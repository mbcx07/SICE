import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import {
  loginWithMatricula,
  ensureSession,
  logoutSession,
  changeOwnPassword,
  validatePasswordStrength,
  AuthError,
  dbService
} from '../../services/db';

interface AuthScreenProps {
  onLogin: (user: any) => void;
  logoUrl: string;
  isPublicRegister: boolean;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, logoUrl, isPublicRegister }) => {
  // Login state
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Change password modal
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpShowNew, setCpShowNew] = useState(false);

  // Public intake
  const [intakeDraft, setIntakeDraft] = useState<{
    fullName: string;
    phone: string;
    email: string;
    residence: string;
  }>({ fullName: '', phone: '', email: '', residence: '' });
  const [intakeSent, setIntakeSent] = useState(false);
  const [intakeSending, setIntakeSending] = useState(false);

  const doLogin = async () => {
    try {
      setError(null);
      setUiMessage(null);
      setLoading(true);
      const rawU = matricula.trim();
      const mappedU =
        rawU.toLowerCase() === 'luisana'
          ? 'dgnstcspprtdlnrst@gmail.com'
          : rawU;
      const profile = await loginWithMatricula(mappedU, password.trim());
      onLogin(profile);
      setPassword('');
    } catch (e: any) {
      if (e instanceof AuthError) setError(e.message);
      else setError(e?.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const doChangePassword = async () => {
    try {
      const issues = validatePasswordStrength(cpNew);
      const strengthOk =
        !Array.isArray(issues) || issues.length === 0;

      if (!strengthOk) {
        const msg = Array.isArray(issues) ? issues.join(' ') : 'Contraseña insegura.';
        return setUiMessage(msg);
      }
      await changeOwnPassword(cpCurrent, cpNew);
      setUiMessage('Contraseña actualizada.');
      setShowChangePassword(false);
      setCpCurrent('');
      setCpNew('');
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo cambiar contraseña.');
    }
  };

  // ============ Public Register View ============
  if (isPublicRegister) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 520, margin: '48px auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                style={{ height: 48, width: 48, objectFit: 'contain' }}
              />
            ) : null}
            <div>
              <h2 style={{ margin: 0 }}>Diagnostic Support del Noroeste</h2>
              <div className="muted">Registro de paciente</div>
            </div>
          </div>

          <div style={{ height: 18 }} />

          {intakeSent ? (
            <div
              className="card"
              style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}
            >
              <div style={{ fontWeight: 800 }}>Listo</div>
              <div className="muted">
                Tu información fue enviada correctamente.
              </div>
            </div>
          ) : (
            <>
              <label className="label">Nombre completo</label>
              <input
                className="input"
                value={intakeDraft.fullName}
                onChange={(e) =>
                  setIntakeDraft((s) => ({ ...s, fullName: e.target.value }))
                }
              />

              <div style={{ height: 12 }} />
              <label className="label">Número de celular</label>
              <input
                className="input"
                value={intakeDraft.phone}
                onChange={(e) =>
                  setIntakeDraft((s) => ({ ...s, phone: e.target.value }))
                }
              />

              <div style={{ height: 12 }} />
              <label className="label">Correo electrónico</label>
              <input
                className="input"
                value={intakeDraft.email}
                onChange={(e) =>
                  setIntakeDraft((s) => ({ ...s, email: e.target.value }))
                }
              />

              <div style={{ height: 12 }} />
              <label className="label">Lugar de residencia</label>
              <input
                className="input"
                value={intakeDraft.residence}
                onChange={(e) =>
                  setIntakeDraft((s) => ({ ...s, residence: e.target.value }))
                }
              />

              {uiMessage ? (
                <div
                  className="toast"
                  style={{ position: 'static', marginTop: 12 }}
                >
                  {uiMessage}
                </div>
              ) : null}

              <div style={{ height: 14 }} />
              <button
                className="btnPrimary"
                disabled={intakeSending}
                onClick={async () => {
                  const fullName = intakeDraft.fullName.trim();
                  const phone = intakeDraft.phone.trim();
                  const email = intakeDraft.email.trim();
                  const residence = intakeDraft.residence.trim();
                  if (!fullName || !phone || !email || !residence) {
                    setUiMessage('Completa todos los campos.');
                    return;
                  }
                  try {
                    setIntakeSending(true);
                    setUiMessage(null);
                    await dbService.createIntake({
                      fullName,
                      phone,
                      email,
                      residence
                    });
                    setIntakeSent(true);
                  } catch (e: any) {
                    setUiMessage(e?.message || 'No se pudo enviar.');
                  } finally {
                    setIntakeSending(false);
                  }
                }}
              >
                {intakeSending ? 'Enviando…' : 'Enviar'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============ Login View ============
  return (
    <div className="appShell">
      <div className="card" style={{ maxWidth: 460, margin: '64px auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              style={{ height: 48, width: 48, objectFit: 'contain' }}
            />
          ) : null}
          <div>
            <h2 style={{ margin: 0 }}>Diagnostic Support del Noroeste</h2>
            <div className="muted">Acceso</div>
          </div>
        </div>

        <div style={{ height: 16 }} />
        <label className="label">Usuario</label>
        <input
          className="input"
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          placeholder="Nombre"
        />

        <div style={{ height: 12 }} />
        <label className="label">Contraseña</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
          />
          <button
            className="btn"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            onClick={() => setShowPassword((s) => !s)}
            style={{
              width: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error ? (
          <div className="errorBox" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <div style={{ height: 12 }} />
        <button
          className="btnPrimary"
          onClick={doLogin}
          disabled={!matricula.trim() || !password || loading}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </div>

      {/* Change Password Modal */}
      {showChangePassword ? (
        <div
          className="modalOverlay"
          onClick={() => setShowChangePassword(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cambiar contraseña</h3>
            <label className="label">Actual</label>
            <input
              className="input"
              type="password"
              value={cpCurrent}
              onChange={(e) => setCpCurrent(e.target.value)}
            />
            <div style={{ height: 10 }} />
            <label className="label">Nueva</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                type={cpShowNew ? 'text' : 'password'}
                value={cpNew}
                onChange={(e) => setCpNew(e.target.value)}
              />
              <button
                className="btn"
                aria-label={cpShowNew ? 'Ocultar contraseña' : 'Ver contraseña'}
                title={cpShowNew ? 'Ocultar contraseña' : 'Ver contraseña'}
                onClick={() => setCpShowNew((s) => !s)}
                style={{
                  width: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {cpShowNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {uiMessage ? (
              <div className="toast" style={{ position: 'static', marginTop: 10 }}>
                {uiMessage}
              </div>
            ) : null}
            <div style={{ height: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setShowChangePassword(false)}
              >
                Cancelar
              </button>
              <button
                className="btnPrimary"
                onClick={doChangePassword}
                disabled={!cpCurrent || !cpNew}
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AuthScreen;
