-- 06. Fix RETURN QUERY type mismatch in the matching pipeline.
--
-- v_player_card.market_value / salary_per_year are the `d_money` domain and
-- match_result.f_score / s_score / matching are `d_score`, while both functions
-- declare plain `numeric` output columns. PostgreSQL rejects a domain column in
-- RETURN QUERY when the declared type is its base type (SQLSTATE 42804,
-- "Returned type d_money does not match expected type numeric"). The bug only
-- surfaced once the demo dataset produced real candidates, because a missing
-- requirement raises before the query is planned.
--
-- Fix: cast the domain columns explicitly, keeping the public signatures.
SET search_path = public, extensions;

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
    pc.market_value::numeric,
    pc.salary_per_year::numeric,
    pc.contract_end_date,
    coalesce(pc.season_minutes, 0)::numeric,
    fn_fee_est(pc.market_value)::numeric
  FROM v_player_card pc
  JOIN valid_positions vp ON vp.pos = pc.position
  WHERE (v_req.min_age IS NULL OR pc.age >= v_req.min_age)
    AND (v_req.max_age IS NULL OR pc.age <= v_req.max_age)
    -- never suggest a player already at the requesting club
    AND (v_req.club_id IS NULL OR pc.club_id IS NULL OR pc.club_id <> v_req.club_id)
    AND coalesce(pc.season_minutes, 0) >= v_min_minutes;
END;
$$;

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
      fn_fee_est(pc.market_value)::numeric AS fee,
      mr.f_score::numeric AS f,
      mr.s_score::numeric AS s,
      mr.matching::numeric AS m
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

COMMENT ON FUNCTION fn_candidates(integer, jsonb) IS
  'Hard-filter candidates for a requirement (position/age/minutes). Returns fee estimate.';
COMMENT ON FUNCTION fn_alternatives(integer, integer, integer) IS
  'Alternative targets with higher F, same position and similar role score profile.';
