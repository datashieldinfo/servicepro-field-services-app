import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import './index.css';
import { initPwa } from './lib/pwa';

// registers the service worker and catches the install prompt, which browsers
// fire early — long before the user opens the download screen
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
