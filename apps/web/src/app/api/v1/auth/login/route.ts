import { NextRequest } from 'next/server';
import { LoginRequestSchema } from '@project3/shared';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getClientIp } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Thông tin đăng nhập không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const tokens = await AuthService.login(parsed.data, clientIp);

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
      err.code || 'LOGIN_FAILED',
      err.message || 'Đăng nhập thất bại',
      err.status || 500
    );
  }
}
