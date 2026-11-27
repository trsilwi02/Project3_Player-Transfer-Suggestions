import { z } from 'zod';

export const LoginRequestSchema = z.object({
  usernameOrEmail: z.string().min(3, 'Tên đăng nhập hoặc email tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  deviceToken: z.string().optional(),
  platform: z.enum(['fcm', 'apns']).optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ gồm chữ cái, số và dấu gạch dưới'),
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự'),
  locale: z.enum(['vi', 'en']).default('vi'),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token không được để trống'),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  role: z.enum(['scout', 'admin', 'guest']),
  locale: z.enum(['vi', 'en']),
  createdAt: z.string().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}
