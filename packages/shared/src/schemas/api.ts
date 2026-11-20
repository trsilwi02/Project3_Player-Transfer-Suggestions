import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export interface ApiResponse<T = any> {
  data?: T;
  error?: ApiError;
  meta?: {
    cursor?: string | null;
    hasMore?: boolean;
    total?: number;
    asOf?: string;
  };
}

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
