-- 05. Matching pipeline (UC06/UC07, gap G2).
-- Ported from the parallel prototype and corrected:
--   * fn_r_inj returns a table, so its score is selected, not assigned;
--   * ROLE_TIE compared a row against a NULL lead() value and never fired;
--   * fn_alternatives no longer relies on SELECT * over a join.
-- Orchestration only: every formula stays in the scoring functions from 02.
SET search_path = public, extensions;

-- 1. Pre-filter candidates for a requirement (position, age, minutes).
CREATE OR REPLACE FUNCTION fn_candidates(
  p_requirement_id integer,
  p_params jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  player_id integer,
  player_name varchar(100),
  "position" varchar(10),
  age integer,
  club_id integer,
  club_name varchar(100),
  league varchar(100),
  market_value numeric,
  salary_per_year numeric,
  contract_end_date date,
  season_minutes numeric,
  fee_est numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req club_requirement%ROWTYPE;
  v_min_minutes numeric;
  v_allow_shift boolean;
BEGIN
  SELECT * INTO v_req FROM club_requirement WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUIREMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_min_minutes := coalesce(
    (p_params->>'min_minutes')::numeric,
    (v_req.matching_params->>'min_minutes')::numeric,
    450
  );
  v_allow_shift := coalesce(
    (p_params->>'allow_position_shift')::boolean,
    (v_req.matching_params->>'allow_position_shift')::boolean,
    false
  );

  RETURN QUERY
  WITH valid_positions AS (
    SELECT v_req.position AS pos
    UNION
    SELECT adjacent_code
    FROM position_group_adjacency
    WHERE group_code = v_req.position AND v_allow_shift
  )
  SELECT
    pc.id,
    pc.name,
    pc.position,
    pc.age,
    pc.club_id,
    pc.club_name,
    pc.league,
    pc.market_value,
    pc.salary_per_year,
    pc.contract_end_date,
    coalesce(pc.season_minutes, 0),
    fn_fee_est(pc.market_value)
  FROM v_player_card pc
  JOIN valid_positions vp ON vp.pos = pc.position
  WHERE (v_req.min_age IS NULL OR pc.age >= v_req.min_age)
    AND (v_req.max_age IS NULL OR pc.age <= v_req.max_age)
    -- never suggest a player already at the requesting club
    AND (v_req.club_id IS NULL OR pc.club_id IS NULL OR pc.club_id <> v_req.club_id)
    AND coalesce(pc.season_minutes, 0) >= v_min_minutes;
END;
$$;

COMMENT ON FUNCTION fn_candidates(integer, jsonb) IS
  'Hard-filter candidates for a requirement (position/age/minutes). Returns fee estimate.';

-- 2. Run the whole V2 pipeline for a requirement and persist the run.
CREATE OR REPLACE FUNCTION fn_run_match(
  p_requirement_id integer,
  p_user_id integer,
  p_params jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req club_requirement%ROWTYPE;
  v_cfg scoring_config%ROWTYPE;
  v_mat role_weight_matrix%ROWTYPE;
  v_run_id uuid := gen_random_uuid();
  v_run_code varchar(40);
  v_asof date := current_date;
  v_tau_fee numeric;
  v_tau_wage numeric;
  v_s_min numeric;
  v_w_f numeric;
  v_w_s numeric;
  v_w_r numeric;
  v_role_gap numeric;
  v_latest_season varchar(20);
  v_total_cand integer := 0;
  v_passed_cand integer := 0;
  v_excluded_cand integer := 0;

  rec RECORD;
  v_fee numeric;
  v_wage numeric;
  v_years_left numeric;
  v_f_fee numeric;
  v_f_wage numeric;
  v_f_con numeric;
  v_f_total numeric;
  v_s_score numeric;
  v_req_role_id smallint;
  v_r_inj numeric;
  v_r_resale numeric;
  v_r_total numeric;
  v_matching numeric;
  v_recom text;
  v_flags text[];
  v_reasons jsonb;
  v_is_excluded boolean;
  v_trend RECORD;
BEGIN
  SELECT * INTO v_req FROM club_requirement WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUIREMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- GK has no role matrix yet (position_group.is_scorable = false).
  IF v_req.position = 'GK' THEN
    RAISE EXCEPTION 'UNSUPPORTED_POSITION: goalkeeper scoring is not part of Matching Engine V2'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_cfg FROM scoring_config WHERE status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_SCORING_CONFIG' USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_mat FROM role_weight_matrix WHERE status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_ROLE_WEIGHT_MATRIX' USING ERRCODE = 'P0004';
  END IF;

  SELECT max(season) INTO v_latest_season FROM player_stats WHERE deleted_at IS NULL;

  -- Effective parameters: request override > requirement > active config > default.
  v_tau_fee  := coalesce((p_params->>'tau_fee')::numeric,
                         (v_req.matching_params->>'tau_fee')::numeric,
                         (v_cfg.params->>'tau_fee')::numeric, 0.10);
  v_tau_wage := coalesce((p_params->>'tau_wage')::numeric,
                         (v_req.matching_params->>'tau_wage')::numeric,
                         (v_cfg.params->>'tau_wage')::numeric, 0.10);
  v_s_min    := coalesce((p_params->>'s_min')::numeric,
                         (v_req.matching_params->>'s_min')::numeric,
                         (v_cfg.params->>'s_min')::numeric, 70);
  v_role_gap := coalesce((v_cfg.params->>'role_tie_gap')::numeric, 3);

  v_w_f := coalesce((p_params->>'w_f')::numeric, (v_cfg.params->>'w_f')::numeric, 0.40);
  v_w_s := coalesce((p_params->>'w_s')::numeric, (v_cfg.params->>'w_s')::numeric, 0.40);
  v_w_r := coalesce((p_params->>'w_r')::numeric, (v_cfg.params->>'w_r')::numeric, 0.20);

  IF (v_w_f + v_w_s + v_w_r) > 0 AND (v_w_f + v_w_s + v_w_r) <> 1.0 THEN
    v_w_f := v_w_f / (v_w_f + v_w_s + v_w_r);
    v_w_s := v_w_s / (v_w_f + v_w_s + v_w_r);
    v_w_r := v_w_r / (v_w_f + v_w_s + v_w_r);
  END IF;

  v_run_code := 'run_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 6);

  INSERT INTO match_run(
    id, run_code, user_id, requirement_id, config_id, matrix_id, params_snapshot, summary, data_as_of
  ) VALUES (
    v_run_id, v_run_code, p_user_id, p_requirement_id, v_cfg.id, v_mat.id,
    jsonb_build_object(
      'budget', v_req.budget,
      'salary_limit', v_req.salary_limit,
      'tau_fee', v_tau_fee,
      'tau_wage', v_tau_wage,
      's_min', v_s_min,
      'role_tie_gap', v_role_gap,
      'w_f', v_w_f,
      'w_s', v_w_s,
      'w_r', v_w_r
    ),
    '{}'::jsonb,
    v_asof
  );

  FOR rec IN SELECT * FROM fn_candidates(p_requirement_id, p_params) LOOP
    v_total_cand := v_total_cand + 1;
    v_is_excluded := false;
    v_reasons := '[]'::jsonb;
    v_flags := '{}'::text[];

    v_fee := coalesce(rec.fee_est, rec.market_value, 0);
    v_wage := coalesce(rec.salary_per_year, 0);

    -- Best role score: requested roles first, otherwise any role of the position.
    SELECT prs.score, prs.role_id
      INTO v_s_score, v_req_role_id
    FROM player_role_score prs
    JOIN tactical_role tr ON tr.id = prs.role_id
    WHERE prs.player_id = rec.player_id
      AND prs.season = v_latest_season
      AND prs.matrix_id = v_mat.id
      AND (
        EXISTS (
          SELECT 1 FROM club_requirement_role crr
          WHERE crr.requirement_id = p_requirement_id AND crr.role_id = prs.role_id
        )
        OR (
          NOT EXISTS (SELECT 1 FROM club_requirement_role crr WHERE crr.requirement_id = p_requirement_id)
          AND tr.position_group = rec.position
        )
      )
    ORDER BY prs.score DESC NULLS LAST
    LIMIT 1;

    -- Hard filter 1: fee above budget + tau_fee.
    IF v_req.budget > 0 AND v_fee > v_req.budget * (1 + v_tau_fee) THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'BUDGET_EXCEEDED',
        'message', format('Estimated fee (%s) exceeds budget (%s)', v_fee, v_req.budget * (1 + v_tau_fee))
      );
    END IF;

    -- Hard filter 2: wage above salary cap + tau_wage.
    IF v_req.salary_limit > 0 AND v_wage > v_req.salary_limit * (1 + v_tau_wage) THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'WAGE_CAP_EXCEEDED',
        'message', format('Wage (%s) exceeds salary cap (%s)', v_wage, v_req.salary_limit * (1 + v_tau_wage))
      );
    END IF;

    -- Hard filter 3: missing or insufficient role score.
    IF v_s_score IS NULL OR v_s_score < v_s_min THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'TACTICAL_FIT_BELOW_MINIMUM',
        'message', format('Role score (%s) is below s_min (%s)', coalesce(v_s_score::text, 'n/a'), v_s_min)
      );
    END IF;

    IF v_is_excluded THEN
      v_excluded_cand := v_excluded_cand + 1;
      INSERT INTO match_exclusion(run_id, player_id, reasons)
      VALUES (v_run_id, rec.player_id, v_reasons);
    ELSE
      v_passed_cand := v_passed_cand + 1;

      -- F: fee, wage, contract horizon.
      v_f_fee := fn_f_fee(v_fee, v_req.budget, v_tau_fee);
      v_f_wage := fn_f_wage(v_wage, v_req.salary_limit, v_tau_wage);
      IF rec.contract_end_date IS NOT NULL THEN
        v_years_left := round(((rec.contract_end_date - v_asof) / 365.25)::numeric, 2);
        v_f_con := fn_f_con(v_years_left);
      ELSE
        v_years_left := 0;
        v_f_con := 70.0; -- neutral when the contract is unknown
      END IF;
      v_f_total := fn_f_total(v_f_fee, v_f_wage, v_f_con);

      -- R: injuries (table-returning function) and resale potential.
      SELECT score INTO v_r_inj FROM fn_r_inj(rec.player_id, v_asof);
      v_r_inj := coalesce(v_r_inj, (v_cfg.params->>'default_injury_score')::numeric, 70);

      SELECT * INTO v_trend FROM fn_price_trend(rec.player_id, v_asof);
      IF v_trend.g IS NOT NULL AND v_trend.sigma IS NOT NULL THEN
        v_r_resale := fn_r_resale(rec.age, 3.0, v_trend.g, v_trend.sigma);
      ELSE
        v_r_resale := fn_a_age(rec.age + 3.0);
        v_flags := array_append(v_flags, 'PRICE_SERIES_INCOMPLETE');
      END IF;

      v_r_total := fn_r_total(v_r_inj, v_r_resale);

      v_matching := fn_matching(v_f_total, v_s_score, v_r_total, v_w_f, v_w_s, v_w_r);
      v_recom := fn_recommendation(v_matching);

      -- ROLE_TIE: two best roles are within role_tie_gap points.
      IF (
        SELECT count(*) >= 2 AND (max(score) - min(score)) < v_role_gap
        FROM (
          SELECT score
          FROM player_role_score
          WHERE player_id = rec.player_id
            AND season = v_latest_season
            AND matrix_id = v_mat.id
          ORDER BY score DESC
          LIMIT 2
        ) top2
      ) THEN
        v_flags := array_append(v_flags, 'ROLE_TIE');
      END IF;

      IF v_years_left <= 0.5 THEN
        v_flags := array_append(v_flags, 'EXPIRING_CONTRACT');
      END IF;

      INSERT INTO match_result(
        run_id, user_id, player_id, requirement_id, matching, f_score, s_score, r_score,
        requested_role_id, recommendation, breakdown, flags
      ) VALUES (
        v_run_id, p_user_id, rec.player_id, p_requirement_id, v_matching, v_f_total, v_s_score, v_r_total,
        v_req_role_id, v_recom,
        jsonb_build_object(
          'f_fee', v_f_fee,
          'f_wage', v_f_wage,
          'f_con', v_f_con,
          'r_inj', v_r_inj,
          'r_resale', v_r_resale,
          'years_left', v_years_left,
          'fee_est', v_fee,
          'wage_est', v_wage
        ),
        v_flags
      );
    END IF;
  END LOOP;

  -- Rank: matching, then role score, then financial score, then cheaper fee.
  WITH ranked AS (
    SELECT
      mr.id,
      row_number() OVER (
        ORDER BY mr.matching DESC NULLS LAST,
                 mr.s_score DESC NULLS LAST,
                 mr.f_score DESC NULLS LAST,
                 (mr.breakdown->>'fee_est')::numeric ASC
      ) AS computed_rank
    FROM match_result mr
    WHERE mr.run_id = v_run_id
  )
  UPDATE match_result mr
  SET rank = r.computed_rank
  FROM ranked r
  WHERE mr.id = r.id;

  UPDATE match_run
  SET summary = jsonb_build_object(
    'candidates_count', v_total_cand,
    'passed_count', v_passed_cand,
    'excluded_count', v_excluded_cand,
    'avg_matching', (SELECT round(avg(matching)::numeric, 1) FROM match_result WHERE run_id = v_run_id)
  )
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION fn_run_match(integer, integer, jsonb) IS
  'Executes Matching Engine V2 end-to-end: match_run, match_result, match_exclusion, rank.';

-- 3. Alternatives: better F, same position, similar role profile.
CREATE OR REPLACE FUNCTION fn_alternatives(
  p_player_id integer,
  p_requirement_id integer,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  player_id integer,
  player_name varchar(100),
  "position" varchar(10),
  age integer,
  club_name varchar(100),
  fee_est numeric,
  f_score numeric,
  s_score numeric,
  matching numeric,
  similarity_score numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_player v_player_card%ROWTYPE;
  v_base_f numeric;
  v_base_s numeric;
BEGIN
  SELECT * INTO v_base_player FROM v_player_card WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Scores of the base player in the latest run for this requirement (if any).
  SELECT mr.f_score, mr.s_score
    INTO v_base_f, v_base_s
  FROM match_result mr
  JOIN match_run r ON r.id = mr.run_id
  WHERE mr.player_id = p_player_id AND mr.requirement_id = p_requirement_id
  ORDER BY mr.created_at DESC
  LIMIT 1;

  RETURN QUERY
  WITH cand AS (
    SELECT
      pc.id,
      pc.name,
      pc.position,
      pc.age,
      coalesce(pc.club_name, 'Free agent')::varchar(100) AS club,
      fn_fee_est(pc.market_value) AS fee,
      mr.f_score AS f,
      mr.s_score AS s,
      mr.matching AS m
    FROM v_player_card pc
    JOIN match_result mr ON mr.player_id = pc.id AND mr.requirement_id = p_requirement_id
    WHERE pc.id <> p_player_id
      AND pc.position = v_base_player.position
      AND (v_base_f IS NULL OR mr.f_score >= v_base_f)
  )
  SELECT
    c.id,
    c.name,
    c.position,
    c.age,
    c.club,
    c.fee,
    c.f,
    c.s,
    c.m,
    round((0.6 * greatest(0, 100 - abs(coalesce(c.s, 50) - coalesce(v_base_s, 50)) * 2)
           + 0.4 * coalesce(c.m, 50))::numeric, 1)
  FROM cand c
  ORDER BY 10 DESC, c.f DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION fn_alternatives(integer, integer, integer) IS
  'Alternative targets with higher F, same position and similar role score profile.';

-- 4. Lock down execution: only the server (postgres) calls these directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION fn_candidates(integer, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION fn_run_match(integer, integer, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION fn_alternatives(integer, integer, integer) FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
