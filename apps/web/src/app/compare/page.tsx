'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type PlayerOption = {
  id: number;
  name: string;
  subtitle?: string | null;
};

type ComparedPlayer = {
  id: number;
  name: string;
  position: string;
  club_name?: string | null;
  age?: number | null;
  market_value?: number | null;
  salary_per_year?: number | null;
  contract_end_date?: string | null;
  months_remaining?: number | null;
  season_minutes?: number | null;
};

export default function ComparePage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-500">Đang tải trang so sánh...</div>}><CompareContent /></Suspense>;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const initialIds = searchParams.get('playerIds') || '';
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlayerOption[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [selected, setSelected] = useState<PlayerOption[]>([]);
  const [data, setData] = useState<ComparedPlayer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSuggestionLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      try {
        const params = new URLSearchParams({ q: term, limit: '10' });
        const res = await fetch(`/api/v1/search/suggest?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setSuggestions(json.data
            .filter((item: any) => item.type === 'player')
            .map((item: any) => ({ id: item.id, name: item.name, subtitle: item.subtitle })));
        } else {
          setSuggestions([]);
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const fetchComparison = async (players: PlayerOption[], hydrateSelection = false) => {
    const ids = players.map((player) => player.id);
    if (ids.length < 2 || ids.length > 5) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({ playerIds: ids.join(',') });
      const res = await fetch(`/api/v1/compare?${params}`);
      const json = await res.json();
      if (!res.ok || !json.data?.players) {
        setData(null);
        setErrorMsg(res.status === 401
          ? 'Vui lòng đăng nhập để sử dụng chức năng so sánh.'
          : json.error?.message || 'Không thể so sánh các cầu thủ đã chọn.');
        return;
      }

      const compared = json.data.players as ComparedPlayer[];
      setData(compared);
      if (hydrateSelection) {
        setSelected(compared.map((player) => ({
          id: player.id,
          name: player.name,
          subtitle: `${player.position} · ${player.club_name || 'Tự do'}`,
        })));
      }
    } catch {
      setData(null);
      setErrorMsg('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialIds) return;
    const ids = Array.from(new Set(initialIds.split(',').map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 5);
    if (ids.length < 2) return;
    void fetchComparison(ids.map((id) => ({ id, name: `Cầu thủ #${id}` })), true);
    // Only hydrate a legacy/shared URL once on initial page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIds]);

  const addPlayer = (player: PlayerOption) => {
    if (selected.some((item) => item.id === player.id) || selected.length >= 5) return;
    setSelected((current) => [...current, player]);
    setData(null);
    setErrorMsg(null);
    setQuery('');
    setSuggestions([]);
  };

  const removePlayer = (id: number) => {
    setSelected((current) => current.filter((player) => player.id !== id));
    setData(null);
    setErrorMsg(null);
  };

  const handleCompareSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void fetchComparison(selected);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-700">CÔNG CỤ PHÂN TÍCH</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">So sánh cầu thủ</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tìm theo tên, chọn từ 2 đến 5 cầu thủ rồi đối chiếu thông tin trong cùng một bảng.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">1</span>
          <div>
            <h2 className="font-semibold text-slate-900">Chọn cầu thủ cần so sánh</h2>
            <p className="text-xs text-slate-500">Nhập tên cầu thủ, không cần biết ID.</p>
          </div>
        </div>

        <form onSubmit={handleCompareSubmit} className="space-y-4">
          <div className="relative">
            <label htmlFor="player-search" className="mb-1.5 block text-sm font-medium text-slate-700">Tìm cầu thủ</label>
            <div className="flex gap-2">
              <input
                id="player-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ví dụ: Haaland, Mbappé..."
                autoComplete="off"
                aria-controls="player-suggestions"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
              <button
                type="submit"
                disabled={selected.length < 2 || loading}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? 'Đang so sánh…' : 'So sánh'}
              </button>
            </div>

            {(suggestionLoading || suggestions.length > 0 || query.trim().length >= 2) && (
              <div id="player-suggestions" role="listbox" className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {suggestionLoading ? (
                  <p className="px-3 py-3 text-sm text-slate-500">Đang tìm cầu thủ…</p>
                ) : suggestions.length > 0 ? suggestions.map((player) => {
                  const alreadySelected = selected.some((item) => item.id === player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      role="option"
                      aria-selected={alreadySelected}
                      disabled={alreadySelected || selected.length >= 5}
                      onClick={() => addPlayer(player)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{player.name}</span>
                        <span className="block text-xs text-slate-500">{player.subtitle || 'Chưa có thông tin CLB'}</span>
                      </span>
                      <span className="text-xs font-semibold text-emerald-700">{alreadySelected ? 'Đã chọn' : '+ Thêm'}</span>
                    </button>
                  );
                }) : query.trim().length >= 2 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">Không tìm thấy cầu thủ phù hợp.</p>
                ) : null}
              </div>
            )}
            {query.trim().length === 1 && <p className="mt-2 text-xs text-slate-500">Nhập thêm ít nhất một ký tự để tìm kiếm.</p>}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Đã chọn</h3>
              <span className="text-xs text-slate-500">{selected.length}/5 cầu thủ</span>
            </div>
            {selected.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có cầu thủ nào. Hãy tìm và chọn ít nhất 2 người.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {selected.map((player) => (
                  <li key={player.id} className="flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-white py-1.5 pl-3 pr-1.5 shadow-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">{player.name}</span>
                      {player.subtitle && <span className="block truncate text-[11px] text-slate-500">{player.subtitle}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePlayer(player.id)}
                      aria-label={`Bỏ ${player.name} khỏi danh sách so sánh`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">Có thể chọn từ 2 đến 5 cầu thủ. Chọn cùng vị trí để so sánh dễ hơn.</p>
          </div>
        </form>
      </section>

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {errorMsg}{errorMsg.includes('đăng nhập') && <> <Link href="/login" className="font-semibold underline">Đăng nhập</Link></>}
        </div>
      )}

      {data && data.length >= 2 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Kết quả đối chiếu</p>
            <p className="mt-0.5 text-xs text-slate-500">Thông tin tài chính chỉ hiển thị cho người dùng đã đăng nhập.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="min-w-[190px] px-4 py-3">Tiêu chí</th>
                  {data.map((player) => (
                    <th key={player.id} className="min-w-[190px] px-4 py-3">
                      <Link href={`/players/${player.id}`} className="text-sm font-bold normal-case tracking-normal text-emerald-800 hover:underline">{player.name}</Link>
                      <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-slate-500">{player.position} · {player.club_name || 'Tự do'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <CompareRow players={data} label="Độ tuổi">{(player) => player.age != null ? `${player.age} tuổi` : '—'}</CompareRow>
                <CompareRow players={data} label="Định giá thị trường">{(player) => player.market_value != null ? `€${(player.market_value / 1e6).toFixed(1)}M` : '—'}</CompareRow>
                <CompareRow players={data} label="Mức lương hiện tại">{(player) => player.salary_per_year != null ? `€${(player.salary_per_year / 1e6).toFixed(2)}M/năm` : '—'}</CompareRow>
                <CompareRow players={data} label="Hạn hợp đồng">{(player) => player.contract_end_date || 'Chưa có thông tin'}</CompareRow>
                <CompareRow players={data} label="Thời lượng thi đấu gần nhất">{(player) => player.season_minutes != null ? `${player.season_minutes.toLocaleString()} phút` : '—'}</CompareRow>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        !loading && !errorMsg && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-700">⇄</div>
            <h2 className="font-semibold text-slate-900">Sẵn sàng so sánh?</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Tìm tên cầu thủ phía trên, thêm ít nhất hai người vào danh sách rồi nhấn “So sánh”.</p>
          </div>
        )
      )}
    </div>
  );
}

function CompareRow({ label, players, children }: { label: string; players: ComparedPlayer[]; children: (player: ComparedPlayer) => string }) {
  return <tr><td className="px-4 py-3 font-medium text-slate-600">{label}</td>{players.map((player) => <td key={player.id} className="px-4 py-3 font-medium text-slate-800">{children(player)}</td>)}</tr>;
}
