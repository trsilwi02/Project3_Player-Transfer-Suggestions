'use client';

import { useState, useEffect } from 'react';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'config'>('audit');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [auditRes, cfgRes] = await Promise.all([
          fetch('/api/v1/admin/audit-logs'),
          fetch('/api/v1/admin/scoring-configs'),
        ]);

        const auditData = await auditRes.json();
        const cfgData = await cfgRes.json();

        if (auditData.data) setAuditLogs(auditData.data);
        if (cfgData.data) setConfigs(cfgData.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Khu Vực Quản Trị Hệ Thống (UC11, UC12)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Theo dõi nhật ký kiểm toán bất biến (Audit Log - BR05) và quản trị phiên bản tham số chấm điểm Matching Engine.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('audit')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition ${
            activeTab === 'audit'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Nhật ký Kiểm toán — Audit Log ({auditLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition ${
            activeTab === 'config'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Cấu hình Chấm điểm Scoring Configs ({configs.length})
        </button>
      </div>

      {/* Tab 1: Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex justify-between items-center">
            <span className="font-semibold">
              Bảng kiểm toán chỉ thêm (Append-only) — Cấm sửa và cấm xóa (BR05)
            </span>
            <span className="text-[11px] text-emerald-700 font-mono font-bold">
              ✓ Trigger tự động kích hoạt
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">Đang tải nhật ký kiểm toán...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">Chưa có nhật ký phát sinh.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Thời điểm</th>
                    <th className="px-3 py-3">Thực thể</th>
                    <th className="px-3 py-3">Entity ID</th>
                    <th className="px-3 py-3">Hành động</th>
                    <th className="px-4 py-3">Người thực hiện</th>
                    <th className="px-4 py-3">IP Client</th>
                    <th className="px-4 py-3">Chi tiết thay đổi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-mono">{log.created_at}</td>
                      <td className="px-3 py-3 font-semibold text-slate-800">{log.entity_type}</td>
                      <td className="px-3 py-3 font-mono text-slate-600">{log.entity_id}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                            log.action === 'create'
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.action === 'delete'
                              ? 'bg-rose-100 text-rose-800'
                              : log.action === 'verify'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {log.actor_name || (log.actor_id ? `User #${log.actor_id}` : 'Hệ thống (Cron/Seed)')}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{log.ip_address || '—'}</td>
                      <td className="px-4 py-3 max-w-xs truncate text-[11px] text-slate-600 font-mono">
                        {log.new_value ? JSON.stringify(log.new_value) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Scoring Configs */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map((cfg) => {
              const isActive = cfg.status === 'active';
              return (
                <div
                  key={cfg.id}
                  className={`p-5 rounded-xl border shadow-sm space-y-3 bg-white ${
                    isActive ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{cfg.version}</h3>
                      <span className="text-xs text-slate-500">{cfg.notes || 'Không có ghi chú'}</span>
                    </div>
                    {isActive ? (
                      <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-1 rounded-full border border-emerald-300">
                        ● Đang áp dụng (Active)
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full">
                        {cfg.status}
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                    <div className="text-slate-500">Tham số cấu hình (params):</div>
                    <pre className="text-slate-800 overflow-x-auto">
                      {JSON.stringify(cfg.params, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
