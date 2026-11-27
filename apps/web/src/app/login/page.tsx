'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: usernameOrEmail.trim(), password }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message || 'Không thể đăng nhập. Vui lòng thử lại.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[65vh] max-w-5xl items-center gap-10 py-8 lg:grid-cols-[1fr_0.9fr]">
      <section className="hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-10 text-white shadow-xl lg:block">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Football Transfer DB</p>
        <h1 className="text-3xl font-extrabold leading-tight">Đưa quyết định tuyển trạch về gần dữ liệu hơn.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">Đăng nhập để quản lý nhu cầu CLB, tạo danh sách mục tiêu và chạy Matching Studio.</p>
        <div className="mt-8 grid grid-cols-3 gap-3 text-center text-xs">
          {['Khả thi tài chính', 'Phù hợp chiến thuật', 'Rủi ro & tiềm năng'].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-slate-200">{item}</div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9">
        <div className="mb-7">
          <p className="text-sm font-semibold text-emerald-700">Chào mừng trở lại</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Đăng nhập</h2>
          <p className="mt-2 text-sm text-slate-600">Dùng tên đăng nhập hoặc email của bạn.</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="usernameOrEmail" className="mb-1.5 block text-sm font-medium text-slate-700">Tên đăng nhập hoặc email</label>
            <input id="usernameOrEmail" name="usernameOrEmail" type="text" autoComplete="username" required minLength={3} value={usernameOrEmail} onChange={(event) => setUsernameOrEmail(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="vd: scout_01 hoặc ten@email.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="Nhập mật khẩu" />
          </div>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60">
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800">Tạo tài khoản</Link>
        </p>
      </section>
    </div>
  );
}
