import { NextRequest } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user || user.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Chỉ quản trị viên mới có quyền xác thực dữ liệu', 403);
    }

    const body = await request.json();
    const { entityType, entityId } = body;

    if (!entityType || !entityId) {
      return errorResponse('INVALID_PARAMS', 'Thiếu entityType hoặc entityId', 400);
    }

    const clientIp = getClientIp(request);
    const result = await AdminService.verifyRecord(entityType, entityId, user.id, clientIp);
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err.code || 'VERIFY_FAILED', err.message, err.status || 500);
  }
}
