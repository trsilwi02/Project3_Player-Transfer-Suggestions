import { NextRequest } from 'next/server';
import { MatchingService } from '@/services/matching.service';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = parseInt(searchParams.get('playerId') || '', 10);
    const requirementId = parseInt(searchParams.get('requirementId') || '', 10);

    if (isNaN(playerId) || isNaN(requirementId)) {
      return errorResponse('INVALID_PARAMS', 'Thiếu playerId hoặc requirementId', 400);
    }

    const alternatives = await MatchingService.getAlternatives(playerId, requirementId, 3);
    return successResponse(alternatives);
  } catch (err: any) {
    return errorResponse('ALTERNATIVES_FAILED', err.message, 500);
  }
}
