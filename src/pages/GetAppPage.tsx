import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Apple, ArrowLeft, Check, CheckCircle2, Chrome, Copy, Download, Globe, Laptop2,
  Mail, MessageCircle, MonitorSmartphone, MoreVertical, RefreshCw, Share, Smartphone, WifiOff,
} from 'lucide-react';
import Logo from '../components/Logo';
import { toggleLanguage } from '../lib/language';
import { mailtoLink, whatsAppLink } from '../lib/format';
import {
  DevicePlatform, canInstallDirectly, detectBrowser, detectPlatform, isStandalone,
  onInstallStateChange, promptInstall, wasInstalled,
} from '../lib/pwa';

const PLATFORMS: { id: DevicePlatform; Icon: typeof Smartphone; accent: string }[] = [
  { id: 'android', Icon: Smartphone, accent: 'bg-green-50 text-green-700 border-green-100' },
  { id: 'ios', Icon: Apple, accent: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'windows', Icon: MonitorSmartphone, accent: 'bg-blue-50 text-blue-700 border-blue-100' },
  { id: 'macos', Icon: Laptop2, accent: 'bg-violet-50 text-violet-700 border-violet-100' },
];

/** The little glyph a step refers to, so the wording matches what is on screen. */
const STEP_ICONS: Record<DevicePlatform, typeof Smartphone> = {
  android: MoreVertical,
  ios: Share,
  windows: Download,
  macos: Chrome,
  other: Download,
};

export default function GetAppPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [platform] = useState<DevicePlatform>(() => detectPlatform());
  const [browser] = useState(() => detectBrowser());
  const [canPrompt, setCanPrompt] = useState(canInstallDirectly);
  const [installedNow, setInstalledNow] = useState(wasInstalled);
  const [standalone, setStandalone] = useState(isStandalone);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const appUrl = typeof window === 'undefined' ? '' : window.location.origin;
  const shareText = t('getApp.share.message', { url: appUrl });

  useEffect(() => onInstallStateChange(() => {
    setCanPrompt(canInstallDirectly());
    setInstalledNow(wasInstalled());
    setStandalone(isStandalone());
  }), []);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    const outcome = await promptInstall();
    if (outcome === 'accepted') setInstalledNow(true);
    setBusy(false);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(appUrl);
    } catch {
      return; // clipboard is blocked on insecure origins — the link is on screen anyway
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** The numbered steps for one platform, honouring the browser in use. */
  function stepsFor(id: DevicePlatform): string[] {
    const key = id === 'android' && browser === 'samsung' ? 'androidSamsung' : id;
    const steps: unknown = t(`getApp.steps.${key}`, { returnObjects: true });
    return Array.isArray(steps) ? (steps as string[]) : [];
  }

  const detected = PLATFORMS.find(p => p.id === platform);
  const others = PLATFORMS.filter(p => p.id !== platform);
  const iosOnNonSafari = platform === 'ios' && browser !== 'safari';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-navy-800 to-slate-900">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 flex items-center justify-between gap-4">
        <div className="bg-white/5 backdrop-blur rounded-2xl px-3 py-2 border border-white/10">
          <Logo compact />
          <span className="sr-only">ServisGo</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition backdrop-blur"
          >
            <Globe className="w-3.5 h-3.5" />
            {isAr ? 'EN' : 'AR'}
          </button>
          <Link
            to="/login"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition backdrop-blur"
          >
            <ArrowLeft className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            {t('getApp.backToLogin')}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <section className="text-center mb-10">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={88}
            height={88}
            className="mx-auto rounded-3xl shadow-2xl shadow-black/40 mb-5"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('getApp.title')}</h1>
          <p className="text-slate-300 max-w-2xl mx-auto leading-relaxed">{t('getApp.subtitle')}</p>

          {/* Primary action */}
          <div className="mt-6 flex flex-col items-center gap-3">
            {standalone || installedNow ? (
              <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 text-green-200 rounded-2xl px-5 py-3 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                {standalone ? t('getApp.runningInstalled') : t('getApp.installedNow')}
              </div>
            ) : canPrompt ? (
              <button
                onClick={handleInstall}
                disabled={busy}
                className="inline-flex items-center gap-2 bg-gold hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-bold rounded-2xl px-6 py-3.5 text-sm transition shadow-lg shadow-amber-900/30"
              >
                {busy
                  ? <div className="w-4 h-4 border-2 border-amber-950 border-t-transparent rounded-full animate-spin" />
                  : <Download className="w-5 h-5" />}
                {t('getApp.installNow')}
              </button>
            ) : (
              <p className="text-slate-400 text-sm max-w-md">{t('getApp.followSteps')}</p>
            )}
            <p className="text-slate-500 text-xs">{t('getApp.noStoreNeeded')}</p>
          </div>
        </section>

        {/* Why it is worth installing */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {[
            { Icon: WifiOff, key: 'offline' },
            { Icon: RefreshCw, key: 'updates' },
            { Icon: Smartphone, key: 'home' },
          ].map(({ Icon, key }) => (
            <div key={key} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-4">
              <Icon className="w-5 h-5 text-sky-300 mb-2" />
              <p className="text-white text-sm font-semibold mb-1">{t(`getApp.benefits.${key}.title`)}</p>
              <p className="text-slate-400 text-xs leading-relaxed">{t(`getApp.benefits.${key}.desc`)}</p>
            </div>
          ))}
        </section>

        {/* Detected device first */}
        {detected && (
          <section className="mb-6">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              {t('getApp.yourDevice')}
            </p>
            <PlatformCard
              id={detected.id}
              Icon={detected.Icon}
              accent={detected.accent}
              highlighted
              steps={stepsFor(detected.id)}
              note={iosOnNonSafari ? t('getApp.iosSafariOnly') : t(`getApp.notes.${detected.id}`)}
            />
          </section>
        )}

        {/* Every other device */}
        <section>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            {detected ? t('getApp.otherDevices') : t('getApp.allDevices')}
          </p>
          <div className={`grid grid-cols-1 gap-4 ${detected ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
            {others.map(p => (
              <PlatformCard
                key={p.id}
                id={p.id}
                Icon={p.Icon}
                accent={p.accent}
                steps={stepsFor(p.id)}
                note={t(`getApp.notes.${p.id}`)}
              />
            ))}
          </div>
        </section>

        {/* Share the link with the team or a customer */}
        <section className="mt-10 bg-white rounded-3xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-900 mb-1">{t('getApp.share.title')}</h2>
          <p className="text-slate-500 text-sm mb-4">{t('getApp.share.desc')}</p>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 min-w-0">
              <span className="text-sm text-slate-700 font-mono truncate" dir="ltr">{appUrl}</span>
            </div>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy hover:bg-navy-700 text-white text-sm font-semibold transition"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? t('getApp.share.copied') : t('getApp.share.copy')}
            </button>
            <a
              href={whatsAppLink(null, shareText)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition"
            >
              <MessageCircle className="w-4 h-4" />
              {t('getApp.share.whatsapp')}
            </a>
            <a
              href={mailtoLink('', t('getApp.share.subject'), shareText)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
            >
              <Mail className="w-4 h-4" />
              {t('getApp.share.email')}
            </a>
          </div>
        </section>

        <p className="text-center text-slate-500 text-xs mt-8">{t('app.copyright')}</p>
      </main>
    </div>
  );
}

interface PlatformCardProps {
  id: DevicePlatform;
  Icon: typeof Smartphone;
  accent: string;
  steps: string[];
  note?: string;
  highlighted?: boolean;
}

function PlatformCard({ id, Icon, accent, steps, note, highlighted = false }: PlatformCardProps) {
  const { t } = useTranslation();
  const StepIcon = STEP_ICONS[id];
  return (
    <div
      className={`bg-white rounded-2xl border p-5 ${
        highlighted ? 'border-gold shadow-2xl shadow-black/30' : 'border-slate-100 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-slate-900 text-sm leading-tight">{t(`getApp.platforms.${id}`)}</p>
          <p className="text-xs text-slate-400">{t(`getApp.browsers.${id}`)}</p>
        </div>
      </div>

      <ol className="space-y-2.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center mt-0.5">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {note && (
        <p className="mt-4 flex gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 leading-relaxed">
          <StepIcon className="w-4 h-4 flex-shrink-0 text-slate-400 mt-0.5" />
          <span>{note}</span>
        </p>
      )}
    </div>
  );
}
