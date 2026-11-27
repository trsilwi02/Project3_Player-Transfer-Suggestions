import { NextRequest } from 'next/server';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    if (!getAuthUser(request)) return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get('playerIds') || '';
    const playerIds = rawIds
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (playerIds.length < 2 || playerIds.length > 5) {
      return errorResponse('INVALID_PLAYER_COUNT', 'Chức năng so sánh hỗ trợ từ 2 đến 5 cầu thủ', 400);
    }

    const comparison = await MatchingService.comparePlayers(playerIds);
    return successResponse(comparison);
  } catch (err: any) {
    return errorResponse(err.code || 'COMPARE_FAILED', err.message, err.status || 500);
  }
}
