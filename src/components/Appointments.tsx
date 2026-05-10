import React, { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { dbService } from '../../services/db';
import { startOfWeekIso, endOfWeekIso } from './utils';
import type { Appointment, Patient, SiceSettings } from './types';

// ── helpers ──────────────────────────────────────────────────────────
const fmtDateShort = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};
const toLocalDatetime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const statusLabel: Record<string, string> = {
  scheduled: 'Programada',
  done: 'Realizada',
  cancelled: 'Cancelada',
};

// ── empty draft ──────────────────────────────────────────────────────
const emptyDraft = (): Partial<Appointment> => ({
  title: '',
  patientId: '',
  start: '',
  end: '',
  status: 'scheduled',
  notes: '',
});

const Appointments: React.FC = () => {
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptDraft, setApptDraft] = useState<Partial<Appointment>>(emptyDraft());
  const [patients, setPatients] = useState<Patient[]>([]);
  const [settings, setSettings] = useState<SiceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── week range ─────────────────────────────────────────────────────
  const weekStart = useMemo(() => startOfWeekIso(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => endOfWeekIso(weekAnchor), [weekAnchor]);

  // ── navigation ─────────────────────────────────────────────────────
  const nav = (days: number) => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + days);
    setWeekAnchor(d);
  };

  // ── watch appointments ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = dbService.watchAppointments({ startIso: weekStart, endIso: weekEnd }, (list) => {
      setAppointments(list || []);
    });
    return () => unsub?.();
  }, [weekStart, weekEnd]);

  // ── watch patients ─────────────────────────────────────────────────
  useEffect(() => {
    dbService.watchPatients((list) => setPatients(list || []));
  }, []);

  // ── watch settings ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = dbService.watchSiceSettings((s) => setSettings(s));
    return () => unsub?.();
  }, []);

  // ── filtered patients ──────────────────────────────────────────────
  const patientOptions = useMemo(
    () => patients.filter((p) => p.name?.trim()),
    [patients],
  );

  // ── handlers ───────────────────────────────────────────────────────
  const handleEdit = (a: Appointment) => {
    setApptDraft({
      id: a.id,
      title: a.title || '',
      patientId: a.patientId || '',
      start: toLocalDatetime(a.start),
      end: toLocalDatetime(a.end),
      status: a.status || 'scheduled',
      notes: a.notes || '',
    });
  };

  const handleClear = () => {
    setApptDraft(emptyDraft());
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      await dbService.upsertAppointment({ id, _deleted: true } as any);
    } catch (e: any) {
      setError(e?.message || 'Error al eliminar');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!apptDraft.title?.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!apptDraft.start || !apptDraft.end) {
      setError('Define inicio y fin de la cita.');
      return;
    }
    setSaving(true);
    try {
      const id = await dbService.upsertAppointment(apptDraft);
      // calendar webhook
      if (settings?.calendarWebhookUrl) {
        await dbService.callCalendarWebhook(settings.calendarWebhookUrl, settings.calendarWebhookSecret || '', id);
      }
      handleClear();
    } catch (e: any) {
      setError(e?.message || 'Error al guardar la cita.');
    } finally {
      setSaving(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>
      {/* ── header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Agenda</h2>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-outline" onClick={() => nav(-7)}>← Anterior</button>
          <button className="btn btn-outline" onClick={() => setWeekAnchor(new Date())}>Hoy</button>
          <button className="btn btn-outline" onClick={() => nav(7)}>Siguiente →</button>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: 16, fontSize: 14 }}>
        {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}
      </p>

      {/* ── appointment list ────────────────────────────────────────── */}
      {appointments.length === 0 ? (
        <p className="muted" style={{ padding: 24, textAlign: 'center' }}>
          No hay citas esta semana.
        </p>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
                <th style={{ padding: '8px 4px' }}>Fecha</th>
                <th style={{ padding: '8px 4px' }}>Hora</th>
                <th style={{ padding: '8px 4px' }}>Título</th>
                <th style={{ padding: '8px 4px' }}>Paciente</th>
                <th style={{ padding: '8px 4px' }}>Estatus</th>
                <th style={{ padding: '8px 4px', width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => handleEdit(a)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border, #e2e8f0)' }}
                  onMouseEnter={(ev) => {
                    (ev.currentTarget as HTMLElement).style.background = 'var(--hover, #f1f5f9)';
                  }}
                  onMouseLeave={(ev) => {
                    (ev.currentTarget as HTMLElement).style.background = '';
                  }}
                >
                  <td style={{ padding: '8px 4px' }}>{fmtDateShort(a.start)}</td>
                  <td style={{ padding: '8px 4px' }}>
                    {fmtTime(a.start)} – {fmtTime(a.end)}
                  </td>
                  <td style={{ padding: '8px 4px', fontWeight: 500 }}>{a.title}</td>
                  <td style={{ padding: '8px 4px' }}>{a.patientName || '—'}</td>
                  <td style={{ padding: '8px 4px' }}>
                    <span className={`pill pill-${a.status || 'scheduled'}`}>
                      {statusLabel[a.status || 'scheduled'] || a.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <button
                      className="btn btn-icon btn-danger"
                      title="Eliminar"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleDelete(a.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── create / edit form ──────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>
          {apptDraft.id ? 'Editar cita' : 'Nueva cita'}
        </h3>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* título */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Título
            <input
              className="input"
              value={apptDraft.title || ''}
              onChange={(e) => setApptDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Ej. Consulta general"
            />
          </label>

          {/* paciente */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Paciente
            <select
              className="input"
              value={apptDraft.patientId || ''}
              onChange={(e) => setApptDraft((d) => ({ ...d, patientId: e.target.value }))}
            >
              <option value="">— Seleccionar —</option>
              {patientOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* inicio / fin */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Inicio
              <input
                className="input"
                type="datetime-local"
                value={toLocalDatetime(apptDraft.start || '')}
                onChange={(e) => {
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    setApptDraft((prev) => ({ ...prev, start: d.toISOString() }));
                  }
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Fin
              <input
                className="input"
                type="datetime-local"
                value={toLocalDatetime(apptDraft.end || '')}
                onChange={(e) => {
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    setApptDraft((prev) => ({ ...prev, end: d.toISOString() }));
                  }
                }}
              />
            </label>
          </div>

          {/* estatus */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Estatus
            <select
              className="input"
              value={apptDraft.status || 'scheduled'}
              onChange={(e) => setApptDraft((d) => ({ ...d, status: e.target.value as any }))}
            >
              <option value="scheduled">Programada</option>
              <option value="done">Realizada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>

          {/* notas */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Notas
            <textarea
              className="input"
              rows={3}
              value={apptDraft.notes || ''}
              onChange={(e) => setApptDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="btn btn-outline" type="button" onClick={handleClear}>
              Limpiar
            </button>
            {apptDraft.id && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  if (apptDraft.id) handleDelete(apptDraft.id);
                }}
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Appointments;
