import { query, withTransaction } from '@project3/db';
import { ShortlistAdd, ShortlistItem, ShortlistUpdate } from '@project3/shared';

export class ShortlistService {
  static async listByUser(userId: number, requirementId?: number): Promise<ShortlistItem[]> {
    const params: any[] = [userId];
    let reqFilter = '';

    if (requirementId !== undefined) {
      params.push(requirementId);
      reqFilter = 'AND sl.requirement_id = $2';
    }

    const res = await query(
      `SELECT sl.id, sl.user_id, sl.requirement_id, sl.note, sl.created_at,
              pc.id AS player_id, pc.name AS player_name, pc.age, pc.position,
              pc.club_name, pc.contract_end_date,
              fn_fee_est(pc.market_value) AS fee_est_default,
              lm.matching, lm.f_score, lm.s_score, lm.r_score, lm.run_id, coalesce(lm.stale, false) AS stale
       FROM shortlist sl
       JOIN v_player_card pc ON pc.id = sl.player_id
       LEFT JOIN LATERAL (
         SELECT mr.matching, mr.f_score, mr.s_score, mr.r_score, mr.run_id, r.stale
         FROM match_result mr
         JOIN match_run r ON r.id = mr.run_id
         WHERE mr.user_id = sl.user_id AND mr.player_id = sl.player_id
           AND mr.requirement_id IS NOT DISTINCT FROM sl.requirement_id
         ORDER BY mr.created_at DESC LIMIT 1
       ) lm ON true
       WHERE sl.user_id = $1 ${reqFilter}
       ORDER BY sl.created_at DESC`,
      params
    );

    return res.rows.map(this.mapShortlistRow);
  }

  static async add(userId: number, data: ShortlistAdd, clientIp: string): Promise<ShortlistItem> {
    return withTransaction(async (client) => {
      // Check duplicate
      const checkRes = await client.query(
        `SELECT id FROM shortlist WHERE user_id = $1 AND player_id = $2 AND coalesce(requirement_id, 0) = coalesce($3, 0)`,
        [userId, data.playerId, data.requirementId || 0]
      );

      if (checkRes.rows.length > 0) {
        throw {
          code: 'SHORTLIST_DUPLICATE',
          message: 'Cầu thủ này đã có trong danh sách mục tiêu',
          status: 409,
        };
      }

      const insRes = await client.query(
        `INSERT INTO shortlist (user_id, player_id, requirement_id, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, data.playerId, data.requirementId || null, data.note || null]
      );

      const items = await ShortlistService.listByUser(userId);
      const created = items.find((i) => i.id === insRes.rows[0].id);
      return created!;
    }, { userId, clientIp });
  }

  static async update(
    id: number,
    userId: number,
    data: ShortlistUpdate,
    clientIp: string
  ): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE shortlist SET note = $1 WHERE id = $2 AND user_id = $3 RETURNING id`,
        [data.note, id, userId]
      );
      if (res.rowCount === 0) {
        throw { code: 'SHORTLIST_ITEM_NOT_FOUND', message: 'Không tìm thấy mục tiêu trong danh sách', status: 404 };
      }
    }, { userId, clientIp });
  }

  static async remove(id: number, userId: number, clientIp: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `DELETE FROM shortlist WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId]
      );
      if (res.rowCount === 0) {
        throw { code: 'SHORTLIST_ITEM_NOT_FOUND', message: 'Không tìm thấy mục tiêu trong danh sách', status: 404 };
      }
    }, { userId, clientIp });
  }

  static async exportToCsv(userId: number, requirementId?: number): Promise<string> {
    const items = await this.listByUser(userId, requirementId);

    const headers = [
      'Player ID',
      'Player Name',
      'Position',
      'Age',
      'Club',
      'Contract End Date',
      'Fee Estimate (EUR)',
      'Matching Score',
      'Financial Fit (F)',
      'Squad Fit (S)',
      'Risk & Future (R)',
      'Scout Note',
      'Added At',
    ];

    const rows = items.map((i) => [
      i.playerId,
      `"${i.playerName.replace(/"/g, '""')}"`,
      i.position,
      i.age,
      `"${(i.clubName || '').replace(/"/g, '""')}"`,
      i.contractEndDate || '',
      i.feeEstDefault || '',
      i.matching !== null ? i.matching : '',
      i.fScore !== null ? i.fScore : '',
      i.sScore !== null ? i.sScore : '',
      i.rScore !== null ? i.rScore : '',
      `"${(i.note || '').replace(/"/g, '""')}"`,
      i.createdAt,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  private static mapShortlistRow(row: any): ShortlistItem {
    return {
      id: row.id,
      userId: row.user_id,
      requirementId: row.requirement_id,
      note: row.note,
      createdAt: row.created_at,
      playerId: row.player_id,
      playerName: row.player_name,
      age: row.age,
      position: row.position,
      clubName: row.club_name,
      contractEndDate: row.contract_end_date,
      feeEstDefault: row.fee_est_default ? parseFloat(row.fee_est_default) : null,
      matching: row.matching !== null ? parseFloat(row.matching) : null,
      fScore: row.f_score !== null ? parseFloat(row.f_score) : null,
      sScore: row.s_score !== null ? parseFloat(row.s_score) : null,
      rScore: row.r_score !== null ? parseFloat(row.r_score) : null,
      runId: row.run_id,
      stale: row.stale,
    };
  }
}
