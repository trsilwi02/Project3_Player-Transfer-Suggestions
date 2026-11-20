import { NextRequest } from 'next/server';
import { ClubService } from '@/services/club.service';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clubId = parseInt(params.id, 10);
    if (isNaN(clubId)) {
      return errorResponse('INVALID_CLUB_ID', 'ID CLB không hợp lệ', 400);
    }

    const club = await ClubService.getClubDetail(clubId);
    if (!club) {
      return errorResponse('CLUB_NOT_FOUND', 'Không tìm thấy CLB', 404);
    }

    return successResponse(club);
  } catch (err: any) {
    return errorResponse('CLUB_DETAIL_FAILED', err.message, 500);
  }
}
