import { NextRequest } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    let refreshToken: string | undefined;

    try {
      const body = await request.json();
      refreshToken = body.refreshToken;
    } catch {
      // Body is optional
    }

    if (user) {
      await AuthService.logout(user.id, refreshToken);
    }

    const response = successResponse({ message: 'Đăng xuất thành công' });
    response.cookies.delete('access_token');
    return response;
  } catch (err: any) {
    return errorResponse('LOGOUT_FAILED', err.message || 'Lỗi khi đăng xuất', 500);
  }
}
