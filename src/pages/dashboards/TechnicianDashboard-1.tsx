import { useState, useEffect } from 'react';
import { MapPin, Navigation, Phone, Calendar, Clock, CheckCircle, Package, Camera, FileText, ChevronRight, Home, ClipboardList, History, Settings, X, Send, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';

type JobStatus = 'pending' | 'in_progress' | 'completed';
type MobileTab = 'home' | 'tasks' | 'history' | 'settings';

interface Job {
  id: string;
  time: string;
  customer: string;
  address: string;
  type: string;
  status: JobStatus;
  contact: string;
  phone: string;
  notes: string;
  lat?: number;
  lng?: number;
}

const todaysJobs: Job[] = [
  {
    id: 'JOB-1041',
    time: '9:00',
    customer: 'مستشفى المدينة',
    address: 'شارع الملك فهد، الرياض',
    type: 'صيانة دورية',
    status: 'in_progress',
    contact: 'م. أحمد',
    phone: '0551234567',
    notes: 'فحص فلاتر التكييف - الأدوار 3 إلى 5',
    lat: 24.7136,
    lng: 46.6753,
  },
  {
    id: 'JOB-1043',
    time: '13:30',
    customer: 'مجمع الواحة التجاري',
    address: 'طريق الملك عبدالله، جدة',
    type: 'تغيير فلاتر',
    status: 'pending',
    contact: 'أ. سارة',
    phone: '0559876543',
    notes: 'استبدال فلاتر MERV-13 في جميع الوحدات',
    lat: 21.5433,
    lng: 39.1728,
  },
  {
    id: 'JOB-1045',
    time: '16:00',
    customer: 'برج المكاتب الحديثة',
    address: 'طريق الملك فيصل، الخبر',
    type: 'فحص',
    status: 'pending',
    contact: 'مدير المبنى',
    phone: '0556667777',
    notes: 'فحص ربع سنوي، توثيق حالة جميع الفلاتر',
    lat: 26.2172,
    lng: 50.1971,
  },
];

const historyJobs = [
  { id: 'JOB-1038', date: '20 مايو 2026', customer: 'فندق القصر', service: 'تغيير فلاتر', status: 'completed' as JobStatus },
  { id: 'JOB-1035', date: '17 مايو 2026', customer: 'مصنع الخليج', service: 'إصلاح طارئ', status: 'completed' as JobStatus },
  { id: 'JOB-1030', date: '14 مايو 2026', customer: 'مجمع الواحة', service: 'صيانة دورية', status: 'completed' as JobStatus },
  { id: 'JOB-1025', date: '10 مايو 2026', customer: 'مستشفى المدينة', service: 'فحص', status: 'completed' as JobStatus },
];

const inventoryParts = [
  { id: '1', name: 'فلتر MERV-13' },
  { id: '2', name: 'فلتر HEPA H14' },
  { id: '3', name: 'فلتر كربون نشط' },
  { id: '4', name: 'حشوة مطاطية' },
  { id: '5', name: 'مروحة تهوية' },
];

export default function TechnicianDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [jobs, setJobs] = useState<Job[]>(todaysJobs);
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [checklist, setChecklist] = useState([
    { id: 1, title: 'استبدال الفلتر', done: false },
    { id: 2, title: 'فحص الضغط', done: false },
    { id: 3, title: 'تنظيف الوحدة', done: false },
    { id: 4, title: 'اختبار التشغيل', done: false },
  ]);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [jobNotes, setJobNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateJobStatus = (jobId: string, newStatus: JobStatus) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
  };

  const handleSubmitJob = () => {
    if (selectedJob) {
      updateJobStatus(selectedJob.id, 'completed');
      setSelectedJob(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setChecklist(prev => prev.map(c => ({ ...c, done: false })));
      setSelectedParts([]);
      setJobNotes('');
    }
  };

  const completedToday = jobs.filter(j => j.status === 'completed').length;
  const totalJobs = jobs.length;

  const statusButton = (job: Job) => {
    const configs: Record<JobStatus, { label: string; next: JobStatus | null; bg: string; hover: string }> = {
      pending: { label: t('technician.startWork'), next: 'in_progress', bg: 'bg-slate-700', hover: 'hover:bg-slate-800' },
      in_progress: { label: t('technician.inExecution'), next: 'completed', bg: 'bg-amber-500', hover: 'hover:bg-amber-600' },
      completed: { label: t('technician.done'), next: null, bg: 'bg-green-600', hover: '' },
    };
    const cfg = configs[job.status];
    return (
      <button
        onClick={() => cfg.next && updateJobStatus(job.id, cfg.next)}
        disabled={!cfg.next}
        className={`${cfg.bg} ${cfg.hover} text-white px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-70 flex items-center gap-2`}
      >
        {job.status === 'completed' && <CheckCircle className="w-4 h-4" />}
        {job.status === 'in_progress' && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
        {cfg.label}
      </button>
    );
  };

  const renderMyDay = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('technician.myDayView')}
          </h1>
          <p className="text-slate-500 mt-1">
            {t('technician.hey')}، {profile?.full_name?.split(' ')[0] ?? ''} — {t('technician.jobsScheduled', { count: totalJobs })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm font-medium border border-green-100">
          <Navigation className="w-4 h-4" />
          {t('technician.onDuty')}
        </div>
      </div>

      {/* Daily Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-green-600">{completedToday}</p>
          <p className="text-xs text-slate-500 mt-1">{t('technician.completedTasks')}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-blue-600">{selectedParts.length}</p>
          <p className="text-xs text-slate-500 mt-1">{t('technician.partsUsedCount')}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-slate-700">{totalJobs}</p>
          <p className="text-xs text-slate-500 mt-1">{t('technician.totalVisits')}</p>
        </div>
      </div>

      {/* Today's date */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Calendar className="w-4 h-4" />
        {new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      {/* Job Cards */}
      <div className="space-y-4">
        {jobs.map(job => {
          const isActive = job.status === 'in_progress';
          return (
            <div
              key={job.id}
              className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${isActive ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-100 hover:shadow-md'}`}
            >
              {isActive && (
                <div className="bg-green-600 px-5 py-1.5 flex items-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-xs font-semibold">{t('technician.currentlyActive')}</span>
                </div>
              )}
              <div className="p-5">
                {/* Top row: time + customer + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-600">
                        <Clock className="w-3.5 h-3.5" />
                        {job.time}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{job.id}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">{job.customer}</h3>
                  </div>
                  {statusButton(job)}
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{job.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                    <FileText className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {job.type}
                  </div>
                </div>

                {/* Notes */}
                {job.notes && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 mb-3">
                    {job.notes}
                  </p>
                )}

                {/* Action row */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${job.phone}`}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-green-600 transition bg-slate-50 hover:bg-green-50 px-3 py-1.5 rounded-lg"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {job.contact}
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      {t('technician.openMap')}
                    </a>
                  </div>
                  {job.status !== 'completed' && (
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700 transition"
                    >
                      {t('technician.viewDetails')}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">{t('technician.myHistory')}</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.date')}</th>
                <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.customer')}</th>
                <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.service')}</th>
                <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.statusCol')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {historyJobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3 text-slate-600">{job.date}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{job.customer}</td>
                  <td className="px-5 py-3 text-slate-600">{job.service}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      {t('status.completed')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Summary card */}
      <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
        <h3 className="font-semibold text-green-900 mb-4">{t('technician.dailySummary')}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-700">{completedToday}</p>
            <p className="text-xs text-green-600 mt-1">{t('technician.completedTasks')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-700">{selectedParts.length}</p>
            <p className="text-xs text-green-600 mt-1">{t('technician.partsUsedCount')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-700">{totalJobs}</p>
            <p className="text-xs text-green-600 mt-1">{t('technician.totalVisits')}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderJobDetail = () => {
    if (!selectedJob) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="font-bold text-slate-900">{t('technician.jobDetail')}</h2>
              <p className="text-sm text-slate-500">{selectedJob.customer} — {selectedJob.id}</p>
            </div>
            <button onClick={() => setSelectedJob(null)} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="p-5 space-y-6">
            {/* Checklist */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-green-600" />
                {t('technician.checklist')}
              </h3>
              <div className="space-y-2">
                {checklist.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${item.done ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100 hover:border-green-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                      className="w-5 h-5 rounded-md border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className={`text-sm font-medium ${item.done ? 'text-green-700 line-through' : 'text-slate-700'}`}>
                      {item.title}
                    </span>
                    {item.done && <CheckCircle className="w-4 h-4 text-green-500 ms-auto" />}
                  </label>
                ))}
              </div>
            </div>

            {/* Parts Used */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                {t('technician.partsUsed')}
              </h3>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !selectedParts.includes(e.target.value)) {
                    setSelectedParts(prev => [...prev, e.target.value]);
                  }
                }}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              >
                <option value="">{t('technician.selectPart')}</option>
                {inventoryParts.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
              {selectedParts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedParts.map((part, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-100">
                      {part}
                      <button onClick={() => setSelectedParts(prev => prev.filter((_, i) => i !== idx))} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                {t('technician.notesField')}
              </h3>
              <textarea
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
                placeholder={t('technician.notesPlaceholder')}
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
            </div>

            {/* Photos */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-600" />
                {t('technician.uploadPhotos')}
              </h3>
              <button className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-green-300 hover:bg-green-50/50 transition">
                <Camera className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-500 font-medium">{t('technician.addPhotos')}</span>
              </button>
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmitJob}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Send className="w-4 h-4" />
              {t('technician.submitComplete')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-8">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500 text-white px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          {t('offline.banner')}
        </div>
      )}
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'home' || activeTab === 'tasks' ? renderMyDay() : null}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'settings' && (
          <div className="text-center py-12">
            <Settings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('nav.settings')}</p>
          </div>
        )}
      </div>

      {/* Job Detail Modal */}
      {selectedJob && renderJobDetail()}

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-20 inset-x-0 flex justify-center z-50 animate-in slide-in-from-top">
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold">
            <CheckCircle className="w-5 h-5" />
            {t('technician.jobCompleteSuccess')} ✓
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 sm:hidden z-40">
        <div className="flex items-center justify-around py-2">
          {[
            { id: 'home' as MobileTab, icon: Home, label: t('technician.mobileNav.home') },
            { id: 'tasks' as MobileTab, icon: ClipboardList, label: t('technician.mobileNav.myTasks') },
            { id: 'history' as MobileTab, icon: History, label: t('technician.mobileNav.myHistory') },
            { id: 'settings' as MobileTab, icon: Settings, label: t('technician.mobileNav.settings') },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition ${isActive ? 'text-green-600' : 'text-slate-400'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
