import { NextRequest } from 'next/server';
import { RefreshTokenRequestSchema } from '@project3/shared';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getClientIp } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RefreshTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Yêu cầu refresh token không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const tokens = await AuthService.refreshTokens(parsed.data.refreshToken, clientIp);

    const response = successResponse(tokens);
    response.cookies.set('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });

    return response;
  } catch (err: any) {
    return errorResponse(
      err.code || 'REFRESH_FAILED',
      err.message || 'Không thể làm mới phiên đăng nhập',
      err.status || 401
    );
  }
}
