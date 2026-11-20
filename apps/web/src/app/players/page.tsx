'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PlayerItem {
  id: number;
  name: string;
  age: number;
  position: string;
  clubName?: string | null;
  league?: string | null;
  marketValue?: number | null;
  marketValueLabel?: string | null;
  salaryPerYear?: number | null;
  contractEndDate?: string | null;
  monthsRemaining?: number | null;
  seasonMinutes?: number | null;
}

export default function PlayersDiscoveryPage() {
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [position, setPosition] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [freeAgentWindow, setFreeAgentWindow] = useState('');
  const [minMinutes, setMinMinutes] = useState('');
  const [sortBy, setSortBy] = useState('market_value');

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.append('q', q.trim());
      if (position) params.append('position', position);
      if (minAge) params.append('minAge', minAge);
      if (maxAge) params.append('maxAge', maxAge);
      if (freeAgentWindow) params.append('freeAgentWindow', freeAgentWindow);
      if (minMinutes) params.append('minMinutes', minMinutes);
      params.append('sortBy', sortBy);
      params.append('limit', '30');

      const res = await fetch(`/api/v1/players?${params.toString()}`);
      const data = await res.json();
      if (data.data) {
        setPlayers(data.data);
      }
    } catch (err) {
      console.error('Fetch players error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [position, freeAgentWindow, sortBy]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPlayers();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Tra cứu & Sàng lọc Đa chiều Cầu thủ (UC02, UC03)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hỗ trợ tìm kiếm mờ (fuzzy), không dấu và lọc động theo thời hạn hợp đồng, thời lượng thi đấu, năng lực tài chính.
        </p>
      </div>

      {/* Filter Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Tìm theo tên (không dấu / fuzzy)
            </label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="VD: nguyen, haaland, mbappe..."
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Vị trí thi đấu
            </label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tất cả vị trí</option>
              <option value="CB">Trung vệ (CB)</option>
              <option value="RB/LB">Hậu vệ biên/cánh (RB/LB)</option>
              <option value="CM/CDM">Tiền vệ trung tâm/phòng ngự (CM/CDM)</option>
              <option value="CAM">Tiền vệ công (CAM)</option>
              <option value="LW/RW">Tiền đạo cánh (LW/RW)</option>
              <option value="ST">Tiền đạo cắm (ST)</option>
              <option value="GK">Thủ môn (GK - Ngoài phạm vi V2)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Thời hạn hợp đồng (BR01)
            </label>
            <select
              value={freeAgentWindow}
              onChange={(e) => setFreeAgentWindow(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Mọi thời hạn</option>
              <option value="3">Hết hạn trong ≤ 3 tháng</option>
              <option value="6">Hết hạn trong ≤ 6 tháng (Free Agent)</option>
              <option value="12">Hết hạn trong ≤ 12 tháng</option>
              <option value="24">Hết hạn trong ≤ 24 tháng</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Sắp xếp theo
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="market_value">Giá trị thị trường giảm dần</option>
              <option value="name">Tên cầu thủ (A-Z)</option>
              <option value="age">Độ tuổi</option>
              <option value="contract_end_date">Ngày hết hạn hợp đồng</option>
              <option value="season_minutes">Thời lượng thi đấu (phút)</option>
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tuổi từ</label>
              <input
                type="number"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                placeholder="16"
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Đến</label>
              <input
                type="number"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="35"
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Số phút thi đấu tối thiểu
            </label>
            <input
              type="number"
              value={minMinutes}
              onChange={(e) => setMinMinutes(e.target.value)}
              placeholder="VD: 900"
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 flex items-end space-x-2">
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition"
            >
              {loading ? 'Đang lọc...' : 'Áp dụng bộ lọc'}
            </button>
            <button
              type="button"
              onClick={() => {
                setQ('');
                setPosition('');
                setMinAge('');
                setMaxAge('');
                setFreeAgentWindow('');
                setMinMinutes('');
                fetchPlayers();
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm transition"
            >
              Đặt lại
            </button>
          </div>
        </form>
      </div>

      {/* Players Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <span className="text-sm font-semibold text-slate-700">
            Kết quả hiển thị ({players.length} cầu thủ)
          </span>
          <span className="text-xs text-slate-500">
            Lương hiển thị cho vai trò Scout/Admin kèm nhãn độ tin cậy
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Đang tải dữ liệu hồ sơ cầu thủ...</div>
        ) : players.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Không tìm thấy cầu thủ nào phù hợp với điều kiện lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Cầu thủ</th>
                  <th className="px-3 py-3">Vị trí</th>
                  <th className="px-3 py-3">Tuổi</th>
                  <th className="px-4 py-3">CLB hiện tại</th>
                  <th className="px-4 py-3">Giá trị thị trường</th>
                  <th className="px-4 py-3">Lương (EUR/năm)</th>
                  <th className="px-4 py-3">Hợp đồng</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {players.map((p) => {
                  const isExpiringSoon = p.monthsRemaining !== null && p.monthsRemaining !== undefined && p.monthsRemaining <= 6;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <Link
                          href={`/players/${p.id}`}
                          className="font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.seasonMinutes !== undefined && p.seasonMinutes !== null && (
                          <span className="block text-xs text-slate-500">
                            {p.seasonMinutes.toLocaleString()} phút
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block bg-slate-100 text-slate-800 text-xs px-2 py-0.5 rounded font-mono font-medium">
                          {p.position}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{p.age}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{p.clubName || 'Tự do'}</span>
                        <span className="block text-xs text-slate-400">{p.league || ''}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {p.marketValue ? `€${(p.marketValue / 1e6).toFixed(1)}M` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {p.salaryPerYear ? (
                          <div>
                            <span className="font-medium text-slate-800">
                              €{(p.salaryPerYear / 1e6).toFixed(2)}M
                            </span>
                            <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded">
                              verified
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Chưa công bố</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.contractEndDate ? (
                          <div>
                            <span className="text-slate-700 text-xs">{p.contractEndDate}</span>
                            {isExpiringSoon && (
                              <span className="block mt-0.5 text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded w-max">
                                Sắp hết hạn ({p.monthsRemaining}th)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium">Cầu thủ tự do</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Link
                          href={`/players/${p.id}`}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded transition font-medium"
                        >
                          Chi tiết &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
