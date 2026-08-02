import { useTranslation } from 'react-i18next';
import { TONE_CLASS, TONE_DOT, type CustomerStatus } from '../lib/statusMeta';

interface Props {
  status?: CustomerStatus | null;
  /** Compact form for dense tables. */
  small?: boolean;
}

/**
 * Where a customer stands with us, in one badge: under contract, contract about
 * to run out, an offer waiting on them, a visit booked, nothing yet, or nothing
 * for a year. Same vocabulary on every screen that lists customers.
 */
export default function CustomerStatusBadge({ status, small = false }: Props) {
  const { t } = useTranslation();
  if (!status) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-bold whitespace-nowrap ${
        TONE_CLASS[status.tone]
      } ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'}`}
      title={t(`customerStatus.hint_${status.state}`)}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[status.tone]}`} />
      {t(`customerStatus.${status.state}`)}
    </span>
  );
}
