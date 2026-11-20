import { NextRequest } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const tokenUser = getAuthUser(request);
    if (!tokenUser) {
      return errorResponse('UNAUTHORIZED', 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn', 401);
    }

    const user = await AuthService.getUserById(tokenUser.id);
    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'Người dùng không tồn tại hoặc đã bị khóa', 404);
    }

    return successResponse(user);
  } catch (err: any) {
    return errorResponse('ME_FAILED', err.message, 500);
  }
}
