import { useState, useEffect, useCallback } from 'react';
import { FileBarChart, Download, Calendar, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { downloadCsv } from '../lib/format';

interface TechnicianRow {
  name: string;
  jobs: number;
  tasksDone: number;
  partsUsed: number;
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [techData, setTechData] = useState<TechnicianRow[]>([]);
  const [monthlyCounts, setMonthlyCounts] = useState<number[]>(new Array(12).fill(0));
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    let q = supabase
      .from('appointments')
      .select('id, scheduled_at, technician:profiles!appointments_technician_id_fkey(id, full_name), job_tasks(id, completed), job_parts(quantity_used)')
      .eq('status', 'completed');

    if (fromDate) q = q.gte('scheduled_at', fromDate);
    if (toDate) q = q.lte('scheduled_at', toDate + 'T23:59:59');

    const { data } = await q;

    if (!data) {
      setLoading(false);
      return;
    }

    const techMap = new Map<string, TechnicianRow>();
    const counts = new Array(12).fill(0);

    type RawAppt = {
      id: string; scheduled_at: string;
      technician: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      job_tasks: { completed: boolean }[];
      job_parts: { quantity_used: number }[];
    };
    for (const appt of data as RawAppt[]) {
      counts[new Date(appt.scheduled_at).getMonth()]++;

      const techRaw = appt.technician;
      const tech = Array.isArray(techRaw) ? techRaw[0] : techRaw;
      if (!tech?.id) continue;

      if (!techMap.has(tech.id)) {
        techMap.set(tech.id, { name: tech.full_name, jobs: 0, tasksDone: 0, partsUsed: 0 });
      }
      const row = techMap.get(tech.id)!;
      row.jobs += 1;
      row.tasksDone += (appt.job_tasks as { completed: boolean }[]).filter(t => t.completed).length;
      row.partsUsed += (appt.job_parts as { quantity_used: number }[]).reduce((s, p) => s + (p.quantity_used ?? 0), 0);
    }

    setTechData([...techMap.values()].sort((a, b) => b.jobs - a.jobs));
    setMonthlyCounts(counts);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
  const chartData = monthKeys.map((key, i) => ({
    name: t(`months.${key}`),
    tasks: monthlyCounts[i],
  }));

  function exportCsv() {
    downloadCsv(
      'servisgo-report.csv',
      [t('reports.techName'), t('reports.completedJobs'), t('reports.tasksDone'), t('reports.partsUsed')],
      techData.map(row => [row.name, row.jobs, row.tasksDone, row.partsUsed]),
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <FileBarChart className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{t('reports.title')}</h1>
          </div>
          <button
            onClick={exportCsv}
            disabled={loading || techData.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            {t('reports.exportCsv')}
          </button>
        </div>

        {/* Date filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <label className="text-sm font-medium text-slate-700">{t('reports.fromDate')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">{t('reports.toDate')}</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 underline transition"
              >
                {t('common.filter')} ✕
              </button>
            )}
          </div>
        </div>

        {/* Monthly chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{t('reports.completedTasks')}</h2>
            {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value) => [`${value}`, t('reports.completedJobs')]}
              />
              <Bar dataKey="tasks" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Technician table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t('reports.title')}</h2>
            {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : techData.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">{t('common.noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-start px-6 py-3 font-semibold text-slate-600">{t('reports.techName')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('reports.completedJobs')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('reports.tasksDone')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('reports.partsUsed')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {techData.map(tech => (
                    <tr key={tech.name} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-xs font-bold">
                            {tech.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="font-medium text-slate-900">{tech.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
                          {tech.jobs}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">
                          {tech.tasksDone}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{tech.partsUsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
