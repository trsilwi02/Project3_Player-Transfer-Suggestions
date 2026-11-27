import { NextRequest } from 'next/server';
import { LoginRequestSchema } from '@project3/shared';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getClientIp } from '@/lib/auth';
import { query } from '@project3/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Thông tin đăng nhập không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const limited = await query('SELECT fn_login_rate_limit($1) AS allowed', [clientIp]);
    if (!limited.rows[0]?.allowed) return errorResponse('RATE_LIMITED', 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.', 429);
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
    const connectionErrors = Array.isArray(err?.errors)
      ? err.errors.map((cause: any) => ({
          code: cause?.code,
          syscall: cause?.syscall,
          address: cause?.address,
          port: cause?.port,
        }))
      : [];
    console.error('[auth.login] Request failed', {
      name: err?.name,
      code: err?.code,
      message: err?.message,
      connectionErrors,
    });
    if (err?.code === 'ECONNREFUSED' || connectionErrors.some((cause: any) => cause.code === 'ECONNREFUSED')) {
      return errorResponse('DATABASE_UNAVAILABLE', 'Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.', 503);
    }
    return errorResponse(
      err.code || 'LOGIN_FAILED',
      err.message || 'Đăng nhập thất bại',
      err.status || 500
    );
  }
}
