import { NextRequest } from 'next/server';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';
import { query } from '@project3/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request);
    if (!user) return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    const { id: runId } = await params;
    const ownedRun = await query('SELECT requirement_id FROM match_run WHERE id = $1 AND user_id = $2', [runId, user.id]);
    if (!ownedRun.rowCount) return errorResponse('RUN_NOT_FOUND', 'Không tìm thấy phiên matching', 404);
    const { searchParams } = new URL(request.url);
    const playerId = parseInt(searchParams.get('playerId') || '', 10);
    const requirementId = parseInt(searchParams.get('requirementId') || '', 10);

    if (isNaN(playerId) || isNaN(requirementId)) {
      return errorResponse('INVALID_PARAMS', 'Thiếu playerId hoặc requirementId', 400);
    }
    if (requirementId !== ownedRun.rows[0].requirement_id) return errorResponse('RUN_NOT_FOUND', 'Không tìm thấy phiên matching', 404);

    const alternatives = await MatchingService.getAlternatives(playerId, requirementId, 3);
    return successResponse(alternatives);
  } catch (err: any) {
    return errorResponse('ALTERNATIVES_FAILED', err.message, 500);
  }
}
