import { useTranslation } from 'react-i18next';
import { visitTypeDef } from '../lib/visitFields';

interface Props {
  visitType: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Small coloured label for a visit's type — used in every visit list. */
export default function VisitTypeBadge({ visitType, size = 'sm', className = '' }: Props) {
  const { t } = useTranslation();
  const def = visitTypeDef(visitType);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${def.badge} ${
        size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      } ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${def.dot}`} />
      {t(`visit.type.${def.value}`)}
    </span>
  );
}
