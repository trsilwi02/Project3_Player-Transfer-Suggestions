'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function ComparePage() {
  const searchParams = useSearchParams();
  const initialIds = searchParams.get('playerIds') || '';

  const [inputIds, setInputIds] = useState(initialIds);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchComparison = async (ids: string) => {
    if (!ids) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/compare?playerIds=${ids}`);
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      } else {
        setErrorMsg(json.error?.message || 'Không thể so sánh');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialIds) {
      fetchComparison(initialIds);
    }
  }, [initialIds]);

  const handleCompareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchComparison(inputIds);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          So Sánh Cầu Thủ Trực Quan (UC07)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Đối chiếu trực diện từ 2 đến 4 mục tiêu chuyển nhượng về thông số tài chính, hợp đồng và vector vai trò chiến thuật.
        </p>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <form onSubmit={handleCompareSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputIds}
            onChange={(e) => setInputIds(e.target.value)}
            placeholder="Nhập ID các cầu thủ cách nhau bằng dấu phẩy (VD: 1, 2, 3)"
            className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-5 py-2 rounded-lg transition"
          >
            So sánh
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {errorMsg}
        </div>
      )}

      {loading && <div className="p-12 text-center text-slate-500">Đang đối chiếu dữ liệu...</div>}

      {data && data.players && data.players.length >= 2 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700 uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 min-w-[180px]">Tiêu chí đối chiếu</th>
                {data.players.map((p: any) => (
                  <th key={p.id} className="px-4 py-3 min-w-[200px]">
                    <Link href={`/players/${p.id}`} className="font-bold text-emerald-800 hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs font-normal text-slate-500">
                      {p.position} • {p.club_name || 'Tự do'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Độ tuổi</td>
                {data.players.map((p: any) => (
                  <td key={p.id} className="px-4 py-3 font-mono font-bold text-slate-900">
                    {p.age} tuổi
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Định giá thị trường</td>
                {data.players.map((p: any) => (
                  <td key={p.id} className="px-4 py-3 font-mono font-bold text-slate-900">
                    {p.market_value ? `€${(p.market_value / 1e6).toFixed(1)}M` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Mức lương hiện tại</td>
                {data.players.map((p: any) => (
                  <td key={p.id} className="px-4 py-3 font-mono text-emerald-700 font-bold">
                    {p.salary_per_year ? `€${(p.salary_per_year / 1e6).toFixed(2)}M/năm` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Hạn hợp đồng</td>
                {data.players.map((p: any) => (
                  <td key={p.id} className="px-4 py-3 text-slate-800">
                    {p.contract_end_date || 'Tự do'}{' '}
                    {p.months_remaining && `(${p.months_remaining} tháng)`}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Thời lượng thi đấu gần nhất</td>
                {data.players.map((p: any) => (
                  <td key={p.id} className="px-4 py-3 font-mono text-slate-800">
                    {p.season_minutes ? `${p.season_minutes.toLocaleString()} phút` : '0 phút'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
