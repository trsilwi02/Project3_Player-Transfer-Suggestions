'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ShortlistItem {
  id: number;
  playerId: number;
  playerName: string;
  age: number;
  position: string;
  clubName?: string | null;
  contractEndDate?: string | null;
  feeEstDefault?: number | null;
  matching?: number | null;
  fScore?: number | null;
  sScore?: number | null;
  rScore?: number | null;
  note?: string | null;
  createdAt: string;
}

export default function ShortlistPage() {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShortlist = async () => {
    try {
      const res = await fetch('/api/v1/shortlists');
      const data = await res.json();
      if (data.data) {
        setItems(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShortlist();
  }, []);

  const handleRemove = async (id: number) => {
    if (!confirm('Xóa cầu thủ này khỏi Shortlist?')) return;
    try {
      await fetch(`/api/v1/shortlists/${id}`, { method: 'DELETE' });
      fetchShortlist();
    } catch (err) {
      console.error(err);
    }
  };

  const totalFee = items.reduce((sum, item) => sum + (item.feeEstDefault || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Danh Sách Tuyển Trạch Mục Tiêu — Shortlist (UC08)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tổng hợp và theo dõi các mục tiêu chuyển nhượng trọng tâm, ghi chú tuyển trạch và tổng dự toán ngân sách.
          </p>
        </div>

        <div className="flex gap-3">
          <a
            href="/api/v1/shortlists/export"
            download
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition border border-slate-700 flex items-center gap-2"
          >
            📥 Xuất danh sách CSV
          </a>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 uppercase block font-semibold">
            Tổng số mục tiêu
          </span>
          <span className="text-2xl font-bold text-slate-900">{items.length} cầu thủ</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 uppercase block font-semibold">
            Dự toán phí chuyển nhượng
          </span>
          <span className="text-2xl font-bold text-emerald-700">
            €{(totalFee / 1e6).toFixed(1)}M
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 uppercase block font-semibold">
            Sắp hết hạn hợp đồng
          </span>
          <span className="text-2xl font-bold text-amber-600">
            {items.filter((i) => i.contractEndDate && new Date(i.contractEndDate) < new Date(Date.now() + 180 * 86400000)).length} mục tiêu
          </span>
        </div>
      </div>

      {/* Shortlist Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Đang tải danh sách Shortlist...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <p>Danh sách mục tiêu hiện đang trống.</p>
            <Link href="/players" className="text-xs text-emerald-600 font-bold underline">
              Khám phá và thêm cầu thủ vào Shortlist ngay
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Cầu thủ</th>
                  <th className="px-3 py-3">Vị trí</th>
                  <th className="px-4 py-3">CLB hiện tại</th>
                  <th className="px-4 py-3">Phí ước tính</th>
                  <th className="px-4 py-3">Matching Score</th>
                  <th className="px-4 py-3">Ghi chú tuyển trạch</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/players/${i.playerId}`}
                        className="font-bold text-emerald-800 hover:underline text-sm"
                      >
                        {i.playerName}
                      </Link>
                      <span className="block text-[11px] text-slate-400">{i.age} tuổi</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-mono font-medium">
                        {i.position}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{i.clubName || 'Tự do'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                      {i.feeEstDefault ? `€${(i.feeEstDefault / 1e6).toFixed(1)}M` : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-700 font-mono text-sm">
                      {i.matching !== null && i.matching !== undefined ? `${i.matching.toFixed(1)}/100` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 italic max-w-xs truncate">
                      {i.note || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(i.id)}
                        className="text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded"
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
    </div>
  );
}
