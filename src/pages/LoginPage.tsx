import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Zap, Globe, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toggleLanguage } from '../lib/language';
import { supabase, UserRole } from '../lib/supabase';
import Logo from '../components/Logo';

async function seedCustomerDemoData(userId: string) {
  const { data: custRecord } = await supabase
    .from('customers')
    .insert({ user_id: userId, name: 'خالد الزيود', phone: '0778068705', address: 'الهاشمي الشمالي، شارع البطحاء، عمان' })
    .select('id')
    .single();

  if (!custRecord) return;
  const cid = custRecord.id;
  const now = new Date();

  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 3);
  futureDate.setHours(10, 0, 0, 0);

  const pastJobs = [
    { days: 42,  service: 'صيانة دورية وقياس TDS' },
    { days: 125, service: 'استبدال فلاتر' },
    { days: 231, service: 'فحص جهاز التحلية' },
    { days: 328, service: 'تركيب جهاز تحلية جديد' },
  ];

  await supabase.from('appointments').insert([
    {
      customer_id: cid,
      service_type: 'صيانة دورية وقياس TDS',
      scheduled_at: futureDate.toISOString(),
      status: 'pending',
      confirmed: false,
      address: 'وادي السير، عمّان',
      notes: '',
    },
    ...pastJobs.map(({ days, service }) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      d.setHours(10, 0, 0, 0);
      return {
        customer_id: cid,
        service_type: service,
        scheduled_at: d.toISOString(),
        status: 'completed',
        confirmed: true,
        address: 'وادي السير، عمّان',
        notes: '',
      };
    }),
  ]);

  await supabase.from('filter_status').insert([
    { customer_id: cid, location: 'المطبخ — مرحلة 1', filter_type: 'فلتر ترسيب 5 ميكرون', last_replaced: '2026-03-23', next_due: '2026-06-23', health_percent: 67 },
    { customer_id: cid, location: 'المطبخ — مرحلة 2', filter_type: 'فلتر كربون نشط',       last_replaced: '2026-04-23', next_due: '2026-07-23', health_percent: 85 },
    { customer_id: cid, location: 'المطبخ — مرحلة 3', filter_type: 'غشاء تحلية RO 75 GPD', last_replaced: '2026-01-22', next_due: '2026-06-01', health_percent: 35 },
    { customer_id: cid, location: 'المطبخ — مرحلة 4', filter_type: 'فلتر ما بعد الكربون',  last_replaced: '2026-05-07', next_due: '2026-08-07', health_percent: 92 },
  ]);

  await supabase.from('notifications').insert([
    { user_id: userId, type: 'reminder', message: 'تذكير: موعد صيانة جهاز التحلية بعد 3 أيام الساعة 10:00 ص', is_read: false },
    { user_id: userId, type: 'offer',    message: 'عرض خاص: خصم 15% على استبدال غشاء RO لهذا الشهر',         is_read: false },
    { user_id: userId, type: 'alert',    message: 'تنبيه: قياس TDS ارتفع — يُنصح بفحص غشاء التحلية',          is_read: true },
    { user_id: userId, type: 'reminder', message: 'تم جدولة موعد صيانة جهاز التحلية بنجاح',                   is_read: true },
  ]);
}

const ROLE_ROUTES: Record<UserRole, string> = {
  owner: '/dashboard/owner',
  technician: '/dashboard/technician',
  admin: '/dashboard/admin',
  customer: '/dashboard/customer',
  manager: '/dashboard/manager',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<UserRole | null>(null);
  const isAr = i18n.language === 'ar';

  const demoAccounts: { role: UserRole; email: string; color: string; descKey: string; labelKey: string }[] = [
    { role: 'owner', email: 'owner@demo.com', color: 'bg-blue-600 hover:bg-blue-700', descKey: 'login.ownerDesc', labelKey: 'login.ownerLabel' },
    { role: 'technician', email: 'tech@demo.com', color: 'bg-green-600 hover:bg-green-700', descKey: 'login.techDesc', labelKey: 'login.techLabel' },
    { role: 'admin', email: 'admin@demo.com', color: 'bg-orange-600 hover:bg-orange-700', descKey: 'login.adminDesc', labelKey: 'login.adminLabel' },
    { role: 'manager', email: 'manager@demo.com', color: 'bg-purple-600 hover:bg-purple-700', descKey: 'login.managerDesc', labelKey: 'login.managerLabel' },
    { role: 'customer', email: 'customer@demo.com', color: 'bg-violet-600 hover:bg-violet-700', descKey: 'login.customerDesc', labelKey: 'login.customerLabel' },
  ];

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
      const role = (profile?.role ?? 'customer') as UserRole;
      navigate(ROLE_ROUTES[role]);
    }
    setLoading(false);
  }

  async function handleDemoLogin(role: UserRole) {
    const account = demoAccounts.find(a => a.role === role)!;
    setDemoLoading(role);
    setError('');

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: 'demo1234',
    });

    if (signInError) {
      const names: Record<UserRole, string> = {
        owner: 'محمد الخصاونة',
        technician: 'أحمد الحمداني',
        admin: 'رنا العمري',
        customer: 'خالد الزيود',
        manager: 'ليلى النابلسي',
      };
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: account.email,
        password: 'demo1234',
        options: { data: { full_name: names[role], role } },
      });

      if (signUpError) {
        setError(signUpError.message);
        setDemoLoading(null);
        return;
      }

      if (signUpData.user) {
        const userId = signUpData.user.id;
        await supabase.from('profiles').upsert({
          id: userId,
          full_name: names[role],
          role,
        });

        if (role === 'customer') {
          await seedCustomerDemoData(userId);
        }

        navigate(ROLE_ROUTES[role]);
      }
    } else if (data.user) {
      navigate(ROLE_ROUTES[role]);
    }

    setDemoLoading(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-navy-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      </div>

      {/* Language toggle */}
      <button
        onClick={toggleLanguage}
        className="absolute top-4 end-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition backdrop-blur"
      >
        <Globe className="w-3.5 h-3.5" />
        {isAr ? 'EN' : 'AR'}
      </button>

      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-12">
        {/* Left side - branding */}
        <div className="text-center lg:text-start">
          <div className="flex justify-center lg:justify-start mb-6">
            <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10">
              <Logo />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            {t('app.welcomeTo')}
          </h1>
          <p className="text-slate-300 text-lg mb-3 leading-relaxed">
            {t('app.tagline')}
          </p>
          <p className="text-slate-500 text-sm mb-6">
            {t('app.poweredBy')}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: '360°', en: 'Full Visibility', ar: 'رؤية شاملة' },
              { value: '24/7', en: 'Always On',       ar: 'وصول دائم'  },
            ].map(s => (
              <div key={s.value} className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-slate-400 mt-1">{isAr ? s.ar : s.en}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right side - login form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('login.welcome')}</h2>
          <p className="text-slate-500 text-sm mb-6">{t('login.subtitle')}</p>

          <form onSubmit={handleLogin} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('login.email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('login.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full px-4 py-2.5 pe-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy hover:bg-navy-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : t('login.signIn')}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Zap className="w-3 h-3" /> {t('login.quickDemo')}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Demo role buttons */}
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map(account => (
              <button
                key={account.role}
                onClick={() => handleDemoLogin(account.role)}
                disabled={demoLoading !== null}
                className={`${account.color} text-white rounded-xl px-3 py-2.5 text-start transition disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">{t(account.labelKey)}</span>
                  {demoLoading === account.role && (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <p className="text-white/70 text-xs mt-0.5 leading-tight">{t(account.descKey)}</p>
              </button>
            ))}
          </div>

          {/* Install the app on this device */}
          <Link
            to="/download"
            className="mt-6 flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-navy text-xs font-semibold py-2.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            {t('getApp.loginLink')}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 inset-x-0 text-center">
        <p className="text-slate-500 text-xs">{t('app.copyright')}</p>
      </div>
    </div>
  );
}
