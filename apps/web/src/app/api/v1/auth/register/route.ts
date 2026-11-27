import { NextRequest } from 'next/server';
import { RegisterRequestSchema } from '@project3/shared';
import { AuthService } from '@/services/auth.service';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getClientIp } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Dữ liệu đăng ký không hợp lệ', 400, parsed.error.format());
    }

    const clientIp = getClientIp(request);
    const tokens = await AuthService.register(parsed.data, clientIp);

    const response = successResponse(tokens, undefined, 201);
    // Set httpOnly cookie for web
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
    console.error('[auth.register] Request failed', {
      name: err?.name,
      code: err?.code,
      message: err?.message,
      connectionErrors,
    });
    if (err?.code === 'ECONNREFUSED' || connectionErrors.some((cause: any) => cause.code === 'ECONNREFUSED')) {
      return errorResponse('DATABASE_UNAVAILABLE', 'Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.', 503);
    }
    return errorResponse(
      err.code || 'REGISTER_FAILED',
      err.message || 'Đăng ký tài khoản thất bại',
      err.status || 500
    );
  }
}
