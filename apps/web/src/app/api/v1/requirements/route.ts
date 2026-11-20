import { NextRequest } from 'next/server';
import { ClubRequirementCreateSchema } from '@project3/shared';
import { RequirementService } from '@/services/requirement.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser, getClientIp } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để xem danh sách nhu cầu', 401);
    }

    const items = await RequirementService.listByUser(user.id);
    return successResponse(items);
  } catch (err: any) {
    return errorResponse('REQUIREMENTS_FETCH_FAILED', err.message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để tạo nhu cầu tuyển trạch', 401);
    }

    const body = await request.json();
    const parsed = ClubRequirementCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Dữ liệu nhu cầu không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const created = await RequirementService.create(user.id, parsed.data, clientIp);
    return successResponse(created, undefined, 201);
  } catch (err: any) {
    return errorResponse(err.code || 'REQUIREMENT_CREATE_FAILED', err.message, err.status || 500);
  }
}
