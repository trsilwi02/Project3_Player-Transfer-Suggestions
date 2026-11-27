import { query } from '@project3/db';

export class ClubService {
  static async listClubs(q?: string, league?: string, limit: number = 50) {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let pIdx = 1;

    if (q && q.trim()) {
      params.push(q.trim());
      conditions.push(`(f_unaccent(lower(name)) % f_unaccent(lower($${pIdx})) OR f_unaccent(lower(name)) LIKE '%' || f_unaccent(lower($${pIdx})) || '%')`);
      pIdx++;
    }

    if (league) {
      params.push(league);
      conditions.push(`league = $${pIdx}`);
      pIdx++;
    }

    params.push(limit);

    const res = await query(
      `SELECT id, name, country, league, founded_year, logo_url, record_status
       FROM club
       WHERE ${conditions.join(' AND ')}
       ORDER BY name ASC
       LIMIT $${pIdx}`,
      params
    );

    return res.rows;
  }

  static async getClubDetail(clubId: number, includeSalary = false) {
    const clubRes = await query(
      `SELECT id, name, country, league, founded_year, logo_url, record_status
       FROM club
       WHERE id = $1 AND deleted_at IS NULL`,
      [clubId]
    );

    if (clubRes.rows.length === 0) return null;

    // Squad list
    const squadRes = await query(
      `SELECT p.id, p.name, p.position, fn_age(p.date_of_birth) as age, p.market_value,
              c.start_date, c.end_date, ${includeSalary ? 'c.salary_per_year' : 'NULL::numeric AS salary_per_year'}, c.contract_type
       FROM contract c
       JOIN player p ON p.id = c.player_id
       WHERE c.club_id = $1 AND c.status = 'active' AND c.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY p.position, p.name`,
      [clubId]
    );

    return {
      ...clubRes.rows[0],
      squad: squadRes.rows,
    };
  }
}
