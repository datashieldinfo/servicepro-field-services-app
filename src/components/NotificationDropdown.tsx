import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Clock, Gift, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  type: 'reminder' | 'offer' | 'alert';
  message: string;
  created_at: string;
  isRead: boolean;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  reminder: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50' },
  offer: { icon: Gift, color: 'text-teal-600', bg: 'bg-teal-50' },
  alert: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
};

export default function NotificationDropdown() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const loadNotifications = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, message, is_read, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);

    type RawNotif = { id: string; type: string; message: string; is_read: boolean; created_at: string };
    setNotifications(
      (data ?? []).map((n: RawNotif) => ({
        id: n.id,
        type: n.type as Notification['type'],
        message: n.message,
        created_at: n.created_at,
        isRead: n.is_read,
      }))
    );
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (days > 0) return t('time.daysAgo', { count: days });
    if (hours > 0) return t('time.hoursAgo', { count: hours });
    return t('time.minutesAgo', { count: Math.max(1, Math.floor(diff / 60000)) });
  }

  async function markOneRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile!.id)
      .eq('is_read', false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 end-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {t('notifications.empty')}
              </div>
            ) : (
              notifications.map(notif => {
                const cfg = typeConfig[notif.type] ?? typeConfig.reminder;
                const Icon = cfg.icon;
                return (
                  <div
                    key={notif.id}
                    onClick={() => !notif.isRead && markOneRead(notif.id)}
                    className={`px-4 py-3 border-b border-slate-50 transition ${
                      !notif.isRead
                        ? 'bg-blue-50/30 hover:bg-blue-50/60 cursor-pointer'
                        : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-relaxed ${!notif.isRead ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeAgo(notif.created_at)}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
