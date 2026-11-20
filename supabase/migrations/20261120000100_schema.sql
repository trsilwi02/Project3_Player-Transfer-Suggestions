-- =====================================================================
-- Football Transfer System — Database schema (PostgreSQL 16)
-- Nguồn: ERD + thực thể mở rộng trong "Tài liệu đặc tả API" v1.0,
--        Matching Engine V1&V2 Unified, ma trận trọng số vai trò.
-- Chạy theo thứ tự: 01_schema → 02_functions_views → 03_seed_reference
--                   → (tuỳ chọn) 04_demo_and_tests
-- =====================================================================
-- psql meta-command omitted for supabase migration compatibility

CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- tìm mờ (fuzzy) cho auto-complete
CREATE EXTENSION IF NOT EXISTS unaccent;    -- tìm không dấu
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint chống chồng lấn hợp đồng
CREATE EXTENSION IF NOT EXISTS citext;      -- email không phân biệt hoa/thường

-- Tìm không dấu: unaccent() không IMMUTABLE nên cần hàm bọc để dùng trong index.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE DOMAIN d_score AS numeric(5,2) CHECK (VALUE IS NULL OR (VALUE >= 0 AND VALUE <= 100));
CREATE DOMAIN d_money AS numeric(15,2) CHECK (VALUE IS NULL OR VALUE >= 0);

-- ---------------------------------------------------------------------
-- 1. Danh mục vị trí
-- ---------------------------------------------------------------------
CREATE TABLE position_group (
  code        varchar(10) PRIMARY KEY,
  name_vi     varchar(100) NOT NULL,
  is_scorable boolean NOT NULL DEFAULT true,   -- GK: false (chưa có công thức chấm điểm vai trò)
  sort_order  smallint NOT NULL DEFAULT 0
);
COMMENT ON COLUMN position_group.is_scorable IS 'false = Matching trả UNSUPPORTED_POSITION (GK).';

CREATE TABLE position_group_adjacency (
  group_code    varchar(10) NOT NULL REFERENCES position_group(code),
  adjacent_code varchar(10) NOT NULL REFERENCES position_group(code),
  PRIMARY KEY (group_code, adjacent_code),
  CHECK (group_code <> adjacent_code)
);

-- ---------------------------------------------------------------------
-- 2. Người dùng (ERD: User)
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      varchar(50)  NOT NULL UNIQUE CHECK (char_length(username) >= 3),
  email         citext       NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role          varchar(20)  NOT NULL DEFAULT 'scout' CHECK (role IN ('scout','admin')),
  status        varchar(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  locale        varchar(5)   NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi','en')),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_token (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,              -- SHA-256 hex; không lưu token gốc
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_token_user ON refresh_token(user_id) WHERE revoked_at IS NULL;

CREATE TABLE user_device (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  device_token varchar(512) NOT NULL UNIQUE,
  platform     varchar(10) NOT NULL CHECK (platform IN ('fcm','apns')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_user_device_user ON user_device(user_id);

-- ---------------------------------------------------------------------
-- 3. Dữ liệu master: Club, Player, Contract, Transfer, MarketValue,
--    PlayerStats, InjuryHistory.  record_status: draft → verified;
--    xóa mềm bằng deleted_at (BR05, UC10).
-- ---------------------------------------------------------------------
CREATE TABLE club (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         varchar(100) NOT NULL,
  country      varchar(100),
  league       varchar(100),
  founded_year integer CHECK (founded_year BETWEEN 1800 AND 2100),
  logo_url     text,
  record_status varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_club_name_country ON club (lower(name), coalesce(country,'')) WHERE deleted_at IS NULL;
CREATE INDEX ix_club_league ON club(league) WHERE deleted_at IS NULL;
CREATE INDEX ix_club_name_trgm ON club USING gin (f_unaccent(lower(name)) gin_trgm_ops);

CREATE TABLE player (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            varchar(100) NOT NULL,
  date_of_birth   date NOT NULL CHECK (date_of_birth > DATE '1950-01-01'),   -- tuổi tính động (BR08)
  nationality     varchar(100),
  position        varchar(10)  NOT NULL REFERENCES position_group(code),     -- vị trí chính
  market_value    d_money,
  market_value_label  varchar(20) CHECK (market_value_label IN ('rumor','reputable_media','official','financial_report')),
  market_value_source text,
  height          integer CHECK (height BETWEEN 120 AND 230),
  preferred_foot  varchar(10) CHECK (preferred_foot IN ('left','right','both')),
  status          varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_loan','free_agent','retired')),
  photo_url       text,
  -- true = Admin xác nhận đã nhập đủ lịch sử chấn thương (kể cả "không có ca nào").
  -- false + không có bản ghi = THIẾU dữ liệu (R_inj tạm 70 + cờ), không phải "khỏe mạnh".
  injury_history_complete boolean NOT NULL DEFAULT false,
  record_status   varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (market_value IS NULL OR (market_value_label IS NOT NULL AND market_value_source IS NOT NULL))  -- BR03
);
CREATE INDEX ix_player_position   ON player(position)      WHERE deleted_at IS NULL;
CREATE INDEX ix_player_dob        ON player(date_of_birth) WHERE deleted_at IS NULL;
CREATE INDEX ix_player_value      ON player(market_value)  WHERE deleted_at IS NULL;
CREATE INDEX ix_player_nat        ON player(nationality)  WHERE deleted_at IS NULL;
CREATE INDEX ix_player_status     ON player(status)       WHERE deleted_at IS NULL;
CREATE INDEX ix_player_name_trgm  ON player USING gin (f_unaccent(lower(name)) gin_trgm_ops);

-- Vị trí phụ: chỉ nhập/xác minh, không tự suy ra.
CREATE TABLE player_secondary_position (
  player_id     integer NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  position_code varchar(10) NOT NULL REFERENCES position_group(code),
  verified      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (player_id, position_code)
);

CREATE TABLE contract (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id        integer NOT NULL REFERENCES player(id),
  club_id          integer NOT NULL REFERENCES club(id),
  contract_type    varchar(10) NOT NULL DEFAULT 'permanent' CHECK (contract_type IN ('permanent','loan','free')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  salary_per_year  d_money,
  release_clause   d_money,
  transfer_fee     d_money,
  buy_option       d_money,
  parent_club_id   integer REFERENCES club(id),
  status           varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated')),
  reliability_label varchar(20) CHECK (reliability_label IN ('rumor','reputable_media','official','financial_report')),
  source           text,
  record_status    varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_contract_dates CHECK (end_date > start_date),
  CONSTRAINT ck_contract_loan_parent CHECK (contract_type <> 'loan' OR parent_club_id IS NOT NULL),   -- BR02
  CONSTRAINT ck_contract_parent_diff CHECK (parent_club_id IS NULL OR parent_club_id <> club_id),
  -- BR03: mọi dữ liệu tài chính phải có nhãn tin cậy và nguồn
  CONSTRAINT ck_contract_financial_label CHECK (
    (salary_per_year IS NULL AND release_clause IS NULL AND transfer_fee IS NULL AND buy_option IS NULL)
    OR (reliability_label IS NOT NULL AND source IS NOT NULL)),
  -- BR02: tại một thời điểm chỉ có một hợp đồng chính hiệu lực (loan có ràng buộc riêng)
  CONSTRAINT ex_contract_main_overlap EXCLUDE USING gist (
    player_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    WHERE (status = 'active' AND deleted_at IS NULL AND contract_type IN ('permanent','free')),
  CONSTRAINT ex_contract_loan_overlap EXCLUDE USING gist (
    player_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    WHERE (status = 'active' AND deleted_at IS NULL AND contract_type = 'loan')
);
CREATE INDEX ix_contract_player   ON contract(player_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_contract_club     ON contract(club_id)   WHERE deleted_at IS NULL;
CREATE INDEX ix_contract_end      ON contract(end_date)  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX ix_contract_release  ON contract(release_clause) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX ix_contract_salary   ON contract(salary_per_year) WHERE deleted_at IS NULL AND status = 'active';

CREATE TABLE transfer (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id    integer NOT NULL REFERENCES player(id),
  from_club_id integer REFERENCES club(id),
  to_club_id   integer REFERENCES club(id),
  transfer_date date NOT NULL,
  type         varchar(10) NOT NULL CHECK (type IN ('permanent','loan','free')),
  fee          d_money,
  reliability_label varchar(20) CHECK (reliability_label IN ('rumor','reputable_media','official','financial_report')),
  source       text,
  record_status varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (from_club_id IS NOT NULL OR to_club_id IS NOT NULL),
  CHECK (fee IS NULL OR (reliability_label IS NOT NULL AND source IS NOT NULL))
);
CREATE INDEX ix_transfer_player ON transfer(player_id, transfer_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE market_value (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id    integer NOT NULL REFERENCES player(id),
  value_date   date NOT NULL,                   -- ngày thực tế của mốc giá (để đánh giá độ cũ)
  value        numeric(15,2) NOT NULL CHECK (value > 0),
  source       text NOT NULL,
  reliability_label varchar(20) NOT NULL CHECK (reliability_label IN ('rumor','reputable_media','official','financial_report')),
  record_status varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, value_date, source)
);
CREATE INDEX ix_market_value_player ON market_value(player_id, value_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE player_stats (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id      integer NOT NULL REFERENCES player(id),
  season         varchar(20) NOT NULL,           -- ví dụ '2025/2026'
  league         varchar(100) NOT NULL DEFAULT 'ALL',
  appearances    integer NOT NULL DEFAULT 0 CHECK (appearances >= 0),
  minutes_played integer NOT NULL DEFAULT 0 CHECK (minutes_played >= 0),
  goals          integer NOT NULL DEFAULT 0 CHECK (goals >= 0),
  assists        integer NOT NULL DEFAULT 0 CHECK (assists >= 0),
  yellow_cards   integer NOT NULL DEFAULT 0 CHECK (yellow_cards >= 0),
  red_cards      integer NOT NULL DEFAULT 0 CHECK (red_cards >= 0),
  record_status  varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season, league)
);
CREATE INDEX ix_player_stats_season ON player_stats(season, minutes_played DESC) WHERE deleted_at IS NULL;

-- 18 chỉ số của ma trận vai trò (đã quy /90 nếu là chỉ số đếm; tỷ lệ % để nguyên).
-- Chỉ số tracking (sprints_90, dist_90, att3rd_rec) có thể NULL: thiếu dữ liệu ≠ 0.
CREATE TABLE player_season_metrics (
  player_id   integer NOT NULL REFERENCES player(id),
  season      varchar(20) NOT NULL,
  g_90 numeric(8,4), xg_90 numeric(8,4), a_90 numeric(8,4), xa_90 numeric(8,4), k_90 numeric(8,4),
  prgp_90 numeric(8,4), prgc_90 numeric(8,4), p_90 numeric(8,4), t_90 numeric(8,4), i_90 numeric(8,4),
  padj_t_90 numeric(8,4), padj_i_90 numeric(8,4),
  aerials_won_pct numeric(6,3), aerials_att integer CHECK (aerials_att >= 0),
  press_90 numeric(8,4), press_succ_pct numeric(6,3), press_att integer CHECK (press_att >= 0),
  sprints_90 numeric(8,4), dist_90 numeric(10,2)  /* mét */, att3rd_rec_90 numeric(8,4),
  -- thủ môn
  psxg_diff_90 numeric(8,4), save_pct numeric(6,3), cross_stop_pct numeric(6,3), opa_90 numeric(8,4),
  tracking_available boolean GENERATED ALWAYS AS (sprints_90 IS NOT NULL AND dist_90 IS NOT NULL) STORED,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season)
);

CREATE TABLE injury_history (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id   integer NOT NULL REFERENCES player(id),
  injury_type varchar(100) NOT NULL,
  body_part   varchar(50),                       -- dùng để phạt tái phát cùng vùng cơ thể
  start_date  date NOT NULL,
  end_date    date,
  days_missed integer NOT NULL CHECK (days_missed >= 0),
  record_status varchar(10) NOT NULL DEFAULT 'draft' CHECK (record_status IN ('draft','verified')),
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX ix_injury_player ON injury_history(player_id, start_date DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 4. Ma trận vai trò chiến thuật + cấu hình chấm điểm (có phiên bản)
-- ---------------------------------------------------------------------
CREATE TABLE indicator (
  code           varchar(30) PRIMARY KEY,         -- 'G','xG',...,'Att3rd Rec','PSxG±/90'
  name_vi        varchar(100) NOT NULL,
  applies_to     varchar(10) NOT NULL CHECK (applies_to IN ('outfield','gk','both')),
  is_tracking    boolean NOT NULL DEFAULT false,
  is_pressing_group boolean NOT NULL DEFAULT false, -- nhóm vận động/pressing (ô cam trong xlsx)
  higher_is_better boolean NOT NULL DEFAULT true,
  sort_order     smallint NOT NULL
);

CREATE TABLE tactical_role (
  id             smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           varchar(50) NOT NULL UNIQUE,     -- 'Box-to-Box'
  name_vi        varchar(100) NOT NULL,
  position_group varchar(10) NOT NULL REFERENCES position_group(code),
  sort_order     smallint NOT NULL
);

CREATE TABLE role_weight_matrix (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version     varchar(30) NOT NULL UNIQUE,         -- 'rwm-v2.0'
  name        varchar(100) NOT NULL,
  source      text,
  status      varchar(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by  integer REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);
CREATE UNIQUE INDEX ux_one_active_matrix ON role_weight_matrix ((true)) WHERE status = 'active';

CREATE TABLE role_weight (
  matrix_id    integer  NOT NULL REFERENCES role_weight_matrix(id) ON DELETE CASCADE,
  role_id      smallint NOT NULL REFERENCES tactical_role(id),
  indicator_code varchar(30) NOT NULL REFERENCES indicator(code),
  weight       numeric(7,6) NOT NULL CHECK (weight >= 0 AND weight <= 1),   -- ô trống = 0
  PRIMARY KEY (matrix_id, role_id, indicator_code)
);

CREATE TABLE scoring_config (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version      varchar(30) NOT NULL UNIQUE,        -- 'cfg-2026.11-v1'
  name         varchar(100) NOT NULL,
  status       varchar(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  role_matrix_id integer NOT NULL REFERENCES role_weight_matrix(id),
  -- trọng số trụ cột mặc định (chiến lược "Cân bằng")
  w_f numeric(5,4) NOT NULL, w_s numeric(5,4) NOT NULL, w_r numeric(5,4) NOT NULL,
  strategies   jsonb NOT NULL,                     -- moneyball / balanced / long_term / need_now
  fee_w_fee numeric(5,4) NOT NULL DEFAULT 0.45, fee_w_wage numeric(5,4) NOT NULL DEFAULT 0.35, fee_w_con numeric(5,4) NOT NULL DEFAULT 0.20,
  risk_w_inj numeric(5,4) NOT NULL DEFAULT 0.50, risk_w_resale numeric(5,4) NOT NULL DEFAULT 0.50,
  threshold_high     numeric(5,2) NOT NULL DEFAULT 80,   -- BR09: > 80 khuyến nghị cao
  threshold_consider numeric(5,2) NOT NULL DEFAULT 50,   -- 50–79 cần cân nhắc; < 50 rủi ro cao
  params       jsonb NOT NULL DEFAULT '{}',        -- kappa, smoothing_k, min_reference_minutes, ...
  created_by   integer REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CONSTRAINT ck_cfg_pillars CHECK (w_f >= 0 AND w_s >= 0 AND w_r >= 0 AND abs(w_f + w_s + w_r - 1) < 0.00001),
  CONSTRAINT ck_cfg_fee     CHECK (fee_w_fee >= 0 AND fee_w_wage >= 0 AND fee_w_con >= 0 AND abs(fee_w_fee + fee_w_wage + fee_w_con - 1) < 0.00001),
  CONSTRAINT ck_cfg_risk    CHECK (risk_w_inj >= 0 AND risk_w_resale >= 0 AND abs(risk_w_inj + risk_w_resale - 1) < 0.00001),
  CONSTRAINT ck_cfg_thresholds CHECK (threshold_consider < threshold_high)
);
CREATE UNIQUE INDEX ux_one_active_config ON scoring_config ((true)) WHERE status = 'active';

-- Điểm vai trò tính sẵn (giai đoạn "tính sẵn theo lô")
CREATE TABLE player_percentile (
  player_id      integer NOT NULL REFERENCES player(id),
  season         varchar(20) NOT NULL,
  indicator_code varchar(30) NOT NULL REFERENCES indicator(code),
  reference_group varchar(10) NOT NULL REFERENCES position_group(code),
  percentile     numeric(5,2) NOT NULL CHECK (percentile BETWEEN 0 AND 100),
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season, indicator_code)
);

CREATE TABLE player_role_score (
  player_id  integer  NOT NULL REFERENCES player(id),
  season     varchar(20) NOT NULL,
  matrix_id  integer  NOT NULL REFERENCES role_weight_matrix(id),
  role_id    smallint NOT NULL REFERENCES tactical_role(id),
  score      d_score  NOT NULL,
  minutes    integer  NOT NULL,
  s_minute   d_score  NOT NULL,
  tracking_fallback boolean NOT NULL DEFAULT false,   -- true = đã chuyển trọng số tracking sang Press/90 & PrgC
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season, matrix_id, role_id)
);
CREATE INDEX ix_role_score_role ON player_role_score(matrix_id, role_id, season, score DESC);

-- ---------------------------------------------------------------------
-- 5. Nhu cầu CLB, Matching, Shortlist
-- ---------------------------------------------------------------------
CREATE TABLE club_requirement (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  club_id       integer REFERENCES club(id),               -- có thể bỏ trống (activity diagram)
  position      varchar(10) NOT NULL REFERENCES position_group(code),
  min_age       integer CHECK (min_age >= 0),
  max_age       integer,
  salary_limit  d_money NOT NULL CHECK (salary_limit > 0),  -- W_cap
  budget        d_money NOT NULL CHECK (budget > 0),        -- B
  priority      integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  matching_params jsonb NOT NULL DEFAULT '{}',              -- s_min, min_minutes, tau_*, strategy, ...
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (max_age IS NULL OR min_age IS NULL OR min_age <= max_age)
);
CREATE INDEX ix_requirement_user ON club_requirement(user_id, priority, created_at DESC);

CREATE TABLE club_requirement_role (
  requirement_id integer  NOT NULL REFERENCES club_requirement(id) ON DELETE CASCADE,
  role_id        smallint NOT NULL REFERENCES tactical_role(id),
  PRIMARY KEY (requirement_id, role_id)
);

CREATE TABLE match_run (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_code       varchar(40) NOT NULL UNIQUE,              -- 'run_20261105_0043' (hiển thị qua API)
  user_id        integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  requirement_id integer REFERENCES club_requirement(id) ON DELETE SET NULL,
  config_id      integer NOT NULL REFERENCES scoring_config(id),
  matrix_id      integer NOT NULL REFERENCES role_weight_matrix(id),
  params_snapshot jsonb NOT NULL,                          -- tham số hiệu lực lúc chạy (tái lập kết quả)
  summary        jsonb NOT NULL DEFAULT '{}',
  data_as_of     date NOT NULL,
  stale          boolean NOT NULL DEFAULT false,           -- nhu cầu đã sửa sau lần chạy này
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_match_run_req ON match_run(requirement_id, created_at DESC);

CREATE TABLE match_result (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         uuid NOT NULL REFERENCES match_run(id) ON DELETE CASCADE,
  user_id        integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  player_id      integer NOT NULL REFERENCES player(id),
  requirement_id integer REFERENCES club_requirement(id) ON DELETE SET NULL,
  rank           integer CHECK (rank >= 1),
  matching       d_score,                                  -- NULL nếu thiếu trụ cột (không chia lại trọng số)
  f_score        d_score,
  s_score        d_score,
  r_score        d_score,
  requested_role_id smallint REFERENCES tactical_role(id),
  recommendation varchar(10) CHECK (recommendation IN ('high','consider','risk')),
  breakdown      jsonb NOT NULL DEFAULT '{}',              -- thành phần F_fee/F_wage/..., vai trò phụ
  pros           jsonb NOT NULL DEFAULT '[]',
  cons           jsonb NOT NULL DEFAULT '[]',
  flags          text[] NOT NULL DEFAULT '{}',
  explanation    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, player_id)
);
CREATE INDEX ix_match_result_run    ON match_result(run_id, rank);
CREATE INDEX ix_match_result_player ON match_result(player_id, created_at DESC);

CREATE TABLE match_exclusion (
  run_id    uuid    NOT NULL REFERENCES match_run(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES player(id),
  reasons   jsonb   NOT NULL,                               -- [{code, message}]
  PRIMARY KEY (run_id, player_id)
);

-- ERD: Shortlist là bảng phẳng (user, player, requirement, note, created_at).
-- Khác ERD: user_id NOT NULL (shortlist luôn thuộc một người dùng); requirement_id vẫn nullable.
CREATE TABLE shortlist (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  player_id      integer NOT NULL REFERENCES player(id),
  requirement_id integer REFERENCES club_requirement(id) ON DELETE CASCADE,
  note           varchar(255),
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Chống trùng (user, player, requirement) kể cả khi requirement_id NULL → API 409 SHORTLIST_DUPLICATE
CREATE UNIQUE INDEX ux_shortlist_dedupe ON shortlist (user_id, player_id, coalesce(requirement_id, 0));
CREATE INDEX ix_shortlist_req    ON shortlist(requirement_id, created_at DESC);
CREATE INDEX ix_shortlist_player ON shortlist(player_id);

CREATE TABLE saved_filter (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name       varchar(100) NOT NULL,
  criteria   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- ---------------------------------------------------------------------
-- 6. Sự kiện, thông báo
-- ---------------------------------------------------------------------
CREATE TABLE domain_event (                -- hàng đợi cho Scheduler
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  varchar(40) NOT NULL,        -- CONTRACT_SIGNED, CONTRACT_RENEWED, CONTRACT_TERMINATED, ...
  player_id   integer NOT NULL REFERENCES player(id),
  entity_type varchar(40),
  entity_id   integer,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX ix_domain_event_pending ON domain_event(created_at) WHERE processed_at IS NULL;

CREATE TABLE notification (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type       varchar(40) NOT NULL CHECK (type IN (
               'CONTRACT_RENEWED','CONTRACT_TERMINATED','CONTRACT_EXPIRY_12M','CONTRACT_EXPIRY_6M',
               'CONTRACT_EXPIRY_3M','RELEASE_CLAUSE_CHANGED','MARKET_VALUE_CHANGED','INJURY_UPDATED')),
  title      varchar(200) NOT NULL,
  body       text,
  player_id  integer REFERENCES player(id) ON DELETE SET NULL,
  event_key  varchar(100) NOT NULL,         -- BR07: một sự kiện chỉ một thông báo cho mỗi người dùng
  payload    jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);
CREATE INDEX ix_notification_user ON notification(user_id, created_at DESC);
CREATE INDEX ix_notification_unread ON notification(user_id) WHERE read_at IS NULL;

CREATE TABLE notification_setting (
  user_id integer PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  types   jsonb NOT NULL DEFAULT '{}',                              -- {"CONTRACT_EXPIRY_6M": true, ...}
  contract_thresholds_months integer[] NOT NULL DEFAULT '{12,6,3}',
  value_change_threshold_pct numeric(5,2) NOT NULL DEFAULT 20 CHECK (value_change_threshold_pct > 0),
  push_enabled boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
-- 7. Audit log (chỉ thêm, không sửa/xóa) và tác vụ nền
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  log_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type varchar(60) NOT NULL,
  entity_id   varchar(60) NOT NULL,
  action      varchar(20) NOT NULL CHECK (action IN ('create','update','delete','restore','verify','activate')),
  old_value   jsonb,
  new_value   jsonb,
  actor_id    integer,                      -- không FK: log tồn tại độc lập với tài khoản
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX ix_audit_actor  ON audit_log(actor_id, created_at DESC);
CREATE INDEX ix_audit_time   ON audit_log(created_at DESC);

CREATE TABLE import_job (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_code varchar(40) NOT NULL UNIQUE,
  user_id     integer NOT NULL REFERENCES app_user(id),
  resource    varchar(30) NOT NULL,
  file_name   varchar(255) NOT NULL,
  on_conflict varchar(10) NOT NULL DEFAULT 'skip' CHECK (on_conflict IN ('skip','update')),
  status      varchar(12) NOT NULL DEFAULT 'validating' CHECK (status IN ('validating','ready','failed','confirmed','cancelled')),
  total_rows  integer NOT NULL DEFAULT 0,
  valid_rows  integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  preview     jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE import_error (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES import_job(id) ON DELETE CASCADE,
  row_no    integer NOT NULL,
  field     varchar(60),
  issue     text NOT NULL,
  value     text
);
CREATE INDEX ix_import_error ON import_error(import_id, row_no);

CREATE TABLE job (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code    varchar(40) NOT NULL UNIQUE,
  type        varchar(40) NOT NULL CHECK (type IN ('recompute_role_scores','recompute_percentiles','scan_contracts')),
  params      jsonb NOT NULL DEFAULT '{}',
  status      varchar(12) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  processed   integer NOT NULL DEFAULT 0,
  total       integer,
  error       text,
  requested_by integer,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_job_running ON job(type) WHERE status IN ('queued','running');  -- API 409 khi đang có job cùng loại
-- =====================================================================