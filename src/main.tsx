import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { wagmiConfig } from './config/wagmi.ts';
import { AdminDashboard } from './admin/AdminDashboard.tsx';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* ── Admin dashboard ── */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* ── Main landing page ── */}
        <Route
          path="*"
          element={
            <WagmiProvider config={wagmiConfig}>
              <QueryClientProvider client={queryClient}>
                <App />
              </QueryClientProvider>
            </WagmiProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
