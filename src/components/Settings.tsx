import React, { useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import { dbService } from '../../services/db';
import { changeOwnPassword, validatePasswordStrength } from '../../services/db';
import { fileToDataUrl } from './utils';
import type { SiceSettings } from './types';

// ── empty settings fallback ──────────────────────────────────────────
const defaultSettings: SiceSettings = {
  id: 'global',
  themeColor: '#0ea5e9',
  logoDataUrl: '',
  calendarWebhookUrl: '',
  calendarWebhookSecret: '',
  calendarInvitePatient: true,
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SiceSettings>(defaultSettings);
  const [draft, setDraft] = useState<SiceSettings>(defaultSettings);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ── password change modal ──────────────────────────────────────────
  const [pwModal, setPwModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // ── watch ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = dbService.watchSiceSettings((s) => {
      if (s) {
        setSettings(s);
        setDraft(s);
      }
    });
    return () => unsub?.();
  }, []);

  // ── handlers ───────────────────────────────────────────────────────
  const update = (patch: Partial<SiceSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const handleSaveSettings = async () => {
    setErr('');
    setMsg('');
    try {
      await dbService.updateSiceSettings(draft);
      setMsg('Configuración guardada.');
    } catch (e: any) {
      setErr(e?.message || 'Error al guardar.');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      update({ logoDataUrl: dataUrl });
    } catch {
      setErr('Error al leer la imagen.');
    }
  };

  const handleRemoveLogo = () => {
    update({ logoDataUrl: '' });
  };

  const openPasswordModal = () => {
    setPwCurrent('');
    setPwNew('');
    setPwErr('');
    setPwModal(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr('');

    const issues = validatePasswordStrength(pwNew);
    if (issues.length > 0) {
      setPwErr(issues.join(' '));
      return;
    }

    setPwSaving(true);
    try {
      await changeOwnPassword(pwCurrent, pwNew);
      setPwModal(false);
      setMsg('Contraseña actualizada.');
    } catch (error: any) {
      setPwErr(error?.message || 'Error al cambiar la contraseña.');
    } finally {
      setPwSaving(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 style={{ fontSize: 20, marginBottom: 20 }}>Configuración</h2>

      {msg && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* ── Branding ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12, borderBottom: '2px solid var(--border, #e2e8f0)', paddingBottom: 8 }}>
          Branding
        </h3>

        {/* color picker */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 16 }}>
          Color del tema
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={draft.themeColor}
              onChange={(e) => update({ themeColor: e.target.value })}
              style={{ width: 40, height: 40, border: 'none', cursor: 'pointer', padding: 0 }}
            />
            <input
              className="input"
              value={draft.themeColor}
              onChange={(e) => update({ themeColor: e.target.value })}
              style={{ maxWidth: 120 }}
            />
          </div>
        </label>

        {/* logo */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Logo
        </label>
        {draft.logoDataUrl && (
          <div style={{ marginBottom: 8 }}>
            <img
              src={draft.logoDataUrl}
              alt="Logo"
              style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <label className="btn btn-outline" style={{ cursor: 'pointer', fontSize: 13 }}>
            Subir logo
            <input type="file" accept="image/*" hidden onChange={handleLogoUpload} />
          </label>
          {draft.logoDataUrl && (
            <button className="btn btn-outline" onClick={handleRemoveLogo} type="button">
              Quitar logo
            </button>
          )}
        </div>
      </section>

      {/* ── Google Calendar ────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12, borderBottom: '2px solid var(--border, #e2e8f0)', paddingBottom: 8 }}>
          Automatización Google Calendar
        </h3>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 12 }}>
          Webhook URL
          <input
            className="input"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={draft.calendarWebhookUrl || ''}
            onChange={(e) => update({ calendarWebhookUrl: e.target.value })}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 12 }}>
          Secret
          <input
            className="input"
            type="password"
            placeholder="Token compartido"
            value={draft.calendarWebhookSecret || ''}
            onChange={(e) => update({ calendarWebhookSecret: e.target.value })}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.calendarInvitePatient ?? true}
            onChange={(e) => update({ calendarInvitePatient: e.target.checked })}
          />
          Invitar al paciente al evento de Google Calendar
        </label>
      </section>

      {/* ── Cuenta ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12, borderBottom: '2px solid var(--border, #e2e8f0)', paddingBottom: 8 }}>
          Cuenta
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13 }}>
            <span className="muted">Nombre: </span>
            <span style={{ fontWeight: 500 }}>{settings?.id || '—'}</span>
          </div>
          <div style={{ fontSize: 13 }}>
            <span className="muted">Unidad: </span>
            <span style={{ fontWeight: 500 }}>{settings?.id || '—'}</span>
          </div>
          <button
            className="btn btn-outline"
            type="button"
            onClick={openPasswordModal}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          >
            <KeyRound size={16} style={{ marginRight: 6 }} />
            Cambiar contraseña
          </button>
        </div>
      </section>

      {/* ── global save ────────────────────────────────────────────── */}
      <button className="btn btn-primary" onClick={handleSaveSettings} type="button">
        Guardar configuración
      </button>

      {/* ── password modal ─────────────────────────────────────────── */}
      {pwModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setPwModal(false)}
        >
          <div
            style={{
              background: 'var(--bg, #fff)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Cambiar contraseña</h3>

            {pwErr && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                {pwErr}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* current */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Contraseña actual
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    className="input"
                    type={pwShowCurrent ? 'text' : 'password'}
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => setPwShowCurrent((v) => !v)}
                  >
                    {pwShowCurrent ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </label>

              {/* new */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Nueva contraseña
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    className="input"
                    type={pwShowNew ? 'text' : 'password'}
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => setPwShowNew((v) => !v)}
                  >
                    {pwShowNew ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </label>

              <p className="muted" style={{ fontSize: 12 }}>
                Mínimo 10 caracteres: mayúscula, minúscula, número y carácter especial.
              </p>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPwModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                  {pwSaving ? 'Actualizando…' : 'Cambiar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
