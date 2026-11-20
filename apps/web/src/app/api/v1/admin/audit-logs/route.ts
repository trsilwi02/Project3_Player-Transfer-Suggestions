import { NextRequest } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user || user.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Chỉ quản trị viên (Admin) mới có quyền truy cập Audit Log', 403);
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') || undefined;
    const action = searchParams.get('action') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const logs = await AdminService.listAuditLogs({ entityType, action, limit });
    return successResponse(logs);
  } catch (err: any) {
    return errorResponse('AUDIT_LOGS_FAILED', err.message, 500);
  }
}
