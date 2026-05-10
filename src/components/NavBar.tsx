import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  CalendarDays,
  ClipboardList,
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';

interface NavBarProps {
  tab: string;
  onTabChange: (tab: string) => void;
  user: any;
  onLogout: () => void;
  logoUrl: string;
}

const NavBar: React.FC<NavBarProps> = ({ tab, onTabChange, user, onLogout, logoUrl }) => {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="brandLogo" />
          ) : (
            <div className="brandLogoFallback" />
          )}
          <div>
            <div className="brandTitle">Diagnostic Support del Noroeste</div>
            <div className="brandSub" style={{ display: 'none' }}>
              {user?.nombre} · {user?.unidad}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn"
            onClick={onLogout}
            aria-label="Salir"
            title="Salir"
            style={{
              width: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={tab === 'dashboard' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('dashboard')}
        >
          <LayoutDashboard size={16} />
          &nbsp;Tablero
        </button>
        <button
          className={tab === 'patients' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('patients')}
        >
          <Users size={16} />
          &nbsp;Pacientes
        </button>
        <button
          className={tab === 'sales' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('sales')}
        >
          <ShoppingCart size={16} />
          &nbsp;Ventas
        </button>
        <button
          className={tab === 'appointments' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('appointments')}
        >
          <CalendarDays size={16} />
          &nbsp;Agenda
        </button>
        <button
          className={tab === 'intakes' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('intakes')}
        >
          <ClipboardList size={16} />
          &nbsp;Registros
        </button>
        <button
          className={tab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('settings')}
        >
          <SettingsIcon size={16} />
          &nbsp;Settings
        </button>
      </nav>
    </>
  );
};

export default NavBar;
