import { NextRequest } from 'next/server';
import { MatchRunRequestSchema } from '@project3/shared';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để chạy thuật toán Matching', 401);
    }

    const body = await request.json();
    const parsed = MatchRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Tham số chạy Matching không hợp lệ', 400, parsed.error.format());
    }

    const result = await MatchingService.executeMatchRun(
      parsed.data.requirementId,
      user.id,
      parsed.data.overrideParams
    );

    return successResponse(result, undefined, 201);
  } catch (err: any) {
    return errorResponse(err.code || 'MATCH_RUN_FAILED', err.message, err.status || 500);
  }
}
