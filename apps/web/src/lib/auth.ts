import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { AuthUser } from '@project3/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-transfer-market-jwt-token-key-2026';
const REFRESH_TOKEN_PEPPER = process.env.REFRESH_TOKEN_PEPPER || 'transfer-market-pepper-2026';

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      locale: user.locale,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: parseInt(decoded.sub, 10),
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
      locale: decoded.locale || 'vi',
    };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const rawBytes = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(rawBytes + REFRESH_TOKEN_PEPPER)
    .digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  return { token: rawBytes, hash, expiresAt };
}

export function hashRefreshToken(rawToken: string): string {
  return crypto
    .createHash('sha256')
    .update(rawToken + REFRESH_TOKEN_PEPPER)
    .digest('hex');
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

export function getAuthUser(request: NextRequest): AuthUser | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return verifyAccessToken(token);
  }

  const cookieToken = request.cookies.get('access_token')?.value;
  if (cookieToken) {
    return verifyAccessToken(cookieToken);
  }

  return null;
}
