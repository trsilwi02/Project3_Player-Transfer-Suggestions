'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Requirement {
  id: number;
  position: string;
  clubName?: string | null;
  budget: number;
  salaryLimit: number;
  minAge?: number | null;
  maxAge?: number | null;
  priority: number;
  matchingParams?: any;
  createdAt: string;
}

export default function RequirementsPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [position, setPosition] = useState('CM/CDM');
  const [budget, setBudget] = useState('30000000');
  const [salaryLimit, setSalaryLimit] = useState('4000000');
  const [minAge, setMinAge] = useState('20');
  const [maxAge, setMaxAge] = useState('28');
  const [priority, setPriority] = useState(3);
  const [sMin, setSMin] = useState(60);
  const [minMinutes, setMinMinutes] = useState(600);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchRequirements = async () => {
    try {
      const res = await fetch('/api/v1/requirements');
      const data = await res.json();
      if (data.data) {
        setRequirements(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const res = await fetch('/api/v1/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position,
          budget: parseFloat(budget),
          salaryLimit: parseFloat(salaryLimit),
          minAge: minAge ? parseInt(minAge, 10) : null,
          maxAge: maxAge ? parseInt(maxAge, 10) : null,
          priority: Number(priority),
          matchingParams: {
            s_min: Number(sMin),
            min_minutes: Number(minMinutes),
            tau_fee: 0.1,
            tau_wage: 0.1,
          },
        }),
      });

      const data = await res.json();
      if (data.data) {
        setShowCreateModal(false);
        fetchRequirements();
      } else {
        setStatusMsg(data.error?.message || 'Tạo nhu cầu thất bại');
      }
    } catch (err: any) {
      setStatusMsg(err.message || 'Lỗi kết nối máy chủ');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa nhu cầu tuyển trạch này?')) return;
    try {
      await fetch(`/api/v1/requirements/${id}`, { method: 'DELETE' });
      fetchRequirements();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Quản lý Nhu cầu Tuyển trạch CLB (UC05)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Thiết lập ràng buộc về vị trí, ngân sách phí, trần quỹ lương và tiêu chuẩn tương thích chiến thuật.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
        >
          + Tạo nhu cầu mới
        </button>
      </div>

      {/* List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Đang tải danh sách nhu cầu...</div>
        ) : requirements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <p>Chưa có hồ sơ nhu cầu tuyển trạch nào được tạo.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100"
            >
              Tạo nhu cầu đầu tiên ngay &rarr;
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Vị trí cần tuyển</th>
                  <th className="px-4 py-3">Độ tuổi</th>
                  <th className="px-4 py-3">Ngân sách (B)</th>
                  <th className="px-4 py-3">Trần lương (W_cap)</th>
                  <th className="px-3 py-3">Ưu tiên</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {requirements.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-slate-500">#{r.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-xs mr-2 font-mono">
                        {r.position}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.minAge || '—'} – {r.maxAge || '—'} tuổi
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      €{(r.budget / 1e6).toFixed(1)}M
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      €{(r.salaryLimit / 1e6).toFixed(2)}M/năm
                    </td>
                    <td className="px-3 py-3">
                      <span className="bg-indigo-50 text-indigo-700 font-bold text-xs px-2 py-0.5 rounded">
                        Mức {r.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        href={`/matching?requirementId=${r.id}`}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition inline-block"
                      >
                        Chạy Matching &rarr;
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal create requirement */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-bold text-slate-900">Tạo Nhu Cầu Tuyển Trạch Mới</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {statusMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {statusMsg}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vị trí cần bổ sung
                  </label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="CB">Trung vệ (CB)</option>
                    <option value="RB/LB">Hậu vệ biên/cánh (RB/LB)</option>
                    <option value="CM/CDM">Tiền vệ trung tâm/phòng ngự (CM/CDM)</option>
                    <option value="CAM">Tiền vệ công (CAM)</option>
                    <option value="LW/RW">Tiền đạo cánh (LW/RW)</option>
                    <option value="ST">Tiền đạo cắm (ST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Độ ưu tiên (1–5)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngân sách chuyển nhượng B (EUR)
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="30000000"
                    required
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trần quỹ lương W_cap (EUR/năm)
                  </label>
                  <input
                    type="number"
                    value={salaryLimit}
                    onChange={(e) => setSalaryLimit(e.target.value)}
                    placeholder="4000000"
                    required
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tuổi từ</label>
                  <input
                    type="number"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Đến tuổi</label>
                  <input
                    type="number"
                    value={maxAge}
                    onChange={(e) => setMaxAge(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Điểm chuyên môn tối thiểu (s_min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={sMin}
                    onChange={(e) => setSMin(parseInt(e.target.value, 10))}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phút thi đấu tối thiểu
                  </label>
                  <input
                    type="number"
                    value={minMinutes}
                    onChange={(e) => setMinMinutes(parseInt(e.target.value, 10))}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Lưu nhu cầu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
