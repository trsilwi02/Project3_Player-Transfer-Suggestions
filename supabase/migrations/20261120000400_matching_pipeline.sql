-- =====================================================================
-- Migration 004: Matching Pipeline & Coordination Functions
-- Khắc phục Gap G2, thực hiện UC06, UC07 & Đặc tả Matching Engine V2
-- Các hàm:
--   1. fn_candidates: Lọc ứng viên sơ bộ theo vị trí, tuổi, số phút thi đấu
--   2. fn_run_match: Điều phối chạy Matching V2 end-to-end, ghi match_run,
--                    match_result và match_exclusion
--   3. fn_alternatives: Gợi ý 3 phương án thay thế có F cao hơn và tương đồng vai trò
-- =====================================================================

-- 1. Hàm truy vấn danh sách ứng viên sơ bộ cho nhu cầu tuyển trạch
CREATE OR REPLACE FUNCTION fn_candidates(
  p_requirement_id integer,
  p_params jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  player_id integer,
  player_name varchar(100),
  position varchar(10),
  age integer,
  club_id integer,
  club_name varchar(100),
  league varchar(100),
  market_value numeric,
  salary_per_year numeric,
  contract_end_date date,
  season_minutes numeric,
  fee_est numeric
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_req club_requirement%ROWTYPE;
  v_min_minutes numeric;
  v_allow_shift boolean;
  v_latest_season varchar(20);
BEGIN
  SELECT * INTO v_req FROM club_requirement WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUIREMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_min_minutes := coalesce((p_params->>'min_minutes')::numeric, (v_req.matching_params->>'min_minutes')::numeric, 450);
  v_allow_shift := coalesce((p_params->>'allow_position_shift')::boolean, (v_req.matching_params->>'allow_position_shift')::boolean, false);

  -- Xác định mùa giải gần nhất có số liệu
  SELECT max(season) INTO v_latest_season FROM player_stats WHERE deleted_at IS NULL;

  RETURN QUERY
  WITH valid_positions AS (
    SELECT v_req.position AS pos
    UNION
    SELECT adjacent_code AS pos FROM position_group_adjacency WHERE group_code = v_req.position AND v_allow_shift
  ),
  c_players AS (
    SELECT 
      pc.id AS p_id,
      pc.name AS p_name,
      pc.position AS p_pos,
      pc.age AS p_age,
      pc.club_id AS p_club_id,
      pc.club_name AS p_club_name,
      pc.league AS p_league,
      pc.market_value AS p_mv,
      pc.salary_per_year AS p_wage,
      pc.contract_end_date AS p_end,
      coalesce(pc.season_minutes, 0) AS p_min,
      fn_fee_est(pc.market_value) AS p_fee
    FROM v_player_card pc
    JOIN valid_positions vp ON vp.pos = pc.position
    WHERE 
      (v_req.min_age IS NULL OR pc.age >= v_req.min_age)
      AND (v_req.max_age IS NULL OR pc.age <= v_req.max_age)
      AND (v_req.club_id IS NULL OR pc.club_id IS NULL OR pc.club_id <> v_req.club_id) -- loại cầu thủ thuộc chính CLB
      AND coalesce(pc.season_minutes, 0) >= v_min_minutes
  )
  SELECT 
    p_id, p_name, p_pos, p_age, p_club_id, p_club_name, p_league,
    p_mv, p_wage, p_end, p_min, p_fee
  FROM c_players;
END;
$$;

-- 2. Hàm chạy Matching Engine V2 và ghi nhận kết quả / lý do loại
CREATE OR REPLACE FUNCTION fn_run_match(
  p_requirement_id integer,
  p_user_id integer,
  p_params jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql AS $$
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
  v_recom varchar(10);
  v_flags text[];
  v_reasons jsonb;
  v_is_excluded boolean;
  v_trend RECORD;
BEGIN
  -- Lấy thông tin requirement
  SELECT * INTO v_req FROM club_requirement WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUIREMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Kiểm tra vị trí GK: không chấm điểm theo BR/Quy ước G6
  IF v_req.position = 'GK' THEN
    RAISE EXCEPTION 'UNSUPPORTED_POSITION: Thủ môn (GK) chưa hỗ trợ chấm điểm trong Matching Engine V2.' USING ERRCODE = 'P0001';
  END IF;

  -- Lấy active scoring_config và role_weight_matrix
  SELECT * INTO v_cfg FROM scoring_config WHERE status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_SCORING_CONFIG' USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_mat FROM role_weight_matrix WHERE status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_ROLE_WEIGHT_MATRIX' USING ERRCODE = 'P0004';
  END IF;

  SELECT max(season) INTO v_latest_season FROM player_stats WHERE deleted_at IS NULL;

  -- Tham số hiệu lực (merge từ requirement và params override)
  v_tau_fee  := coalesce((p_params->>'tau_fee')::numeric, (v_req.matching_params->>'tau_fee')::numeric, (v_cfg.params->>'tau_fee')::numeric, 0.10);
  v_tau_wage := coalesce((p_params->>'tau_wage')::numeric, (v_req.matching_params->>'tau_wage')::numeric, (v_cfg.params->>'tau_wage')::numeric, 0.10);
  v_s_min    := coalesce((p_params->>'s_min')::numeric, (v_req.matching_params->>'s_min')::numeric, (v_cfg.params->>'s_min')::numeric, 50.0);

  v_w_f := coalesce((p_params->>'w_f')::numeric, (v_cfg.params->>'w_f')::numeric, 0.40);
  v_w_s := coalesce((p_params->>'w_s')::numeric, (v_cfg.params->>'w_s')::numeric, 0.40);
  v_w_r := coalesce((p_params->>'w_r')::numeric, (v_cfg.params->>'w_r')::numeric, 0.20);

  -- Chuẩn hóa tổng trọng số F/S/R = 1 nếu tổng khác 1
  IF (v_w_f + v_w_s + v_w_r) > 0 AND (v_w_f + v_w_s + v_w_r) <> 1.0 THEN
    v_w_f := v_w_f / (v_w_f + v_w_s + v_w_r);
    v_w_s := v_w_s / (v_w_f + v_w_s + v_w_r);
    v_w_r := v_w_r / (v_w_f + v_w_s + v_w_r);
  END IF;

  v_run_code := 'run_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 6);

  -- Khởi tạo bản ghi match_run
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
      'w_f', v_w_f,
      'w_s', v_w_s,
      'w_r', v_w_r
    ),
    '{}'::jsonb,
    v_asof
  );

  -- Lặp qua các ứng viên
  FOR rec IN (SELECT * FROM fn_candidates(p_requirement_id, p_params)) LOOP
    v_total_cand := v_total_cand + 1;
    v_is_excluded := false;
    v_reasons := '[]'::jsonb;
    v_flags := '{}'::text[];

    v_fee := coalesce(rec.fee_est, rec.market_value, 0);
    v_wage := coalesce(rec.salary_per_year, 0);

    -- Lấy điểm chuyên môn cao nhất trong các vai trò yêu cầu của requirement
    -- Nếu requirement có chỉ định vai trò cụ thể trong club_requirement_role, lấy max role_score trong các role đó
    -- Ngược lại, lấy max role_score của mọi vai trò thuộc vị trí đó
    SELECT prs.score, prs.role_id INTO v_s_score, v_req_role_id
    FROM player_role_score prs
    JOIN tactical_role tr ON tr.id = prs.role_id
    WHERE prs.player_id = rec.player_id
      AND prs.season = v_latest_season
      AND prs.matrix_id = v_mat.id
      AND (
        EXISTS (SELECT 1 FROM club_requirement_role crr WHERE crr.requirement_id = p_requirement_id AND crr.role_id = prs.role_id)
        OR (NOT EXISTS (SELECT 1 FROM club_requirement_role crr WHERE crr.requirement_id = p_requirement_id) AND tr.position_group = rec.position)
      )
    ORDER BY prs.score DESC NULLS LAST
    LIMIT 1;

    -- Kiểm tra hard filter 1: Vượt quá ngân sách + tau_fee
    IF v_req.budget > 0 AND v_fee > v_req.budget * (1 + v_tau_fee) THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'BUDGET_EXCEEDED',
        'message', format('Phí ước tính (%s) vượt quá ngân sách tối đa cho phép (%s)', v_fee, v_req.budget * (1 + v_tau_fee))
      );
    END IF;

    -- Kiểm tra hard filter 2: Vượt quá trần lương + tau_wage
    IF v_req.salary_limit > 0 AND v_wage > v_req.salary_limit * (1 + v_tau_wage) THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'WAGE_CAP_EXCEEDED',
        'message', format('Mức lương (%s) vượt quá trần lương tối đa cho phép (%s)', v_wage, v_req.salary_limit * (1 + v_tau_wage))
      );
    END IF;

    -- Kiểm tra hard filter 3: s_score < s_min (hoặc thiếu điểm chuyên môn)
    IF v_s_score IS NULL OR v_s_score < v_s_min THEN
      v_is_excluded := true;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'TACTICAL_FIT_BELOW_MINIMUM',
        'message', format('Điểm vai trò chiến thuật (%s) thấp hơn ngưỡng tối thiểu yêu cầu (%s)', coalesce(v_s_score::text, 'Chưa có'), v_s_min)
      );
    END IF;

    -- Nếu bị loại bằng hard filter, ghi vào match_exclusion
    IF v_is_excluded THEN
      v_excluded_cand := v_excluded_cand + 1;
      INSERT INTO match_exclusion(run_id, player_id, reasons)
      VALUES (v_run_id, rec.player_id, v_reasons);
    ELSE
      -- Nếu vượt qua lọc cứng: Tính điểm chi tiết F, S, R
      v_passed_cand := v_passed_cand + 1;

      -- 1. Tính F
      v_f_fee := fn_f_fee(v_fee, v_req.budget, v_tau_fee);
      v_f_wage := fn_f_wage(v_wage, v_req.salary_limit, v_tau_wage);
      IF rec.contract_end_date IS NOT NULL THEN
        v_years_left := round(((rec.contract_end_date - v_asof) / 365.25)::numeric, 2);
        v_f_con := fn_f_con(v_years_left);
      ELSE
        v_years_left := 0;
        v_f_con := 70.0; -- Trung tính khi không có hợp đồng
      END IF;
      v_f_total := fn_f_total(v_f_fee, v_f_wage, v_f_con);

      -- 2. Tính R
      v_r_inj := fn_r_inj(rec.player_id, v_asof);

      -- Trend và biến động giá
      SELECT * INTO v_trend FROM fn_price_trend(rec.player_id, v_asof);
      IF v_trend.g IS NOT NULL AND v_trend.sigma IS NOT NULL THEN
        v_r_resale := fn_r_resale(rec.age, 3.0, v_trend.g, v_trend.sigma);
      ELSE
        -- Nếu thiếu chuỗi giá, R_resale đánh giá theo độ tuổi
        v_r_resale := fn_a_age(rec.age + 3.0);
        v_flags := array_append(v_flags, 'PRICE_SERIES_INCOMPLETE');
      END IF;

      v_r_total := fn_r_total(v_r_inj, v_r_resale);

      -- 3. Tổng hợp Matching
      v_matching := fn_matching(v_f_total, v_s_score, v_r_total, v_w_f, v_w_s, v_w_r);
      v_recom := fn_recommendation(v_matching);

      -- Kiểm tra cờ ROLE_TIE (hai vai trò cao nhất cách nhau dưới 3 điểm)
      IF EXISTS (
        SELECT 1 FROM (
          SELECT score, lead(score) OVER (ORDER BY score DESC) AS next_score
          FROM player_role_score
          WHERE player_id = rec.player_id AND season = v_latest_season AND matrix_id = v_mat.id
          ORDER BY score DESC LIMIT 1
        ) sub WHERE next_score IS NOT NULL AND (score - next_score) < 3.0
      ) THEN
        v_flags := array_append(v_flags, 'ROLE_TIE');
      END IF;

      -- Cờ sắp hết hạn hợp đồng
      IF v_years_left <= 0.5 THEN
        v_flags := array_append(v_flags, 'EXPIRING_CONTRACT');
      END IF;

      -- Ghi vào match_result (tạm thời chưa có rank)
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

  -- Đánh số rank cho các kết quả đạt chuẩn theo thứ tự: matching DESC, S DESC, F DESC, phí thấp hơn
  WITH ranked AS (
    SELECT 
      mr.id,
      row_number() OVER (
        ORDER BY mr.matching DESC NULLS LAST, mr.s_score DESC NULLS LAST, mr.f_score DESC NULLS LAST, (mr.breakdown->>'fee_est')::numeric ASC
      ) AS computed_rank
    FROM match_result mr
    WHERE mr.run_id = v_run_id
  )
  UPDATE match_result mr
  SET rank = r.computed_rank
  FROM ranked r
  WHERE mr.id = r.id;

  -- Cập nhật summary trong match_run
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

-- 3. Hàm gợi ý 3 phương án thay thế có F cao hơn và vai trò tương đồng
CREATE OR REPLACE FUNCTION fn_alternatives(
  p_player_id integer,
  p_requirement_id integer,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  player_id integer,
  player_name varchar(100),
  position varchar(10),
  age integer,
  club_name varchar(100),
  fee_est numeric,
  f_score numeric,
  s_score numeric,
  matching numeric,
  similarity_score numeric
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_req club_requirement%ROWTYPE;
  v_base_player v_player_card%ROWTYPE;
  v_base_res match_result%ROWTYPE;
  v_latest_season varchar(20);
  v_mat_id integer;
BEGIN
  SELECT * INTO v_req FROM club_requirement WHERE id = p_requirement_id;
  SELECT * INTO v_base_player FROM v_player_card WHERE id = p_player_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT id INTO v_mat_id FROM role_weight_matrix WHERE status = 'active' LIMIT 1;
  SELECT max(season) INTO v_latest_season FROM player_stats WHERE deleted_at IS NULL;

  -- Điểm của cầu thủ gốc trong run gần nhất nếu có
  SELECT * INTO v_base_res FROM match_result mr
  JOIN match_run r ON r.id = mr.run_id
  WHERE mr.player_id = p_player_id AND mr.requirement_id = p_requirement_id
  ORDER BY mr.created_at DESC LIMIT 1;

  RETURN QUERY
  WITH cand AS (
    SELECT 
      pc.id AS c_id,
      pc.name AS c_name,
      pc.position AS c_pos,
      pc.age AS c_age,
      coalesce(pc.club_name, 'Tự do')::varchar(100) AS c_club,
      fn_fee_est(pc.market_value) AS c_fee,
      mr.f_score AS c_f,
      mr.s_score AS c_s,
      mr.matching AS c_matching
    FROM v_player_card pc
    JOIN match_result mr ON mr.player_id = pc.id AND mr.requirement_id = p_requirement_id
    WHERE pc.id <> p_player_id
      AND pc.position = v_base_player.position
      AND (v_base_res.f_score IS NULL OR mr.f_score >= v_base_res.f_score)
  ),
  sim AS (
    -- Tính độ tương đồng đơn giản qua độ lệch role score
    SELECT 
      c.c_id,
      c.c_name,
      c.c_pos,
      c.c_age,
      c.c_club,
      c.c_fee,
      c.c_f,
      c.c_s,
      c.c_matching,
      greatest(0, 100 - abs(coalesce(c.c_s, 50) - coalesce(v_base_res.s_score, 50)) * 2)::numeric AS sim_val
    FROM cand c
  )
  SELECT 
    c_id, c_name, c_pos, c_age, c_club, c_fee, c_f, c_s, c_matching,
    round((0.6 * sim_val + 0.4 * coalesce(c_matching, 50))::numeric, 1) AS final_sim
  FROM sim
  ORDER BY final_sim DESC, c_f DESC
  LIMIT p_limit;
END;
$$;
