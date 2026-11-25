-- 07. Requirement profiles (UC05) and multi-list shortlists (UC08).
--
-- Closes the two schema gaps recorded in the plan:
--   G13  shortlist was a flat table without a list name or priority, so UC08's
--        "several lists per user" could not be represented.
--   G14  club_requirement lacked name, a custom club label and the profile
--        direction (ready now / develop), and only stored a single position.
--
-- Both changes are additive and backfill existing rows, so the demo dataset and
-- the matching pipeline keep working unchanged.
SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- G14: UC05 requirement profile
-- ---------------------------------------------------------------------------
ALTER TABLE club_requirement
  ADD COLUMN IF NOT EXISTS name      varchar(100),
  ADD COLUMN IF NOT EXISTS club_name varchar(100),
  ADD COLUMN IF NOT EXISTS direction varchar(20);

UPDATE club_requirement SET name = 'Requirement #' || id WHERE name IS NULL;
UPDATE club_requirement SET direction = 'ready_now'        WHERE direction IS NULL;

ALTER TABLE club_requirement
  ALTER COLUMN name      SET NOT NULL,
  ALTER COLUMN direction SET NOT NULL,
  ALTER COLUMN direction SET DEFAULT 'ready_now';

ALTER TABLE club_requirement
  ADD CONSTRAINT ck_requirement_direction CHECK (direction IN ('ready_now', 'develop'));

-- Priority positions of a profile; `club_requirement.position` stays the main
-- one so fn_candidates and the matching pipeline keep a single anchor.
CREATE TABLE club_requirement_position (
  requirement_id integer     NOT NULL REFERENCES club_requirement(id) ON DELETE CASCADE,
  position       varchar(10) NOT NULL REFERENCES position_group(code),
  priority       smallint    NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  PRIMARY KEY (requirement_id, position)
);
CREATE INDEX ix_requirement_position ON club_requirement_position(requirement_id, priority);

INSERT INTO club_requirement_position (requirement_id, position, priority)
SELECT id, position, 1 FROM club_requirement
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- G13: UC08 shortlist lists
-- ---------------------------------------------------------------------------
ALTER TABLE shortlist
  ADD COLUMN IF NOT EXISTS list_name  varchar(100),
  ADD COLUMN IF NOT EXISTS priority   smallint,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE shortlist SET list_name  = 'Watchlist' WHERE list_name IS NULL;
UPDATE shortlist SET priority   = 3           WHERE priority IS NULL;
UPDATE shortlist SET updated_at = created_at  WHERE updated_at IS NULL;

ALTER TABLE shortlist
  ALTER COLUMN list_name  SET NOT NULL,
  ALTER COLUMN priority   SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN priority   SET DEFAULT 3,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE shortlist
  ADD CONSTRAINT ck_shortlist_priority CHECK (priority BETWEEN 1 AND 5);

-- One player per list and requirement; lists are per user.
DROP INDEX IF EXISTS ux_shortlist_dedupe;
CREATE UNIQUE INDEX ux_shortlist_dedupe
  ON shortlist (user_id, list_name, player_id, coalesce(requirement_id, 0));
CREATE INDEX ix_shortlist_user_list ON shortlist (user_id, list_name, priority, created_at DESC);

CREATE TRIGGER trg_a_touch_shortlist BEFORE UPDATE ON shortlist
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Shortlist read model: list metadata, money and the latest matching scores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_shortlist_detail AS
SELECT sl.id, sl.user_id, sl.requirement_id, sl.note, sl.created_at,
       pc.id AS player_id, pc.name AS player_name, pc.age, pc.position, pc.club_name, pc.contract_end_date,
       fn_fee_est(pc.market_value) AS fee_est_default,
       lm.matching, lm.f_score, lm.s_score, lm.r_score, lm.run_id, coalesce(lm.stale, false) AS stale,
       sl.list_name, sl.priority, sl.updated_at,
       pc.club_id, pc.league, pc.market_value, pc.market_value_label, pc.months_remaining,
       pc.preferred_foot, pc.status,
       pc.salary_per_year,
       fn_fee_est(pc.market_value) AS fee_est,
       -- Year-one outlay: transfer fee estimate plus one season of wages.
       fn_fee_est(pc.market_value) + coalesce(pc.salary_per_year, 0) AS cost_est
FROM shortlist sl
JOIN v_player_card pc ON pc.id = sl.player_id
LEFT JOIN LATERAL (
  SELECT mr.matching, mr.f_score, mr.s_score, mr.r_score, mr.run_id, r.stale
  FROM match_result mr JOIN match_run r ON r.id = mr.run_id
  WHERE mr.user_id = sl.user_id AND mr.player_id = sl.player_id AND mr.requirement_id IS NOT DISTINCT FROM sl.requirement_id
  ORDER BY mr.created_at DESC LIMIT 1
) lm ON true;

-- ---------------------------------------------------------------------------
-- Candidates now consider every priority position of the profile.
-- The main position and the optional adjacency shift stay as a fallback, so a
-- profile without rows in the new table behaves exactly as before.
-- ---------------------------------------------------------------------------
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
    SELECT crp.position AS pos
    FROM club_requirement_position crp
    WHERE crp.requirement_id = p_requirement_id
    UNION
    SELECT v_req.position
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

COMMENT ON FUNCTION fn_candidates(integer, jsonb) IS
  'Hard-filter candidates for a requirement (priority positions/age/minutes). Returns fee estimate.';
