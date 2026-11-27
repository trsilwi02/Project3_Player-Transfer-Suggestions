import { NextResponse } from 'next/server';

export interface ApiSuccessPayload<T> {
  data: T;
  meta?: {
    cursor?: string | null;
    hasMore?: boolean;
    total?: number;
    asOf?: string;
  };
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export function successResponse<T>(
  data: T,
  meta?: ApiSuccessPayload<T>['meta'],
  status: number = 200
) {
  const body: ApiSuccessPayload<T> = { data };
  if (meta) {
    body.meta = meta;
  }
  return NextResponse.json(body, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status: number = 400,
  details?: any
) {
  if (/^[A-Z0-9]{5}$/.test(code)) {
    const sqlState = code;
    if (sqlState === 'P0002') return errorResponse('REQUIREMENT_NOT_FOUND', 'Không tìm thấy dữ liệu yêu cầu', 404);
    if (sqlState === 'P0001' && /UNSUPPORTED_POSITION/.test(message || '')) {
      return errorResponse('UNSUPPORTED_POSITION', 'Vị trí này chưa được hỗ trợ chấm điểm', 422);
    }
    return errorResponse('INTERNAL_ERROR', 'Đã xảy ra lỗi khi xử lý yêu cầu', 500);
  }
  if (status >= 500) {
    code = 'INTERNAL_ERROR';
    message = 'Đã xảy ra lỗi khi xử lý yêu cầu';
    details = undefined;
  }
  const body: ApiErrorPayload = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}
