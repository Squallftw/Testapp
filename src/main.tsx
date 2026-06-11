import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { ErrorBoundary } from '@/lib/error-boundary';
import { initSupabase } from '@/data/client';
import zellijUrl from '@/assets/zellij.avif';
import '@/index.css';

// Hand the bundled (base-correct, hashed) zellij asset URL to the CSS canvas
// texture defined in index.css. Set once at boot.
document.documentElement.style.setProperty('--bati-zellij', `url("${zellijUrl}")`);

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials (Settings → API).'
  );
}

initSupabase({ url, anonKey });

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
