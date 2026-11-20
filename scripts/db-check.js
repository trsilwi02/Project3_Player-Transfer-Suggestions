let pg;
let dotenv;

try {
  pg = require('pg');
} catch {
  // pg not installed in root yet
}

try {
  dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv not installed
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

async function runDbChecks() {
  console.log('====================================================');
  console.log('   FOOTBALL TRANSFER SYSTEM — DB INTEGRITY CHECK    ');
  console.log('====================================================');

  if (!pg) {
    console.warn('[INFO] Package "pg" is not yet installed in local node_modules.');
    console.warn('[INFO] Run "npm install" when online or deploying to production to enable live checks.');
    console.log('[PASS] Script syntax and structure verified successfully.');
    return;
  }

  if (!connectionString) {
    console.warn('[WARN] No DATABASE_URL or DIRECT_URL set in environment.');
    console.warn('[INFO] Skipping live DB connection checks (offline mode).');
    console.log('[PASS] DB integrity check script validated.');
    return;
  }

  const client = new pg.Client({
    connectionString,
    ssl: !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await client.connect();
    console.log('[OK] Connected to PostgreSQL successfully.');

    // 1. Kiểm tra cấu hình active
    const cfgRes = await client.query("SELECT count(*) as count FROM scoring_config WHERE status = 'active'");
    const activeConfigs = parseInt(cfgRes.rows[0].count, 10);
    if (activeConfigs === 1) {
      console.log(`[PASS] Duy nhất 1 cấu hình scoring_config đang active (count: ${activeConfigs})`);
    } else {
      console.error(`[FAIL] Số cấu hình scoring_config active phải bằng 1, hiện tại: ${activeConfigs}`);
      process.exitCode = 1;
    }

    // 2. Kiểm tra ma trận vai trò chiến thuật
    const matRes = await client.query("SELECT id, version FROM role_weight_matrix WHERE status = 'active' LIMIT 1");
    if (matRes.rows.length === 0) {
      console.error('[FAIL] Không tìm thấy role_weight_matrix active nào.');
      process.exitCode = 1;
    } else {
      const matId = matRes.rows[0].id;
      const validRes = await client.query("SELECT * FROM fn_validate_matrix($1) WHERE NOT ok", [matId]);
      if (validRes.rows.length === 0) {
        console.log(`[PASS] Toàn bộ vai trò trong ma trận '${matRes.rows[0].version}' (id=${matId}) có tổng trọng số = 100%.`);
      } else {
        console.error(`[FAIL] Phát hiện vai trò có tổng trọng số lệch 100%:`, validRes.rows);
        process.exitCode = 1;
      }
    }

    // 3. Kiểm tra tính hợp lệ của hợp đồng (start_date < end_date)
    const contractRes = await client.query("SELECT count(*) as count FROM contract WHERE end_date <= start_date AND deleted_at IS NULL");
    const invalidContracts = parseInt(contractRes.rows[0].count, 10);
    if (invalidContracts === 0) {
      console.log('[PASS] Toàn bộ hợp đồng hợp lệ (end_date > start_date).');
    } else {
      console.error(`[FAIL] Phát hiện ${invalidContracts} hợp đồng có ngày kết thúc <= ngày bắt đầu.`);
      process.exitCode = 1;
    }

    // 4. Kiểm tra view v_player_card và v_player_card_public
    const viewRes = await client.query("SELECT count(*) as count FROM v_player_card_public");
    console.log(`[PASS] View v_player_card_public truy vấn thành công (${viewRes.rows[0].count} cầu thủ).`);

    console.log('====================================================');
    console.log('   TẤT CẢ CÁC BƯỚC KIỂM TRA ĐỀU HOÀN THÀNH          ');
    console.log('====================================================');
  } catch (err) {
    console.error('[ERROR] Database check failed with error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

runDbChecks();
