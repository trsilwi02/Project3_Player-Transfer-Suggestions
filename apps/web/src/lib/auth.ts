import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import { NextRequest } from 'next/server';
import { AuthUser } from '@project3/shared';

function requiredSecret(name: 'JWT_SECRET' | 'REFRESH_TOKEN_PEPPER'): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be configured with at least 32 characters`);
  return value;
}

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$2')) return bcrypt.compare(password, hash);
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(hash: string): boolean {
  return hash.startsWith('$2');
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
    requiredSecret('JWT_SECRET'),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token: string): AuthUser | null {
  const secret = requiredSecret('JWT_SECRET');
  try {
    const decoded = jwt.verify(token, secret) as any;
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
    .update(rawBytes + requiredSecret('REFRESH_TOKEN_PEPPER'))
    .digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  return { token: rawBytes, hash, expiresAt };
}

export function hashRefreshToken(rawToken: string): string {
  return crypto
    .createHash('sha256')
    .update(rawToken + requiredSecret('REFRESH_TOKEN_PEPPER'))
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
