'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function MatchingStudioPage() {
  const searchParams = useSearchParams();
  const initialReqId = searchParams.get('requirementId') || '';

  const [requirements, setRequirements] = useState<any[]>([]);
  const [selectedReqId, setSelectedReqId] = useState<string>(initialReqId);
  const [running, setRunning] = useState(false);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'passed' | 'excluded'>('passed');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Alternatives modal state
  const [altModalPlayer, setAltModalPlayer] = useState<any>(null);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);

  useEffect(() => {
    async function loadReqs() {
      try {
        const res = await fetch('/api/v1/requirements');
        const data = await res.json();
        if (data.data) {
          setRequirements(data.data);
          if (!selectedReqId && data.data.length > 0) {
            setSelectedReqId(data.data[0].id.toString());
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadReqs();
  }, []);

  const handleRunMatch = async () => {
    if (!selectedReqId) return;
    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/match-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: parseInt(selectedReqId, 10),
        }),
      });

      const data = await res.json();
      if (data.data) {
        // Fetch run details
        const detailRes = await fetch(`/api/v1/match-runs/${data.data.runId}`);
        const detailData = await detailRes.json();
        if (detailData.data) {
          setRunDetail(detailData.data);
        }
      } else {
        setErrorMsg(data.error?.message || 'Chạy Matching Engine thất bại');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối khi chạy thuật toán');
    } finally {
      setRunning(false);
    }
  };

  const handleViewAlternatives = async (player: any) => {
    setAltModalPlayer(player);
    setLoadingAlts(true);
    try {
      const res = await fetch(
        `/api/v1/match-runs/${runDetail.id}/alternatives?playerId=${player.playerId}&requirementId=${selectedReqId}`
      );
      const data = await res.json();
      if (data.data) {
        setAlternatives(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAlts(false);
    }
  };

  const handleAddToShortlist = async (playerId: number) => {
    try {
      const res = await fetch('/api/v1/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          requirementId: parseInt(selectedReqId, 10),
          note: 'Thêm từ phiên chấm điểm Matching Studio',
        }),
      });
      const data = await res.json();
      if (data.data) {
        alert('Đã thêm thành công vào danh sách Shortlist!');
      } else {
        alert(`Thông báo: ${data.error?.message || 'Đã có trong danh sách'}`);
      }
    } catch {
      alert('Lỗi kết nối');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Matching Engine Studio — V2 Unified (UC06)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hệ thống điều phối thuật toán chấm điểm và xếp hạng ứng viên dựa trên 3 trụ cột F (Tài chính), S (Đội hình), R (Rủi ro).
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1 max-w-md w-full">
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Chọn nhu cầu tuyển trạch của CLB
          </label>
          <select
            value={selectedReqId}
            onChange={(e) => setSelectedReqId(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          >
            {requirements.length === 0 && <option value="">(Chưa có nhu cầu nào - Hãy tạo mới)</option>}
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — Vị trí: {r.position} (B: €{(r.budget / 1e6).toFixed(1)}M, Lương: €{(r.salaryLimit / 1e6).toFixed(1)}M)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunMatch}
            disabled={running || !selectedReqId}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold text-white transition shadow-md ${
              running || !selectedReqId
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {running ? 'Đang chấm điểm & xếp hạng...' : '⚡ Khởi chạy Matching Engine'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Run Summary Banner */}
      {runDetail && (
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-lg border border-slate-800 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs text-slate-400">Phiên chạy:</span>{' '}
              <span className="font-mono text-emerald-400 font-bold">{runDetail.runCode}</span>
            </div>
            <div className="text-xs text-slate-400">
              Thời điểm dữ liệu:{' '}
              <span className="text-slate-200 font-medium">{runDetail.dataAsOf}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <span className="text-xs text-slate-400 block">Tổng ứng viên sơ bộ</span>
              <span className="text-xl font-bold">{runDetail.summary.candidates_count || 0}</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <span className="text-xs text-emerald-400 block">Vượt qua lọc cứng</span>
              <span className="text-xl font-bold text-emerald-400">
                {runDetail.summary.passed_count || 0}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <span className="text-xs text-amber-400 block">Bị loại bởi bộ lọc</span>
              <span className="text-xl font-bold text-amber-400">
                {runDetail.summary.excluded_count || 0}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <span className="text-xs text-sky-400 block">Điểm Matching TB</span>
              <span className="text-xl font-bold text-sky-400">
                {runDetail.summary.avg_matching ? `${runDetail.summary.avg_matching}/100` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {runDetail && (
        <div className="space-y-4">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('passed')}
              className={`py-3 px-6 text-sm font-bold border-b-2 transition ${
                activeTab === 'passed'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Danh sách Đạt chuẩn & Xếp hạng ({runDetail.results.length})
            </button>
            <button
              onClick={() => setActiveTab('excluded')}
              className={`py-3 px-6 text-sm font-bold border-b-2 transition ${
                activeTab === 'excluded'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Hồ sơ Bị loại cứng ({runDetail.exclusions ? runDetail.exclusions.length : 0})
            </button>
          </div>

          {/* TAB 1: Ranked Candidates */}
          {activeTab === 'passed' && (
            <div className="space-y-4">
              {runDetail.results.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                  Không có ứng viên nào vượt qua toàn bộ điều kiện lọc cứng của nhu cầu này.
                </div>
              ) : (
                runDetail.results.map((res: any) => {
                  const matchingScore = res.matching !== null ? res.matching.toFixed(1) : '—';
                  const recomBadge =
                    res.recommendation === 'high'
                      ? { label: 'Khuyến nghị cao', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                      : res.recommendation === 'consider'
                      ? { label: 'Cần cân nhắc', color: 'bg-amber-100 text-amber-800 border-amber-300' }
                      : { label: 'Rủi ro cao', color: 'bg-rose-100 text-rose-800 border-rose-300' };

                  return (
                    <div
                      key={res.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-slate-300 transition"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-sm shadow">
                            #{res.rank}
                          </span>
                          <div>
                            <Link
                              href={`/players/${res.playerId}`}
                              className="text-lg font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                            >
                              {res.playerName}
                            </Link>
                            <div className="text-xs text-slate-500">
                              {res.position} • {res.age} tuổi • {res.clubName || 'Tự do'} ({res.league || '—'})
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Matching Score</span>
                            <span className="text-2xl font-black text-slate-900 font-mono">
                              {matchingScore}
                            </span>
                          </div>
                          <span
                            className={`text-xs font-bold px-3 py-1 rounded-full border ${recomBadge.color}`}
                          >
                            {recomBadge.label}
                          </span>
                        </div>
                      </div>

                      {/* 3 Pillars Score Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-slate-700">Tài chính (F)</span>
                            <span className="font-mono font-bold text-slate-900">
                              {res.fScore !== null ? res.fScore.toFixed(1) : '—'}/100
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Phí ước tính: €{res.breakdown.fee_est ? (res.breakdown.fee_est / 1e6).toFixed(1) : 0}M
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-slate-700">
                              Chiến thuật (S) — {res.requestedRoleName || 'Vai trò'}
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {res.sScore !== null ? res.sScore.toFixed(1) : '—'}/100
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Tương thích theo ma trận chuẩn V2
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-slate-700">Rủi ro & Tương lai (R)</span>
                            <span className="font-mono font-bold text-slate-900">
                              {res.rScore !== null ? res.rScore.toFixed(1) : '—'}/100
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            R_inj: {res.breakdown.r_inj ? res.breakdown.r_inj.toFixed(1) : '—'} • R_resale: {res.breakdown.r_resale ? res.breakdown.r_resale.toFixed(1) : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Explainable AI: Pros, Cons, and Explanation */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {res.explanation && (
                          <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 italic">
                            &ldquo;{res.explanation}&rdquo;
                          </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {res.pros && res.pros.length > 0 && (
                            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded space-y-1">
                              <span className="font-bold text-emerald-800 block">Điểm mạnh (Pros):</span>
                              <ul className="list-disc list-inside text-emerald-900 space-y-0.5">
                                {res.pros.map((p: string, i: number) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {res.cons && res.cons.length > 0 && (
                            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded space-y-1">
                              <span className="font-bold text-amber-800 block">Lưu ý / Rủi ro (Cons):</span>
                              <ul className="list-disc list-inside text-amber-900 space-y-0.5">
                                {res.cons.map((c: string, i: number) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => handleViewAlternatives(res)}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded transition"
                        >
                          🔍 Tìm phương án thay thế
                        </button>
                        <button
                          onClick={() => handleAddToShortlist(res.playerId)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded transition"
                        >
                          + Thêm vào Shortlist
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: Exclusions */}
          {activeTab === 'excluded' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3">Cầu thủ</th>
                    <th className="px-3 py-3">Vị trí</th>
                    <th className="px-4 py-3">Lý do bị loại cứng (Hard Filter Exclusion)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {runDetail.exclusions.map((ex: any) => (
                    <tr key={ex.playerId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{ex.playerName}</td>
                      <td className="px-3 py-3 font-mono text-xs">{ex.position}</td>
                      <td className="px-4 py-3 space-y-1">
                        {ex.reasons.map((r: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-block bg-rose-50 text-rose-800 border border-rose-200 text-xs px-2 py-0.5 rounded mr-2"
                          >
                            [{r.code}] {r.message}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Alternatives Modal */}
      {altModalPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Phương án thay thế cho {altModalPlayer.playerName}
                </h2>
                <p className="text-xs text-slate-500">
                  Các cầu thủ cùng vị trí chính, có điểm F cao hơn hoặc chi phí hợp lý hơn (0.6 × Tương đồng + 0.4 × Matching)
                </p>
              </div>
              <button
                onClick={() => setAltModalPlayer(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {loadingAlts ? (
              <div className="p-8 text-center text-slate-500">Đang tìm các phương án tương đồng...</div>
            ) : alternatives.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Không tìm thấy phương án thay thế nào vượt trội hơn về tài chính.
              </div>
            ) : (
              <div className="space-y-3">
                {alternatives.map((alt: any) => (
                  <div
                    key={alt.playerId}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center gap-4 text-xs"
                  >
                    <div>
                      <Link
                        href={`/players/${alt.playerId}`}
                        className="text-sm font-bold text-emerald-800 hover:underline"
                      >
                        {alt.playerName}
                      </Link>
                      <div className="text-slate-500 mt-0.5">
                        {alt.position} • {alt.age} tuổi • {alt.clubName || 'Tự do'}
                      </div>
                      <div className="mt-1">
                        Phí ước tính: <span className="font-semibold text-slate-800">€{(alt.feeEst / 1e6).toFixed(1)}M</span> • F: {alt.fScore.toFixed(1)} • S: {alt.sScore.toFixed(1)}
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="text-xs font-bold text-emerald-600">
                        Độ tương đồng: {alt.similarityScore}%
                      </div>
                      <button
                        onClick={() => handleAddToShortlist(alt.playerId)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-2.5 py-1 rounded transition"
                      >
                        + Shortlist
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
