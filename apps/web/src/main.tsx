import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './components/AuthProvider';
// Self-hosted fonts only (no CDN): Geist Sans + Manrope via font-tokens.css,
// Geist Mono via the bundled @fontsource package.
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './styles/font-tokens.css';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
