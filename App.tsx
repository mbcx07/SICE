import React, { Suspense, useEffect, useState, lazy } from 'react';
import './App.css';
import {
  ensureSession,
  logoutSession,
  dbService
} from './services/db';
import type { User, SiceSettings } from './types';

// Lazy-loaded tab components for code splitting
const AuthScreen = lazy(() => import('./src/components/AuthScreen'));
const NavBar = lazy(() => import('./src/components/NavBar'));
const Dashboard = lazy(() => import('./src/components/Dashboard'));
const PatientsList = lazy(() => import('./src/components/PatientsList'));
const SalesManager = lazy(() => import('./src/components/SalesManager'));
const Appointments = lazy(() => import('./src/components/Appointments'));
const IntakeManager = lazy(() => import('./src/components/IntakeManager'));
const Settings = lazy(() => import('./src/components/Settings'));

type Tab = 'dashboard' | 'patients' | 'sales' | 'appointments' | 'intakes' | 'settings';

const clampColor = (v: string) => (String(v || '').trim() || '#0ea5e9');

const LoadingSpinner: React.FC<{ text?: string; fullPage?: boolean }> = ({ text, fullPage }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, minHeight: fullPage ? '60vh' : 'auto' }}>
    <div className="spinner" />
    {text ? <span style={{ color: '#64748b', fontSize: 14 }}>{text}</span> : null}
  </div>
);

const defaultLogoUrl = `${(import.meta as any).env?.BASE_URL || '/'}diagnostic-support-del-noroeste.jpg`;

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiceSettings>({ id: 'global', themeColor: '#2b5ea7', calendarInvitePatient: true });

  // Public register detection
  const isPublicRegister = typeof window !== 'undefined' && window.location.hash.toLowerCase().includes('registro');

  // Auth
  useEffect(() => {
    if (isPublicRegister) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const profile = await ensureSession();
        if (!mounted) return;
        setUser(profile);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'No se pudo iniciar la app.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isPublicRegister]);

  // Settings watcher
  useEffect(() => {
    const unsub = dbService.watchSiceSettings(setSettings);
    return () => unsub();
  }, []);

  // Theme
  useEffect(() => {
    document.documentElement.style.setProperty('--brand', clampColor(settings.themeColor));
  }, [settings.themeColor]);

  const resolvedLogo = settings.logoDataUrl ? settings.logoDataUrl : defaultLogoUrl;

  const handleLogout = async () => {
    logoutSession();
    setUser(null);
    setError(null);
  };

  const showMessage = (msg: string | null) => {
    setUiMessage(msg);
    if (msg) setTimeout(() => setUiMessage(null), 3000);
  };

  // Loading state
  if (loading) {
    return (
      <div className="appShell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <LoadingSpinner text="Cargando…" />
      </div>
    );
  }

  // Public registration or login screen
  if (!user) {
    return (
      <Suspense fallback={<LoadingSpinner text="Cargando…" />}>
        <AuthScreen
          onLogin={(u: User) => { setUser(u); setError(null); }}
          logoUrl={resolvedLogo}
          isPublicRegister={isPublicRegister}
        />
      </Suspense>
    );
  }

  return (
    <div className="appShell">
      {/* Toast */}
      {uiMessage ? <div className="toast">{uiMessage}</div> : null}

      {/* NavBar */}
      <Suspense fallback={<LoadingSpinner text="Cargando navegación…" />}>
        <NavBar
          tab={tab}
          onTabChange={(t: string) => setTab(t as Tab)}
          user={user}
          onLogout={handleLogout}
          logoUrl={resolvedLogo}
        />
      </Suspense>

      {/* Tab content */}
      <main className="content">
        {tab === 'dashboard' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando tablero…" />}>
            <Dashboard
              settings={settings}
              sales={[]}
              patients={[]}
              appointments={[]}
              setUiMessage={showMessage}
            />
          </Suspense>
        )}
        {tab === 'patients' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando pacientes…" />}>
            <PatientsList />
          </Suspense>
        )}
        {tab === 'sales' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando ventas…" />}>
            <SalesManager />
          </Suspense>
        )}
        {tab === 'appointments' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando agenda…" />}>
            <Appointments />
          </Suspense>
        )}
        {tab === 'intakes' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando registros…" />}>
            <IntakeManager />
          </Suspense>
        )}
        {tab === 'settings' && (
          <Suspense fallback={<LoadingSpinner fullPage text="Cargando configuración…" />}>
            <Settings />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default App;
