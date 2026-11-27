'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password, locale: 'vi' }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.');
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
    <div className="mx-auto grid min-h-[65vh] max-w-5xl items-center gap-10 py-8 lg:grid-cols-[0.9fr_1fr]">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9">
        <div className="mb-7">
          <p className="text-sm font-semibold text-emerald-700">Bắt đầu sử dụng</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Tạo tài khoản Scout</h1>
          <p className="mt-2 text-sm text-slate-600">Tài khoản mới được tạo với quyền Scout.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">Tên đăng nhập</label>
            <input id="username" name="username" type="text" autoComplete="username" required minLength={3} maxLength={50} pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="3–50 ký tự: chữ, số, dấu gạch dưới" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="ten@email.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="Ít nhất 12 ký tự" />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-slate-700">Nhập lại mật khẩu</label>
            <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="Nhập lại mật khẩu" />
          </div>

          <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">Quyền quản trị chỉ được cấp riêng bởi quản trị viên.</p>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60">
            {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">Đăng nhập</Link>
        </p>
      </section>

      <aside className="hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-10 text-white shadow-xl lg:block">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Không gian tuyển trạch</p>
        <h2 className="mt-3 text-3xl font-extrabold leading-tight">Theo dõi mục tiêu. So sánh dữ liệu. Ra quyết định tự tin.</h2>
        <p className="mt-4 text-sm leading-6 text-slate-300">Tạo nhu cầu tuyển dụng cho CLB, lưu shortlist và đánh giá cầu thủ qua các trụ cột tài chính, chiến thuật và rủi ro.</p>
      </aside>
    </div>
  );
}
