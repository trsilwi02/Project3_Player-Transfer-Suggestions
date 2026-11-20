const fs = require('fs');
const path = require('path');

const sqlContent = fs.readFileSync(path.join(__dirname, '..', 'football_transfer_db.sql'), 'utf-8');
const lines = sqlContent.split(/\r?\n/);

console.log('Total lines:', lines.length);

const marker02 = lines.findIndex(line => line.includes('-- 02. Trigger, hàm tính điểm'));
const marker03 = lines.findIndex(line => line.includes('-- 03. Dữ liệu tham chiếu'));

console.log('Marker 02 index (line):', marker02 + 1);
console.log('Marker 03 index (line):', marker03 + 1);

// Schema is from line 0 to marker02 - 1
// But note: remove any `\set ON_ERROR_STOP on` since that's a psql meta-command
function cleanPsql(content) {
  return content.replace(/^\\set\s+ON_ERROR_STOP\s+.*$/gm, '-- psql meta-command omitted for supabase migration compatibility');
}

const schemaLines = lines.slice(0, marker02);
const functionsLines = lines.slice(marker02, marker03);
const seedLines = lines.slice(marker03);

const schemaSql = cleanPsql(schemaLines.join('\n'));
const functionsSql = cleanPsql(functionsLines.join('\n'));
const seedSql = cleanPsql(seedLines.join('\n'));

fs.mkdirSync(path.join(__dirname, '..', 'supabase', 'migrations'), { recursive: true });

fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261120000100_schema.sql'), schemaSql, 'utf-8');
fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261120000200_functions_views.sql'), functionsSql, 'utf-8');
fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'seed.sql'), seedSql, 'utf-8');

console.log('Schema written, length:', schemaSql.length, 'lines:', schemaLines.length);
console.log('Functions written, length:', functionsSql.length, 'lines:', functionsLines.length);
console.log('Seed written, length:', seedSql.length, 'lines:', seedLines.length);
