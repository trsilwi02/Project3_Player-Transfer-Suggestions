import { NextRequest } from 'next/server';
import { PlayerService } from '@/services/player.service';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '8', 10);

    if (q.trim().length < 2) {
      return successResponse([]);
    }

    const results = await PlayerService.suggest(q, limit);
    return successResponse(results);
  } catch (err: any) {
    return errorResponse('SUGGEST_FAILED', err.message, 500);
  }
}
