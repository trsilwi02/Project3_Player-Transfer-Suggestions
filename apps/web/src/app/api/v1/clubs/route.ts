import { NextRequest } from 'next/server';
import { ClubService } from '@/services/club.service';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || undefined;
    const league = searchParams.get('league') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const clubs = await ClubService.listClubs(q, league, limit);
    return successResponse(clubs);
  } catch (err: any) {
    return errorResponse('CLUB_LIST_FAILED', err.message, 500);
  }
}
