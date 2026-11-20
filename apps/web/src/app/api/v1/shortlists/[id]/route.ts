import { NextRequest } from 'next/server';
import { ShortlistUpdateSchema } from '@project3/shared';
import { ShortlistService } from '@/services/shortlist.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUser(request);
    if (!user) return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID không hợp lệ', 400);

    const body = await request.json();
    const parsed = ShortlistUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Nội dung ghi chú không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    await ShortlistService.update(id, user.id, parsed.data, clientIp);
    return successResponse({ message: 'Đã cập nhật ghi chú thành công' });
  } catch (err: any) {
    return errorResponse(err.code || 'SHORTLIST_UPDATE_FAILED', err.message, err.status || 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUser(request);
    if (!user) return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID không hợp lệ', 400);

    const clientIp = getClientIp(request);
    await ShortlistService.remove(id, user.id, clientIp);
    return successResponse({ message: 'Đã xóa cầu thủ khỏi danh sách mục tiêu' });
  } catch (err: any) {
    return errorResponse(err.code || 'SHORTLIST_DELETE_FAILED', err.message, err.status || 500);
  }
}
