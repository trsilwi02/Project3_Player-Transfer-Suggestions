import { NextRequest } from 'next/server';
import { PlayerQueryFilterSchema } from '@project3/shared';
import { PlayerService } from '@/services/player.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams.entries());

    const parsed = PlayerQueryFilterSchema.safeParse(rawParams);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Bộ lọc tìm kiếm không hợp lệ', 400, parsed.error.format());
    }

    const authUser = getAuthUser(request);
    const role = authUser ? authUser.role : 'guest';

    const result = await PlayerService.findPlayers(parsed.data, role);

    return successResponse(result.items, {
      cursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err: any) {
    return errorResponse('PLAYER_SEARCH_FAILED', err.message, 500);
  }
}
