import { NextRequest } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request);
    if (!user || user.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Chỉ quản trị viên mới có quyền kích hoạt cấu hình', 403);
    }

    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return errorResponse('INVALID_ID', 'ID cấu hình không hợp lệ', 400);

    const clientIp = getClientIp(request);
    const result = await AdminService.activateScoringConfig(id, user.id, clientIp);
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err.code || 'CONFIG_ACTIVATE_FAILED', err.message, err.status || 500);
  }
}
