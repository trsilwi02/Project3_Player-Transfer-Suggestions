const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const connectionString = process.env.TEST_DATABASE_URL;
const integration = connectionString ? test : (name, fn) => test(name, { skip: 'Set TEST_DATABASE_URL to a migrated, seeded PostgreSQL test database.' }, fn);
let client;

before(async () => {
  if (!connectionString) return;
  client = new Client({
    connectionString,
    ssl: connectionString && !/localhost|127\.0\.0\.1/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const functions = await client.query(`
    SELECT to_regprocedure('fn_f_fee(numeric,numeric,numeric)') AS fee,
           to_regprocedure('fn_run_match(integer,integer,jsonb)') AS run_match,
           to_regprocedure('fn_matching(numeric,numeric,numeric,numeric,numeric,numeric)') AS matching
  `);
  assert.ok(functions.rows[0].fee);
  assert.ok(functions.rows[0].run_match);
  assert.ok(functions.rows[0].matching);
});
after(async () => { if (client) await client.end(); });

integration('SQL: fee scoring boundary cases', async (t) => {
  for (const [fee, expected] of [[0, 100], [35, 58], [50, 40], [55, 0], [56, null], [null, null]]) {
    await t.test(`fee ${fee}`, async () => {
      const { rows } = await client.query('SELECT fn_f_fee($1, 50, 0.10) AS score', [fee]);
      if (expected === null) assert.equal(rows[0].score, null);
      else assert.ok(Math.abs(Number(rows[0].score) - expected) < 0.001);
    });
  }
});

integration('SQL: wage scoring and missing wage', async (t) => {
  for (const [wage, expected] of [[10, 40], [12, null], [null, null]]) {
    await t.test(`wage ${wage}`, async () => {
      const { rows } = await client.query('SELECT fn_f_wage($1, 10, 0.10) AS score', [wage]);
      if (expected === null) assert.equal(rows[0].score, null);
      else assert.ok(Math.abs(Number(rows[0].score) - expected) < 0.001);
    });
  }
});

integration('SQL: contract score boundaries and missing contract', async (t) => {
  for (const [years, expected] of [[2, 100], [3, 100], [4, 100], [1, 70], [0.5, 55], [5, 70], [null, null]]) {
    await t.test(`years left ${years}`, async () => {
      const { rows } = await client.query('SELECT fn_f_con($1) AS score', [years]);
      if (expected === null) assert.equal(rows[0].score, null);
      else assert.ok(Math.abs(Number(rows[0].score) - expected) < 0.001);
    });
  }
});

integration('SQL: matching normalization, missing data, and Case Study M', async (t) => {
  const cases = [
    ['normalized weights', [70, 80, 90, 0.5, 0.5, 0.5], 80],
    ['default V2 weights', [70, 80, 90], 79],
    ['null financial score', [null, 80, 90, 0.3, 0.5, 0.2], null],
    ['Case Study M', [62.9, 81.4, 80.2, 0.3, 0.5, 0.2], 75.6],
  ];
  for (const [name, args, expected] of cases) {
    await t.test(name, async () => {
      const { rows } = await client.query('SELECT fn_matching($1,$2,$3,$4,$5,$6) AS score', args);
      if (expected === null) assert.equal(rows[0].score, null);
      else assert.ok(Math.abs(Number(rows[0].score) - expected) < 0.2);
    });
  }
});

integration('SQL: F total propagates missing inputs', async () => {
  const { rows } = await client.query('SELECT fn_f_total(50, NULL, 70) AS score');
  assert.equal(rows[0].score, null);
});

integration('SQL: R total calculates known values and propagates missing data', async (t) => {
  await t.test('known injury and resale scores', async () => {
    const { rows } = await client.query('SELECT fn_r_total(83.7, 76.8) AS score');
    assert.ok(Math.abs(Number(rows[0].score) - 80.25) < 0.01);
  });
  await t.test('missing resale score remains NULL', async () => {
    const { rows } = await client.query('SELECT fn_r_total(83.7, NULL) AS score');
    assert.equal(rows[0].score, null);
  });
});

integration('SQL: end-to-end fn_run_match smoke test rolls back its fixture run', async (t) => {
  await client.query('BEGIN');
  try {
    const userInsert = await client.query(`
      INSERT INTO app_user(username, email, password_hash, role, status, locale)
      VALUES ('matching_sql_test', 'matching-sql-test@example.invalid', 'test-only', 'scout', 'active', 'en')
      ON CONFLICT (username) DO NOTHING RETURNING id
    `);
    const userId = userInsert.rows[0]?.id ?? (await client.query("SELECT id FROM app_user WHERE username = 'matching_sql_test'")).rows[0]?.id;
    assert.ok(userId, 'test user should exist');
    const position = await client.query('SELECT code FROM position_group WHERE is_scorable ORDER BY sort_order LIMIT 1');
    assert.ok(position.rows[0]?.code, 'reference position groups should be seeded');
    const req = await client.query(`
      INSERT INTO club_requirement(user_id, position, salary_limit, budget, matching_params)
      VALUES ($1, $2, 10000000, 100000000, '{"min_minutes":0,"s_min":0}') RETURNING id
    `, [userId, position.rows[0].code]);
    const result = await client.query('SELECT fn_run_match($1, $2, $3::jsonb) AS run_id', [req.rows[0].id, userId, '{"min_minutes":0,"s_min":0,"w_f":0.5,"w_s":0.5,"w_r":0.5}']);
    assert.ok(result.rows[0].run_id);
    const snapshot = await client.query('SELECT params_snapshot FROM match_run WHERE id = $1', [result.rows[0].run_id]);
    for (const key of ['w_f', 'w_s', 'w_r']) assert.ok(Math.abs(Number(snapshot.rows[0].params_snapshot[key]) - 1 / 3) < 0.000001);
    const run = await client.query('SELECT count(*)::int AS n FROM match_result WHERE run_id = $1', [result.rows[0].run_id]);
    assert.ok(run.rows[0].n >= 0);
  } finally {
    await client.query('ROLLBACK');
  }
});
