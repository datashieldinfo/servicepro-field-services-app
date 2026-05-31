import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-slate-400" />
        </div>
        <h1 className="text-6xl font-bold text-slate-300 mb-4">404</h1>
        <p className="text-xl font-semibold text-slate-700 mb-2">{t('notFound.title')}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold text-sm transition mt-6"
        >
          <Home className="w-4 h-4" />
          {t('notFound.goHome')}
        </Link>
      </div>
    </div>
  );
}
