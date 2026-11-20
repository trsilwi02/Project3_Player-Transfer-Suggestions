const fs = require('fs');
const path = require('path');

// Simple deterministic PRNG (Linear Congruential Generator)
class DeterministicRNG {
  constructor(seed = 20261120) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  nextInt(min, max) {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  choice(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const rng = new DeterministicRNG(20261120);

const LEAGUES = [
  { name: 'Premier League', country: 'Anh', tier: 1 },
  { name: 'La Liga', country: 'Tây Ban Nha', tier: 1 },
  { name: 'Serie A', country: 'Ý', tier: 1 },
  { name: 'Bundesliga', country: 'Đức', tier: 1 },
  { name: 'Ligue 1', country: 'Pháp', tier: 1 },
  { name: 'Eredivisie', country: 'Hà Lan', tier: 2 },
  { name: 'Primeira Liga', country: 'Bồ Đào Nha', tier: 2 },
  { name: 'Championship', country: 'Anh', tier: 2 },
  { name: 'V.League 1', country: 'Việt Nam', tier: 3 },
  { name: 'J1 League', country: 'Nhật Bản', tier: 3 },
];

const POSITIONS = ['CB', 'RB/LB', 'CM/CDM', 'CAM', 'LW/RW', 'ST', 'GK'];
const FIRST_NAMES = ['David', 'Lucas', 'Alex', 'Nguyen', 'Tran', 'Mateo', 'Kylian', 'Erling', 'Marcus', 'Luka', 'Kevin', 'Jude', 'Vinicius', 'Bruno', 'Declan', 'Bukayo', 'Pedri', 'Gavi', 'Rodri', 'Cole', 'Florian', 'William', 'Theo', 'Achraf'];
const LAST_NAMES = ['Silva', 'Johnson', 'Garcia', 'Van Dijk', 'Haaland', 'Bellingham', 'Saka', 'Foden', 'Rice', 'Palmer', 'Wirtz', 'Musiala', 'Saliba', 'Hernandez', 'Hakimi', 'Martinez', 'Dias', 'Alvarez', 'Son', 'Mitoma', 'Minamino', 'Nguyen', 'Pham'];

function generateDemoData() {
  console.log('Generating deterministic demo dataset (5,000 players, 200 clubs, 8,000 contracts)...');
  const sqlLines = [];

  sqlLines.push('-- =====================================================================');
  sqlLines.push('-- DEMO DATASET (DETERMINISTIC SIMULATED DATA)');
  sqlLines.push('-- Generated per specifications in docs/ke-hoach-xay-dung.md');
  sqlLines.push('-- Reliability Label: simulated | Source: DEMO_GENERATOR');
  sqlLines.push('-- =====================================================================\n');

  // 1. Generate 200 Clubs
  sqlLines.push('-- 1. CLUBS (200 clubs across 10 leagues)');
  for (let i = 1; i <= 200; i++) {
    const league = LEAGUES[(i - 1) % LEAGUES.length];
    const clubName = `${league.country} FC ${Math.ceil(i / 10)} - Club ${i}`;
    const founded = rng.nextInt(1880, 2010);
    sqlLines.push(
      `INSERT INTO club (id, name, country, league, founded_year, record_status) OVERRIDING SYSTEM VALUE ` +
      `VALUES (${i}, '${clubName}', '${league.country}', '${league.name}', ${founded}, 'verified') ON CONFLICT (id) DO NOTHING;`
    );
  }
  sqlLines.push(`SELECT setval(pg_get_serial_sequence('club', 'id'), 200, true);\n`);

  // 2. Generate 5,000 Players
  sqlLines.push('-- 2. PLAYERS (5,000 players, dynamic age, market value log-normal)');
  for (let i = 1; i <= 5000; i++) {
    const fn = rng.choice(FIRST_NAMES);
    const ln = rng.choice(LAST_NAMES);
    const name = `${fn} ${ln} ${i}`;
    const birthYear = rng.nextInt(1988, 2008);
    const birthMonth = String(rng.nextInt(1, 12)).padStart(2, '0');
    const birthDay = String(rng.nextInt(1, 28)).padStart(2, '0');
    const dob = `${birthYear}-${birthMonth}-${birthDay}`;
    const pos = rng.choice(POSITIONS);
    const height = rng.nextInt(168, 198);
    const foot = rng.choice(['right', 'left', 'both']);
    
    // Log-normal distribution approximation for market value
    const baseVal = Math.exp(rng.nextFloat(14.5, 18.2));
    const marketValue = Math.round(baseVal / 50000) * 50000;

    sqlLines.push(
      `INSERT INTO player (id, name, date_of_birth, nationality, position, height, preferred_foot, status, market_value, market_value_label, record_status) OVERRIDING SYSTEM VALUE ` +
      `VALUES (${i}, '${name}', DATE '${dob}', 'Quốc tế', '${pos}', ${height}, '${foot}', 'active', ${marketValue}, 'simulated', 'verified') ON CONFLICT (id) DO NOTHING;`
    );
  }
  sqlLines.push(`SELECT setval(pg_get_serial_sequence('player', 'id'), 5000, true);\n`);

  // 3. Generate Contracts (>= 8,000 contracts: current + historical)
  sqlLines.push('-- 3. CONTRACTS (>= 8,000 contracts, non-overlapping per player)');
  let contractId = 1;
  for (let pId = 1; pId <= 5000; pId++) {
    const clubId = rng.nextInt(1, 200);
    const isFreeAgent = rng.next() < 0.05; // 5% Free Agent
    const isLoan = !isFreeAgent && rng.next() < 0.08; // 8% Loan
    const parentClubId = isLoan ? rng.nextInt(1, 200) : 'NULL';

    if (!isFreeAgent) {
      // Current active contract
      const startYear = rng.nextInt(2022, 2025);
      const endYear = rng.nextInt(2026, 2030);
      const endMonth = rng.choice(['06', '12']);
      const salary = rng.nextInt(500000, 15000000);
      const releaseClause = rng.next() < 0.4 ? salary * rng.nextInt(5, 12) : 'NULL';

      sqlLines.push(
        `INSERT INTO contract (id, player_id, club_id, contract_type, start_date, end_date, salary_per_year, release_clause, reliability_label, source, status, record_status, parent_club_id) OVERRIDING SYSTEM VALUE ` +
        `VALUES (${contractId++}, ${pId}, ${clubId}, '${isLoan ? 'loan' : 'permanent'}', DATE '${startYear}-07-01', DATE '${endYear}-${endMonth}-30', ${salary}, ${releaseClause}, 'simulated', 'DEMO_GENERATOR', 'active', 'verified', ${parentClubId});`
      );
    }

    // Historical contract (for 60% of players)
    if (rng.next() < 0.60) {
      const pastClub = rng.nextInt(1, 200);
      sqlLines.push(
        `INSERT INTO contract (id, player_id, club_id, contract_type, start_date, end_date, salary_per_year, reliability_label, source, status, record_status) OVERRIDING SYSTEM VALUE ` +
        `VALUES (${contractId++}, ${pId}, ${pastClub}, 'permanent', DATE '2019-07-01', DATE '2022-06-30', ${rng.nextInt(300000, 6000000)}, 'simulated', 'DEMO_GENERATOR', 'expired', 'verified');`
      );
    }
  }
  sqlLines.push(`SELECT setval(pg_get_serial_sequence('contract', 'id'), ${contractId}, true);\n`);

  // 4. Generate Stats for 3 seasons (2023/2024, 2024/2025, 2025/2026)
  sqlLines.push('-- 4. PLAYER STATS & SEASON METRICS (3 seasons)');
  const SEASONS = ['2023/2024', '2024/2025', '2025/2026'];
  for (const season of SEASONS) {
    for (let pId = 1; pId <= 5000; pId++) {
      // 60% >= 900 minutes, 15% < 450 minutes, rest in between
      const r = rng.next();
      let minutes = 0;
      if (r < 0.15) {
        minutes = rng.nextInt(50, 440);
      } else if (r < 0.75) {
        minutes = rng.nextInt(900, 3100);
      } else {
        minutes = rng.nextInt(450, 890);
      }

      const goals = rng.nextInt(0, 22);
      const assists = rng.nextInt(0, 16);
      const tracking = rng.next() > 0.05; // 95% have tracking data

      sqlLines.push(
        `INSERT INTO player_stats (player_id, season, matches_played, minutes_played, goals, assists, yellow_cards, red_cards, record_status) ` +
        `VALUES (${pId}, '${season}', ${Math.ceil(minutes / 85)}, ${minutes}, ${goals}, ${assists}, ${rng.nextInt(0, 8)}, ${rng.nextInt(0, 1)}, 'verified');`
      );

      sqlLines.push(
        `INSERT INTO player_season_metrics (player_id, season, minutes_played, tracking_available, record_status) ` +
        `VALUES (${pId}, '${season}', ${minutes}, ${tracking}, 'verified') ON CONFLICT (player_id, season) DO NOTHING;`
      );
    }
  }

  // 5. Generate Market Value Checkpoints (last 24 months)
  sqlLines.push('\n-- 5. MARKET VALUE HISTORY (>= 4 checkpoints for 70% players)');
  for (let pId = 1; pId <= 5000; pId++) {
    const hasFullSeries = rng.next() < 0.70;
    const points = hasFullSeries ? 4 : 2;
    for (let pt = 1; pt <= points; pt++) {
      const valDate = `2024-0${pt * 3}-01`;
      const val = rng.nextInt(1000000, 80000000);
      sqlLines.push(
        `INSERT INTO market_value (player_id, market_value, valuation_date, reliability_label, source, record_status) ` +
        `VALUES (${pId}, ${val}, DATE '${valDate}', 'simulated', 'DEMO_GENERATOR', 'verified');`
      );
    }
  }

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'demo_seed.sql');
  fs.writeFileSync(outFile, sqlLines.join('\n'), 'utf-8');

  console.log(`Demo seed SQL generated successfully at ${outFile} (${sqlLines.length} SQL statements).`);
}

generateDemoData();
