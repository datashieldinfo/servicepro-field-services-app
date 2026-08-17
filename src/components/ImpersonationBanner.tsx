import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogOut, PenLine } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { minutesLeft } from '../lib/impersonation';

/**
 * The bar that says this is not your own account.
 *
 * It is deliberately loud and on every page: a superadmin who forgets they are
 * viewing as a technician will read an empty list as a bug. The countdown is
 * the same one the database enforces — when it reaches zero the session is over
 * whether or not this tab noticed, so the number is the truth, not a warning.
 */
export default function ImpersonationBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { impersonation, stopViewingAs } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!impersonation) { setLeft(null); return; }
    const tick = () => setLeft(minutesLeft(impersonation.expiresAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [impersonation]);

  if (!impersonation) return null;

  async function stop() {
    setLeaving(true);
    await stopViewingAs();
    setLeaving(false);
    navigate('/platform');
  }

  const lapsed = left !== null && left <= 0;

  return (
    <>
      <div className={`${lapsed ? 'bg-slate-700' : 'bg-amber-500'} text-white`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-semibold flex items-center gap-2 min-w-0">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {t('impersonate.banner', {
                name: impersonation.targetName || '—',
                role: t(`roles.${impersonation.targetRole}`, impersonation.targetRole),
              })}
            </span>
            {impersonation.tenantName && (
              <span className="hidden sm:inline opacity-80">· {impersonation.tenantName}</span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/20 flex items-center gap-1">
              {impersonation.readOnly
                ? <><EyeOff className="w-3 h-3" /> {t('impersonate.readOnly')}</>
                : <><PenLine className="w-3 h-3" /> {t('impersonate.canChange')}</>}
            </span>
            {left !== null && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/20">
                {lapsed ? t('impersonate.lapsed') : t('impersonate.minutesLeft', { count: left })}
              </span>
            )}
            <button
              onClick={stop}
              disabled={leaving}
              className="flex items-center gap-1.5 bg-white text-slate-900 px-3 py-1 rounded-lg text-[11px] font-bold hover:bg-white/90 transition disabled:opacity-60"
            >
              {leaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
              {t('impersonate.stop')}
            </button>
          </div>
        </div>
      </div>

      {/* The bar above scrolls away with the page; this stays put on desktop,
          clear of the mobile bottom navigation the superadmin is inspecting. */}
      <button
        onClick={stop}
        disabled={leaving}
        className="hidden sm:flex fixed bottom-4 start-4 z-[60] items-center gap-1.5 bg-slate-900 text-white ps-3 pe-3.5 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-slate-800 transition disabled:opacity-60"
      >
        <LogOut className="w-3.5 h-3.5" /> {t('impersonate.stop')}
      </button>
    </>
  );
}
