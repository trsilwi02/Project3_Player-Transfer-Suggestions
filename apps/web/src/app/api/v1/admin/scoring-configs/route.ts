import { NextRequest } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user || user.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Chỉ quản trị viên mới có quyền xem cấu hình chấm điểm', 403);
    }

    const configs = await AdminService.listScoringConfigs();
    return successResponse(configs);
  } catch (err: any) {
    return errorResponse('SCORING_CONFIGS_FAILED', err.message, 500);
  }
}
