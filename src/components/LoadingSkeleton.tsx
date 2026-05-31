import { useTranslation } from 'react-i18next';

export default function LoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 animate-pulse" aria-label={t('aria.loading')} role="status">
      <div className="h-8 bg-slate-200 rounded-xl w-48" />
      <div className="h-4 bg-slate-200 rounded-lg w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100">
            <div className="h-10 w-10 bg-slate-200 rounded-xl mb-3" />
            <div className="h-6 bg-slate-200 rounded-lg w-16 mb-2" />
            <div className="h-4 bg-slate-200 rounded-lg w-24" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl p-6 border border-slate-100 mt-4">
        <div className="h-5 bg-slate-200 rounded-lg w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
