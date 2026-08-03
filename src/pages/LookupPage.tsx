import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Building2, Loader2, PhoneCall, Search, UserPlus, UserRound,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Customer360Panel from '../components/Customer360Panel';
import AddCustomerModal from '../components/AddCustomerModal';
import CustomerStatusBadge from '../components/CustomerStatusBadge';
import { findCustomersByPhone, formatPhone, isLookupReady, type PhoneMatch } from '../lib/phoneLookup';
import { customerStatus, type CustomerStatus } from '../lib/statusMeta';
import { supabase } from '../lib/supabase';

/**
 * Who is calling.
 *
 * Reached three ways, all of which end in the same place — the customer's 360
 * record: tapping the link on a saved phone contact (`?c=<id>`), a number
 * arriving from the phone system or pasted by hand (`?phone=…`), or somebody
 * typing digits into the box below.
 *
 * The match is on the last nine digits, so it does not matter whether the
 * number arrives as +962…, 07…, or with spaces in it.
 */
export default function LookupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [term, setTerm] = useState(params.get('phone') ?? '');
  const [matches, setMatches] = useState<PhoneMatch[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, CustomerStatus>>({});
  const [searching, setSearching] = useState(false);
  const [openCustomer, setOpenCustomer] = useState<string | null>(params.get('c'));
  const [registering, setRegistering] = useState(false);

  /** Status badges for the shortlist, so the caller is placed at a glance. */
  const loadStatuses = useCallback(async (rows: PhoneMatch[]) => {
    if (rows.length === 0) { setStatuses({}); return; }
    const ids = rows.map(r => r.id);

    const [contractRes, apptRes] = await Promise.all([
      supabase.from('contracts').select('customer_id, status, end_date').in('customer_id', ids),
      supabase.from('appointments').select('customer_id, status, scheduled_at').in('customer_id', ids),
    ]);

    const contracts = (contractRes.data ?? []) as { customer_id: string; status: string; end_date: string }[];
    const visits = (apptRes.data ?? []) as { customer_id: string; status: string; scheduled_at: string }[];
    const now = Date.now();
    const next: Record<string, CustomerStatus> = {};

    rows.forEach(row => {
      const contract = contracts
        .filter(c => c.customer_id === row.id)
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;

      const mine = visits.filter(v => v.customer_id === row.id);
      next[row.id] = customerStatus({
        contract,
        lastVisitAt: mine.filter(v => v.status === 'completed')
          .map(v => v.scheduled_at).sort().reverse()[0] ?? null,
        nextVisitAt: mine.filter(v => v.status !== 'completed' && v.status !== 'cancelled'
          && new Date(v.scheduled_at).getTime() >= now)
          .map(v => v.scheduled_at).sort()[0] ?? null,
      });
    });

    setStatuses(next);
  }, []);

  const run = useCallback(async (raw: string, openIfSingle: boolean) => {
    if (!isLookupReady(raw)) { setMatches(null); return; }
    setSearching(true);
    const rows = await findCustomersByPhone(raw);
    setMatches(rows);
    await loadStatuses(rows);
    setSearching(false);
    /* One caller, one record — do not make anyone tap a list of one. */
    if (openIfSingle && rows.length === 1) setOpenCustomer(rows[0].id);
  }, [loadStatuses]);

  /* A number handed to us in the URL searches itself. */
  useEffect(() => {
    const incoming = params.get('phone');
    if (incoming) run(incoming, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParams(term ? { phone: term } : {}, { replace: true });
    run(term, true);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /> {t('common.back')}
        </button>

        {/* The number */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-navy" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">{t('lookup.title')}</h1>
              <p className="text-xs text-slate-500">{t('lookup.subtitle')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder={t('lookup.placeholder')}
                dir="ltr"
                inputMode="tel"
                autoFocus
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-navy outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!isLookupReady(term) || searching}
              className="px-5 py-2.5 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {t('lookup.search')}
            </button>
          </form>

          <p className="text-[11px] text-slate-400 mt-2">{t('lookup.matchHint')}</p>
        </section>

        {/* What came back */}
        {matches !== null && (
          matches.length === 0 ? (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
              <p className="text-sm font-semibold text-slate-800 mb-1">{t('lookup.noMatch')}</p>
              <p className="text-xs text-slate-500 mb-4" dir="ltr">{formatPhone(term)}</p>
              <button
                onClick={() => setRegistering(true)}
                className="inline-flex items-center gap-2 bg-gold hover:bg-amber-500 text-amber-950 font-bold rounded-xl px-5 py-2.5 text-sm transition"
              >
                <UserPlus className="w-4 h-4" /> {t('lookup.registerCaller')}
              </button>
            </section>
          ) : (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <p className="px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500">
                {t('lookup.matchCount', { count: matches.length })}
              </p>
              <div className="divide-y divide-slate-100">
                {matches.map(match => (
                  <button
                    key={match.id}
                    onClick={() => setOpenCustomer(match.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-3 text-start hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-navy/10 flex items-center justify-center shrink-0">
                        {match.customer_type === 'corporate'
                          ? <Building2 className="w-4 h-4 text-navy" />
                          : <UserRound className="w-4 h-4 text-navy" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {match.company_name || match.name}
                        </p>
                        <p className="text-xs text-slate-500" dir="ltr">
                          {formatPhone(match.matched_on === 'phone' ? match.phone : match.contact_person_phone)}
                        </p>
                        {match.matched_on === 'contact_person' && (
                          <p className="text-[11px] text-amber-700">
                            {t('lookup.viaContactPerson', { name: match.contact_person_name ?? '' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <CustomerStatusBadge status={statuses[match.id]} small />
                  </button>
                ))}
              </div>
            </section>
          )
        )}
      </main>

      {openCustomer && (
        <Customer360Panel customerId={openCustomer} onClose={() => setOpenCustomer(null)} />
      )}

      {registering && (
        <AddCustomerModal
          presetPhone={term}
          onClose={() => setRegistering(false)}
          onCreated={() => { setRegistering(false); run(term, true); }}
        />
      )}
    </div>
  );
}
