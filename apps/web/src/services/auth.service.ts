import { query, withTransaction } from '@project3/db';
import {
  AuthTokens,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@project3/shared';
import {
  generateRefreshToken,
  hashPassword,
  needsPasswordRehash,
  hashRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../lib/auth';

export class AuthService {
  static async register(data: RegisterRequest, clientIp: string): Promise<AuthTokens> {
    const existing = await query(
      'SELECT id, username, email FROM app_user WHERE username = $1 OR email = $2',
      [data.username, data.email]
    );

    if (existing.rows.length > 0) {
      const isEmail = existing.rows.some((r) => r.email.toLowerCase() === data.email.toLowerCase());
      throw {
        code: isEmail ? 'EMAIL_ALREADY_EXISTS' : 'USERNAME_ALREADY_EXISTS',
        message: isEmail ? 'Email đã được sử dụng' : 'Tên đăng nhập đã tồn tại',
        status: 409,
      };
    }

    const passwordHash = await hashPassword(data.password);

    try {
      return await withTransaction(async (client) => {
        const userRes = await client.query(
          `INSERT INTO app_user (username, email, password_hash, role, status, locale)
           VALUES ($1, $2, $3, $4, 'active', $5)
           RETURNING id, username, email, role, locale, created_at`,
          [data.username, data.email, passwordHash, 'scout', data.locale || 'vi']
        );

        const userRow = userRes.rows[0];
        const user: AuthUser = {
          id: userRow.id,
          username: userRow.username,
          email: userRow.email,
          role: userRow.role,
          locale: userRow.locale,
          createdAt: userRow.created_at,
        };

        const { token: rawRefreshToken, hash: tokenHash, expiresAt } = generateRefreshToken();

        await client.query(
          `INSERT INTO refresh_token (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [user.id, tokenHash, expiresAt]
        );

        const accessToken = signAccessToken(user);

        return {
          accessToken,
          refreshToken: rawRefreshToken,
          expiresIn: 900, // 15 mins
          user,
        };
      }, { clientIp });
    } catch (error: any) {
      if (error?.code === '23505') {
        if (error.constraint === 'app_user_email_key') {
          throw { code: 'EMAIL_ALREADY_EXISTS', message: 'Email đã được sử dụng', status: 409 };
        }
        if (error.constraint === 'app_user_username_key') {
          throw { code: 'USERNAME_ALREADY_EXISTS', message: 'Tên đăng nhập đã tồn tại', status: 409 };
        }
      }
      throw error;
    }
  }

  static async login(data: LoginRequest, clientIp: string): Promise<AuthTokens> {
    const userRes = await query(
      `SELECT id, username, email, password_hash, role, status, locale, created_at
       FROM app_user
       WHERE username = $1 OR email = $1`,
      [data.usernameOrEmail]
    );

    if (userRes.rows.length === 0) {
      throw {
        code: 'INVALID_CREDENTIALS',
        message: 'Tên đăng nhập, email hoặc mật khẩu không chính xác',
        status: 401,
      };
    }

    const userRow = userRes.rows[0];

    if (userRow.status !== 'active') {
      throw {
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản đã bị tạm khóa hoặc vô hiệu hóa',
        status: 403,
      };
    }

    const passwordMatch = await verifyPassword(data.password, userRow.password_hash);
    if (!passwordMatch) {
      throw {
        code: 'INVALID_CREDENTIALS',
        message: 'Tên đăng nhập, email hoặc mật khẩu không chính xác',
        status: 401,
      };
    }

    const user: AuthUser = {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      role: userRow.role,
      locale: userRow.locale,
      createdAt: userRow.created_at,
    };

    const { token: rawRefreshToken, hash: tokenHash, expiresAt } = generateRefreshToken();

    await withTransaction(async (client) => {
      if (needsPasswordRehash(userRow.password_hash)) {
        const upgradedHash = await hashPassword(data.password);
        await client.query('UPDATE app_user SET password_hash = $1 WHERE id = $2', [upgradedHash, user.id]);
      }
      await client.query(
        `INSERT INTO refresh_token (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      if (data.deviceToken && data.platform) {
        await client.query(
          `INSERT INTO user_device (user_id, device_token, platform)
           VALUES ($1, $2, $3)
           ON CONFLICT (device_token) DO UPDATE SET user_id = $1`,
          [user.id, data.deviceToken, data.platform]
        );
      }
    }, { userId: user.id, clientIp });

    const accessToken = signAccessToken(user);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
      user,
    };
  }

  static async refreshTokens(rawRefreshToken: string, clientIp: string): Promise<AuthTokens> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const tokenRes = await query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.id as u_id, u.username, u.email, u.role, u.status, u.locale, u.created_at
       FROM refresh_token rt
       JOIN app_user u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      throw {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token không hợp lệ',
        status: 401,
      };
    }

    const row = tokenRes.rows[0];

    if (row.revoked_at !== null) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id]
        );
      }, { userId: row.user_id, clientIp });
      throw {
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Phát hiện refresh token cũ được sử dụng lại; toàn bộ phiên đã bị thu hồi',
        status: 401,
      };
    }

    if (new Date(row.expires_at) < new Date()) {
      throw {
        code: 'TOKEN_EXPIRED_OR_REVOKED',
        message: 'Refresh token đã hết hạn hoặc bị thu hồi',
        status: 401,
      };
    }

    if (row.status !== 'active') {
      throw {
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản người dùng đã bị khóa',
        status: 403,
      };
    }

    const user: AuthUser = {
      id: row.u_id,
      username: row.username,
      email: row.email,
      role: row.role,
      locale: row.locale,
      createdAt: row.created_at,
    };

    // Rotation: revoke old token and create new one
    const { token: newRawRefreshToken, hash: newTokenHash, expiresAt } = generateRefreshToken();

    const rotated = await withTransaction(async (client) => {
      const revoked = await client.query(
        `UPDATE refresh_token SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
        [row.id]
      );
      if (!revoked.rowCount) {
        await client.query(
          `UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id]
        );
        return false;
      }

      await client.query(
        `INSERT INTO refresh_token (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, newTokenHash, expiresAt]
      );
      return true;
    }, { userId: user.id, clientIp });

    if (!rotated) {
      throw {
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Phát hiện refresh token cũ được sử dụng lại; toàn bộ phiên đã bị thu hồi',
        status: 401,
      };
    }

    const accessToken = signAccessToken(user);

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
      user,
    };
  }

  static async logout(userId: number, rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashRefreshToken(rawRefreshToken);
      await query(
        `UPDATE refresh_token SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2`,
        [tokenHash, userId]
      );
    } else {
      // Revoke all tokens for this user
      await query(
        `UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    }
  }

  static async getUserById(userId: number): Promise<AuthUser | null> {
    const res = await query(
      `SELECT id, username, email, role, locale, created_at FROM app_user WHERE id = $1 AND status = 'active'`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      locale: r.locale,
      createdAt: r.created_at,
    };
  }
}
