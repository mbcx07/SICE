import React, { useState, useEffect } from 'react';
import { dbService } from '../../services/db';
import type { IntakeRequest, Patient } from './types';

// ── helpers ──────────────────────────────────────────────────────────
const statusPillClass: Record<string, string> = {
  new: 'pill-new',
  approved: 'pill-approved',
  rejected: 'pill-rejected',
};
const statusLabel: Record<string, string> = {
  new: 'Nuevo',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const emptyForm = () => ({
  fullName: '',
  phone: '',
  email: '',
  residence: '',
});

// ── public registration form ─────────────────────────────────────────
const PublicRegistration: React.FC = () => {
  const [form, setForm] = useState(emptyForm());
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim() || !form.phone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    setLoading(true);
    try {
      await dbService.createIntake(form);
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Error al enviar.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', padding: 32, textAlign: 'center' }}>
        <h2>¡Gracias!</h2>
        <p style={{ marginTop: 12, color: 'var(--muted)' }}>
          Hemos recibido tu información. Te contactaremos pronto.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Registro</h2>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>
        Déjanos tus datos y nos pondremos en contacto contigo.
      </p>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Nombre completo
          <input className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Teléfono
          <input className="input" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Email
          <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Residencia
          <input className="input" value={form.residence} onChange={(e) => setForm((f) => ({ ...f, residence: e.target.value }))} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
};

// ── admin panel ──────────────────────────────────────────────────────
const AdminPanel: React.FC = () => {
  const [records, setRecords] = useState<IntakeRequest[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<IntakeRequest | null>(null);
  const [editForm, setEditForm] = useState<IntakeRequest | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = dbService.watchIntakes((list) => setRecords(list || []));
    return () => unsub?.();
  }, []);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.fullName?.toLowerCase().includes(q) ||
      r.phone?.includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.residence?.toLowerCase().includes(q)
    );
  });

  const publicUrl = `${window.location.origin}${window.location.pathname}#registro`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicUrl).catch(() => {});
  };

  const openEdit = (r: IntakeRequest) => {
    setEditing(r);
    setEditForm({ ...r });
    setError('');
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    try {
      await dbService.updateIntake(editForm.id, editForm);
      closeEdit();
    } catch (e: any) {
      setError(e?.message || 'Error al guardar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      await dbService.deleteIntake(id);
    } catch (e: any) {
      setError(e?.message || 'Error al eliminar.');
    }
  };

  const handleApprove = async (r: IntakeRequest) => {
    if (!confirm(`¿Aprobar y crear paciente para "${r.fullName}"?`)) return;
    try {
      const patient: Partial<Patient> = {
        name: r.fullName,
        phone: r.phone,
        email: r.email,
        address: r.residence,
      };
      await dbService.upsertPatient({ name: patient.name, phone: patient.phone, email: patient.email, address: patient.address });
      await dbService.updateIntake(r.id, { status: 'approved', approvedAt: new Date().toISOString() });
    } catch (e: any) {
      setError(e?.message || 'Error al aprobar.');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await dbService.updateIntake(id, { status: 'rejected' });
    } catch (e: any) {
      setError(e?.message || 'Error al rechazar.');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Solicitudes de Contacto</h2>

      {/* ── toolbar ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          Total: {filtered.length}
        </span>
        <button className="btn btn-outline" onClick={copyPublicUrl} style={{ marginLeft: 'auto', fontSize: 13 }}>
          📋 Copiar enlace público
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── list ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Sin registros.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
              <th style={{ padding: '8px 4px' }}>Nombre</th>
              <th style={{ padding: '8px 4px' }}>Teléfono</th>
              <th style={{ padding: '8px 4px' }}>Email</th>
              <th style={{ padding: '8px 4px' }}>Residencia</th>
              <th style={{ padding: '8px 4px' }}>Estatus</th>
              <th style={{ padding: '8px 4px', width: 180 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <td style={{ padding: '8px 4px', fontWeight: 500 }}>{r.fullName}</td>
                <td style={{ padding: '8px 4px' }}>{r.phone}</td>
                <td style={{ padding: '8px 4px' }}>{r.email}</td>
                <td style={{ padding: '8px 4px' }}>{r.residence}</td>
                <td style={{ padding: '8px 4px' }}>
                  <span className={`pill ${statusPillClass[r.status || 'new'] || 'pill-new'}`}>
                    {statusLabel[r.status || 'new'] || r.status}
                  </span>
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>Eliminar</button>
                    {r.status === 'new' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(r)}>Aprobar</button>
                        <button className="btn btn-sm btn-outline" onClick={() => handleReject(r.id)}>Rechazar</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── edit modal ─────────────────────────────────────────────── */}
      {editing && editForm && (
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
          onClick={closeEdit}
        >
          <div
            style={{
              background: 'var(--bg, #fff)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Editar registro</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Nombre
                <input
                  className="input"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => f && { ...f, fullName: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Teléfono
                <input
                  className="input"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Email
                <input
                  className="input"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => f && { ...f, email: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Residencia
                <input
                  className="input"
                  value={editForm.residence}
                  onChange={(e) => setEditForm((f) => f && { ...f, residence: e.target.value })}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={closeEdit}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── main component ───────────────────────────────────────────────────
const IntakeManager: React.FC = () => {
  const isPublic = typeof window !== 'undefined' && window.location.hash.includes('registro');

  return isPublic ? <PublicRegistration /> : <AdminPanel />;
};

export default IntakeManager;
