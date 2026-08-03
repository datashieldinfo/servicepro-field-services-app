import { LogOut, Globe, Search, Download, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toggleLanguage } from '../lib/language';
import { isStandalone } from '../lib/pwa';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../lib/supabase';
import Logo from './Logo';
import NotificationDropdown from './NotificationDropdown';

const ROLE_CONFIG: Record<UserRole, { bg: string; text: string; dot: string }> = {
  owner: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-600' },
  technician: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-600' },
  admin: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-600' },
  customer: { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-600' },
  manager: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-600' },
};

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const role = profile?.role ?? 'customer';
  const config = ROLE_CONFIG[role];
  const isAr = i18n.language === 'ar';
  const [searchOpen, setSearchOpen] = useState(false);
  // nothing to install when the app is already running from the home screen
  const [installed] = useState(isStandalone);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Logo compact />

          {/* Center: Global Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-6">
            <div className="relative w-full">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('search.placeholder')}
                className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Mobile search toggle */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="md:hidden w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Who is calling — number in, customer record out */}
            {role !== 'customer' && (
              <button
                onClick={() => navigate('/lookup')}
                title={t('lookup.title')}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-navy hover:text-white flex items-center justify-center text-slate-500 transition"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
            )}

            {/* Install the app */}
            {!installed && (
              <button
                onClick={() => navigate('/download')}
                title={t('nav.getApp')}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-navy hover:text-white flex items-center justify-center text-slate-500 transition"
              >
                <Download className="w-4 h-4" />
              </button>
            )}

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition border border-slate-200"
            >
              <Globe className="w-3.5 h-3.5" />
              {isAr ? 'EN' : 'AR'}
            </button>

            {/* Notification dropdown */}
            <NotificationDropdown />

            {/* User info */}
            <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-1.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${config.dot}`}>
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-900 leading-tight">
                  {profile?.full_name || 'User'}
                </p>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md ${config.bg} ${config.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                  {t(`roles.${role}`)}
                </span>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition"
              title={t('nav.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden pb-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('search.placeholder')}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                autoFocus
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
