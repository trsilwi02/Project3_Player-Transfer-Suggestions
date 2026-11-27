'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shortlistNote, setShortlistNote] = useState('');
  const [shortlistStatus, setShortlistStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/v1/players/${params.id}`);
        const data = await res.json();
        if (data.data) {
          setPlayer(data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  const addToShortlist = async () => {
    try {
      const res = await fetch('/api/v1/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: parseInt(params.id, 10),
          note: shortlistNote || 'Thêm từ hồ sơ chi tiết',
        }),
      });
      const data = await res.json();
      if (data.data) {
        setShortlistStatus('Đã thêm cầu thủ vào Shortlist thành công!');
      } else {
        setShortlistStatus(`Lỗi: ${data.error?.message || 'Không thể thêm'}`);
      }
    } catch {
      setShortlistStatus('Lỗi khi gửi yêu cầu');
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Đang tải hồ sơ chi tiết...</div>;
  }

  if (!player) {
    return (
      <div className="p-12 text-center text-slate-500">
        Không tìm thấy thông tin cầu thủ.{' '}
        <Link href="/players" className="text-emerald-600 underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link href="/players" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          &larr; Quay lại danh sách sàng lọc
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900">{player.name}</h1>
            <span className="bg-emerald-100 text-emerald-800 font-mono font-bold text-xs px-2.5 py-1 rounded">
              {player.position}
            </span>
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              {player.age} tuổi
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {player.clubName || 'Cầu thủ tự do'} • {player.league || 'Chưa cập nhật'} • Quốc tịch: {player.nationality || '—'}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider block">
              Định giá thị trường
            </span>
            <span className="text-2xl font-black text-slate-900">
              {player.marketValue ? `€${(player.marketValue / 1e6).toFixed(1)}M` : '—'}
            </span>
            {player.marketValueLabel && (
              <span className="text-[10px] block mt-0.5 text-slate-500">
                Độ tin cậy: <span className="font-semibold text-emerald-700">{player.marketValueLabel}</span>
              </span>
            )}
          </div>

          <div className="border-l border-slate-200 pl-4">
            <span className="text-xs text-slate-500 uppercase tracking-wider block">
              Lương hiện tại (BR06)
            </span>
            <span className="text-xl font-bold text-emerald-700">
              {player.salaryPerYear ? `€${(player.salaryPerYear / 1e6).toFixed(2)}M/năm` : '—'}
            </span>
            {player.contractReliability && (
              <span className="text-[10px] block mt-0.5 text-slate-500">
                Nguồn: <span className="font-semibold text-emerald-700">{player.contractReliability}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Tactical Roles & Contract/Injury Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Tactical Role Vector (S Pillar) */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Vector Vai Trò Chiến Thuật (Trụ cột S - Squad Fit)
              </h2>
              <p className="text-xs text-slate-500">
                Chấm điểm theo ma trận trọng số V2.0 dựa trên các chỉ số thi đấu chuẩn hóa percentile
              </p>
            </div>
          </div>

          {player.tacticalRoles && player.tacticalRoles.length > 0 ? (
            <div className="space-y-3">
              {player.tacticalRoles.map((r: any, idx: number) => {
                const score = parseFloat(r.score);
                const isTop = idx === 0;
                return (
                  <div key={r.role} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className={isTop ? 'text-emerald-700 font-bold' : 'text-slate-700'}>
                        {isTop ? '★ ' : ''}
                        {r.role}
                      </span>
                      <span className="font-mono">{score.toFixed(1)} / 100</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full ${
                          score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-sky-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Chưa có số liệu vai trò thi đấu cho cầu thủ này.</p>
          )}

          {/* Quick Action: Add to Shortlist */}
          <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 items-center">
            <input
              type="text"
              value={shortlistNote}
              onChange={(e) => setShortlistNote(e.target.value)}
              placeholder="Ghi chú tuyển trạch (VD: Mục tiêu ưu tiên kỳ đông...)"
              className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={addToShortlist}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition whitespace-nowrap"
            >
              + Thêm vào Shortlist
            </button>
          </div>
          {shortlistStatus && (
            <p className="text-xs font-medium text-emerald-700">{shortlistStatus}</p>
          )}
        </div>

        {/* Right Column: Contract Timeline & Injury (R Pillar) */}
        <div className="space-y-6">
          {/* Contract Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
              Tình trạng hợp đồng hiện tại
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày bắt đầu:</span>
                <span className="font-medium text-slate-800">{player.startDate || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày hết hạn:</span>
                <span className="font-semibold text-slate-900">{player.contractEndDate || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian còn lại:</span>
                <span className="font-bold text-amber-600">
                  {player.monthsRemaining ? `${player.monthsRemaining} tháng` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phí phá vỡ hợp đồng:</span>
                <span className="font-medium text-slate-800">
                  {player.releaseClause ? `€${(player.releaseClause / 1e6).toFixed(1)}M` : 'Không có'}
                </span>
              </div>
            </div>
          </div>

          {/* Injury History Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
              Lịch sử chấn thương 24 tháng (Trụ cột R)
            </h3>
            {player.injuryHistory && player.injuryHistory.length > 0 ? (
              <div className="space-y-2">
                {player.injuryHistory.map((inj: any) => (
                  <div key={inj.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-800">{inj.injury_type}</div>
                    <div className="text-slate-500 flex justify-between mt-0.5">
                      <span>Vùng: {inj.body_area}</span>
                      <span className="font-medium text-amber-700">Nghỉ {inj.days_missed} ngày</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-600 font-medium">
                ✓ Không có ca chấn thương nào ghi nhận trong 24 tháng qua.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
