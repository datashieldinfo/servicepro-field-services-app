import { useState } from 'react';
import { X, Loader2, User, Phone, Mail, MapPin, FileText, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddCustomerModal({ onClose, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [phone, setPhone]         = useState('');
  const [address, setAddress]     = useState('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      showToast(t('toast.warning'), 'warning');
      return;
    }
    if (password.length < 6) {
      showToast(isAr ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters', 'warning');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: 'customer',
            email: email.trim(),
            password,
            full_name: fullName.trim(),
            phone: phone.trim(),
            address: address.trim(),
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || json.error) {
        showToast(json.error ?? t('toast.error'), 'error');
        setSaving(false);
        return;
      }

      setDone(true);
      showToast(isAr ? 'تم إنشاء حساب العميل بنجاح' : 'Customer account created successfully', 'success');
      setTimeout(() => {
        onCreated();
        onClose();
      }, 1500);
    } catch {
      showToast(t('toast.error'), 'error');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {isAr ? 'إضافة عميل جديد' : 'Add New Customer'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? 'سيتم إنشاء حساب تسجيل دخول للعميل' : 'A login account will be created for the customer'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-900 text-lg">
              {isAr ? 'تم إنشاء الحساب بنجاح!' : 'Account created successfully!'}
            </p>
            <p className="text-sm text-slate-500">{isAr ? 'جاري التحديث...' : 'Refreshing data...'}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'الاسم الكامل' : 'Full Name'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={isAr ? 'محمد أحمد الهواري' : 'John Smith'}
                  required
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'البريد الإلكتروني' : 'Email Address'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                  required
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'كلمة المرور' : 'Password'} <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isAr ? '6 أحرف على الأقل' : 'Min. 6 characters'}
                required
                minLength={6}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                dir="ltr"
              />
              <p className="text-xs text-slate-400 mt-1">
                {isAr ? 'سيستخدمها العميل لتسجيل الدخول' : 'The customer will use this to log in'}
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'رقم الهاتف' : 'Phone Number'}
              </label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="077XXXXXXX"
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'العنوان' : 'Address'}
              </label>
              <div className="relative">
                <MapPin className="absolute start-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder={isAr ? 'الهاشمي الشمالي، عمّان' : 'Al Hashmi, Amman'}
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {isAr ? 'ملاحظات' : 'Notes'}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={isAr ? 'أي ملاحظات إضافية...' : 'Any additional notes...'}
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">{isAr ? 'ما سيتم إنشاؤه تلقائياً:' : 'What will be created automatically:'}</p>
              <p>✓ {isAr ? 'حساب تسجيل دخول للعميل (auth)' : 'Customer login account (auth)'}</p>
              <p>✓ {isAr ? 'ملف تعريف بوابة العميل' : 'Customer portal profile'}</p>
              <p>✓ {isAr ? 'سجل العميل في قاعدة البيانات' : 'Customer record in database'}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                {isAr ? 'إنشاء حساب العميل' : 'Create Customer Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
