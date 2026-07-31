import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, ChevronDown, FileSpreadsheet, PackagePlus, CalendarPlus, CheckCircle,
  Printer, KeyRound, X, Loader2, Copy, Check, MessageCircle, Mail, Link as LinkIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import QuotationModal from './QuotationModal';
import NewInstallationModal from './NewInstallationModal';
import ScheduleVisitModal from './ScheduleVisitModal';
import PrintableQuotation, { type QuotationData } from './PrintableQuotation';
import { loadOpenOffer, type OpenOffer } from '../lib/customerActionState';
import { issuePortalAccess } from '../lib/portalAccess';

export interface NextStepCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  /** Present when the customer already has a 360 login. */
  user_id?: string | null;
  portal_access?: boolean | null;
}

interface Props {
  customer: NextStepCustomer;
  /** `menu` = dropdown button for list rows; `panel` = the full card list. */
  variant?: 'menu' | 'panel';
  /**
   * The customer's open offer when the caller already loaded it. Leave
   * undefined and the menu fetches it the first time it opens.
   */
  offer?: OpenOffer | null;
  /** Draws attention — used for customers nobody has followed up on. */
  highlight?: boolean;
  /** Something was saved; the caller should reload. */
  onChanged?: () => void;
  /** An installation or a visit was booked — the caller may close itself. */
  onFinished?: () => void;
  /** Hidden right after registration, where the link has just been shown. */
  showPortalAccess?: boolean;
}

/**
 * The "what's next?" step from the registration window, available for good.
 *
 * Closing that window used to strand the customer: no offer, no installation,
 * no visit, and no way back to any of them. The same choices now live on every
 * customer row, in the 360 view and on the edit screen, and they carry the
 * offer already on file so a decision can be recorded whenever it arrives.
 */
export default function CustomerNextStep({
  customer,
  variant = 'menu',
  offer,
  highlight = false,
  onChanged,
  onFinished,
  showPortalAccess = true,
}: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /*
    The menu is drawn into <body>. A customer table scrolls sideways, which
    clips anything hanging out of the row — the menu would be cut in half on a
    short list, which is exactly the list this feature exists for.
  */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  // `undefined` means "not looked up yet".
  const [ownOffer, setOwnOffer] = useState<OpenOffer | null | undefined>(offer);
  const pendingOffer = offer !== undefined ? offer : ownOffer ?? null;

  const [step, setStep] = useState<'offer' | 'installation' | 'visit' | null>(null);
  const [convertFrom, setConvertFrom] = useState<
    { quotationId: string; devices: { device_brand: string; catalog_id: string }[] } | null
  >(null);
  const [decision, setDecision] = useState<OpenOffer | null>(null);
  const [printOffer, setPrintOffer] = useState<QuotationData | null>(null);
  const [portal, setPortal] = useState(false);

  useEffect(() => { setOwnOffer(offer); }, [offer]);

  // Look the offer up lazily — a customer list must not fire one query per row.
  useEffect(() => {
    if (!open || offer !== undefined || ownOffer !== undefined) return;
    let cancelled = false;
    loadOpenOffer(customer.id).then(found => { if (!cancelled) setOwnOffer(found); });
    return () => { cancelled = true; };
  }, [open, offer, ownOffer, customer.id]);

  // Click-away, so an open menu never sits over the row underneath it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function refresh() {
    setOwnOffer(undefined);
    onChanged?.();
  }

  /** The customer said yes — record it, and offer to book the installation. */
  async function acceptOffer(target: OpenOffer, thenInstall: boolean) {
    const { error } = await supabase
      .from('quotations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', target.id);

    if (error) { showToast(error.message, 'error'); return; }

    showToast(t('quote.approvedToast', { number: target.quote_number }), 'success');
    setDecision(null);

    if (thenInstall) {
      setConvertFrom({
        quotationId: target.id,
        devices: (target.items ?? [])
          .filter(i => i.kind === 'device')
          .map(i => ({ device_brand: i.name, catalog_id: i.ref_id ?? '' })),
      });
      setStep('installation');
    }
    refresh();
  }

  async function declineOffer(target: OpenOffer) {
    const { error } = await supabase
      .from('quotations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', target.id);

    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('quote.declinedToast', { number: target.quote_number }), 'success');
    setDecision(null);
    refresh();
  }

  function openPrint(target: OpenOffer) {
    setPrintOffer({
      quoteNumber: target.quote_number,
      issuedAt: target.created_at,
      validUntil: target.valid_until,
      customer: {
        name: customer.name,
        address: customer.address ?? '',
        phone: customer.phone ?? '',
        email: customer.email || undefined,
      },
      items: target.items ?? [],
      subtotal: Number(target.subtotal ?? 0),
      discount: Number(target.discount ?? 0),
      total: Number(target.total_amount ?? 0),
      currency: 'JOD',
      notes: target.notes ?? '',
    });
  }

  // ── The choices themselves, shared by both layouts ────────────────────────

  interface Choice {
    key: string;
    icon: typeof FileSpreadsheet;
    title: string;
    desc?: string;
    tone: 'green' | 'slate' | 'purple' | 'blue' | 'orange';
    run: () => void;
  }

  const choices: Choice[] = [];

  if (pendingOffer) {
    choices.push({
      key: 'decision',
      icon: CheckCircle,
      title: t('quote.recordDecision'),
      desc: `${pendingOffer.quote_number} — ${Number(pendingOffer.total_amount).toFixed(2)} JOD`,
      tone: 'green',
      run: () => setDecision(pendingOffer),
    });
    choices.push({
      key: 'print',
      icon: Printer,
      title: t('quote.viewPrint'),
      tone: 'slate',
      run: () => openPrint(pendingOffer),
    });
  }

  choices.push({
    key: 'offer',
    icon: FileSpreadsheet,
    title: t('customerForm.sendOffer'),
    desc: t('customerForm.sendOfferDesc'),
    tone: 'purple',
    run: () => setStep('offer'),
  });
  choices.push({
    key: 'installation',
    icon: PackagePlus,
    title: t('customerForm.newInstallation'),
    desc: t('customerForm.newInstallationDesc'),
    tone: 'blue',
    run: () => { setConvertFrom(null); setStep('installation'); },
  });
  choices.push({
    key: 'visit',
    icon: CalendarPlus,
    title: t('customerForm.scheduleVisit'),
    desc: t('customerForm.scheduleVisitDesc'),
    tone: 'orange',
    run: () => setStep('visit'),
  });

  if (showPortalAccess) {
    choices.push({
      key: 'portal',
      icon: KeyRound,
      title: customer.user_id ? t('portal.reissueTitle') : t('portal.grantTitle'),
      desc: customer.user_id ? t('portal.reissueDesc') : t('portal.grantDesc'),
      tone: 'slate',
      run: () => setPortal(true),
    });
  }

  const TONE: Record<Choice['tone'], { icon: string; hover: string; border: string; bg: string; text: string; sub: string }> = {
    green:  { icon: 'text-green-600',  hover: 'hover:bg-green-50',  border: 'border-green-200',  bg: 'bg-green-50',  text: 'text-green-900',  sub: 'text-green-700' },
    slate:  { icon: 'text-slate-500',  hover: 'hover:bg-slate-50',  border: 'border-slate-200',  bg: 'bg-slate-50',  text: 'text-slate-800',  sub: 'text-slate-500' },
    purple: { icon: 'text-purple-600', hover: 'hover:bg-purple-50', border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-900', sub: 'text-purple-700' },
    blue:   { icon: 'text-blue-600',   hover: 'hover:bg-blue-50',   border: 'border-blue-200',   bg: 'bg-blue-50',   text: 'text-blue-900',   sub: 'text-blue-700' },
    orange: { icon: 'text-orange-600', hover: 'hover:bg-orange-50', border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-900', sub: 'text-orange-700' },
  };

  const modals = (
    <>
      {step === 'offer' && (
        <QuotationModal
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone ?? undefined}
          customerEmail={customer.email || undefined}
          customerAddress={customer.address ?? undefined}
          onClose={() => setStep(null)}
          onSaved={() => refresh()}
          onConvert={(quotationId, devices) => {
            setConvertFrom({ quotationId, devices });
            setStep('installation');
          }}
        />
      )}

      {step === 'installation' && (
        <NewInstallationModal
          customerId={customer.id}
          customerName={customer.name}
          presetDevices={convertFrom?.devices}
          quotationId={convertFrom?.quotationId ?? null}
          onClose={() => { setStep(null); setConvertFrom(null); }}
          onSaved={() => { setStep(null); setConvertFrom(null); refresh(); onFinished?.(); }}
        />
      )}

      {step === 'visit' && (
        <ScheduleVisitModal
          presetCustomerId={customer.id}
          presetCustomerName={customer.name}
          onClose={() => setStep(null)}
          onSaved={() => { setStep(null); refresh(); onFinished?.(); }}
        />
      )}

      {decision && (
        <OfferDecisionDialog
          customerName={customer.name}
          offer={decision}
          onClose={() => setDecision(null)}
          onAccept={thenInstall => acceptOffer(decision, thenInstall)}
          onDecline={() => declineOffer(decision)}
        />
      )}

      {printOffer && <PrintableQuotation quote={printOffer} onClose={() => setPrintOffer(null)} />}

      {portal && (
        <PortalAccessDialog
          customer={customer}
          isAr={isAr}
          onClose={() => setPortal(false)}
          onGranted={() => onChanged?.()}
        />
      )}
    </>
  );

  const MENU_WIDTH = 240;

  /** Keeps the floating menu pinned under its button, and on screen. */
  const place = useCallback(() => {
    const button = boxRef.current?.getBoundingClientRect();
    if (!button) return;

    const height = menuRef.current?.offsetHeight ?? 260;
    const below = window.innerHeight - button.bottom;
    const top = below < height + 12 && button.top > height + 12
      ? button.top - height - 4
      : button.bottom + 4;

    const left = Math.min(
      Math.max(8, button.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );

    setAnchor({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setAnchor(null); return; }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place, choices.length]);

  if (variant === 'panel') {
    return (
      <>
        <div className="w-full space-y-2 text-start">
          {choices.map(c => {
            const tone = TONE[c.tone];
            return (
              <button
                key={c.key}
                type="button"
                onClick={c.run}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 ${tone.border} ${tone.bg} hover:brightness-95 transition text-start`}
              >
                <c.icon className={`w-5 h-5 ${tone.icon} shrink-0`} />
                <span>
                  <span className={`block text-sm font-semibold ${tone.text}`}>{c.title}</span>
                  {c.desc && <span className={`block text-[11px] ${tone.sub}`}>{c.desc}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <div className="relative" ref={boxRef}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={t('customerForm.whatNext')}
          className={`h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-bold whitespace-nowrap transition ${
            highlight || pendingOffer
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {t('admin.nextStep')}
          <ChevronDown className="w-3 h-3" />
        </button>

        {open && createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: anchor?.top ?? -9999,
              left: anchor?.left ?? -9999,
              width: MENU_WIDTH,
              visibility: anchor ? 'visible' : 'hidden',
            }}
            className="z-[120] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          >
            {choices.map((c, i) => {
              const tone = TONE[c.tone];
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setOpen(false); c.run(); }}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 ${tone.hover} transition text-start ${
                    i < choices.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <c.icon className={`w-4 h-4 ${tone.icon} shrink-0 mt-0.5`} />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800">{c.title}</span>
                    {c.desc && <span className="block text-[11px] text-slate-500">{c.desc}</span>}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      </div>
      {modals}
    </>
  );
}

// ── The customer's answer on an offer, recorded whenever it arrives ─────────

function OfferDecisionDialog({
  customerName, offer, onClose, onAccept, onDecline,
}: {
  customerName: string;
  offer: OpenOffer;
  onClose: () => void;
  onAccept: (thenInstall: boolean) => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('quote.recordDecision')}</h2>
              <p className="text-xs text-slate-500">{customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-900" dir="ltr">{offer.quote_number}</span>
              <span className="font-bold text-slate-900">{Number(offer.total_amount).toFixed(2)} JOD</span>
            </div>
            <ul className="space-y-0.5">
              {(offer.items ?? []).map((item, i) => (
                <li key={i} className="text-xs text-slate-600 flex justify-between gap-3">
                  <span className="truncate">{item.name} × {item.qty}</span>
                  <span className="shrink-0">{Number(item.total).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {offer.valid_until && (
              <p className="text-[11px] text-slate-400 mt-2">
                {t('quote.validUntil')}: {offer.valid_until}
              </p>
            )}
          </div>

          <p className="text-sm text-slate-600">{t('quote.decisionPrompt')}</p>

          <div className="space-y-2">
            <button
              onClick={() => onAccept(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-green-200 bg-green-50 hover:border-green-400 transition text-start"
            >
              <PackagePlus className="w-5 h-5 text-green-700 shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-green-900">{t('quote.acceptAndInstall')}</span>
                <span className="block text-[11px] text-green-700">{t('quote.acceptAndInstallDesc')}</span>
              </span>
            </button>
            <button
              onClick={() => onAccept(false)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-start"
            >
              <CheckCircle className="w-5 h-5 text-slate-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">{t('quote.acceptOnly')}</span>
            </button>
            <button
              onClick={onDecline}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-100 hover:bg-red-50 transition text-start"
            >
              <X className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-700">{t('quote.decline')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Portal access: grant it, or re-issue a lost login link ──────────────────

function PortalAccessDialog({
  customer, isAr, onClose, onGranted,
}: {
  customer: NextStepCustomer;
  isAr: boolean;
  onClose: () => void;
  onGranted: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [email, setEmail] = useState(customer.email ?? '');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ loginLink?: string; tempPassword?: string } | null>(null);
  const [copied, setCopied] = useState<'link' | 'password' | null>(null);

  const existing = !!customer.user_id;

  async function run() {
    if (!email.trim()) { showToast(t('portal.needEmail'), 'warning'); return; }
    setWorking(true);
    const res = await issuePortalAccess(customer.id, customer.name, email);
    setWorking(false);

    if (!res.ok) { showToast(res.error ?? t('toast.error'), 'error'); return; }

    setResult({ loginLink: res.loginLink, tempPassword: res.tempPassword });
    showToast(res.created ? t('portal.grantedToast') : t('portal.reissuedToast'), 'success');
    onGranted();
  }

  async function copy(text: string, which: 'link' | 'password') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast(t('toast.error'), 'error');
    }
  }

  function message(): string {
    const link = result?.loginLink ?? '';
    return isAr
      ? `مرحباً ${customer.name}،\nتم إنشاء حسابك في تطبيق BioFamily 360.\nللدخول لأول مرة استخدم هذا الرابط، وسيُطلب منك اختيار كلمة مرور جديدة:\n${link}`
      : `Hello ${customer.name},\nYour BioFamily 360 account is ready.\nUse this one-time link to sign in — you will be asked to choose your own password:\n${link}`;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {existing ? t('portal.reissueTitle') : t('portal.grantTitle')}
              </h2>
              <p className="text-xs text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-slate-600">
                {existing ? t('portal.reissueBody') : t('portal.grantBody')}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">{t('admin.emailLabel')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  dir="ltr"
                  placeholder="name@example.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">{t('portal.emailHint')}</p>
              </div>

              <button
                onClick={run}
                disabled={working}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                {existing ? t('portal.reissueAction') : t('portal.grantAction')}
              </button>
            </>
          ) : (
            <>
              {result.loginLink && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5" />
                    {t('customerForm.loginLinkTitle')}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-700 truncate" dir="ltr">
                      {result.loginLink}
                    </code>
                    <button
                      onClick={() => copy(result.loginLink!, 'link')}
                      className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shrink-0"
                      title={t('customerForm.copy')}
                    >
                      {copied === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => window.open(
                        `https://wa.me/${(customer.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(message())}`,
                        '_blank', 'noopener',
                      )}
                      disabled={!customer.phone}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {t('customerForm.sendWhatsApp')}
                    </button>
                    <button
                      onClick={() => {
                        const subject = isAr ? 'حسابك في تطبيق BioFamily 360' : 'Your BioFamily 360 account';
                        window.location.href =
                          `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message())}`;
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold transition"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {t('customerForm.sendEmail')}
                    </button>
                  </div>
                  <p className="text-[11px] text-blue-800">{t('customerForm.loginLinkHint')}</p>
                </div>
              )}

              {result.tempPassword && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-900">{t('customerForm.tempPasswordTitle')}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800" dir="ltr">
                      {result.tempPassword}
                    </code>
                    <button
                      onClick={() => copy(result.tempPassword!, 'password')}
                      className="p-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition"
                      title={t('customerForm.copy')}
                    >
                      {copied === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-800">{t('portal.passwordReplaced')}</p>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 transition"
              >
                {t('common.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
