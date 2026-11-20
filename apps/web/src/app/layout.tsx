import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Hệ thống thông tin hồ sơ cầu thủ & Hỗ trợ chuyển nhượng',
  description: 'Hệ thống thông tin tuyển trạch, định giá, hợp đồng và hỗ trợ quyết định chuyển nhượng bóng đá theo chuẩn Matching Engine V2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen flex flex-col">
        {/* Main Navigation Bar */}
        <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  FOOTBALL TRANSFER DB
                </span>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  V2 Engine
                </span>
              </Link>

              <nav className="hidden md:flex space-x-1 text-sm font-medium">
                <Link
                  href="/"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Tổng quan
                </Link>
                <Link
                  href="/players"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Cầu thủ & Sàng lọc
                </Link>
                <Link
                  href="/requirements"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Nhu cầu CLB
                </Link>
                <Link
                  href="/matching"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Matching Studio
                </Link>
                <Link
                  href="/compare"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  So sánh
                </Link>
                <Link
                  href="/shortlists"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Shortlist
                </Link>
                <Link
                  href="/admin"
                  className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-emerald-400 transition"
                >
                  Quản trị & Audit
                </Link>
              </nav>
            </div>

            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center bg-slate-800/80 rounded-lg px-3 py-1.5 border border-slate-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse"></span>
                <span>Role: Scout (Đầy đủ dữ liệu lương)</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <p className="font-semibold text-slate-300">
                Hệ thống thông tin hồ sơ cầu thủ, hợp đồng và hỗ trợ quyết định chuyển nhượng
              </p>
              <p>Tuân thủ chuẩn quy tắc nghiệp vụ BR01–BR09 & Thuật toán Matching Engine V2 (F/S/R).</p>
            </div>
            <div className="text-right">
              <p>Đồ án tốt nghiệp Full-stack & Hệ thống thông tin</p>
              <p className="text-emerald-400">PostgreSQL 16 · Next.js · TypeScript</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
