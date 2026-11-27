import { query, withTransaction } from '@project3/db';

export class AdminService {
  static async listAuditLogs(options?: {
    entityType?: string;
    action?: string;
    actorId?: number;
    limit?: number;
  }) {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.entityType) {
      params.push(options.entityType);
      conditions.push(`entity_type = $${pIdx++}`);
    }

    if (options?.action) {
      params.push(options.action);
      conditions.push(`action = $${pIdx++}`);
    }

    if (options?.actorId) {
      params.push(options.actorId);
      conditions.push(`actor_id = $${pIdx++}`);
    }

    params.push(options?.limit || 100);

    const res = await query(
      `SELECT a.id, a.entity_type, a.entity_id, a.action, a.old_value, a.new_value,
              a.actor_id, u.username as actor_name, a.ip_address, a.created_at
       FROM audit_log a
       LEFT JOIN app_user u ON u.id = a.actor_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${pIdx}`,
      params
    );

    return res.rows;
  }

  static async listScoringConfigs() {
    const res = await query(
      `SELECT id, version, status, is_default, params, notes, created_at, updated_at
       FROM scoring_config
       ORDER BY created_at DESC`
    );
    return res.rows;
  }

  static async activateScoringConfig(configId: number, userId: number, clientIp: string) {
    return withTransaction(async (client) => {
      const config = await client.query(`SELECT id, role_matrix_id FROM scoring_config WHERE id = $1 FOR UPDATE`, [configId]);
      if (!config.rowCount) throw { code: 'CONFIG_NOT_FOUND', message: 'Không tìm thấy cấu hình', status: 404 };
      const validation = await client.query(`SELECT count(*) AS invalid_count FROM fn_validate_matrix($1) WHERE NOT ok`, [config.rows[0].role_matrix_id]);
      if (Number(validation.rows[0]?.invalid_count) > 0) throw { code: 'INVALID_CONFIG', message: 'Ma trận trọng số không hợp lệ', status: 422 };
      // Config guard will enforce: cannot edit or reactivate used configs irregularly
      await client.query(`UPDATE scoring_config SET status = 'deprecated' WHERE status = 'active'`);
      await client.query(`UPDATE scoring_config SET status = 'active' WHERE id = $1`, [configId]);
      return { success: true, activatedId: configId, preview: validation.rows };
    }, { userId, clientIp });
  }

  static async verifyRecord(
    entityType: 'club' | 'player' | 'contract' | 'transfer' | 'injury_history',
    entityId: number,
    userId: number,
    clientIp: string
  ) {
    const allowed = ['club', 'player', 'contract', 'transfer', 'injury_history'];
    if (!allowed.includes(entityType)) {
      throw { code: 'INVALID_ENTITY_TYPE', message: 'Loại thực thể không hỗ trợ xác thực', status: 400 };
    }

    return withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE ${entityType} SET record_status = 'verified' WHERE id = $1 RETURNING id, record_status`,
        [entityId]
      );
      if (res.rowCount === 0) {
        throw { code: 'ENTITY_NOT_FOUND', message: 'Không tìm thấy thực thể cần xác thực', status: 404 };
      }
      return res.rows[0];
    }, { userId, clientIp });
  }
}
