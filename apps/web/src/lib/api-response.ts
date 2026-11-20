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
  const body: ApiErrorPayload = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}
