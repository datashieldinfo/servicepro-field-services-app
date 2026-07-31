import { useTranslation } from 'react-i18next';
import { TONE_CLASS, TONE_DOT, type StatusMeta, type Tone } from '../lib/statusMeta';

interface ChipProps {
  meta: StatusMeta;
  /** i18n namespace holding the labels, e.g. `visitStatus` or `requestStatus`. */
  ns: string;
  className?: string;
}

/** A status word that also says where in the process it sits. */
export function StatusChip({ meta, ns, className = '' }: ChipProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${TONE_CLASS[meta.tone]} ${className}`}
      title={t(`${ns}.meaning_${meta.key}`)}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} />
      {t(`${ns}.label_${meta.key}`)}
    </span>
  );
}

interface StageProps {
  meta: StatusMeta;
}

/** Four dots showing how far along the process this record is. */
export function StageBar({ meta }: StageProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: meta.totalStages }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < meta.stage ? `w-6 ${TONE_DOT[meta.tone]}` : 'w-3 bg-slate-200'
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] text-slate-500">
        {t('statusDetail.stageOf', { stage: meta.stage, total: meta.totalStages })}
      </span>
    </div>
  );
}

interface PanelProps {
  meta: StatusMeta;
  ns: string;
  /** Reason keys resolved as `<ns>.reason_<key>`. */
  reasons?: string[];
  /** Extra rows of context: label plus value. */
  facts?: { label: string; value: string; tone?: Tone }[];
  /** Rendered under the explanation — the buttons that move it forward. */
  children?: React.ReactNode;
}

/**
 * The "why is it like this, and what now" panel shown under a record. Reads as
 * three answers: where it stands, why, and what the office should do next.
 */
export function StatusDetailPanel({ meta, ns, reasons = [], facts = [], children }: PanelProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-slate-50/80 border-t border-slate-100 px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageBar meta={meta} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            {t('statusDetail.whatItMeans')}
          </p>
          <p className="text-xs text-slate-700">{t(`${ns}.meaning_${meta.key}`)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            {t('statusDetail.whatToDo')}
          </p>
          <p className="text-xs text-slate-700">{t(`${ns}.action_${meta.key}`)}</p>
        </div>
      </div>

      {reasons.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
            {t('statusDetail.whyHere')}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {reasons.map(r => (
              <li
                key={r}
                className="text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
              >
                {t(`${ns}.reason_${r}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {facts.map(f => (
            <div key={f.label} className="flex items-baseline justify-between gap-3 border-b border-slate-200/70 pb-1">
              <span className="text-[11px] text-slate-500 shrink-0">{f.label}</span>
              <span className={`text-xs font-medium text-end ${
                f.tone === 'danger' ? 'text-red-600'
                  : f.tone === 'warning' ? 'text-amber-700'
                  : f.tone === 'success' ? 'text-green-700'
                  : 'text-slate-800'
              }`}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
    </div>
  );
}
