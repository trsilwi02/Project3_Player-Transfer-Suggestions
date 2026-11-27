import { query } from '@project3/db';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET() {
  try {
    let dbStatus = 'ok';
    let healthy = true;
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'unreachable';
      healthy = false;
    }

    return successResponse({
      status: healthy ? 'healthy' : 'degraded',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      uptime: process.uptime(),
    }, undefined, healthy ? 200 : 503);
  } catch (err: any) {
    return errorResponse('HEALTH_CHECK_FAILED', err.message, 500);
  }
}
