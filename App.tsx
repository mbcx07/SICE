import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  ensureSession,
  loginWithMatricula,
  logoutSession,
  changeOwnPassword,
  validatePasswordStrength,
  AuthError,
  dbService
} from './services/db';
import type { Appointment, CatalogItem, Patient, Sale, SaleLineItem, SiceSettings, User } from './types';
import { CalendarDays, LogOut, Settings as SettingsIcon, Users, ShoppingCart, Package, KeyRound, Printer, Trash2, PlusCircle, Search } from 'lucide-react';

type Tab = 'patients' | 'sales' | 'appointments' | 'settings';

const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clampColor = (v: string) => (String(v || '').trim() || '#0ea5e9');

function startOfWeekIso(d: Date) {
  const dd = new Date(d);
  const day = dd.getDay(); // 0 Sunday
  const diff = (day === 0 ? -6 : 1) - day; // make Monday
  dd.setDate(dd.getDate() + diff);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString();
}

function endOfWeekIso(d: Date) {
  const dd = new Date(d);
  const day = dd.getDay();
  const diff = (day === 0 ? 0 : 7 - day);
  dd.setDate(dd.getDate() + diff);
  dd.setHours(23, 59, 59, 999);
  return dd.toISOString();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addMonthsIso(baseIso: string, months: number): string {
  const d = new Date(baseIso);
  if (!Number.isFinite(d.getTime())) return baseIso;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // handle month rollover (e.g. Jan 31 + 1 month)
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d.toISOString();
}

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('patients');
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);

  // settings
  const [settings, setSettings] = useState<SiceSettings>({ id: 'global', themeColor: '#2b5ea7', calendarInvitePatient: true });
  const defaultLogoUrl = '/diagnostic-support-del-noroeste.jpg';

  // patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientDraft, setPatientDraft] = useState<Partial<Patient>>({});

  // catalog
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogDraft, setCatalogDraft] = useState<Partial<CatalogItem>>({ type: 'product', active: true });

  // sales
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleDraft, setSaleDraft] = useState<{
    patientId?: string;
    patientName?: string;
    deliveryEstimatedAt?: string;
    invoiceRequired?: boolean;
    delivered?: boolean;
    providerPaid?: boolean;
    providerDue?: number;
    shipping: number; // charge
    shippingCost: number; // cost
    ivaRate: number;
    notes?: string;
    items: SaleLineItem[];
  }>(() => ({ shipping: 0, shippingCost: 0, ivaRate: 0.16, invoiceRequired: false, delivered: false, providerPaid: false, providerDue: 0, items: [{ name: '', qty: 1, unitPrice: 0, unitCost: 0 }] }));
  const [salePrintTarget, setSalePrintTarget] = useState<Sale | null>(null);

  // appointments
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptDraft, setApptDraft] = useState<Partial<Appointment>>({ status: 'scheduled' });

  // auth UI
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpShowNew, setCpShowNew] = useState(false);

  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsub = dbService.watchSiceSettings(setSettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', clampColor(settings.themeColor));
  }, [settings.themeColor]);

  const resolvedLogo = settings.logoDataUrl ? settings.logoDataUrl : defaultLogoUrl;

  useEffect(() => {
    if (!user) return;
    const unsubPatients = dbService.watchPatients(setPatients);
    const unsubCatalog = dbService.watchCatalogItems(setCatalog);

    const year = new Date().getFullYear();
    let unsubSales: null | (() => void) = null;
    void (async () => {
      unsubSales = await dbService.watchSales(year, setSales);
    })();

    const range = { startIso: startOfWeekIso(weekAnchor), endIso: endOfWeekIso(weekAnchor) };
    const unsubAppts = dbService.watchAppointments(range, setAppointments);

    return () => {
      unsubPatients();
      unsubCatalog();
      if (unsubSales) unsubSales();
      unsubAppts();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const range = { startIso: startOfWeekIso(weekAnchor), endIso: endOfWeekIso(weekAnchor) };
    const unsub = dbService.watchAppointments(range, setAppointments);
    return () => unsub();
  }, [weekAnchor, user]);

  const filteredPatients = useMemo(() => {
    const s = patientSearch.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter((p) => {
      const hay = `${p.name || ''} ${p.phone || ''} ${p.email || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [patients, patientSearch]);

  const patientById = useMemo(() => {
    const m = new Map<string, Patient>();
    for (const p of patients) m.set(p.id, p);
    return m;
  }, [patients]);

  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  const salePreview = useMemo(() => {
    const itemsSubtotal = (saleDraft.items || []).reduce((acc, it) => acc + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
    const shipping = Number(saleDraft.shipping || 0);
    const subtotal = Math.max(0, itemsSubtotal + shipping);
    const ivaRate = Number(saleDraft.ivaRate ?? 0.16);
    const iva = Math.max(0, subtotal * ivaRate);
    const total = subtotal + iva;
    const itemsCost = (saleDraft.items || []).reduce((acc, it) => acc + Number(it.qty || 0) * Number(it.unitCost || 0), 0);
    const costTotal = itemsCost + Math.max(0, Number(saleDraft.shippingCost || 0));
    const profit = total - costTotal;
    return { itemsSubtotal, subtotal, iva, total, costTotal, profit };
  }, [saleDraft]);

  const doLogin = async () => {
    try {
      setError(null);
      setUiMessage(null);
      setLoading(true);
      const profile = await loginWithMatricula(matricula, password);
      setUser(profile);
      setTab('patients');
      setPassword('');
    } catch (e: any) {
      if (e instanceof AuthError) setError(e.message);
      else setError(e?.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const doLogout = async () => {
    try {
      setLoading(true);
      await logoutSession();
      setUser(null);
      setMatricula('');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const savePatient = async () => {
    const name = String(patientDraft.name || '').trim();
    if (!name) return setUiMessage('Nombre es requerido.');
    setUiMessage(null);
    try {
      await dbService.upsertPatient({ ...patientDraft, name } as any);
      setPatientDraft({});
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo guardar paciente.');
    }
  };

  const saveCatalog = async () => {
    const name = String(catalogDraft.name || '').trim();
    if (!name) return setUiMessage('Nombre del producto/servicio es requerido.');
    try {
      await dbService.upsertCatalogItem({
        ...catalogDraft,
        name,
        unitPrice: Number(catalogDraft.unitPrice || 0),
        unitCost: Number(catalogDraft.unitCost || 0),
        active: catalogDraft.active !== false,
        type: catalogDraft.type === 'service' ? 'service' : 'product'
      } as any);
      setCatalogDraft({ type: 'product', active: true });
      setUiMessage('Guardado.');
      setTimeout(() => setUiMessage(null), 1500);
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo guardar en catálogo.');
    }
  };

  const addSaleLine = () => {
    setSaleDraft((s) => ({ ...s, items: [...(s.items || []), { name: '', qty: 1, unitPrice: 0, unitCost: 0 }] }));
  };

  const callCalendarWebhook = async (action: string, payload: any): Promise<{ ok: boolean; eventId?: string; htmlLink?: string; error?: string } | null> => {
    const url = String(settings.calendarWebhookUrl || '').trim();
    const secret = String(settings.calendarWebhookSecret || '').trim();
    if (!url || !secret) return null;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, action, payload })
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || `Webhook error (${res.status})`;
      throw new Error(msg);
    }
    return data;
  };

  const createSale = async () => {
    try {
      setUiMessage(null);
      if (!(saleDraft.items || []).some((x) => String(x.name || '').trim() && Number(x.qty || 0) > 0)) {
        return setUiMessage('Agrega al menos 1 concepto.');
      }
      const patientObj = saleDraft.patientId ? patientById.get(saleDraft.patientId) : null;
      const patientName = patientObj?.name || saleDraft.patientName || '';
      const deliveryEstimatedAt = saleDraft.deliveryEstimatedAt ? String(saleDraft.deliveryEstimatedAt) : '';

      const id = await dbService.createSale({
        patientId: saleDraft.patientId,
        patientName,
        patientEmail: patientObj?.email || '',
        patientPhone: patientObj?.phone || '',
        invoiceRequired: Boolean(saleDraft.invoiceRequired),
        delivered: Boolean(saleDraft.delivered),
        deliveryEstimatedAt,
        providerPaid: Boolean(saleDraft.providerPaid),
        providerDue: Number(saleDraft.providerDue || 0),
        items: saleDraft.items,
        shipping: Number(saleDraft.shipping || 0),
        shippingCost: Number(saleDraft.shippingCost || 0),
        ivaRate: Number(saleDraft.ivaRate ?? 0.16),
        notes: saleDraft.notes
      });

      // Follow-up: 11 months after estimated delivery
      if (deliveryEstimatedAt) {
        try {
          const followUpAt = addMonthsIso(deliveryEstimatedAt, 11);
          const resp = await callCalendarWebhook('createFollowUpEvent', {
            saleId: id,
            when: followUpAt,
            deliveryEstimatedAt,
            patientName,
            patientEmail: patientObj?.email || '',
            patientPhone: patientObj?.phone || '',
            title: `Seguimiento plantillas - ${patientName || 'Paciente'}`,
            description: `Diagnostic Support del Noroeste\nPaciente: ${patientName}\nTel: ${patientObj?.phone || ''}\nCorreo: ${patientObj?.email || ''}\nEntrega estimada: ${deliveryEstimatedAt}\n\nContacto: +52 612 169 2544`,
            invitePatient: settings.calendarInvitePatient === true
          });
          if (resp?.eventId) {
            await dbService.updateSale(id, { followUpAt, followUpCalendarEventId: resp.eventId } as any);
          } else {
            await dbService.updateSale(id, { followUpAt } as any);
          }
        } catch (err: any) {
          // Don't block the sale creation; show message.
          setUiMessage(`Venta registrada (${id}), pero no se pudo crear recordatorio: ${err?.message || err}`);
          setTimeout(() => setUiMessage(null), 5000);
        }
      }

      setUiMessage(`Venta registrada: ${id}`);
      setSaleDraft({ shipping: 0, shippingCost: 0, ivaRate: 0.16, invoiceRequired: false, delivered: false, providerPaid: false, providerDue: 0, items: [{ name: '', qty: 1, unitPrice: 0, unitCost: 0 }] });
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo registrar venta.');
    }
  };

  const saveAppointment = async () => {
    const title = String(apptDraft.title || '').trim();
    if (!title) return setUiMessage('Título es requerido.');
    if (!apptDraft.start || !apptDraft.end) return setUiMessage('Fecha/hora inicio y fin son requeridas.');
    const patientObj = apptDraft.patientId ? patientById.get(String(apptDraft.patientId)) : null;
    const patientName = patientObj?.name || apptDraft.patientName || '';
    const startIso = String(apptDraft.start);
    const endIso = String(apptDraft.end);

    try {
      const id = await dbService.upsertAppointment({
        ...apptDraft,
        title,
        start: startIso,
        end: endIso,
        patientName,
        patientEmail: patientObj?.email || '',
        patientPhone: patientObj?.phone || ''
      } as any);

      // Calendar automation
      try {
        const resp = await callCalendarWebhook('createAppointmentEvent', {
          appointmentId: id,
          patientName,
          patientEmail: patientObj?.email || '',
          patientPhone: patientObj?.phone || '',
          title: `Cita - ${patientName || title}`,
          start: startIso,
          end: endIso,
          description: `Diagnostic Support del Noroeste\nPaciente: ${patientName}\nTel: ${patientObj?.phone || ''}\nCorreo: ${patientObj?.email || ''}\n\n${String(apptDraft.notes || '')}`,
          invitePatient: settings.calendarInvitePatient === true
        });
        if (resp?.eventId) {
          await dbService.updateAppointment(id, { calendarEventId: resp.eventId } as any);
        }
      } catch (err: any) {
        // don't block
        setUiMessage(`Cita guardada, pero no se pudo crear evento en calendario: ${err?.message || err}`);
        setTimeout(() => setUiMessage(null), 5000);
      }

      setApptDraft({ status: 'scheduled' });
      setUiMessage('Cita guardada.');
      setTimeout(() => setUiMessage(null), 1500);
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo guardar cita.');
    }
  };

  const doPrintSale = (sale: Sale) => {
    setSalePrintTarget(sale);
    setTimeout(() => window.print(), 50);
  };

  const updateThemeColor = async (color: string) => {
    try {
      await dbService.updateSiceSettings({ themeColor: color });
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo actualizar color.');
    }
  };

  const updateLogo = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      // very rough safety cap
      if (dataUrl.length > 900_000) {
        return setUiMessage('Logo demasiado grande. Usa una imagen más pequeña (ideal < 300KB).');
      }
      await dbService.updateSiceSettings({ logoDataUrl: dataUrl });
      setUiMessage('Logo actualizado.');
      setTimeout(() => setUiMessage(null), 1500);
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo actualizar logo.');
    }
  };

  const doChangePassword = async () => {
    try {
      const strength = validatePasswordStrength(cpNew);
      if (!strength.ok) return setUiMessage(strength.message);
      await changeOwnPassword(cpCurrent, cpNew);
      setUiMessage('Contraseña actualizada.');
      setShowChangePassword(false);
      setCpCurrent('');
      setCpNew('');
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo cambiar contraseña.');
    }
  };

  if (loading && !user) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 420, margin: '64px auto' }}>
          <h2>SICE</h2>
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 460, margin: '64px auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {resolvedLogo ? <img src={resolvedLogo} alt="Logo" style={{ height: 48, width: 48, objectFit: 'contain' }} /> : null}
            <div>
              <h2 style={{ margin: 0 }}>SICE</h2>
              <div className="muted">Acceso</div>
            </div>
          </div>

          <div style={{ height: 16 }} />
          <label className="label">Matrícula</label>
          <input className="input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="99032103" />

          <div style={{ height: 12 }} />
          <label className="label">Contraseña</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            <button className="btn" onClick={() => setShowPassword((s) => !s)}>{showPassword ? 'Ocultar' : 'Ver'}</button>
          </div>

          {error ? <div className="errorBox" style={{ marginTop: 12 }}>{error}</div> : null}

          <div style={{ height: 16 }} />
          <button className="btnPrimary" onClick={doLogin} disabled={!matricula.trim() || !password}>Entrar</button>

          <div style={{ height: 10 }} />
          <div className="muted" style={{ fontSize: 12 }}>
            Tip: el color/branding se ajusta en <b>Settings</b> una vez dentro.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      {/* printable sale note */}
      <div className="printArea" ref={printRef}>
        {salePrintTarget ? (
          <div className="printNote">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {resolvedLogo ? <img src={resolvedLogo} alt="Logo" style={{ height: 52, width: 52, objectFit: 'contain' }} /> : null}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Nota de Venta</div>
                  <div className="muted">{salePrintTarget.folio}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div><b>Fecha:</b> {new Date(salePrintTarget.createdAt).toLocaleString('es-MX')}</div>
                {salePrintTarget.patientName ? <div><b>Paciente:</b> {salePrintTarget.patientName}</div> : null}
              </div>
            </div>

            <hr />
            <table className="printTable">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>P. Unit</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {(salePrintTarget.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.name}</td>
                    <td style={{ textAlign: 'right' }}>{it.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(it.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(it.qty * it.unitPrice)}</td>
                  </tr>
                ))}
                {salePrintTarget.shipping ? (
                  <tr>
                    <td>Envío</td>
                    <td style={{ textAlign: 'right' }}>1</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(salePrintTarget.shipping)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(salePrintTarget.shipping)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <hr />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 10 }}>
              <div>
                {salePrintTarget.notes ? <div><b>Notas:</b> {salePrintTarget.notes}</div> : null}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><b>{formatCurrency(salePrintTarget.subtotal)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IVA</span><b>{formatCurrency(salePrintTarget.iva)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18 }}><span>Total</span><b>{formatCurrency(salePrintTarget.total)}</b></div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <header className="topbar">
        <div className="brand">
          {resolvedLogo ? <img src={resolvedLogo} alt="Logo" className="brandLogo" /> : <div className="brandLogoFallback" />}
          <div>
            <div className="brandTitle">SICE</div>
            <div className="brandSub">{user.nombre} · {user.unidad}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => setShowChangePassword(true)} title="Cambiar contraseña"><KeyRound size={16} />&nbsp;Contraseña</button>
          <button className="btn" onClick={doLogout}><LogOut size={16} />&nbsp;Salir</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'patients' ? 'tab active' : 'tab'} onClick={() => setTab('patients')}><Users size={16} />&nbsp;Pacientes</button>
        <button className={tab === 'sales' ? 'tab active' : 'tab'} onClick={() => setTab('sales')}><ShoppingCart size={16} />&nbsp;Ventas</button>
        <button className={tab === 'appointments' ? 'tab active' : 'tab'} onClick={() => setTab('appointments')}><CalendarDays size={16} />&nbsp;Agenda</button>
        <button className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}><SettingsIcon size={16} />&nbsp;Settings</button>
      </nav>

      {uiMessage ? <div className="toast">{uiMessage}</div> : null}

      <main className="content">
        {tab === 'patients' ? (
          <div className="grid2">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h3 style={{ margin: 0 }}>Pacientes</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Search size={16} />
                  <input className="input" style={{ width: 220 }} value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="Buscar" />
                </div>
              </div>
              <div style={{ height: 12 }} />
              <div className="list">
                {filteredPatients.map((p) => (
                  <button key={p.id} className="listItem" onClick={() => setPatientDraft(p)}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{[p.phone, p.email].filter(Boolean).join(' · ')}</div>
                  </button>
                ))}
                {!filteredPatients.length ? <div className="muted">Sin pacientes.</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>{patientDraft.id ? 'Editar paciente' : 'Nuevo paciente'}</h3>
              <label className="label">Nombre</label>
              <input className="input" value={patientDraft.name || ''} onChange={(e) => setPatientDraft((s) => ({ ...s, name: e.target.value }))} />
              <div style={{ height: 10 }} />
              <label className="label">Teléfono</label>
              <input className="input" value={patientDraft.phone || ''} onChange={(e) => setPatientDraft((s) => ({ ...s, phone: e.target.value }))} />
              <div style={{ height: 10 }} />
              <label className="label">Email</label>
              <input className="input" value={patientDraft.email || ''} onChange={(e) => setPatientDraft((s) => ({ ...s, email: e.target.value }))} />
              <div style={{ height: 10 }} />
              <label className="label">Dirección</label>
              <input className="input" value={patientDraft.address || ''} onChange={(e) => setPatientDraft((s) => ({ ...s, address: e.target.value }))} />
              <div style={{ height: 10 }} />
              <label className="label">Notas</label>
              <textarea className="input" style={{ minHeight: 80 }} value={patientDraft.notes || ''} onChange={(e) => setPatientDraft((s) => ({ ...s, notes: e.target.value }))} />

              <div style={{ height: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btnPrimary" onClick={savePatient}>Guardar</button>
                <button className="btn" onClick={() => setPatientDraft({})}>Limpiar</button>
                {patientDraft.id ? (
                  <button className="btnDanger" onClick={async () => {
                    if (!confirm('¿Eliminar paciente?')) return;
                    await dbService.deletePatient(String(patientDraft.id));
                    setPatientDraft({});
                  }}><Trash2 size={16} />&nbsp;Eliminar</button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'sales' ? (
          <div className="grid2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Ventas (año {new Date().getFullYear()})</h3>
              <div className="list">
                {sales.map((s) => (
                  <div key={s.id} className="listRow">
                    <div>
                      <div style={{ fontWeight: 700 }}>{s.folio}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(s.createdAt).toLocaleString('es-MX')} {s.patientName ? `· ${s.patientName}` : ''}
                      </div>
                      <div style={{ fontSize: 12 }}>Total: <b>{formatCurrency(s.total)}</b> · Costo: {formatCurrency(s.costTotal)} · Utilidad: <b>{formatCurrency(s.profit)}</b></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => doPrintSale(s)}><Printer size={16} />&nbsp;Imprimir</button>
                      <button className="btnDanger" onClick={async () => {
                        if (!confirm('¿Eliminar venta?')) return;
                        await dbService.deleteSale(s.id);
                      }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
                {!sales.length ? <div className="muted">Sin ventas registradas.</div> : null}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ marginTop: 0 }}>Nueva venta</h3>
                <button className="btn" onClick={addSaleLine}><PlusCircle size={16} />&nbsp;Concepto</button>
              </div>

              <label className="label">Paciente (opcional)</label>
              <select className="input" value={saleDraft.patientId || ''} onChange={(e) => setSaleDraft((s) => ({ ...s, patientId: e.target.value || undefined }))}>
                <option value="">(Sin paciente)</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div style={{ height: 12 }} />
              <label className="label">Conceptos</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(saleDraft.items || []).map((it, idx) => (
                  <div key={idx} className="saleLine">
                    <select className="input" style={{ flex: 2 }} value={it.catalogItemId || ''} onChange={(e) => {
                      const id = e.target.value;
                      const item = id ? catalogById.get(id) : null;
                      setSaleDraft((s) => {
                        const items = [...(s.items || [])];
                        items[idx] = {
                          catalogItemId: id || undefined,
                          name: item?.name || '',
                          qty: Number(items[idx]?.qty || 1),
                          unitPrice: Number(item?.unitPrice || 0),
                          unitCost: Number(item?.unitCost || 0)
                        };
                        return { ...s, items };
                      });
                    }}>
                      <option value="">(Manual)</option>
                      {catalog.filter((c) => c.active !== false).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input className="input" style={{ flex: 2 }} value={it.name || ''} onChange={(e) => {
                      const v = e.target.value;
                      setSaleDraft((s) => {
                        const items = [...(s.items || [])];
                        items[idx] = { ...items[idx], name: v };
                        return { ...s, items };
                      });
                    }} placeholder="Concepto" />
                    <input className="input" style={{ width: 90 }} type="number" value={it.qty ?? 1} onChange={(e) => {
                      const v = Number(e.target.value);
                      setSaleDraft((s) => {
                        const items = [...(s.items || [])];
                        items[idx] = { ...items[idx], qty: v };
                        return { ...s, items };
                      });
                    }} />
                    <input className="input" style={{ width: 120 }} type="number" value={it.unitPrice ?? 0} onChange={(e) => {
                      const v = Number(e.target.value);
                      setSaleDraft((s) => {
                        const items = [...(s.items || [])];
                        items[idx] = { ...items[idx], unitPrice: v };
                        return { ...s, items };
                      });
                    }} />
                    <input className="input" style={{ width: 120 }} type="number" value={it.unitCost ?? 0} onChange={(e) => {
                      const v = Number(e.target.value);
                      setSaleDraft((s) => {
                        const items = [...(s.items || [])];
                        items[idx] = { ...items[idx], unitCost: v };
                        return { ...s, items };
                      });
                    }} />
                    <button className="btnDanger" onClick={() => {
                      setSaleDraft((s) => ({ ...s, items: (s.items || []).filter((_, i) => i !== idx) }));
                    }} title="Quitar"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>

              <div style={{ height: 12 }} />
              <div className="grid3">
                <div>
                  <label className="label">Envío (pre-IVA)</label>
                  <input className="input" type="number" value={saleDraft.shipping} onChange={(e) => setSaleDraft((s) => ({ ...s, shipping: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">IVA</label>
                  <select className="input" value={String(saleDraft.ivaRate)} onChange={(e) => setSaleDraft((s) => ({ ...s, ivaRate: Number(e.target.value) }))}>
                    <option value="0.16">16%</option>
                    <option value="0">0%</option>
                  </select>
                </div>
                <div>
                  <label className="label">Resumen</label>
                  <div className="summaryBox">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><b>{formatCurrency(salePreview.subtotal)}</b></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IVA</span><b>{formatCurrency(salePreview.iva)}</b></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total</span><b>{formatCurrency(salePreview.total)}</b></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Costo</span><span>{formatCurrency(salePreview.costTotal)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Utilidad</span><b>{formatCurrency(salePreview.profit)}</b></div>
                  </div>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <div className="grid3">
                <div>
                  <label className="label">Costo de envío (tu costo)</label>
                  <input className="input" type="number" value={saleDraft.shippingCost} onChange={(e) => setSaleDraft((s) => ({ ...s, shippingCost: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Entrega probable</label>
                  <input className="input" type="date" value={(saleDraft.deliveryEstimatedAt || '').slice(0,10)} onChange={(e) => setSaleDraft((s) => ({ ...s, deliveryEstimatedAt: e.target.value }))} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Con esto se agenda seguimiento automático a 11 meses (si Calendar está configurado).</div>
                </div>
                <div>
                  <label className="label">Pago a proveedor (pendiente)</label>
                  <input className="input" type="number" value={saleDraft.providerDue ?? 0} onChange={(e) => setSaleDraft((s) => ({ ...s, providerDue: Number(e.target.value) }))} />
                </div>
              </div>

              <div style={{ height: 10 }} />
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={saleDraft.invoiceRequired === true} onChange={(e) => setSaleDraft((s) => ({ ...s, invoiceRequired: e.target.checked }))} />
                  <span>Requiere factura</span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={saleDraft.delivered === true} onChange={(e) => setSaleDraft((s) => ({ ...s, delivered: e.target.checked }))} />
                  <span>Entregado</span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={saleDraft.providerPaid === true} onChange={(e) => setSaleDraft((s) => ({ ...s, providerPaid: e.target.checked }))} />
                  <span>Proveedor pagado</span>
                </label>
              </div>

              <div style={{ height: 12 }} />
              <label className="label">Notas</label>
              <textarea className="input" style={{ minHeight: 60 }} value={saleDraft.notes || ''} onChange={(e) => setSaleDraft((s) => ({ ...s, notes: e.target.value }))} />

              <div style={{ height: 12 }} />
              <button className="btnPrimary" onClick={createSale}>Registrar venta</button>

              <div style={{ height: 18 }} />
              <hr />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}><Package size={16} />&nbsp;Catálogo</h3>
              </div>
              <div style={{ height: 8 }} />

              <div className="grid3">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={String(catalogDraft.type || 'product')} onChange={(e) => setCatalogDraft((s) => ({ ...s, type: e.target.value as any }))}>
                    <option value="product">Producto</option>
                    <option value="service">Servicio</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="label">Nombre</label>
                  <input className="input" value={catalogDraft.name || ''} onChange={(e) => setCatalogDraft((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Precio (pre-IVA)</label>
                  <input className="input" type="number" value={catalogDraft.unitPrice ?? 0} onChange={(e) => setCatalogDraft((s) => ({ ...s, unitPrice: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Costo</label>
                  <input className="input" type="number" value={catalogDraft.unitCost ?? 0} onChange={(e) => setCatalogDraft((s) => ({ ...s, unitCost: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Activo</label>
                  <select className="input" value={catalogDraft.active === false ? '0' : '1'} onChange={(e) => setCatalogDraft((s) => ({ ...s, active: e.target.value === '1' }))}>
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
              </div>
              <div style={{ height: 10 }} />
              <button className="btn" onClick={saveCatalog}>Guardar en catálogo</button>

              <div style={{ height: 12 }} />
              <div className="list">
                {catalog.map((c) => (
                  <div key={c.id} className="listRow">
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name} {c.active === false ? <span className="pill">Inactivo</span> : null}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.type} · Precio: {formatCurrency(c.unitPrice)} · Costo: {formatCurrency(c.unitCost)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => setCatalogDraft(c)}>Editar</button>
                      <button className="btnDanger" onClick={async () => {
                        if (!confirm('¿Eliminar del catálogo?')) return;
                        await dbService.deleteCatalogItem(c.id);
                      }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
                {!catalog.length ? <div className="muted">Sin catálogo.</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'appointments' ? (
          <div className="grid2">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Agenda semanal</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => setWeekAnchor((d) => new Date(d.getTime() - 7 * 24 * 3600 * 1000))}>←</button>
                  <button className="btn" onClick={() => setWeekAnchor(new Date())}>Hoy</button>
                  <button className="btn" onClick={() => setWeekAnchor((d) => new Date(d.getTime() + 7 * 24 * 3600 * 1000))}>→</button>
                </div>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Semana: {new Date(startOfWeekIso(weekAnchor)).toLocaleDateString('es-MX')} – {new Date(endOfWeekIso(weekAnchor)).toLocaleDateString('es-MX')}
              </div>
              <div style={{ height: 10 }} />
              <div className="list">
                {appointments.map((a) => (
                  <button key={a.id} className="listItem" onClick={() => setApptDraft(a)}>
                    <div style={{ fontWeight: 700 }}>{new Date(a.start).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} – {new Date(a.end).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div>{a.title} {a.patientName ? `· ${a.patientName}` : ''}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{a.status || 'scheduled'}</div>
                  </button>
                ))}
                {!appointments.length ? <div className="muted">Sin citas en esta semana.</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>{apptDraft.id ? 'Editar cita' : 'Nueva cita'}</h3>
              <label className="label">Título</label>
              <input className="input" value={apptDraft.title || ''} onChange={(e) => setApptDraft((s) => ({ ...s, title: e.target.value }))} placeholder="Consulta / Entrega / etc." />

              <div style={{ height: 10 }} />
              <label className="label">Paciente (opcional)</label>
              <select className="input" value={String(apptDraft.patientId || '')} onChange={(e) => setApptDraft((s) => ({ ...s, patientId: e.target.value || undefined }))}>
                <option value="">(Sin paciente)</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div style={{ height: 10 }} />
              <div className="grid2">
                <div>
                  <label className="label">Inicio</label>
                  <input className="input" type="datetime-local" value={apptDraft.start ? String(apptDraft.start).slice(0, 16) : ''} onChange={(e) => setApptDraft((s) => ({ ...s, start: new Date(e.target.value).toISOString() }))} />
                </div>
                <div>
                  <label className="label">Fin</label>
                  <input className="input" type="datetime-local" value={apptDraft.end ? String(apptDraft.end).slice(0, 16) : ''} onChange={(e) => setApptDraft((s) => ({ ...s, end: new Date(e.target.value).toISOString() }))} />
                </div>
              </div>

              <div style={{ height: 10 }} />
              <label className="label">Estatus</label>
              <select className="input" value={String(apptDraft.status || 'scheduled')} onChange={(e) => setApptDraft((s) => ({ ...s, status: e.target.value as any }))}>
                <option value="scheduled">Programada</option>
                <option value="done">Realizada</option>
                <option value="cancelled">Cancelada</option>
              </select>

              <div style={{ height: 10 }} />
              <label className="label">Notas</label>
              <textarea className="input" style={{ minHeight: 70 }} value={apptDraft.notes || ''} onChange={(e) => setApptDraft((s) => ({ ...s, notes: e.target.value }))} />

              <div style={{ height: 12 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btnPrimary" onClick={saveAppointment}>Guardar</button>
                <button className="btn" onClick={() => setApptDraft({ status: 'scheduled' })}>Limpiar</button>
                {apptDraft.id ? (
                  <button className="btnDanger" onClick={async () => {
                    if (!confirm('¿Eliminar cita?')) return;
                    await dbService.deleteAppointment(String(apptDraft.id));
                    setApptDraft({ status: 'scheduled' });
                  }}><Trash2 size={16} />&nbsp;Eliminar</button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'settings' ? (
          <div className="grid2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Branding</h3>
              <label className="label">Color principal</label>
              <input className="input" type="color" value={clampColor(settings.themeColor)} onChange={(e) => updateThemeColor(e.target.value)} />
              <div className="muted" style={{ marginTop: 8 }}>Se aplica al instante (variable CSS <code>--brand</code>).</div>

              <div style={{ height: 14 }} />
              <label className="label">Logo</label>
              <input className="input" type="file" accept="image/*" onChange={(e) => updateLogo(e.target.files?.[0])} />
              {resolvedLogo ? (
                <div style={{ marginTop: 10 }}>
                  <img src={resolvedLogo} alt="Logo" style={{ maxHeight: 90, maxWidth: 260, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8, padding: 6, background: '#fff' }} />
                  <div style={{ height: 8 }} />
                  <button className="btnDanger" onClick={async () => {
                    if (!confirm('¿Quitar logo?')) return;
                    await dbService.updateSiceSettings({ logoDataUrl: '' });
                  }}>Quitar logo</button>
                </div>
              ) : null}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Automatización (Google Calendar)</h3>
              <div className="muted" style={{ lineHeight: 1.35 }}>
                Para que SICE cree automáticamente eventos (citas + seguimiento a 11 meses), configura el webhook de
                <b> Google Apps Script</b>.
              </div>

              <div style={{ height: 12 }} />
              <label className="label">Webhook URL</label>
              <input
                className="input"
                value={settings.calendarWebhookUrl || ''}
                onChange={(e) => dbService.updateSiceSettings({ calendarWebhookUrl: e.target.value })}
                placeholder="https://script.google.com/macros/s/.../exec"
              />

              <div style={{ height: 10 }} />
              <label className="label">Secret</label>
              <input
                className="input"
                value={settings.calendarWebhookSecret || ''}
                onChange={(e) => dbService.updateSiceSettings({ calendarWebhookSecret: e.target.value })}
                placeholder="(igual al SICE_WEBHOOK_SECRET del script)"
              />

              <div style={{ height: 10 }} />
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={settings.calendarInvitePatient !== false}
                  onChange={(e) => dbService.updateSiceSettings({ calendarInvitePatient: e.target.checked })}
                />
                <span>Invitar al paciente por correo (Google Calendar envía invitación)</span>
              </label>

              <div className="muted" style={{ marginTop: 10 }}>
                Nota: esto manda invitaciones desde el calendario de la cuenta dedicada.
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Cuenta</h3>
              <div className="muted">Usuario: {user.nombre}</div>
              <div className="muted">Unidad: {user.unidad}</div>
              <div style={{ height: 10 }} />
              <button className="btn" onClick={() => setShowChangePassword(true)}><KeyRound size={16} />&nbsp;Cambiar contraseña</button>
            </div>
          </div>
        ) : null}
      </main>

      {showChangePassword ? (
        <div className="modalOverlay" onClick={() => setShowChangePassword(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cambiar contraseña</h3>
            <label className="label">Actual</label>
            <input className="input" type="password" value={cpCurrent} onChange={(e) => setCpCurrent(e.target.value)} />
            <div style={{ height: 10 }} />
            <label className="label">Nueva</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} type={cpShowNew ? 'text' : 'password'} value={cpNew} onChange={(e) => setCpNew(e.target.value)} />
              <button className="btn" onClick={() => setCpShowNew((s) => !s)}>{cpShowNew ? 'Ocultar' : 'Ver'}</button>
            </div>
            <div style={{ height: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowChangePassword(false)}>Cancelar</button>
              <button className="btnPrimary" onClick={doChangePassword} disabled={!cpCurrent || !cpNew}>Actualizar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
