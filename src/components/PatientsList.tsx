import React, { useEffect, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { formatCurrency } from './utils';
import { siceService } from '../../services/sice';
import { dbService } from '../../services/db';
import type { Patient, Sale, CatalogItem } from './types';

const PatientsList: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Patient>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });

  const [patientSales, setPatientSales] = useState<Sale[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);

  // ---- Watchers ----
  useEffect(() => {
    const unsub1 = siceService.watchPatients(setPatients);
    const unsub2 = siceService.watchCatalogItems(setCatalogItems);
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    if (!selectedId) { setPatientSales([]); return; }
    const unsub = siceService.watchSalesByPatient(selectedId, setPatientSales);
    return () => unsub();
  }, [selectedId]);

  // ---- Derived ----
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return patients;
    return patients.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.phone || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s)
    );
  }, [patients, search]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId]
  );

  const emailDuplicates = useMemo(() => {
    const map = new Map<string, Patient[]>();
    for (const p of patients) {
      const e = (p.email || '').trim().toLowerCase();
      if (!e) continue;
      if (!map.has(e)) map.set(e, []);
      map.get(e)!.push(p);
    }
    const dups = new Set<string>();
    for (const [e, list] of map) {
      if (list.length > 1) {
        const keeper = list.reduce((a, b) =>
          (a.createdAt ?? '') < (b.createdAt ?? '') ? a : b
        );
        for (const p of list) {
          if (p.id !== keeper.id) dups.add(p.id);
        }
      }
    }
    return dups;
  }, [patients]);

  // ---- Form sync ----
  useEffect(() => {
    if (selectedPatient) {
      setForm({
        name: selectedPatient.name || '',
        phone: selectedPatient.phone || '',
        email: selectedPatient.email || '',
        address: selectedPatient.address || '',
        notes: selectedPatient.notes || ''
      });
    }
  }, [selectedPatient]);

  // ---- Actions ----
  const clearForm = () => {
    setSelectedId(null);
    setForm({ name: '', phone: '', email: '', address: '', notes: '' });
  };

  const handleSave = async () => {
    const name = (form.name || '').trim();
    if (!name) return;

    // Duplicate detection by email
    const email = (form.email || '').trim().toLowerCase();
    if (email) {
      const existing = patients.find(
        (p) => p.email?.trim().toLowerCase() === email && p.id !== selectedId
      );
      if (existing) {
        const ok = window.confirm(
          `Ya existe un paciente con el email "${email}": ${existing.name}. ¿Deseas eliminarlo y continuar?`
        );
        if (ok) {
          await siceService.deletePatient(existing.id);
        } else {
          return;
        }
      }
    }

    try {
      await siceService.upsertPatient({
        id: selectedId || undefined,
        name,
        phone: (form.phone || '').trim(),
        email,
        address: (form.address || '').trim(),
        notes: (form.notes || '').trim()
      });
      clearForm();
    } catch (err: any) {
      alert('Error al guardar: ' + (err?.message ?? err));
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm(`¿Eliminar a "${selectedPatient?.name}"?`)) return;
    try {
      await siceService.deletePatient(selectedId);
      clearForm();
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message ?? err));
    }
  };

  // Sales helpers
  const lastSales = useMemo(() => patientSales.slice(0, 10), [patientSales]);

  const templateItems = useMemo(
    () => catalogItems.filter((c) => c.isTemplate),
    [catalogItems]
  );

  const templateSales = useMemo(() => {
    const tids = new Set(templateItems.map((t) => t.id));
    return patientSales.filter((s) =>
      (s.items || []).some((it) => it.catalogItemId && tids.has(it.catalogItemId))
    );
  }, [patientSales, templateItems]);

  // ===================== RENDER =====================
  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>
      {/* LEFT: Patient list */}
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 8, padding: '4px 12px' }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Buscar paciente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 14 }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                padding: 10,
                borderRadius: 8,
                cursor: 'pointer',
                background: selectedId === p.id ? '#dbeafe' : '#fff',
                border: selectedId === p.id ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                fontSize: 13
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.name}</span>
                {emailDuplicates.has(p.id) && (
                  <span title="Email duplicado" style={{ color: '#ef4444', fontSize: 11 }}>⚠️</span>
                )}
              </div>
              {p.phone && <div style={{ color: '#64748b', fontSize: 12 }}>📞 {p.phone}</div>}
              {p.email && <div style={{ color: '#64748b', fontSize: 12 }}>✉️ {p.email}</div>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>
              No hay pacientes
            </div>
          )}
        </div>

        <button
          onClick={clearForm}
          style={{
            padding: '8px 16px',
            border: '1px solid #3b82f6',
            background: '#fff',
            color: '#3b82f6',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13
          }}
        >
          ＋ Nuevo paciente
        </button>
      </div>

      {/* RIGHT: Form + History */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* FORM */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
            {selectedId ? 'Editar paciente' : 'Nuevo paciente'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Nombre *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Teléfono</label>
              <input
                type="text"
                value={form.phone || ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Dirección</label>
              <input
                type="text"
                value={form.address || ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 20px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13
              }}
            >
              💾 Guardar
            </button>
            <button
              onClick={clearForm}
              style={{
                padding: '8px 20px',
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13
              }}
            >
              🧹 Limpiar
            </button>
            {selectedId && (
              <button
                onClick={handleDelete}
                style={{
                  padding: '8px 20px',
                  background: '#fef2f2',
                  color: '#ef4444',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Trash2 size={14} /> Eliminar
              </button>
            )}
          </div>
        </div>

        {/* SALES HISTORY */}
        {selectedId && (
          <div style={{
            flex: 1,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
              📊 Histórico de ventas — {selectedPatient?.name}
            </div>

            {lastSales.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 24 }}>
                Sin ventas registradas
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Summary cards */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Total compras</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#16a34a' }}>
                      {formatCurrency(lastSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0))}
                    </div>
                  </div>
                  <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Última compra</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#2563eb' }}>
                      {lastSales[0]?.folio ?? '—'}
                    </div>
                  </div>
                  {templateSales.length > 0 && (
                    <div style={{ background: '#fefce8', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Plantillas</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#ca8a04' }}>
                        {templateSales.length} venta(s)
                      </div>
                    </div>
                  )}
                </div>

                {/* Next renewal */}
                {(() => {
                  const lastTemplateSale = templateSales[0];
                  if (!lastTemplateSale) return null;
                  const estDate = lastTemplateSale.deliveryEstimatedAt || lastTemplateSale.createdAt;
                  const renewal = (() => {
                    const d = new Date(estDate);
                    d.setMonth(d.getMonth() + 11);
                    return d;
                  })();
                  return (
                    <div style={{ background: '#fefce8', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                      🔄 Próxima renovación estimada:{' '}
                      <strong>{renewal.toLocaleDateString('es-MX')}</strong>
                      {' '}(basado en venta {lastTemplateSale.folio})
                    </div>
                  );
                })()}

                {/* Sales table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>Folio</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>Conceptos</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>Total</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>Estado</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastSales.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b' }}>{s.folio}</td>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>
                          {(s.items || []).map((it) => it.name).join(', ')}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#16a34a' }}>
                          {formatCurrency(Number(s.total) || 0)}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {s.delivered ? (
                            <span style={{ color: '#16a34a', fontSize: 11 }}>✅ Entregado</span>
                          ) : (
                            <span style={{ color: '#f59e0b', fontSize: 11 }}>⏳ Pendiente</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: 11 }}>
                          {new Date(s.createdAt).toLocaleDateString('es-MX')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientsList;
