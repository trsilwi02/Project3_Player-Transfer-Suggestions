import { NextRequest } from 'next/server';
import { ClubRequirementUpdateSchema } from '@project3/shared';
import { RequirementService } from '@/services/requirement.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID nhu cầu không hợp lệ', 400);

    const item = await RequirementService.getById(id, user.id);
    if (!item) {
      return errorResponse('REQUIREMENT_NOT_FOUND', 'Không tìm thấy nhu cầu tuyển trạch', 404);
    }

    return successResponse(item);
  } catch (err: any) {
    return errorResponse('REQUIREMENT_FETCH_FAILED', err.message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID không hợp lệ', 400);

    const body = await request.json();
    const parsed = ClubRequirementUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Dữ liệu cập nhật không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const updated = await RequirementService.update(id, user.id, parsed.data, clientIp);
    return successResponse(updated);
  } catch (err: any) {
    return errorResponse(err.code || 'REQUIREMENT_UPDATE_FAILED', err.message, err.status || 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID không hợp lệ', 400);

    const clientIp = getClientIp(request);
    await RequirementService.delete(id, user.id, clientIp);
    return successResponse({ message: 'Đã xóa nhu cầu thành công' });
  } catch (err: any) {
    return errorResponse(err.code || 'REQUIREMENT_DELETE_FAILED', err.message, err.status || 500);
  }
}
