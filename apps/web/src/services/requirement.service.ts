import { query, withTransaction } from '@project3/db';
import {
  ClubRequirement,
  ClubRequirementCreate,
  ClubRequirementUpdate,
} from '@project3/shared';

export class RequirementService {
  static async listByUser(userId: number): Promise<ClubRequirement[]> {
    const res = await query(
      `SELECT r.id, r.user_id, r.name, r.club_id, cl.name as club_name, r.position,
              r.min_age, r.max_age, r.salary_limit, r.budget, r.priority,
              r.matching_params, r.created_at, r.updated_at,
              coalesce(json_agg(rr.role_id) FILTER (WHERE rr.role_id IS NOT NULL), '[]') as role_ids
       FROM club_requirement r
       LEFT JOIN club cl ON cl.id = r.club_id
       LEFT JOIN club_requirement_role rr ON rr.requirement_id = r.id
       WHERE r.user_id = $1
       GROUP BY r.id, cl.name
       ORDER BY r.priority ASC, r.created_at DESC`,
      [userId]
    );

    return res.rows.map(this.mapRequirementRow);
  }

  static async getById(id: number, userId?: number): Promise<ClubRequirement | null> {
    const params: any[] = [id];
    let userCond = '';
    if (userId) {
      params.push(userId);
      userCond = 'AND r.user_id = $2';
    }

    const res = await query(
      `SELECT r.id, r.user_id, r.name, r.club_id, cl.name as club_name, r.position,
              r.min_age, r.max_age, r.salary_limit, r.budget, r.priority,
              r.matching_params, r.created_at, r.updated_at,
              coalesce(json_agg(rr.role_id) FILTER (WHERE rr.role_id IS NOT NULL), '[]') as role_ids
       FROM club_requirement r
       LEFT JOIN club cl ON cl.id = r.club_id
       LEFT JOIN club_requirement_role rr ON rr.requirement_id = r.id
       WHERE r.id = $1 ${userCond}
       GROUP BY r.id, cl.name`,
      params
    );

    if (res.rows.length === 0) return null;
    return this.mapRequirementRow(res.rows[0]);
  }

  static async create(
    userId: number,
    data: ClubRequirementCreate,
    clientIp: string
  ): Promise<ClubRequirement> {
    return withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO club_requirement(
           user_id, name, club_id, position, min_age, max_age, salary_limit, budget, priority, matching_params
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, user_id, name, club_id, position, min_age, max_age, salary_limit, budget, priority, matching_params, created_at, updated_at`,
        [
          userId,
          data.name || `Nhu cầu ${data.position}`,
          data.clubId || null,
          data.position,
          data.minAge || null,
          data.maxAge || null,
          data.salaryLimit,
          data.budget,
          data.priority,
          JSON.stringify(data.matchingParams || {}),
        ]
      );

      const reqId = insRes.rows[0].id;

      if (data.roleIds && data.roleIds.length > 0) {
        for (const roleId of data.roleIds) {
          await client.query(
            `INSERT INTO club_requirement_role(requirement_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [reqId, roleId]
          );
        }
      }

      return {
        ...this.mapRequirementRow(insRes.rows[0]),
        roleIds: data.roleIds || [],
      };
    }, { userId, clientIp });
  }

  static async update(
    id: number,
    userId: number,
    data: ClubRequirementUpdate,
    clientIp: string
  ): Promise<ClubRequirement> {
    return withTransaction(async (client) => {
      const checkRes = await client.query(`SELECT id FROM club_requirement WHERE id = $1 AND user_id = $2`, [id, userId]);
      if (checkRes.rows.length === 0) {
        throw { code: 'REQUIREMENT_NOT_FOUND', message: 'Không tìm thấy nhu cầu hoặc bạn không có quyền sửa', status: 404 };
      }

      const updates: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      if (data.clubId !== undefined) {
        params.push(data.clubId);
        updates.push(`club_id = $${pIdx++}`);
      }
      if (data.name !== undefined) {
        params.push(data.name);
        updates.push(`name = $${pIdx++}`);
      }
      if (data.position !== undefined) {
        params.push(data.position);
        updates.push(`position = $${pIdx++}`);
      }
      if (data.minAge !== undefined) {
        params.push(data.minAge);
        updates.push(`min_age = $${pIdx++}`);
      }
      if (data.maxAge !== undefined) {
        params.push(data.maxAge);
        updates.push(`max_age = $${pIdx++}`);
      }
      if (data.salaryLimit !== undefined) {
        params.push(data.salaryLimit);
        updates.push(`salary_limit = $${pIdx++}`);
      }
      if (data.budget !== undefined) {
        params.push(data.budget);
        updates.push(`budget = $${pIdx++}`);
      }
      if (data.priority !== undefined) {
        params.push(data.priority);
        updates.push(`priority = $${pIdx++}`);
      }
      if (data.matchingParams !== undefined) {
        params.push(JSON.stringify(data.matchingParams));
        updates.push(`matching_params = $${pIdx++}`);
      }

      if (updates.length > 0) {
        params.push(id);
        await client.query(
          `UPDATE club_requirement SET ${updates.join(', ')} WHERE id = $${pIdx}`,
          params
        );
      }

      if (data.roleIds !== undefined) {
        await client.query(`DELETE FROM club_requirement_role WHERE requirement_id = $1`, [id]);
        for (const roleId of data.roleIds) {
          await client.query(
            `INSERT INTO club_requirement_role(requirement_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, roleId]
          );
        }
      }

      // Mark past match_run as stale
      await client.query(`UPDATE match_run SET stale = true WHERE requirement_id = $1`, [id]);

      const updated = await RequirementService.getById(id, userId);
      return updated!;
    }, { userId, clientIp });
  }

  static async delete(id: number, userId: number, clientIp: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `DELETE FROM club_requirement WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId]
      );
      if (res.rowCount === 0) {
        throw { code: 'REQUIREMENT_NOT_FOUND', message: 'Không tìm thấy nhu cầu tuyển trạch để xóa', status: 404 };
      }
    }, { userId, clientIp });
  }

  private static mapRequirementRow(row: any): ClubRequirement {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      clubId: row.club_id,
      clubName: row.club_name,
      position: row.position,
      minAge: row.min_age,
      maxAge: row.max_age,
      salaryLimit: parseFloat(row.salary_limit),
      budget: parseFloat(row.budget),
      priority: row.priority,
      roleIds: Array.isArray(row.role_ids) ? row.role_ids : [],
      matchingParams: row.matching_params || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
