-- 02. Trigger, hàm tính điểm (Matching Engine V2) và view
-- =====================================================================
-- psql meta-command omitted for supabase migration compatibility

-- ---------------------------------------------------------------------
-- A. Trigger chung: updated_at, audit log
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_user','club','player','contract','transfer','market_value',
                           'player_stats','player_season_metrics','injury_history','club_requirement'] LOOP
    EXECUTE format('CREATE TRIGGER trg_a_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at()', t);
  END LOOP;
END $$;

-- Backend đặt ngữ cảnh trước khi ghi:  SET LOCAL app.user_id = '2';  SET LOCAL app.client_ip = '203.0.113.10';
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_action text; v_old jsonb; v_new jsonb; v_id text;
  v_actor integer := nullif(current_setting('app.user_id', true), '')::integer;
  v_ip inet := nullif(current_setting('app.client_ip', true), '')::inet;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_new := to_jsonb(NEW); v_id := v_new->>'id';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete'; v_old := to_jsonb(OLD); v_id := v_old->>'id';
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_id := v_new->>'id';
    IF (v_old - 'updated_at') = (v_new - 'updated_at') THEN RETURN NULL; END IF;
    v_action := CASE
      WHEN v_old->>'deleted_at' IS NULL     AND v_new->>'deleted_at' IS NOT NULL THEN 'delete'
      WHEN v_old->>'deleted_at' IS NOT NULL AND v_new->>'deleted_at' IS NULL     THEN 'restore'
      WHEN v_old->>'record_status' = 'draft' AND v_new->>'record_status' = 'verified' THEN 'verify'
      WHEN TG_TABLE_NAME IN ('scoring_config','role_weight_matrix')
           AND v_old->>'status' IS DISTINCT FROM 'active' AND v_new->>'status' = 'active' THEN 'activate'
      ELSE 'update' END;
  END IF;
  INSERT INTO audit_log(entity_type, entity_id, action, old_value, new_value, actor_id, ip_address)
  VALUES (TG_TABLE_NAME, v_id, v_action, v_old, v_new, v_actor, v_ip);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['club','player','contract','transfer','market_value','player_stats',
                           'injury_history','scoring_config','role_weight_matrix'] LOOP
    EXECUTE format('CREATE TRIGGER trg_z_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_audit_row()', t);
  END LOOP;
END $$;

-- BR05: audit_log không thể sửa/xóa
CREATE OR REPLACE FUNCTION fn_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log chỉ cho phép thêm mới (không được %)', TG_OP USING ERRCODE = '42501'; END $$;
CREATE TRIGGER trg_audit_no_change   BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION fn_audit_immutable();
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_immutable();

-- ---------------------------------------------------------------------
-- B. Hợp đồng → trạng thái cầu thủ + sự kiện biến động (UC09, UC10)
--    domain_event chỉ là hàng đợi; Scheduler chỉ tạo thông báo cho bản ghi đã 'verified'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_player_status(p_player integer) RETURNS void LANGUAGE sql AS $$
  UPDATE player p SET status = CASE
      WHEN p.status = 'retired' THEN 'retired'
      WHEN EXISTS (SELECT 1 FROM contract c WHERE c.player_id = p.id AND c.status = 'active' AND c.deleted_at IS NULL
                   AND c.contract_type = 'loan' AND current_date BETWEEN c.start_date AND c.end_date) THEN 'on_loan'
      WHEN EXISTS (SELECT 1 FROM contract c WHERE c.player_id = p.id AND c.status = 'active' AND c.deleted_at IS NULL
                   AND c.contract_type IN ('permanent','free') AND current_date BETWEEN c.start_date AND c.end_date) THEN 'active'
      ELSE 'free_agent' END
  WHERE p.id = p_player;
$$;

CREATE OR REPLACE FUNCTION fn_contract_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM fn_sync_player_status(OLD.player_id); RETURN NULL; END IF;
  PERFORM fn_sync_player_status(NEW.player_id);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
    VALUES ('CONTRACT_RENEWED', NEW.player_id, 'contract', NEW.id,
            jsonb_build_object('club_id', NEW.club_id, 'end_date', NEW.end_date, 'new', true));
  ELSE
    IF NEW.status = 'terminated' AND OLD.status <> 'terminated' THEN
      INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
      VALUES ('CONTRACT_TERMINATED', NEW.player_id, 'contract', NEW.id, jsonb_build_object('club_id', NEW.club_id));
    ELSIF NEW.end_date > OLD.end_date THEN
      INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
      VALUES ('CONTRACT_RENEWED', NEW.player_id, 'contract', NEW.id,
              jsonb_build_object('old_end_date', OLD.end_date, 'end_date', NEW.end_date));
    END IF;
    IF NEW.release_clause IS DISTINCT FROM OLD.release_clause THEN
      INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
      VALUES ('RELEASE_CLAUSE_CHANGED', NEW.player_id, 'contract', NEW.id,
              jsonb_build_object('old', OLD.release_clause, 'new', NEW.release_clause));
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_contract_after AFTER INSERT OR UPDATE OR DELETE ON contract
  FOR EACH ROW EXECUTE FUNCTION fn_contract_after();

CREATE OR REPLACE FUNCTION fn_injury_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
  VALUES ('INJURY_UPDATED', NEW.player_id, 'injury_history', NEW.id,
          jsonb_build_object('injury_type', NEW.injury_type, 'start_date', NEW.start_date));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_injury_after AFTER INSERT ON injury_history FOR EACH ROW EXECUTE FUNCTION fn_injury_after();

CREATE OR REPLACE FUNCTION fn_market_value_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev numeric;
BEGIN
  SELECT value INTO v_prev FROM market_value
   WHERE player_id = NEW.player_id AND deleted_at IS NULL AND id <> NEW.id AND value_date < NEW.value_date
   ORDER BY value_date DESC LIMIT 1;
  IF v_prev IS NOT NULL AND v_prev <> NEW.value THEN
    INSERT INTO domain_event(event_type, player_id, entity_type, entity_id, payload)
    VALUES ('MARKET_VALUE_CHANGED', NEW.player_id, 'market_value', NEW.id,
            jsonb_build_object('old', v_prev, 'new', NEW.value,
                               'change_pct', round((NEW.value - v_prev) / v_prev * 100, 2)));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_market_value_after AFTER INSERT ON market_value FOR EACH ROW EXECUTE FUNCTION fn_market_value_after();

-- ---------------------------------------------------------------------
-- C. Ma trận vai trò & cấu hình: kiểm tra tổng 100%, bất biến sau kích hoạt
-- ---------------------------------------------------------------------
-- Trả về từng vai trò kèm tổng trọng số; ok = |tổng - 1| < 1e-6. Vai trò thiếu trọng số có tổng 0.
CREATE OR REPLACE FUNCTION fn_validate_matrix(p_matrix integer)
RETURNS TABLE (role_id smallint, role_name varchar, total numeric, ok boolean) LANGUAGE sql STABLE AS $$
  SELECT r.id, r.name, coalesce(sum(w.weight), 0),
         abs(coalesce(sum(w.weight), 0) - 1) < 0.000001
  FROM tactical_role r
  LEFT JOIN role_weight w ON w.role_id = r.id AND w.matrix_id = p_matrix
  GROUP BY r.id, r.name ORDER BY r.id;
$$;

CREATE OR REPLACE FUNCTION fn_matrix_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_bad text;
BEGIN
  IF TG_OP = 'INSERT' THEN       -- phiên bản mới luôn bắt đầu ở trạng thái draft, kích hoạt bằng UPDATE
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'Ma trận mới phải ở trạng thái draft' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - 'status' - 'activated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'activated_at') THEN
    RAISE EXCEPTION 'Ma trận % đã kích hoạt là bất biến; hãy tạo phiên bản mới', OLD.version USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Không thể chuyển ma trận về draft' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    SELECT string_agg(role_name || '=' || total, ', ') INTO v_bad FROM fn_validate_matrix(NEW.id) WHERE NOT ok;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'MATRIX_INVALID: vai trò có tổng trọng số khác 100%%: %', v_bad USING ERRCODE = '23514';
    END IF;
    UPDATE role_weight_matrix SET status = 'archived' WHERE status = 'active' AND id <> NEW.id;
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_matrix_guard BEFORE INSERT OR UPDATE ON role_weight_matrix FOR EACH ROW EXECUTE FUNCTION fn_matrix_guard();

CREATE OR REPLACE FUNCTION fn_role_weight_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text; v_applies text; v_gk boolean; v_mid integer := coalesce(NEW.matrix_id, OLD.matrix_id);
BEGIN
  SELECT status INTO v_status FROM role_weight_matrix WHERE id = v_mid;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'Ma trận đã kích hoạt là bất biến; không sửa trọng số' USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT i.applies_to INTO v_applies FROM indicator i WHERE i.code = NEW.indicator_code;
    SELECT (r.position_group = 'GK') INTO v_gk FROM tactical_role r WHERE r.id = NEW.role_id;
    IF (v_gk AND v_applies = 'outfield') OR (NOT v_gk AND v_applies = 'gk') THEN
      RAISE EXCEPTION 'Chỉ số % không áp dụng cho vai trò này', NEW.indicator_code USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER trg_role_weight_guard BEFORE INSERT OR UPDATE OR DELETE ON role_weight FOR EACH ROW EXECUTE FUNCTION fn_role_weight_guard();

CREATE OR REPLACE FUNCTION fn_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_bad text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'Cấu hình mới phải ở trạng thái draft' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Không xóa cấu hình đã kích hoạt' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - 'status' - 'activated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'activated_at') THEN
    RAISE EXCEPTION 'Cấu hình % đã kích hoạt là bất biến; hãy tạo phiên bản mới', OLD.version USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Không thể chuyển cấu hình về draft' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    SELECT string_agg(role_name, ', ') INTO v_bad FROM fn_validate_matrix(NEW.role_matrix_id) WHERE NOT ok;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'MATRIX_INVALID: ma trận % không hợp lệ (%)', NEW.role_matrix_id, v_bad USING ERRCODE = '23514';
    END IF;
    UPDATE scoring_config SET status = 'archived' WHERE status = 'active' AND id <> NEW.id;
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_config_guard BEFORE INSERT OR UPDATE OR DELETE ON scoring_config FOR EACH ROW EXECUTE FUNCTION fn_config_guard();

-- ---------------------------------------------------------------------
-- D. Hàm tính điểm F / S / R / Matching (khớp công thức V2)
--    Quy ước: trả NULL = "không tính được / bị loại bằng bộ lọc cứng";
--    không bao giờ biến dữ liệu thiếu thành 0 hay tự chia lại trọng số.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_age(p_dob date, p_asof date DEFAULT current_date) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT date_part('year', age(p_asof, p_dob))::integer $$;

-- fee_est: ưu tiên giá chào; nếu không có dùng giá trị thị trường × κ (mặc định 1,15)
CREATE OR REPLACE FUNCTION fn_fee_est(p_market_value numeric, p_asking numeric DEFAULT NULL, p_kappa numeric DEFAULT 1.15)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(p_asking, p_market_value * p_kappa) $$;

-- Điểm tuyến tính chung cho phí và lương:
--   x/hạn mức ≤ 1:        100 × (1 − 0,6x)   (đúng hạn mức = 40)
--   1 < x ≤ 1 + τ:        40 × (1 − (x − 1)/τ)
--   x > 1 + τ:            NULL (loại cứng)
CREATE OR REPLACE FUNCTION fn_fit_score(p_ratio numeric, p_tau numeric DEFAULT 0) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ratio IS NULL THEN NULL
              WHEN p_ratio < 0 THEN NULL
              WHEN p_ratio <= 1 THEN 100 * (1 - 0.6 * p_ratio)
              WHEN p_tau > 0 AND p_ratio <= 1 + p_tau THEN 40 * (1 - (p_ratio - 1) / p_tau)
              ELSE NULL END $$;

CREATE OR REPLACE FUNCTION fn_f_fee(p_fee_est numeric, p_budget numeric, p_tau numeric DEFAULT 0) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_budget IS NULL OR p_budget <= 0 THEN RAISE EXCEPTION 'budget phải > 0'; END IF;
  RETURN fn_fit_score(p_fee_est / p_budget, p_tau);
END $$;

CREATE OR REPLACE FUNCTION fn_f_wage(p_wage numeric, p_wage_cap numeric, p_tau numeric DEFAULT 0) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_wage_cap IS NULL OR p_wage_cap <= 0 THEN RAISE EXCEPTION 'salary_limit phải > 0'; END IF;
  RETURN fn_fit_score(p_wage / p_wage_cap, p_tau);
END $$;

-- F_con = max(0, 100 − 30·d), d = khoảng lệch (năm) ra ngoài [c_lo, c_hi]
CREATE OR REPLACE FUNCTION fn_f_con(p_years_left numeric, p_lo numeric DEFAULT 2, p_hi numeric DEFAULT 4) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_years_left IS NULL THEN NULL
              ELSE greatest(0, 100 - 30 * greatest(p_lo - p_years_left, 0, p_years_left - p_hi)) END $$;

-- F = a_fee·F_fee + a_wage·F_wage + a_con·F_con (trọng số được chuẩn hóa nếu tổng ≠ 1;
-- NULL nếu thành phần có trọng số dương bị thiếu)
CREATE OR REPLACE FUNCTION fn_f_total(p_fee numeric, p_wage numeric, p_con numeric,
    a_fee numeric DEFAULT 0.45, a_wage numeric DEFAULT 0.35, a_con numeric DEFAULT 0.20) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s numeric := a_fee + a_wage + a_con;
BEGIN
  IF s <= 0 OR a_fee < 0 OR a_wage < 0 OR a_con < 0 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
  IF (a_fee > 0 AND p_fee IS NULL) OR (a_wage > 0 AND p_wage IS NULL) OR (a_con > 0 AND p_con IS NULL) THEN RETURN NULL; END IF;
  RETURN (coalesce(a_fee * p_fee, 0) + coalesce(a_wage * p_wage, 0) + coalesce(a_con * p_con, 0)) / s;
END $$;

CREATE OR REPLACE FUNCTION fn_s_minute(p_minutes numeric, p_full_sample numeric DEFAULT 2000) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT least(100, 100 * p_minutes / p_full_sample) $$;

-- Score_Role = min(0,20·S_minute + 0,80·Σ w·P ; S_minute + 20 ; 100)
CREATE OR REPLACE FUNCTION fn_role_score(p_weighted_percentile numeric, p_s_minute numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT least(0.20 * p_s_minute + 0.80 * p_weighted_percentile, p_s_minute + 20, 100) $$;

-- A_age: nội suy tuyến tính 26→100, 29→70, 32→30, 35→0
CREATE OR REPLACE FUNCTION fn_a_age(p_resale_age numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_resale_age IS NULL THEN NULL
              WHEN p_resale_age <= 26 THEN 100
              WHEN p_resale_age <= 29 THEN 100 - 30 * (p_resale_age - 26) / 3
              WHEN p_resale_age <= 32 THEN 70  - 40 * (p_resale_age - 29) / 3
              WHEN p_resale_age <  35 THEN 30  - 30 * (p_resale_age - 32) / 3
              ELSE 0 END $$;

-- R_price = 0,6·T + 0,4·V ; T = 50 + 50·clamp(g/0,30; −1; 1) ; V = 100·(1 − min(σ/0,35; 1))
CREATE OR REPLACE FUNCTION fn_r_price(p_g numeric, p_sigma numeric, p_g_cap numeric DEFAULT 0.30, p_sigma_cap numeric DEFAULT 0.35)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_g IS NULL OR p_sigma IS NULL THEN NULL
         ELSE 0.6 * (50 + 50 * greatest(-1, least(1, p_g / p_g_cap)))
            + 0.4 * (100 * (1 - least(p_sigma / p_sigma_cap, 1))) END $$;

-- R_resale = 0,6·A_age(tuổi + H) + 0,4·R_price
CREATE OR REPLACE FUNCTION fn_r_resale(p_age numeric, p_holding_years numeric, p_g numeric, p_sigma numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN fn_r_price(p_g, p_sigma) IS NULL THEN NULL
         ELSE 0.6 * fn_a_age(p_age + p_holding_years) + 0.4 * fn_r_price(p_g, p_sigma) END $$;

CREATE OR REPLACE FUNCTION fn_r_total(p_inj numeric, p_resale numeric, r_inj numeric DEFAULT 0.5, r_resale numeric DEFAULT 0.5) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s numeric := r_inj + r_resale;
BEGIN
  IF s <= 0 OR r_inj < 0 OR r_resale < 0 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
  IF (r_inj > 0 AND p_inj IS NULL) OR (r_resale > 0 AND p_resale IS NULL) THEN RETURN NULL; END IF;
  RETURN (coalesce(r_inj * p_inj, 0) + coalesce(r_resale * p_resale, 0)) / s;
END $$;

-- Matching = w_F·F + w_S·S + w_R·R ; NULL nếu thiếu bất kỳ trụ cột nào (không chia lại trọng số).
CREATE OR REPLACE FUNCTION fn_matching(p_f numeric, p_s numeric, p_r numeric,
    w_f numeric DEFAULT 0.30, w_s numeric DEFAULT 0.50, w_r numeric DEFAULT 0.20) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s numeric := w_f + w_s + w_r;
BEGIN
  IF s <= 0 OR w_f < 0 OR w_s < 0 OR w_r < 0 THEN RAISE EXCEPTION 'INVALID_WEIGHTS'; END IF;
  IF p_f IS NULL OR p_s IS NULL OR p_r IS NULL THEN RETURN NULL; END IF;
  RETURN (w_f * p_f + w_s * p_s + w_r * p_r) / s;
END $$;

CREATE OR REPLACE FUNCTION fn_recommendation(p_score numeric, p_high numeric DEFAULT 80, p_consider numeric DEFAULT 50) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_score IS NULL THEN NULL WHEN p_score > p_high THEN 'high'
              WHEN p_score >= p_consider THEN 'consider' ELSE 'risk' END $$;

-- R_inj trong cửa sổ 24 tháng: ca 0–12 tháng ω=1,0; 12–24 tháng ω=0,6; không tính ngày tương lai.
--   D_w = min(180, Σ ω·d); R_inj = max(0, 100·(1 − D_w/180) − pen_rec − pen_sev)
--   pen_rec = min(24, 8·Σ_vùng max(n_vùng − 1, 0)); pen_sev = min(20, 10·n_(nghỉ ≥ 90 ngày))
-- Không có bản ghi và lịch sử chưa xác nhận đầy đủ → điểm tạm 70 + data_missing = true.
CREATE OR REPLACE FUNCTION fn_r_inj(p_player integer, p_asof date DEFAULT current_date,
    p_default numeric DEFAULT 70, p_verified_only boolean DEFAULT true)
RETURNS TABLE (score numeric, data_missing boolean, weighted_days numeric, recurrence_penalty numeric, severity_penalty numeric, cases integer)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_complete boolean; v_dw numeric; v_rec numeric; v_sev numeric; v_n integer;
BEGIN
  SELECT injury_history_complete INTO v_complete FROM player WHERE id = p_player;
  IF NOT FOUND THEN RETURN; END IF;

  WITH inj AS (
    SELECT i.body_part,
           CASE WHEN i.start_date > (p_asof - interval '12 months') THEN 1.0
                WHEN i.start_date > (p_asof - interval '24 months') THEN 0.6 END AS w,
           CASE WHEN i.end_date IS NOT NULL AND i.end_date <= p_asof THEN i.days_missed
                ELSE least(i.days_missed, p_asof - i.start_date) END AS d
    FROM injury_history i
    WHERE i.player_id = p_player AND i.deleted_at IS NULL AND i.start_date <= p_asof
      AND (NOT p_verified_only OR i.record_status = 'verified')
  ), win AS (SELECT * FROM inj WHERE w IS NOT NULL),
  agg AS (SELECT least(180, coalesce(sum(w * d), 0)) AS dw, count(*) AS n,
                 count(*) FILTER (WHERE d >= 90) AS nsev FROM win),
  rec AS (SELECT coalesce(sum(greatest(c - 1, 0)), 0) AS s
          FROM (SELECT count(*) AS c FROM win WHERE body_part IS NOT NULL GROUP BY body_part) x)
  SELECT agg.dw, least(24, 8 * rec.s), least(20, 10 * agg.nsev), agg.n::integer
    INTO v_dw, v_rec, v_sev, v_n FROM agg, rec;

  IF v_n = 0 AND NOT v_complete THEN
    RETURN QUERY SELECT p_default, true, NULL::numeric, NULL::numeric, NULL::numeric, 0;
    RETURN;
  END IF;
  RETURN QUERY SELECT greatest(0, 100 * (1 - v_dw / 180) - v_rec - v_sev), false, v_dw, v_rec, v_sev, v_n;
END $$;

-- Xu hướng giá 24 tháng: g = hệ số góc hồi quy tuyến tính ln(giá) theo năm;
-- σ = độ lệch chuẩn của thay đổi ln(giá) giữa các mốc liên tiếp. Cần ≥ 4 mốc, nếu không trả NULL
-- (không giả định xu hướng bằng 0).
CREATE OR REPLACE FUNCTION fn_price_trend(p_player integer, p_asof date DEFAULT current_date, p_verified_only boolean DEFAULT true)
RETURNS TABLE (g numeric, sigma numeric, points integer)
LANGUAGE sql STABLE AS $$
  WITH pts AS (
    SELECT value_date, ln(value) AS lv,
           (value_date - DATE '2000-01-01') / 365.25 AS yr,
           ln(value) - lag(ln(value)) OVER (ORDER BY value_date) AS dlv
    FROM market_value
    WHERE player_id = p_player AND deleted_at IS NULL AND value_date <= p_asof
      AND value_date > (p_asof - interval '24 months') AND (NOT p_verified_only OR record_status = 'verified')
  )
  SELECT CASE WHEN count(*) >= 4 THEN regr_slope(lv, yr)::numeric END,
         CASE WHEN count(*) >= 4 THEN stddev_samp(dlv)::numeric END,
         count(*)::integer
  FROM pts $$;

-- ---------------------------------------------------------------------
-- E. Giai đoạn "tính sẵn theo lô": percentile và vector điểm vai trò
-- ---------------------------------------------------------------------
-- P_i = 100·[N(x < x_i) + 0,5·N(x = x_i)] / N, so với cầu thủ cùng nhóm vị trí, cùng mùa,
-- tập tham chiếu chỉ gồm người có ≥ 450 phút. Press Succ % và Aerials Won % được làm mượt
-- r̂ = (succ + k·r̄)/(att + k) (k = 30) khi có số lần thử.
CREATE OR REPLACE FUNCTION fn_refresh_percentiles(p_season varchar, p_min_ref_minutes integer DEFAULT 450, p_k numeric DEFAULT 30)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_rows integer;
BEGIN
  WITH mins AS (
    SELECT player_id, sum(minutes_played) AS minutes FROM player_stats
    WHERE season = p_season AND deleted_at IS NULL GROUP BY player_id
  ), src AS (
    SELECT m.*, p.position AS grp, mi.minutes
    FROM player_season_metrics m
    JOIN player p ON p.id = m.player_id AND p.deleted_at IS NULL
    JOIN mins mi ON mi.player_id = m.player_id AND mi.minutes > 0
    WHERE m.season = p_season
  ), means AS (
    SELECT grp, avg(aerials_won_pct) AS aer_mean, avg(press_succ_pct) AS prs_mean
    FROM src WHERE minutes >= p_min_ref_minutes GROUP BY grp
  ), base AS (
    SELECT s.player_id, s.grp, s.minutes, v.code, v.val
    FROM src s LEFT JOIN means mn ON mn.grp = s.grp
    CROSS JOIN LATERAL (VALUES
      ('G', s.g_90), ('xG', s.xg_90), ('A', s.a_90), ('xA', s.xa_90), ('K', s.k_90),
      ('PrgP', s.prgp_90), ('PrgC', s.prgc_90), ('P', s.p_90), ('T', s.t_90), ('I', s.i_90),
      ('PAdj-T', s.padj_t_90), ('PAdj-I', s.padj_i_90),
      ('Aerials Won %', CASE WHEN s.aerials_att IS NOT NULL AND s.aerials_won_pct IS NOT NULL AND mn.aer_mean IS NOT NULL
         THEN 100 * ((s.aerials_won_pct / 100 * s.aerials_att) + p_k * mn.aer_mean / 100) / (s.aerials_att + p_k) ELSE s.aerials_won_pct END),
      ('Press/90', s.press_90),
      ('Press Succ %', CASE WHEN s.press_att IS NOT NULL AND s.press_succ_pct IS NOT NULL AND mn.prs_mean IS NOT NULL
         THEN 100 * ((s.press_succ_pct / 100 * s.press_att) + p_k * mn.prs_mean / 100) / (s.press_att + p_k) ELSE s.press_succ_pct END),
      ('Sprints/90', s.sprints_90), ('Dist/90', s.dist_90), ('Att3rd Rec', s.att3rd_rec_90),
      ('PSxG±/90', s.psxg_diff_90), ('Save %', s.save_pct), ('Cross Stop %', s.cross_stop_pct), ('#OPA/90', s.opa_90)
    ) AS v(code, val)
    WHERE v.val IS NOT NULL
  ), ref AS (SELECT * FROM base WHERE minutes >= p_min_ref_minutes),
  pct AS (
    SELECT b.player_id, b.code, b.grp,
           100.0 * (count(*) FILTER (WHERE r.val < b.val) + 0.5 * count(*) FILTER (WHERE r.val = b.val)) / count(*) AS p
    FROM base b JOIN ref r ON r.grp = b.grp AND r.code = b.code
    GROUP BY b.player_id, b.code, b.grp
  )
  INSERT INTO player_percentile(player_id, season, indicator_code, reference_group, percentile, computed_at)
  SELECT player_id, p_season, code, grp, round(p::numeric, 2), now() FROM pct
  ON CONFLICT (player_id, season, indicator_code)
  DO UPDATE SET percentile = EXCLUDED.percentile, reference_group = EXCLUDED.reference_group, computed_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;

-- Tính Score_Role cho mọi vai trò thuộc nhóm vị trí của từng cầu thủ (nhóm lân cận do backend
-- quyết định theo quy tắc 25% số phút). Thiếu tracking → chuyển trọng số Sprints/90 và Dist/90
-- sang Press/90 và PrgC (chia theo p_fallback_to_press, phần còn lại sang PrgC); không gán 0.
-- Thiếu percentile của chỉ số có trọng số dương → không phát hành điểm vai trò đó.
CREATE OR REPLACE FUNCTION fn_refresh_role_scores(p_season varchar, p_matrix integer DEFAULT NULL,
    p_full_sample numeric DEFAULT 2000, p_fallback_to_press numeric DEFAULT 0.5)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_matrix integer; v_rows integer;
BEGIN
  v_matrix := coalesce(p_matrix, (SELECT id FROM role_weight_matrix WHERE status = 'active'));
  IF v_matrix IS NULL THEN RAISE EXCEPTION 'SCORING_CONFIG_MISSING: chưa có ma trận vai trò hoạt động'; END IF;
  IF EXISTS (SELECT 1 FROM fn_validate_matrix(v_matrix) WHERE NOT ok) THEN
    RAISE EXCEPTION 'MATRIX_INVALID: ma trận % có vai trò tổng trọng số khác 100%%', v_matrix;
  END IF;

  DELETE FROM player_role_score WHERE season = p_season AND matrix_id = v_matrix;

  WITH mins AS (
    SELECT player_id, sum(minutes_played) AS minutes FROM player_stats
    WHERE season = p_season AND deleted_at IS NULL GROUP BY player_id
  ), pl AS (
    SELECT p.id AS player_id, p.position AS grp, mi.minutes,
           coalesce(m.tracking_available, false) AS trk
    FROM player p
    JOIN position_group g ON g.code = p.position AND g.is_scorable
    JOIN mins mi ON mi.player_id = p.id AND mi.minutes > 0
    LEFT JOIN player_season_metrics m ON m.player_id = p.id AND m.season = p_season
    WHERE p.deleted_at IS NULL
  ), trk_w AS (
    SELECT role_id, coalesce(sum(weight) FILTER (WHERE indicator_code IN ('Sprints/90','Dist/90')), 0) AS w
    FROM role_weight WHERE matrix_id = v_matrix GROUP BY role_id
  ), ew AS (
    SELECT pl.player_id, r.id AS role_id, rw.indicator_code, pl.minutes, pl.trk,
           CASE WHEN pl.trk THEN rw.weight
                WHEN rw.indicator_code IN ('Sprints/90','Dist/90') THEN 0
                WHEN rw.indicator_code = 'Press/90' THEN rw.weight + t.w * p_fallback_to_press
                WHEN rw.indicator_code = 'PrgC'     THEN rw.weight + t.w * (1 - p_fallback_to_press)
                ELSE rw.weight END AS w
    FROM pl
    JOIN tactical_role r ON r.position_group = pl.grp
    JOIN role_weight rw ON rw.matrix_id = v_matrix AND rw.role_id = r.id
    JOIN trk_w t ON t.role_id = r.id
  ), sc AS (
    SELECT ew.player_id, ew.role_id, max(ew.minutes) AS minutes, bool_or(NOT ew.trk) AS fallback,
           sum(ew.w * pp.percentile) AS wp,
           count(*) FILTER (WHERE ew.w > 0 AND pp.percentile IS NULL) AS missing
    FROM ew LEFT JOIN player_percentile pp
      ON pp.player_id = ew.player_id AND pp.season = p_season AND pp.indicator_code = ew.indicator_code
    GROUP BY ew.player_id, ew.role_id
  )
  INSERT INTO player_role_score(player_id, season, matrix_id, role_id, score, minutes, s_minute, tracking_fallback)
  SELECT player_id, p_season, v_matrix, role_id,
         round(fn_role_score(wp, fn_s_minute(minutes, p_full_sample))::numeric, 2),
         minutes, round(fn_s_minute(minutes, p_full_sample)::numeric, 2), fallback
  FROM sc WHERE missing = 0 AND wp IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;

-- ---------------------------------------------------------------------
-- F. View
-- ---------------------------------------------------------------------
-- Hợp đồng kèm số tháng còn lại và cờ Free Agent (BR01: còn ≤ 6 tháng hoặc đã hết hạn)
CREATE OR REPLACE VIEW v_contract_status AS
SELECT c.*,
       (c.end_date - current_date) AS days_remaining,
       round(((c.end_date - current_date) / 30.4375)::numeric, 1) AS months_remaining,
       round(((c.end_date - current_date) / 365.25)::numeric, 2) AS years_remaining,
       (c.end_date <= current_date + interval '6 months') AS is_free_agent_window
FROM contract c WHERE c.deleted_at IS NULL;

-- Hợp đồng hiện hành của cầu thủ: ưu tiên hợp đồng cho mượn (CLB đang thi đấu cho)
CREATE OR REPLACE VIEW v_player_current_contract AS
SELECT DISTINCT ON (c.player_id) c.*
FROM contract c
WHERE c.deleted_at IS NULL AND c.status = 'active' AND current_date BETWEEN c.start_date AND c.end_date
ORDER BY c.player_id, (c.contract_type = 'loan') DESC, c.end_date DESC;

-- View đầy đủ (Scout/Admin): có lương
CREATE OR REPLACE VIEW v_player_card AS
SELECT p.id, p.name, p.date_of_birth, fn_age(p.date_of_birth) AS age, p.nationality, p.position,
       p.height, p.preferred_foot, p.status, p.market_value, p.market_value_label, p.photo_url,
       cl.id AS club_id, cl.name AS club_name, cl.league,
       c.id AS contract_id, c.contract_type, c.start_date, c.end_date AS contract_end_date,
       round(((c.end_date - current_date) / 30.4375)::numeric, 1) AS months_remaining,
       c.release_clause, c.salary_per_year, c.reliability_label AS contract_reliability, c.parent_club_id,
       (SELECT sum(s.minutes_played) FROM player_stats s
         WHERE s.player_id = p.id AND s.deleted_at IS NULL
           AND s.season = (SELECT max(season) FROM player_stats WHERE player_id = p.id AND deleted_at IS NULL)) AS season_minutes
FROM player p
LEFT JOIN v_player_current_contract c ON c.player_id = p.id
LEFT JOIN club cl ON cl.id = c.club_id
WHERE p.deleted_at IS NULL;

-- View công khai (Guest): không có lương (BR06)
CREATE OR REPLACE VIEW v_player_card_public AS
SELECT id, name, date_of_birth, age, nationality, position, height, preferred_foot, status, market_value,
       market_value_label, photo_url, club_id, club_name, league, contract_id, contract_type, start_date,
       contract_end_date, months_remaining, release_clause, contract_reliability, parent_club_id, season_minutes
FROM v_player_card;

-- Hợp đồng sắp hết hạn (thông báo 12/6/3 tháng)
CREATE OR REPLACE VIEW v_contract_expiring AS
SELECT c.id AS contract_id, c.player_id, c.club_id, c.end_date,
       round(((c.end_date - current_date) / 30.4375)::numeric, 1) AS months_remaining,
       CASE WHEN c.end_date <= current_date + interval '3 months' THEN 3
            WHEN c.end_date <= current_date + interval '6 months' THEN 6
            WHEN c.end_date <= current_date + interval '12 months' THEN 12 END AS threshold_months
FROM contract c
WHERE c.deleted_at IS NULL AND c.status = 'active' AND c.end_date >= current_date
  AND c.end_date <= current_date + interval '12 months' AND c.record_status = 'verified';

-- Vector vai trò: hạng và chênh lệch với vai trò đầu bảng (cờ ROLE_TIE khi gap < 3)
CREATE OR REPLACE VIEW v_player_role_vector AS
SELECT s.player_id, s.season, s.matrix_id, r.name AS role, r.position_group, s.score,
       rank() OVER w AS role_rank,
       max(s.score) OVER (PARTITION BY s.player_id, s.season, s.matrix_id) - s.score AS gap_to_top,
       s.minutes, s.s_minute, s.tracking_fallback
FROM player_role_score s JOIN tactical_role r ON r.id = s.role_id
WINDOW w AS (PARTITION BY s.player_id, s.season, s.matrix_id ORDER BY s.score DESC);

-- Shortlist theo nhu cầu kèm điểm Matching gần nhất
CREATE OR REPLACE VIEW v_shortlist_detail AS
SELECT sl.id, sl.user_id, sl.requirement_id, sl.note, sl.created_at,
       pc.id AS player_id, pc.name AS player_name, pc.age, pc.position, pc.club_name, pc.contract_end_date,
       fn_fee_est(pc.market_value) AS fee_est_default,
       lm.matching, lm.f_score, lm.s_score, lm.r_score, lm.run_id, coalesce(lm.stale, false) AS stale
FROM shortlist sl
JOIN v_player_card pc ON pc.id = sl.player_id
LEFT JOIN LATERAL (
  SELECT mr.matching, mr.f_score, mr.s_score, mr.r_score, mr.run_id, r.stale
  FROM match_result mr JOIN match_run r ON r.id = mr.run_id
  WHERE mr.user_id = sl.user_id AND mr.player_id = sl.player_id AND mr.requirement_id IS NOT DISTINCT FROM sl.requirement_id
  ORDER BY mr.created_at DESC LIMIT 1
) lm ON true;

-- Tìm kiếm không dấu + mờ (UC02):  SELECT * FROM fn_suggest('nguyen', 8);
CREATE OR REPLACE FUNCTION fn_suggest(p_q text, p_limit integer DEFAULT 8)
RETURNS TABLE (type text, id integer, name text, subtitle text, sim real) LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT f_unaccent(lower(p_q)) AS t)
  SELECT * FROM (
    SELECT 'player'::text, p.id, p.name::text, (p.position || ' · ' || coalesce(c.club_name, '—'))::text,
           greatest(similarity(f_unaccent(lower(p.name)), q.t),
                    CASE WHEN f_unaccent(lower(p.name)) LIKE '%' || q.t || '%' THEN 0.6 ELSE 0 END)::real
    FROM q, player p LEFT JOIN v_player_card c ON c.id = p.id
    WHERE p.deleted_at IS NULL AND char_length(p_q) >= 2
      AND (f_unaccent(lower(p.name)) % q.t OR f_unaccent(lower(p.name)) LIKE '%' || q.t || '%')
    UNION ALL
    SELECT 'club'::text, cl.id, cl.name::text, coalesce(cl.league, '')::text,
           greatest(similarity(f_unaccent(lower(cl.name)), q.t),
                    CASE WHEN f_unaccent(lower(cl.name)) LIKE '%' || q.t || '%' THEN 0.6 ELSE 0 END)::real
    FROM q, club cl
    WHERE cl.deleted_at IS NULL AND char_length(p_q) >= 2
      AND (f_unaccent(lower(cl.name)) % q.t OR f_unaccent(lower(cl.name)) LIKE '%' || q.t || '%')
  ) s ORDER BY 5 DESC, 3 LIMIT p_limit $$;
-- =====================================================================