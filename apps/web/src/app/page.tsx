import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-8 text-white shadow-xl border border-slate-800">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/30 mb-4">
            <span>Phiên bản kiến trúc V2.0</span>
            <span>•</span>
            <span>Hệ thống thông tin hỗ trợ quyết định</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-3">
            Hệ thống Tuyển trạch & Hỗ trợ Chuyển nhượng Cầu thủ
          </h1>
          <p className="text-slate-300 text-base leading-relaxed mb-6">
            Lượng hóa và đánh giá khả thi thương vụ dựa trên 3 trụ cột độc lập:{' '}
            <strong className="text-emerald-400">Khả thi tài chính (F)</strong>,{' '}
            <strong className="text-sky-400">Phù hợp chiến thuật đa vai trò (S)</strong> và{' '}
            <strong className="text-amber-400">Rủi ro chấn thương & bán lại (R)</strong>.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/players"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-lg shadow-md transition"
            >
              Tra cứu hồ sơ cầu thủ (UC02-04)
            </Link>
            <Link
              href="/matching"
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium px-5 py-2.5 rounded-lg border border-slate-700 transition"
            >
              Chạy Matching Studio (UC06)
            </Link>
            <Link
              href="/requirements"
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium px-5 py-2.5 rounded-lg border border-slate-700 transition"
            >
              Quản lý nhu cầu CLB (UC05)
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Quy mô dữ liệu cầu thủ
          </div>
          <div className="text-2xl font-bold text-slate-900">5.000+</div>
          <p className="text-xs text-slate-500 mt-2">
            Đa vị trí, độ tuổi 16–38, thống kê 3 mùa giải gần nhất
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            CLB & Giải đấu
          </div>
          <div className="text-2xl font-bold text-emerald-600">200 CLB</div>
          <p className="text-xs text-slate-500 mt-2">
            10 giải đấu hàng đầu: Premier League, La Liga, Serie A,...
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Cơ hội Free Agent (BR01)
          </div>
          <div className="text-2xl font-bold text-amber-600">Hợp đồng ≤ 6 tháng</div>
          <p className="text-xs text-slate-500 mt-2">
            Cảnh báo tự động hợp đồng sắp đáo hạn để tiếp cận sớm
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Ma trận trọng số chiến thuật
          </div>
          <div className="text-2xl font-bold text-sky-600">35 Vai trò (V2)</div>
          <p className="text-xs text-slate-500 mt-2">
            18 chỉ số chuẩn hóa percentile và kiểm soát ties chặt chẽ
          </p>
        </div>
      </div>

      {/* Quick Search & Information Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Rules & Architecture */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b pb-3">
            Quy tắc nghiệp vụ cốt lõi (Business Rules BR01–BR09)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-emerald-700">BR01 — Cơ hội Free Agent:</span>
              <p className="text-slate-600 text-xs mt-1">
                Hợp đồng còn ≤ 6 tháng được xếp vào diện tự do hoặc giá chuyển nhượng giảm sâu.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-emerald-700">BR02 — Ràng buộc hợp đồng:</span>
              <p className="text-slate-600 text-xs mt-1">
                Một cầu thủ chỉ có 1 hợp đồng chính hiệu lực tại 1 thời điểm; exclusion constraint chống chồng lấn.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-emerald-700">BR03 — Nhãn tin cậy tài chính:</span>
              <p className="text-slate-600 text-xs mt-1">
                Mọi số liệu lương/phí bắt buộc gắn nhãn độ tin cậy (rumor, reputable_media, official, simulated).
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-emerald-700">BR06 — Bảo mật lương:</span>
              <p className="text-slate-600 text-xs mt-1">
                Khách vãng lai (Guest) không thể xem lương chi tiết; chỉ Scout/Admin mới được cấp quyền.
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <h3 className="font-semibold text-emerald-900 text-sm mb-1">
              Công thức tổng hợp Matching Engine V2:
            </h3>
            <p className="font-mono text-xs text-emerald-800">
              Matching = 0.40 × F + 0.40 × S + 0.20 × R (hoặc theo cấu hình CLB)
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Phân cấp khuyến nghị: <strong>&gt; 80 Khuyến nghị cao</strong> (Xanh lá) •{' '}
              <strong>50–79 Cần cân nhắc</strong> (Vàng cam) •{' '}
              <strong>&lt; 50 Rủi ro cao</strong> (Đỏ).
            </p>
          </div>
        </div>

        {/* Right Column: Fast Links & System Health */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b pb-3">
            Trạng thái hệ thống
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Cơ sở dữ liệu</span>
              <span className="font-medium text-emerald-600 flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                PostgreSQL 16
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Cấu hình tính điểm</span>
              <span className="font-medium text-slate-800">sc-v2.0-default (Active)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Ma trận vai trò</span>
              <span className="font-medium text-slate-800">rwm-v2.0 (100% OK)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">API Gateway</span>
              <span className="font-medium text-slate-800">/api/v1 (REST JSON)</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Audit Logging</span>
              <span className="font-medium text-emerald-600">Bất biến (Immutable)</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/admin"
              className="block text-center text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 py-2 rounded-lg transition"
            >
              Truy cập Nhật ký Audit & Quản trị dữ liệu &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
