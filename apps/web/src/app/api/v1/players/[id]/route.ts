import { NextRequest } from 'next/server';
import { PlayerService } from '@/services/player.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playerId = parseInt(id, 10);
    if (isNaN(playerId)) {
      return errorResponse('INVALID_PLAYER_ID', 'ID cầu thủ không hợp lệ', 400);
    }

    const authUser = getAuthUser(request);
    const role = authUser ? authUser.role : 'guest';

    const player = await PlayerService.getPlayerDetail(playerId, role);
    if (!player) {
      return errorResponse('PLAYER_NOT_FOUND', 'Không tìm thấy thông tin cầu thủ', 404);
    }

    return successResponse(player);
  } catch (err: any) {
    console.error('[players.detail] Request failed', {
      name: err?.name,
      code: err?.code,
      message: err?.message,
    });
    return errorResponse('PLAYER_DETAIL_FAILED', err.message, 500);
  }
}
