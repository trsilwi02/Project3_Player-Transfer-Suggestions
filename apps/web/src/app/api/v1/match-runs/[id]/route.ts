import { NextRequest } from 'next/server';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request);
    if (!user) return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    const { id: runId } = await params;
    if (!runId) return errorResponse('INVALID_RUN_ID', 'Mã phiên chạy không hợp lệ', 400);

    const detail = await MatchingService.getRunDetail(runId, user.id);
    if (!detail) {
      return errorResponse('RUN_NOT_FOUND', 'Không tìm thấy kết quả của phiên chấm điểm này', 404);
    }

    return successResponse(detail);
  } catch (err: any) {
    return errorResponse('MATCH_RUN_DETAIL_FAILED', err.message, 500);
  }
}
