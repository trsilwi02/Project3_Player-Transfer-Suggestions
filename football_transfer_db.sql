-- =====================================================================
-- Football Transfer System — Database schema (PostgreSQL 16)
-- Nguồn: ERD + thực thể mở rộng trong "Tài liệu đặc tả API" v1.0,
--        Matching Engine V1&V2 Unified, ma trận trọng số vai trò.
-- Chạy theo thứ tự: 01_schema → 02_functions_views → 03_seed_reference
--                   → (tuỳ chọn) 04_demo_and_tests
-- =====================================================================
\set ON_ERROR_STOP on

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
-- 02. Trigger, hàm tính điểm (Matching Engine V2) và view
-- =====================================================================
\set ON_ERROR_STOP on

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
-- 03. Dữ liệu tham chiếu (SINH TỰ ĐỘNG từ ma_tran_trong_so_vai_tro_chien_thuat.xlsx)
-- Vị trí, 24 chỉ số, 35 vai trò, ma trận trọng số rwm-v2.0, cấu hình chấm điểm mặc định.
-- =====================================================================
\set ON_ERROR_STOP on

INSERT INTO position_group(code, name_vi, is_scorable, sort_order) VALUES
('CB','Trung vệ',true,1),
('RB/LB','Hậu vệ biên/cánh',true,2),
('CM/CDM','Tiền vệ trung tâm/phòng ngự',true,3),
('CAM','Tiền vệ công',true,4),
('LW/RW','Tiền đạo cánh',true,5),
('ST','Tiền đạo cắm',true,6),
('GK','Thủ môn',false,7);

INSERT INTO position_group_adjacency(group_code, adjacent_code) VALUES
('RB/LB','LW/RW'),
('CM/CDM','CAM'),
('CAM','CM/CDM'),
('CAM','LW/RW'),
('CAM','ST'),
('LW/RW','RB/LB'),
('LW/RW','CAM'),
('LW/RW','ST'),
('ST','CAM'),
('ST','LW/RW');

INSERT INTO indicator(code, name_vi, applies_to, is_tracking, is_pressing_group, higher_is_better, sort_order) VALUES
('G','Bàn thắng','outfield',false,false,true,1),
('xG','Bàn thắng kỳ vọng','outfield',false,false,true,2),
('A','Kiến tạo','outfield',false,false,true,3),
('xA','Kiến tạo kỳ vọng','outfield',false,false,true,4),
('K','Đường chuyền tạo cơ hội','outfield',false,false,true,5),
('PrgP','Đường chuyền tịnh tiến','both',false,false,true,6),
('PrgC','Kéo bóng tịnh tiến','outfield',false,false,true,7),
('P','Đường chuyền thành công /90','both',false,false,true,8),
('T','Tắc bóng thành công','outfield',false,false,true,9),
('I','Cắt bóng','outfield',false,false,true,10),
('PAdj-T','Tắc bóng (điều chỉnh kiểm soát)','outfield',false,false,true,11),
('PAdj-I','Cắt bóng (điều chỉnh kiểm soát)','outfield',false,false,true,12),
('Aerials Won %','Tỷ lệ thắng không chiến','outfield',false,false,true,13),
('Press/90','Số lần áp sát /90','outfield',false,true,true,14),
('Press Succ %','Tỷ lệ áp sát thành công','outfield',false,true,true,15),
('Sprints/90','Số pha bứt tốc /90','outfield',true,true,true,16),
('Dist/90','Quãng đường di chuyển /90','outfield',true,true,true,17),
('Att3rd Rec','Thu hồi bóng ở 1/3 sân đối phương','outfield',false,true,true,18),
('PSxG±/90','Cản phá vượt kỳ vọng','gk',false,false,true,19),
('Save %','Tỷ lệ cản phá','gk',false,false,true,20),
('Cross Stop %','Tỷ lệ bắt bóng tạt','gk',false,false,true,21),
('#OPA/90','Can thiệp ngoài vòng cấm /90','gk',false,false,true,22);

INSERT INTO tactical_role(name, name_vi, position_group, sort_order) VALUES
('No-Nonsense CB','Trung vệ phá bóng','CB',1),
('Ball-Playing CB','Trung vệ triển khai bóng','CB',2),
('Stopper','Trung vệ áp sát','CB',3),
('Covering CB','Trung vệ bọc lót','CB',4),
('Defensive FB','Hậu vệ biên thiên thủ','RB/LB',5),
('Attacking FB','Hậu vệ biên thiên công','RB/LB',6),
('Inverted FB','Hậu vệ biên bó trong','RB/LB',7),
('Underlapping FB','Hậu vệ chạy chồng trong','RB/LB',8),
('Wing-Back','Hậu vệ cánh (hệ 3 trung vệ)','RB/LB',9),
('Anchor Man','Mỏ neo phòng ngự','CM/CDM',10),
('Ball-Winning Mid','Tiền vệ thu hồi bóng (Destroyer)','CM/CDM',11),
('Deep-Lying PM','Nhạc trưởng lùi sâu','CM/CDM',12),
('Half-Back','Tiền vệ lùi thành trung vệ','CM/CDM',13),
('Box-to-Box','Tiền vệ con thoi','CM/CDM',14),
('Central PM','Tiền vệ kiến thiết trung tâm','CM/CDM',15),
('Mezzala','Tiền vệ lệch trung tâm','CM/CDM',16),
('Carrilero','Tiền vệ hỗ trợ hành lang','CM/CDM',17),
('Advanced PM','Nhạc trưởng tuyến trên','CAM',18),
('Trequartista','Số 10 tự do','CAM',19),
('Shadow Striker','Tiền đạo bóng ma','CAM',20),
('Winger','Tiền đạo cánh truyền thống','LW/RW',21),
('Inverted Winger','Tiền đạo cánh nghịch chân','LW/RW',22),
('Inside Forward','Tiền đạo cánh bó vào trong','LW/RW',23),
('Wide Playmaker','Nhà kiến thiết từ biên','LW/RW',24),
('Defensive Winger','Cầu thủ cánh hỗ trợ phòng ngự','LW/RW',25),
('Poacher','Sát thủ vòng cấm','ST',26),
('Target Man','Tiền đạo mục tiêu','ST',27),
('False Nine','Số 9 ảo','ST',28),
('Deep-Lying Fwd','Tiền đạo lùi sâu','ST',29),
('Advanced Fwd','Tiền đạo chơi cao','ST',30),
('Pressing Fwd','Tiền đạo pressing','ST',31),
('Complete Fwd','Tiền đạo toàn diện','ST',32),
('Second Striker','Tiền đạo thứ hai','ST',33),
('Traditional GK','Thủ môn truyền thống','GK',34),
('Sweeper Keeper','Thủ môn quét','GK',35);

INSERT INTO role_weight_matrix(version, name, source, status) VALUES
('rwm-v2.0','Ma trận trọng số vai trò chiến thuật V2','ma_tran_trong_so_vai_tro_chien_thuat.xlsx','draft');

-- Trọng số dạng phân số (0,04 = 4%); ô trống trong xlsx = 0. Tổng mỗi vai trò = 1.
INSERT INTO role_weight(matrix_id, role_id, indicator_code, weight)
SELECT m.id, r.id, v.ind, v.w FROM role_weight_matrix m
JOIN (VALUES
('No-Nonsense CB','G',0),
('No-Nonsense CB','xG',0),
('No-Nonsense CB','A',0),
('No-Nonsense CB','xA',0),
('No-Nonsense CB','K',0),
('No-Nonsense CB','PrgP',0.050000),
('No-Nonsense CB','PrgC',0),
('No-Nonsense CB','P',0.050000),
('No-Nonsense CB','T',0),
('No-Nonsense CB','I',0),
('No-Nonsense CB','PAdj-T',0.150000),
('No-Nonsense CB','PAdj-I',0.300000),
('No-Nonsense CB','Aerials Won %',0.300000),
('No-Nonsense CB','Press/90',0.050000),
('No-Nonsense CB','Press Succ %',0.050000),
('No-Nonsense CB','Sprints/90',0.050000),
('No-Nonsense CB','Dist/90',0),
('No-Nonsense CB','Att3rd Rec',0),
('Ball-Playing CB','G',0),
('Ball-Playing CB','xG',0),
('Ball-Playing CB','A',0),
('Ball-Playing CB','xA',0),
('Ball-Playing CB','K',0),
('Ball-Playing CB','PrgP',0.280000),
('Ball-Playing CB','PrgC',0.100000),
('Ball-Playing CB','P',0.200000),
('Ball-Playing CB','T',0),
('Ball-Playing CB','I',0),
('Ball-Playing CB','PAdj-T',0.080000),
('Ball-Playing CB','PAdj-I',0.120000),
('Ball-Playing CB','Aerials Won %',0.150000),
('Ball-Playing CB','Press/90',0.030000),
('Ball-Playing CB','Press Succ %',0.020000),
('Ball-Playing CB','Sprints/90',0.020000),
('Ball-Playing CB','Dist/90',0),
('Ball-Playing CB','Att3rd Rec',0),
('Stopper','G',0),
('Stopper','xG',0),
('Stopper','A',0),
('Stopper','xA',0),
('Stopper','K',0),
('Stopper','PrgP',0.040000),
('Stopper','PrgC',0),
('Stopper','P',0.040000),
('Stopper','T',0),
('Stopper','I',0),
('Stopper','PAdj-T',0.220000),
('Stopper','PAdj-I',0.220000),
('Stopper','Aerials Won %',0.250000),
('Stopper','Press/90',0.080000),
('Stopper','Press Succ %',0.120000),
('Stopper','Sprints/90',0.030000),
('Stopper','Dist/90',0),
('Stopper','Att3rd Rec',0),
('Covering CB','G',0),
('Covering CB','xG',0),
('Covering CB','A',0),
('Covering CB','xA',0),
('Covering CB','K',0),
('Covering CB','PrgP',0.050000),
('Covering CB','PrgC',0),
('Covering CB','P',0.100000),
('Covering CB','T',0),
('Covering CB','I',0),
('Covering CB','PAdj-T',0.150000),
('Covering CB','PAdj-I',0.300000),
('Covering CB','Aerials Won %',0.200000),
('Covering CB','Press/90',0),
('Covering CB','Press Succ %',0.050000),
('Covering CB','Sprints/90',0.100000),
('Covering CB','Dist/90',0.050000),
('Covering CB','Att3rd Rec',0),
('Defensive FB','G',0),
('Defensive FB','xG',0),
('Defensive FB','A',0),
('Defensive FB','xA',0.030000),
('Defensive FB','K',0),
('Defensive FB','PrgP',0.060000),
('Defensive FB','PrgC',0),
('Defensive FB','P',0.050000),
('Defensive FB','T',0),
('Defensive FB','I',0),
('Defensive FB','PAdj-T',0.220000),
('Defensive FB','PAdj-I',0.220000),
('Defensive FB','Aerials Won %',0.080000),
('Defensive FB','Press/90',0.080000),
('Defensive FB','Press Succ %',0.080000),
('Defensive FB','Sprints/90',0.080000),
('Defensive FB','Dist/90',0.100000),
('Defensive FB','Att3rd Rec',0),
('Attacking FB','G',0),
('Attacking FB','xG',0),
('Attacking FB','A',0.050000),
('Attacking FB','xA',0.180000),
('Attacking FB','K',0.100000),
('Attacking FB','PrgP',0.150000),
('Attacking FB','PrgC',0.120000),
('Attacking FB','P',0),
('Attacking FB','T',0),
('Attacking FB','I',0),
('Attacking FB','PAdj-T',0.050000),
('Attacking FB','PAdj-I',0.040000),
('Attacking FB','Aerials Won %',0),
('Attacking FB','Press/90',0.040000),
('Attacking FB','Press Succ %',0),
('Attacking FB','Sprints/90',0.150000),
('Attacking FB','Dist/90',0.120000),
('Attacking FB','Att3rd Rec',0),
('Inverted FB','G',0),
('Inverted FB','xG',0),
('Inverted FB','A',0.020000),
('Inverted FB','xA',0.080000),
('Inverted FB','K',0.050000),
('Inverted FB','PrgP',0.250000),
('Inverted FB','PrgC',0.080000),
('Inverted FB','P',0.200000),
('Inverted FB','T',0),
('Inverted FB','I',0),
('Inverted FB','PAdj-T',0.080000),
('Inverted FB','PAdj-I',0.100000),
('Inverted FB','Aerials Won %',0),
('Inverted FB','Press/90',0.060000),
('Inverted FB','Press Succ %',0),
('Inverted FB','Sprints/90',0.030000),
('Inverted FB','Dist/90',0.050000),
('Inverted FB','Att3rd Rec',0),
('Underlapping FB','G',0),
('Underlapping FB','xG',0.050000),
('Underlapping FB','A',0.050000),
('Underlapping FB','xA',0.150000),
('Underlapping FB','K',0.120000),
('Underlapping FB','PrgP',0.150000),
('Underlapping FB','PrgC',0.180000),
('Underlapping FB','P',0),
('Underlapping FB','T',0),
('Underlapping FB','I',0),
('Underlapping FB','PAdj-T',0.050000),
('Underlapping FB','PAdj-I',0.040000),
('Underlapping FB','Aerials Won %',0),
('Underlapping FB','Press/90',0.030000),
('Underlapping FB','Press Succ %',0),
('Underlapping FB','Sprints/90',0.100000),
('Underlapping FB','Dist/90',0.080000),
('Underlapping FB','Att3rd Rec',0),
('Wing-Back','G',0),
('Wing-Back','xG',0),
('Wing-Back','A',0.040000),
('Wing-Back','xA',0.150000),
('Wing-Back','K',0.100000),
('Wing-Back','PrgP',0.100000),
('Wing-Back','PrgC',0.120000),
('Wing-Back','P',0),
('Wing-Back','T',0),
('Wing-Back','I',0),
('Wing-Back','PAdj-T',0.080000),
('Wing-Back','PAdj-I',0.060000),
('Wing-Back','Aerials Won %',0.030000),
('Wing-Back','Press/90',0.050000),
('Wing-Back','Press Succ %',0),
('Wing-Back','Sprints/90',0.130000),
('Wing-Back','Dist/90',0.140000),
('Wing-Back','Att3rd Rec',0),
('Anchor Man','G',0),
('Anchor Man','xG',0),
('Anchor Man','A',0),
('Anchor Man','xA',0),
('Anchor Man','K',0),
('Anchor Man','PrgP',0.100000),
('Anchor Man','PrgC',0),
('Anchor Man','P',0.150000),
('Anchor Man','T',0),
('Anchor Man','I',0),
('Anchor Man','PAdj-T',0.180000),
('Anchor Man','PAdj-I',0.250000),
('Anchor Man','Aerials Won %',0.100000),
('Anchor Man','Press/90',0.060000),
('Anchor Man','Press Succ %',0.060000),
('Anchor Man','Sprints/90',0.020000),
('Anchor Man','Dist/90',0.080000),
('Anchor Man','Att3rd Rec',0),
('Ball-Winning Mid','G',0),
('Ball-Winning Mid','xG',0),
('Ball-Winning Mid','A',0),
('Ball-Winning Mid','xA',0),
('Ball-Winning Mid','K',0),
('Ball-Winning Mid','PrgP',0.040000),
('Ball-Winning Mid','PrgC',0),
('Ball-Winning Mid','P',0.040000),
('Ball-Winning Mid','T',0),
('Ball-Winning Mid','I',0),
('Ball-Winning Mid','PAdj-T',0.200000),
('Ball-Winning Mid','PAdj-I',0.200000),
('Ball-Winning Mid','Aerials Won %',0.050000),
('Ball-Winning Mid','Press/90',0.150000),
('Ball-Winning Mid','Press Succ %',0.150000),
('Ball-Winning Mid','Sprints/90',0.040000),
('Ball-Winning Mid','Dist/90',0.080000),
('Ball-Winning Mid','Att3rd Rec',0.050000),
('Deep-Lying PM','G',0),
('Deep-Lying PM','xG',0),
('Deep-Lying PM','A',0.040000),
('Deep-Lying PM','xA',0.150000),
('Deep-Lying PM','K',0.080000),
('Deep-Lying PM','PrgP',0.250000),
('Deep-Lying PM','PrgC',0.050000),
('Deep-Lying PM','P',0.200000),
('Deep-Lying PM','T',0),
('Deep-Lying PM','I',0),
('Deep-Lying PM','PAdj-T',0.050000),
('Deep-Lying PM','PAdj-I',0.050000),
('Deep-Lying PM','Aerials Won %',0),
('Deep-Lying PM','Press/90',0.030000),
('Deep-Lying PM','Press Succ %',0),
('Deep-Lying PM','Sprints/90',0.020000),
('Deep-Lying PM','Dist/90',0.080000),
('Deep-Lying PM','Att3rd Rec',0),
('Half-Back','G',0),
('Half-Back','xG',0),
('Half-Back','A',0),
('Half-Back','xA',0.050000),
('Half-Back','K',0),
('Half-Back','PrgP',0.220000),
('Half-Back','PrgC',0.050000),
('Half-Back','P',0.220000),
('Half-Back','T',0),
('Half-Back','I',0),
('Half-Back','PAdj-T',0.100000),
('Half-Back','PAdj-I',0.150000),
('Half-Back','Aerials Won %',0.080000),
('Half-Back','Press/90',0.040000),
('Half-Back','Press Succ %',0.040000),
('Half-Back','Sprints/90',0),
('Half-Back','Dist/90',0.050000),
('Half-Back','Att3rd Rec',0),
('Box-to-Box','G',0.040000),
('Box-to-Box','xG',0.050000),
('Box-to-Box','A',0.040000),
('Box-to-Box','xA',0.070000),
('Box-to-Box','K',0.080000),
('Box-to-Box','PrgP',0.140000),
('Box-to-Box','PrgC',0.120000),
('Box-to-Box','P',0),
('Box-to-Box','T',0.100000),
('Box-to-Box','I',0.080000),
('Box-to-Box','PAdj-T',0),
('Box-to-Box','PAdj-I',0),
('Box-to-Box','Aerials Won %',0),
('Box-to-Box','Press/90',0.080000),
('Box-to-Box','Press Succ %',0),
('Box-to-Box','Sprints/90',0.100000),
('Box-to-Box','Dist/90',0.100000),
('Box-to-Box','Att3rd Rec',0),
('Central PM','G',0),
('Central PM','xG',0.030000),
('Central PM','A',0.050000),
('Central PM','xA',0.150000),
('Central PM','K',0.150000),
('Central PM','PrgP',0.220000),
('Central PM','PrgC',0.080000),
('Central PM','P',0.150000),
('Central PM','T',0),
('Central PM','I',0),
('Central PM','PAdj-T',0.030000),
('Central PM','PAdj-I',0.030000),
('Central PM','Aerials Won %',0),
('Central PM','Press/90',0.040000),
('Central PM','Press Succ %',0),
('Central PM','Sprints/90',0.020000),
('Central PM','Dist/90',0.050000),
('Central PM','Att3rd Rec',0),
('Mezzala','G',0.060000),
('Mezzala','xG',0.100000),
('Mezzala','A',0.060000),
('Mezzala','xA',0.140000),
('Mezzala','K',0.120000),
('Mezzala','PrgP',0.120000),
('Mezzala','PrgC',0.180000),
('Mezzala','P',0),
('Mezzala','T',0),
('Mezzala','I',0),
('Mezzala','PAdj-T',0.020000),
('Mezzala','PAdj-I',0.020000),
('Mezzala','Aerials Won %',0),
('Mezzala','Press/90',0.040000),
('Mezzala','Press Succ %',0),
('Mezzala','Sprints/90',0.080000),
('Mezzala','Dist/90',0.060000),
('Mezzala','Att3rd Rec',0),
('Carrilero','G',0),
('Carrilero','xG',0),
('Carrilero','A',0),
('Carrilero','xA',0.050000),
('Carrilero','K',0.050000),
('Carrilero','PrgP',0.120000),
('Carrilero','PrgC',0.040000),
('Carrilero','P',0.140000),
('Carrilero','T',0),
('Carrilero','I',0),
('Carrilero','PAdj-T',0.140000),
('Carrilero','PAdj-I',0.140000),
('Carrilero','Aerials Won %',0),
('Carrilero','Press/90',0.080000),
('Carrilero','Press Succ %',0.060000),
('Carrilero','Sprints/90',0.040000),
('Carrilero','Dist/90',0.140000),
('Carrilero','Att3rd Rec',0),
('Advanced PM','G',0.050000),
('Advanced PM','xG',0.080000),
('Advanced PM','A',0.100000),
('Advanced PM','xA',0.220000),
('Advanced PM','K',0.200000),
('Advanced PM','PrgP',0.150000),
('Advanced PM','PrgC',0.100000),
('Advanced PM','P',0.040000),
('Advanced PM','T',0),
('Advanced PM','I',0),
('Advanced PM','PAdj-T',0),
('Advanced PM','PAdj-I',0),
('Advanced PM','Aerials Won %',0),
('Advanced PM','Press/90',0.030000),
('Advanced PM','Press Succ %',0),
('Advanced PM','Sprints/90',0),
('Advanced PM','Dist/90',0.030000),
('Advanced PM','Att3rd Rec',0),
('Trequartista','G',0.080000),
('Trequartista','xG',0.100000),
('Trequartista','A',0.100000),
('Trequartista','xA',0.200000),
('Trequartista','K',0.180000),
('Trequartista','PrgP',0.120000),
('Trequartista','PrgC',0.150000),
('Trequartista','P',0.050000),
('Trequartista','T',0),
('Trequartista','I',0),
('Trequartista','PAdj-T',0),
('Trequartista','PAdj-I',0),
('Trequartista','Aerials Won %',0),
('Trequartista','Press/90',0),
('Trequartista','Press Succ %',0),
('Trequartista','Sprints/90',0.020000),
('Trequartista','Dist/90',0),
('Trequartista','Att3rd Rec',0),
('Shadow Striker','G',0.200000),
('Shadow Striker','xG',0.250000),
('Shadow Striker','A',0.050000),
('Shadow Striker','xA',0.080000),
('Shadow Striker','K',0.070000),
('Shadow Striker','PrgP',0.050000),
('Shadow Striker','PrgC',0.100000),
('Shadow Striker','P',0),
('Shadow Striker','T',0),
('Shadow Striker','I',0),
('Shadow Striker','PAdj-T',0),
('Shadow Striker','PAdj-I',0),
('Shadow Striker','Aerials Won %',0),
('Shadow Striker','Press/90',0.050000),
('Shadow Striker','Press Succ %',0),
('Shadow Striker','Sprints/90',0.100000),
('Shadow Striker','Dist/90',0),
('Shadow Striker','Att3rd Rec',0.050000),
('Winger','G',0.050000),
('Winger','xG',0.050000),
('Winger','A',0.100000),
('Winger','xA',0.200000),
('Winger','K',0.180000),
('Winger','PrgP',0.030000),
('Winger','PrgC',0.200000),
('Winger','P',0),
('Winger','T',0),
('Winger','I',0),
('Winger','PAdj-T',0),
('Winger','PAdj-I',0),
('Winger','Aerials Won %',0),
('Winger','Press/90',0.030000),
('Winger','Press Succ %',0),
('Winger','Sprints/90',0.120000),
('Winger','Dist/90',0.040000),
('Winger','Att3rd Rec',0),
('Inverted Winger','G',0.100000),
('Inverted Winger','xG',0.140000),
('Inverted Winger','A',0.050000),
('Inverted Winger','xA',0.140000),
('Inverted Winger','K',0.120000),
('Inverted Winger','PrgP',0.050000),
('Inverted Winger','PrgC',0.200000),
('Inverted Winger','P',0),
('Inverted Winger','T',0),
('Inverted Winger','I',0),
('Inverted Winger','PAdj-T',0),
('Inverted Winger','PAdj-I',0),
('Inverted Winger','Aerials Won %',0),
('Inverted Winger','Press/90',0.050000),
('Inverted Winger','Press Succ %',0),
('Inverted Winger','Sprints/90',0.100000),
('Inverted Winger','Dist/90',0.030000),
('Inverted Winger','Att3rd Rec',0.020000),
('Inside Forward','G',0.220000),
('Inside Forward','xG',0.280000),
('Inside Forward','A',0.050000),
('Inside Forward','xA',0.080000),
('Inside Forward','K',0.060000),
('Inside Forward','PrgP',0),
('Inside Forward','PrgC',0.120000),
('Inside Forward','P',0),
('Inside Forward','T',0),
('Inside Forward','I',0),
('Inside Forward','PAdj-T',0),
('Inside Forward','PAdj-I',0),
('Inside Forward','Aerials Won %',0.020000),
('Inside Forward','Press/90',0.040000),
('Inside Forward','Press Succ %',0),
('Inside Forward','Sprints/90',0.100000),
('Inside Forward','Dist/90',0),
('Inside Forward','Att3rd Rec',0.030000),
('Wide Playmaker','G',0),
('Wide Playmaker','xG',0.040000),
('Wide Playmaker','A',0.080000),
('Wide Playmaker','xA',0.240000),
('Wide Playmaker','K',0.220000),
('Wide Playmaker','PrgP',0.150000),
('Wide Playmaker','PrgC',0.120000),
('Wide Playmaker','P',0.060000),
('Wide Playmaker','T',0),
('Wide Playmaker','I',0),
('Wide Playmaker','PAdj-T',0),
('Wide Playmaker','PAdj-I',0),
('Wide Playmaker','Aerials Won %',0),
('Wide Playmaker','Press/90',0.030000),
('Wide Playmaker','Press Succ %',0),
('Wide Playmaker','Sprints/90',0.030000),
('Wide Playmaker','Dist/90',0.030000),
('Wide Playmaker','Att3rd Rec',0),
('Defensive Winger','G',0),
('Defensive Winger','xG',0.020000),
('Defensive Winger','A',0),
('Defensive Winger','xA',0.050000),
('Defensive Winger','K',0.040000),
('Defensive Winger','PrgP',0),
('Defensive Winger','PrgC',0.060000),
('Defensive Winger','P',0),
('Defensive Winger','T',0),
('Defensive Winger','I',0),
('Defensive Winger','PAdj-T',0.140000),
('Defensive Winger','PAdj-I',0.100000),
('Defensive Winger','Aerials Won %',0),
('Defensive Winger','Press/90',0.180000),
('Defensive Winger','Press Succ %',0.150000),
('Defensive Winger','Sprints/90',0.080000),
('Defensive Winger','Dist/90',0.120000),
('Defensive Winger','Att3rd Rec',0.060000),
('Poacher','G',0.300000),
('Poacher','xG',0.350000),
('Poacher','A',0.050000),
('Poacher','xA',0.050000),
('Poacher','K',0.050000),
('Poacher','PrgP',0),
('Poacher','PrgC',0),
('Poacher','P',0),
('Poacher','T',0),
('Poacher','I',0),
('Poacher','PAdj-T',0),
('Poacher','PAdj-I',0),
('Poacher','Aerials Won %',0.150000),
('Poacher','Press/90',0),
('Poacher','Press Succ %',0),
('Poacher','Sprints/90',0.050000),
('Poacher','Dist/90',0),
('Poacher','Att3rd Rec',0),
('Target Man','G',0.180000),
('Target Man','xG',0.200000),
('Target Man','A',0.050000),
('Target Man','xA',0.060000),
('Target Man','K',0.060000),
('Target Man','PrgP',0),
('Target Man','PrgC',0),
('Target Man','P',0.050000),
('Target Man','T',0),
('Target Man','I',0),
('Target Man','PAdj-T',0),
('Target Man','PAdj-I',0),
('Target Man','Aerials Won %',0.300000),
('Target Man','Press/90',0.030000),
('Target Man','Press Succ %',0),
('Target Man','Sprints/90',0),
('Target Man','Dist/90',0.040000),
('Target Man','Att3rd Rec',0.030000),
('False Nine','G',0.080000),
('False Nine','xG',0.100000),
('False Nine','A',0.070000),
('False Nine','xA',0.180000),
('False Nine','K',0.160000),
('False Nine','PrgP',0.140000),
('False Nine','PrgC',0.120000),
('False Nine','P',0.100000),
('False Nine','T',0),
('False Nine','I',0),
('False Nine','PAdj-T',0),
('False Nine','PAdj-I',0),
('False Nine','Aerials Won %',0),
('False Nine','Press/90',0.020000),
('False Nine','Press Succ %',0),
('False Nine','Sprints/90',0),
('False Nine','Dist/90',0.030000),
('False Nine','Att3rd Rec',0),
('Deep-Lying Fwd','G',0.140000),
('Deep-Lying Fwd','xG',0.180000),
('Deep-Lying Fwd','A',0.060000),
('Deep-Lying Fwd','xA',0.140000),
('Deep-Lying Fwd','K',0.120000),
('Deep-Lying Fwd','PrgP',0.120000),
('Deep-Lying Fwd','PrgC',0.080000),
('Deep-Lying Fwd','P',0.080000),
('Deep-Lying Fwd','T',0),
('Deep-Lying Fwd','I',0),
('Deep-Lying Fwd','PAdj-T',0),
('Deep-Lying Fwd','PAdj-I',0),
('Deep-Lying Fwd','Aerials Won %',0.040000),
('Deep-Lying Fwd','Press/90',0.040000),
('Deep-Lying Fwd','Press Succ %',0),
('Deep-Lying Fwd','Sprints/90',0),
('Deep-Lying Fwd','Dist/90',0),
('Deep-Lying Fwd','Att3rd Rec',0),
('Advanced Fwd','G',0.250000),
('Advanced Fwd','xG',0.300000),
('Advanced Fwd','A',0.040000),
('Advanced Fwd','xA',0.050000),
('Advanced Fwd','K',0.020000),
('Advanced Fwd','PrgP',0),
('Advanced Fwd','PrgC',0.080000),
('Advanced Fwd','P',0),
('Advanced Fwd','T',0),
('Advanced Fwd','I',0),
('Advanced Fwd','PAdj-T',0),
('Advanced Fwd','PAdj-I',0),
('Advanced Fwd','Aerials Won %',0.050000),
('Advanced Fwd','Press/90',0.020000),
('Advanced Fwd','Press Succ %',0),
('Advanced Fwd','Sprints/90',0.150000),
('Advanced Fwd','Dist/90',0),
('Advanced Fwd','Att3rd Rec',0.040000),
('Pressing Fwd','G',0.170000),
('Pressing Fwd','xG',0.220000),
('Pressing Fwd','A',0.060000),
('Pressing Fwd','xA',0.060000),
('Pressing Fwd','K',0.050000),
('Pressing Fwd','PrgP',0),
('Pressing Fwd','PrgC',0.060000),
('Pressing Fwd','P',0),
('Pressing Fwd','T',0),
('Pressing Fwd','I',0),
('Pressing Fwd','PAdj-T',0),
('Pressing Fwd','PAdj-I',0),
('Pressing Fwd','Aerials Won %',0.050000),
('Pressing Fwd','Press/90',0.120000),
('Pressing Fwd','Press Succ %',0.080000),
('Pressing Fwd','Sprints/90',0.050000),
('Pressing Fwd','Dist/90',0),
('Pressing Fwd','Att3rd Rec',0.080000),
('Complete Fwd','G',0.150000),
('Complete Fwd','xG',0.200000),
('Complete Fwd','A',0.060000),
('Complete Fwd','xA',0.100000),
('Complete Fwd','K',0.080000),
('Complete Fwd','PrgP',0.050000),
('Complete Fwd','PrgC',0.080000),
('Complete Fwd','P',0.030000),
('Complete Fwd','T',0),
('Complete Fwd','I',0),
('Complete Fwd','PAdj-T',0),
('Complete Fwd','PAdj-I',0),
('Complete Fwd','Aerials Won %',0.100000),
('Complete Fwd','Press/90',0.060000),
('Complete Fwd','Press Succ %',0),
('Complete Fwd','Sprints/90',0.050000),
('Complete Fwd','Dist/90',0),
('Complete Fwd','Att3rd Rec',0.040000),
('Second Striker','G',0.180000),
('Second Striker','xG',0.220000),
('Second Striker','A',0.080000),
('Second Striker','xA',0.120000),
('Second Striker','K',0.120000),
('Second Striker','PrgP',0),
('Second Striker','PrgC',0.100000),
('Second Striker','P',0.030000),
('Second Striker','T',0),
('Second Striker','I',0),
('Second Striker','PAdj-T',0),
('Second Striker','PAdj-I',0),
('Second Striker','Aerials Won %',0),
('Second Striker','Press/90',0.050000),
('Second Striker','Press Succ %',0),
('Second Striker','Sprints/90',0.060000),
('Second Striker','Dist/90',0),
('Second Striker','Att3rd Rec',0.040000),
('Traditional GK','PSxG±/90',0.400000),
('Traditional GK','Save %',0.200000),
('Traditional GK','Cross Stop %',0.250000),
('Traditional GK','#OPA/90',0.050000),
('Traditional GK','P',0.050000),
('Traditional GK','PrgP',0.050000),
('Sweeper Keeper','PSxG±/90',0.200000),
('Sweeper Keeper','Save %',0.100000),
('Sweeper Keeper','Cross Stop %',0.100000),
('Sweeper Keeper','#OPA/90',0.300000),
('Sweeper Keeper','P',0.100000),
('Sweeper Keeper','PrgP',0.200000)
) AS v(role, ind, w) ON true
JOIN tactical_role r ON r.name = v.role
WHERE m.version = 'rwm-v2.0';

UPDATE role_weight_matrix SET status = 'active' WHERE version = 'rwm-v2.0';   -- kiểm tra tổng 100% rồi kích hoạt

INSERT INTO scoring_config(version, name, status, role_matrix_id, w_f, w_s, w_r, strategies, params)
SELECT 'cfg-2026.11-v1','Cấu hình mặc định V2 (Cân bằng 30/50/20)','draft', id, 0.30, 0.50, 0.20,
       '{"moneyball": {"F": 0.5, "S": 0.3, "R": 0.2}, "balanced": {"F": 0.3, "S": 0.5, "R": 0.2}, "long_term": {"F": 0.2, "S": 0.3, "R": 0.5}, "need_now": {"F": 0.2, "S": 0.7, "R": 0.1}}'::jsonb, '{"kappa": 1.15, "smoothing_k": 30, "min_reference_minutes": 450, "minutes_full_sample": 2000, "role_tie_gap": 3, "injury_window_months": 24, "default_injury_score": 70, "wage_estimate_multiplier": 1.2, "rumor_factor": 0.8, "holding_years": 3, "price_trend_cap": 0.3, "price_volatility_cap": 0.35, "min_minutes_default": 900, "s_min_default": 70, "contract_years_range": [2, 4], "shortlist_size_default": 10, "tracking_fallback": {"to": ["Press/90", "PrgC"], "split": [0.5, 0.5]}}'::jsonb
FROM role_weight_matrix WHERE version = 'rwm-v2.0';
UPDATE scoring_config SET status = 'active' WHERE version = 'cfg-2026.11-v1';
