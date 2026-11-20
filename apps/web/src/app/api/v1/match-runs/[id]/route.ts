import { NextRequest } from 'next/server';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const runId = params.id;
    if (!runId) return errorResponse('INVALID_RUN_ID', 'Mã phiên chạy không hợp lệ', 400);

    const detail = await MatchingService.getRunDetail(runId);
    if (!detail) {
      return errorResponse('RUN_NOT_FOUND', 'Không tìm thấy kết quả của phiên chấm điểm này', 404);
    }

    return successResponse(detail);
  } catch (err: any) {
    return errorResponse('MATCH_RUN_DETAIL_FAILED', err.message, 500);
  }
}
