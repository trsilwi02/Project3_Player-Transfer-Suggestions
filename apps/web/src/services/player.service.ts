import { query } from '@project3/db';
import {
  PlayerCardFull,
  PlayerCardPublic,
  PlayerQueryFilter,
  UserRole,
} from '@project3/shared';

export class PlayerService {
  static async suggest(q: string, limit: number = 8) {
    if (!q || q.trim().length < 2) return [];
    const res = await query(
      `SELECT type, id, name, subtitle, sim FROM fn_suggest($1, $2)`,
      [q.trim(), limit]
    );
    return res.rows;
  }

  static async findPlayers(filter: PlayerQueryFilter, role: UserRole) {
    const isPublic = role === 'guest';
    const viewName = isPublic ? 'v_player_card_public' : 'v_player_card';

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (filter.q && filter.q.trim().length > 0) {
      params.push(filter.q.trim());
      conditions.push(`(f_unaccent(lower(name)) % f_unaccent(lower($${pIdx})) OR f_unaccent(lower(name)) LIKE '%' || f_unaccent(lower($${pIdx})) || '%')`);
      pIdx++;
    }

    if (filter.position) {
      params.push(filter.position);
      conditions.push(`position = $${pIdx}`);
      pIdx++;
    }

    if (filter.minAge !== undefined) {
      params.push(filter.minAge);
      conditions.push(`age >= $${pIdx}`);
      pIdx++;
    }

    if (filter.maxAge !== undefined) {
      params.push(filter.maxAge);
      conditions.push(`age <= $${pIdx}`);
      pIdx++;
    }

    if (filter.minMarketValue !== undefined) {
      params.push(filter.minMarketValue);
      conditions.push(`market_value >= $${pIdx}`);
      pIdx++;
    }

    if (filter.maxMarketValue !== undefined) {
      params.push(filter.maxMarketValue);
      conditions.push(`market_value <= $${pIdx}`);
      pIdx++;
    }

    if (filter.freeAgentWindow !== undefined) {
      params.push(filter.freeAgentWindow);
      conditions.push(`months_remaining <= $${pIdx}`);
      pIdx++;
    }

    if (filter.minMinutes !== undefined) {
      params.push(filter.minMinutes);
      conditions.push(`coalesce(season_minutes, 0) >= $${pIdx}`);
      pIdx++;
    }

    if (filter.league) {
      params.push(filter.league);
      conditions.push(`league = $${pIdx}`);
      pIdx++;
    }

    if (filter.clubId !== undefined) {
      params.push(filter.clubId);
      conditions.push(`club_id = $${pIdx}`);
      pIdx++;
    }

    // Cursor pagination (keyset by id)
    if (filter.cursor) {
      const cursorId = parseInt(filter.cursor, 10);
      if (!isNaN(cursorId)) {
        params.push(cursorId);
        conditions.push(`id < $${pIdx}`);
        pIdx++;
      }
    }

    const sortColumn = {
      market_value: 'market_value',
      name: 'name',
      age: 'age',
      contract_end_date: 'contract_end_date',
      season_minutes: 'season_minutes',
    }[filter.sortBy] || 'market_value';

    const sortDir = filter.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    params.push(filter.limit + 1);
    const limitParamIdx = pIdx;

    const sql = `
      SELECT * FROM ${viewName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDir} NULLS LAST, id DESC
      LIMIT $${limitParamIdx}
    `;

    const res = await query(sql, params);
    const hasMore = res.rows.length > filter.limit;
    const items = hasMore ? res.rows.slice(0, filter.limit) : res.rows;
    const nextCursor = hasMore ? items[items.length - 1].id.toString() : null;

    return {
      items: items.map(this.mapPlayerRow),
      nextCursor,
      hasMore,
    };
  }

  static async getPlayerDetail(playerId: number, role: UserRole) {
    const isPublic = role === 'guest';
    const viewName = isPublic ? 'v_player_card_public' : 'v_player_card';

    const cardRes = await query(`SELECT * FROM ${viewName} WHERE id = $1`, [playerId]);
    if (cardRes.rows.length === 0) return null;

    const playerCard = this.mapPlayerRow(cardRes.rows[0]);

    // Role vector (tactical roles and scores)
    const roleVectorRes = await query(
      `SELECT role, position_group, score, role_rank, gap_to_top, minutes, s_minute, tracking_fallback
       FROM v_player_role_vector
       WHERE player_id = $1
       ORDER BY score DESC`,
      [playerId]
    );

    // Injury history (last 24 months)
    const injuryRes = await query(
      `SELECT id, injury_type, body_area, start_date, end_date, days_missed, matches_missed,
              recurrent_flag, record_status
       FROM injury_history
       WHERE player_id = $1 AND deleted_at IS NULL
       ORDER BY start_date DESC`,
      [playerId]
    );

    // Market value history (24 months)
    const mvRes = await query(
      `SELECT id, market_value, valuation_date, reliability_label, source
       FROM market_value
       WHERE player_id = $1
       ORDER BY valuation_date ASC`,
      [playerId]
    );

    // Contract history
    const contractRes = await query(
      `SELECT c.id, c.club_id, cl.name as club_name, c.contract_type, c.start_date, c.end_date,
              c.release_clause, ${isPublic ? 'NULL as salary_per_year' : 'c.salary_per_year'},
              c.reliability_label, c.status
       FROM contract c
       LEFT JOIN club cl ON cl.id = c.club_id
       WHERE c.player_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.start_date DESC`,
      [playerId]
    );

    return {
      ...playerCard,
      tacticalRoles: roleVectorRes.rows,
      injuryHistory: injuryRes.rows,
      marketValueHistory: mvRes.rows,
      contracts: contractRes.rows,
    };
  }

  private static mapPlayerRow(row: any): PlayerCardFull | PlayerCardPublic {
    return {
      id: row.id,
      name: row.name,
      dateOfBirth: row.date_of_birth,
      age: row.age,
      nationality: row.nationality,
      position: row.position,
      height: row.height,
      preferredFoot: row.preferred_foot,
      status: row.status,
      marketValue: row.market_value ? parseFloat(row.market_value) : null,
      marketValueLabel: row.market_value_label,
      photoUrl: row.photo_url,
      clubId: row.club_id,
      clubName: row.club_name,
      league: row.league,
      contractId: row.contract_id,
      contractType: row.contract_type,
      startDate: row.start_date,
      contractEndDate: row.contract_end_date,
      monthsRemaining: row.months_remaining ? parseFloat(row.months_remaining) : null,
      releaseClause: row.release_clause ? parseFloat(row.release_clause) : null,
      salaryPerYear: row.salary_per_year !== undefined && row.salary_per_year !== null
        ? parseFloat(row.salary_per_year)
        : undefined,
      contractReliability: row.contract_reliability,
      parentClubId: row.parent_club_id,
      seasonMinutes: row.season_minutes ? parseFloat(row.season_minutes) : null,
    };
  }
}
