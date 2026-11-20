import pg from 'pg';
import { pool } from './pool.js';

export interface AuditContext {
  userId?: number | null;
  clientIp?: string | null;
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  context?: AuditContext
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (context?.userId) {
      await client.query(`SET LOCAL app.user_id = '${Number(context.userId)}'`);
    }
    if (context?.clientIp) {
      // Validate IP or fallback to safe string
      const safeIp = context.clientIp.replace(/[^0-9a-fA-F:.]/g, '');
      if (safeIp) {
        await client.query(`SET LOCAL app.client_ip = '${safeIp}'`);
      }
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
