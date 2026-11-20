import { NextRequest } from 'next/server';
import { query } from '@project3/db';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    let dbStatus = 'ok';
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - dbStart;
    } catch (err: any) {
      dbStatus = `unreachable: ${err.message}`;
    }

    return successResponse({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      uptime: process.uptime(),
    });
  } catch (err: any) {
    return errorResponse('HEALTH_CHECK_FAILED', err.message, 500);
  }
}
