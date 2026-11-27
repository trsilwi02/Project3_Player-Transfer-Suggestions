'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type AuthUser = { username: string; role: 'scout' | 'admin' | 'guest' };

export default function AuthNav() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Keep the login and registration links visible while the session request runs.
  const [loaded, setLoaded] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const loadUser = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/auth/me', { cache: 'no-store' });
      const payload = await response.json();
      setUser(response.ok ? payload.data : null);
    } catch {
      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser, pathname]);

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      router.replace('/');
      router.refresh();
    }
  };

  if (!loaded || !user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white sm:px-3 sm:text-sm">
          Đăng nhập
        </Link>
        <Link href="/register" className="whitespace-nowrap rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 sm:px-3 sm:text-sm">
          Tạo tài khoản
        </Link>
      </div>
    );
  }

  const roleLabel = user.role === 'admin' ? 'Quản trị viên' : 'Scout';
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="max-w-32 truncate text-sm font-semibold text-white">{user.username}</p>
        <p className="text-xs text-emerald-300">{roleLabel}</p>
      </div>
      <button type="button" onClick={logout} className="whitespace-nowrap rounded-lg border border-slate-700 px-2 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white sm:px-3 sm:text-sm">
        Đăng xuất
      </button>
    </div>
  );
}
