import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminAuthProvider } from '@/lib/admin-auth-context';
import { LocaleProvider } from '@/hooks/use-locale';
import TanStackQueryProvider from '@/vendors/tanstack-query/provider';
import App from './App';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <TanStackQueryProvider>
          <AdminAuthProvider>
            <App />
          </AdminAuthProvider>
        </TanStackQueryProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
);
