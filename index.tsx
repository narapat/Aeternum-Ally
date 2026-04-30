import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const env = (import.meta as any).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY as string | undefined;

function renderConfigError(missing: string[]) {
  rootElement!.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
      <div style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Configuration error</h1>
        <p style="margin:0 0 16px;color:#475569;line-height:1.5;">
          The app cannot start because required build-time environment variables were not available when this site was built.
        </p>
        <p style="margin:0 0 8px;color:#475569;">Missing:</p>
        <ul style="margin:0 0 16px 20px;color:#0f172a;">
          ${missing.map((k) => `<li><code>${k}</code></li>`).join('')}
        </ul>
        <p style="margin:0;color:#475569;line-height:1.5;">
          Set these variables in <strong>Netlify &rarr; Site configuration &rarr; Environment variables</strong>
          (scope: <em>Builds</em>) and trigger a new deploy.
        </p>
      </div>
    </div>
  `;
}

const missing: string[] = [];
if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

if (missing.length > 0) {
  renderConfigError(missing);
} else {
  // Dynamic import so module-load errors (e.g. Supabase client init) become
  // visible UI instead of a blank page.
  import('./App')
    .then(({ default: App }) => {
      const root = ReactDOM.createRoot(rootElement!);
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load application:', err);
      rootElement!.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
          <div style="max-width:560px;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:28px;">
            <h1 style="margin:0 0 8px;font-size:20px;color:#b91c1c;">Application failed to load</h1>
            <p style="margin:0 0 12px;color:#475569;line-height:1.5;">An error occurred while initializing the app. Open the browser console for details.</p>
            <pre style="margin:0;padding:12px;background:#f8fafc;border-radius:8px;color:#0f172a;font-size:12px;white-space:pre-wrap;word-break:break-word;">${String((err && (err.stack || err.message)) || err)}</pre>
          </div>
        </div>
      `;
    });
}
