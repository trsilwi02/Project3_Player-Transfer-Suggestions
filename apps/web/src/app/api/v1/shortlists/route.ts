import { NextRequest } from 'next/server';
import { ShortlistAddSchema } from '@project3/shared';
import { ShortlistService } from '@/services/shortlist.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để xem danh sách mục tiêu (shortlist)', 401);
    }

    const { searchParams } = new URL(request.url);
    const reqIdParam = searchParams.get('requirementId');
    const reqId = reqIdParam ? parseInt(reqIdParam, 10) : undefined;

    const items = await ShortlistService.listByUser(user.id, isNaN(reqId!) ? undefined : reqId);
    return successResponse(items);
  } catch (err: any) {
    return errorResponse('SHORTLIST_FETCH_FAILED', err.message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để thêm vào danh sách mục tiêu', 401);
    }

    const body = await request.json();
    const parsed = ShortlistAddSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Dữ liệu thêm shortlist không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const item = await ShortlistService.add(user.id, parsed.data, clientIp);
    return successResponse(item, undefined, 201);
  } catch (err: any) {
    return errorResponse(err.code || 'SHORTLIST_ADD_FAILED', err.message, err.status || 500);
  }
}
