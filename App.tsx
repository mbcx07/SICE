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
import type { Appointment, CatalogItem, Patient, Sale, SaleLineItem, SalePayment, SalePaymentMethod, SiceSettings, User, IntakeRequest } from './types';
import { CalendarDays, LogOut, Settings as SettingsIcon, Users, ShoppingCart, Package, KeyRound, Printer, Trash2, PlusCircle, Search, LayoutDashboard, ClipboardList } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type Tab = 'dashboard' | 'patients' | 'sales' | 'appointments' | 'intakes' | 'settings';

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
  const [tab, setTab] = useState<Tab>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);

  // settings
  const [settings, setSettings] = useState<SiceSettings>({ id: 'global', themeColor: '#2b5ea7', calendarInvitePatient: true });
  // Use BASE_URL so it works on GitHub Pages (/SICE/)
  const defaultLogoUrl = `${(import.meta as any).env?.BASE_URL || '/'}diagnostic-support-del-noroeste.jpg`;

  // patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientDraft, setPatientDraft] = useState<Partial<Patient>>({});
  const [patientSales, setPatientSales] = useState<Sale[]>([]);

  // public intake
  const isPublicRegister = typeof window !== 'undefined' && window.location.hash.toLowerCase().includes('registro');
  const [intakes, setIntakes] = useState<IntakeRequest[]>([]);
  const [intakeSearch, setIntakeSearch] = useState('');
  const [intakeDraft, setIntakeDraft] = useState<{ fullName: string; phone: string; email: string; residence: string }>(() => ({ fullName: '', phone: '', email: '', residence: '' }));
  const [intakeSent, setIntakeSent] = useState(false);
  const [intakeSending, setIntakeSending] = useState(false);
  const [intakeBusyId, setIntakeBusyId] = useState<string | null>(null);
  const [intakeEdit, setIntakeEdit] = useState<IntakeRequest | null>(null);


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
    providerSentAt?: string;
    shipping: number; // charge
    shippingCost: number; // cost
    ivaRate: number;
    notes?: string;
    items: SaleLineItem[];
  }>(() => ({ shipping: 0, shippingCost: 0, ivaRate: 0.16, invoiceRequired: false, delivered: false, providerPaid: false, providerDue: 0, providerSentAt: '', items: [{ name: '', qty: 1, unitPrice: 0, unitCost: 0 }] }));
  const [salePrintTarget, setSalePrintTarget] = useState<Sale | null>(null);

  // payments UI
  const [salePaymentsTarget, setSalePaymentsTarget] = useState<Sale | null>(null);
  const [salePaymentEditId, setSalePaymentEditId] = useState<string | null>(null);
  const [salePaymentDraft, setSalePaymentDraft] = useState<Partial<SalePayment>>({ method: 'cash', amount: 0, date: new Date().toISOString().slice(0, 10) });

  // dashboard filters
  type DashboardRangePreset = 'quincena' | 'mes' | 'anio' | 'rango';
  const [dashboardPreset, setDashboardPreset] = useState<DashboardRangePreset>('mes');
  const [cobranzaFrom, setCobranzaFrom] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [cobranzaTo, setCobranzaTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

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

  // Settings drafts (avoid "can't type" when saving on every keypress)
  const [calendarUrlDraft, setCalendarUrlDraft] = useState('');
  const [calendarSecretDraft, setCalendarSecretDraft] = useState('');
  const [savingCalendar, setSavingCalendar] = useState(false);

  const printRef = useRef<HTMLDivElement | null>(null);

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
    return () => {
      mounted = false;
    };
  }, [isPublicRegister]);

  useEffect(() => {
    const unsub = dbService.watchSiceSettings(setSettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', clampColor(settings.themeColor));
  }, [settings.themeColor]);

  const resolvedLogo = settings.logoDataUrl ? settings.logoDataUrl : defaultLogoUrl;

  useEffect(() => {
    setCalendarUrlDraft(String(settings.calendarWebhookUrl || ''));
    setCalendarSecretDraft(String(settings.calendarWebhookSecret || ''));
  }, [settings.calendarWebhookUrl, settings.calendarWebhookSecret]);

  useEffect(() => {
    if (!user) return;
    const unsubPatients = dbService.watchPatients(setPatients);
    const unsubCatalog = dbService.watchCatalogItems(setCatalog);
    const unsubIntakes = dbService.watchIntakes(setIntakes);

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
      unsubIntakes();
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

  useEffect(() => {
    if (!salePaymentsTarget) return;
    const fresh = sales.find((s) => s.id === salePaymentsTarget.id);
    if (fresh) setSalePaymentsTarget(fresh);
  }, [sales]);

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

  const SALE_MP_FEE_RATE = 0.0406;
  const isCardPaymentMethod = (m: any) => m === 'debit_terminal' || m === 'credit_terminal';

  const salePaidTotal = (s: Partial<Sale> | null | undefined): number => {
    const payments = (s as any)?.payments;
    if (!Array.isArray(payments)) return 0;
    return payments.reduce((acc: number, p: any) => acc + Number(p?.amount || 0), 0);
  };

  const salePendingTotal = (s: Partial<Sale> | null | undefined): number => {
    const total = Number((s as any)?.total || 0);
    return Math.max(0, total - salePaidTotal(s));
  };

  const saleMpFeeTotal = (s: Partial<Sale> | null | undefined): number => {
    const payments = (s as any)?.payments;
    if (!Array.isArray(payments)) return 0;
    return payments.reduce((acc: number, p: any) => acc + (isCardPaymentMethod(p?.method) ? Number(p?.amount || 0) * SALE_MP_FEE_RATE : 0), 0);
  };

  const applyDashboardPreset = (preset: 'quincena' | 'mes' | 'anio') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'anio') {
      setCobranzaFrom(fmt(new Date(y, 0, 1)));
      setCobranzaTo(fmt(new Date(y, 11, 31)));
      return;
    }

    if (preset === 'mes') {
      const lastDay = new Date(y, m + 1, 0).getDate();
      setCobranzaFrom(fmt(new Date(y, m, 1)));
      setCobranzaTo(fmt(new Date(y, m, lastDay)));
      return;
    }

    // quincena actual (1-15 o 16-fin)
    const day = now.getDate();
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (day <= 15) {
      setCobranzaFrom(fmt(new Date(y, m, 1)));
      setCobranzaTo(fmt(new Date(y, m, 15)));
    } else {
      setCobranzaFrom(fmt(new Date(y, m, 16)));
      setCobranzaTo(fmt(new Date(y, m, lastDay)));
    }
  };

  const dashboardRange = useMemo(() => {
    const from = cobranzaFrom ? `${cobranzaFrom}T00:00:00.000Z` : '';
    const to = cobranzaTo ? `${cobranzaTo}T23:59:59.999Z` : '';
    return { from, to };
  }, [cobranzaFrom, cobranzaTo]);

  const dashboardSales = useMemo(() => {
    const { from, to } = dashboardRange;
    return (sales || []).filter((s) => {
      const t = String(s.createdAt || '');
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [sales, dashboardRange]);

  const dashboardKpis = useMemo(() => {
    const ventas = dashboardSales.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const costo = dashboardSales.reduce((acc, s) => acc + Number(s.costTotal || 0), 0);
    const iva = dashboardSales.reduce((acc, s) => acc + Number(s.iva || 0), 0);
    const mp = dashboardSales.reduce((acc, s) => acc + saleMpFeeTotal(s), 0);
    const gananciaNeta = dashboardSales.reduce((acc, s) => acc + (Number(s.total || 0) - Number(s.costTotal || 0) - saleMpFeeTotal(s)), 0);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const proveedorPendienteMensual = (sales || [])
      .filter((s) => !s.providerPaid && Number(s.providerDue || 0) > 0 && String((s as any).providerSentAt || '').slice(0, 7) === thisMonth)
      .reduce((acc, s) => acc + Number(s.providerDue || 0), 0);

    const proveedorPendienteAcumulado = (sales || [])
      .filter((s) => !s.providerPaid && Number(s.providerDue || 0) > 0)
      .reduce((acc, s) => acc + Number(s.providerDue || 0), 0);

    return { ventas, costo, iva, mp, gananciaNeta, proveedorPendienteMensual, proveedorPendienteAcumulado, proveedorMes: thisMonth };
  }, [dashboardSales, sales]);

  const dashboardMonthlySales = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-MX', { month: 'short' });
      months.push({ key, label: `${label} ${String(d.getFullYear()).slice(-2)}`, total: 0 });
    }
    const idx = new Map(months.map((m) => [m.key, m] as const));
    for (const s of (sales || [])) {
      const k = String(s.createdAt || '').slice(0, 7);
      const row = idx.get(k);
      if (!row) continue;
      row.total += Number(s.total || 0);
    }
    return months;
  }, [sales]);

  const pendingByPatient = useMemo(() => {
    const by = new Map<string, { patientId?: string; patientName: string; pending: number; salesCount: number }>();
    for (const s of (sales || [])) {
      const pending = salePendingTotal(s);
      if (pending <= 0.009) continue;
      const key = String(s.patientId || s.patientName || '');
      const row = by.get(key) || { patientId: s.patientId, patientName: s.patientName || '(Sin nombre)', pending: 0, salesCount: 0 };
      row.pending += pending;
      row.salesCount += 1;
      by.set(key, row);
    }
    return Array.from(by.values()).sort((a, b) => b.pending - a.pending);
  }, [sales]);

  const renewalsNextMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return (sales || [])
      .filter((s) => {
        const fu = String((s as any).followUpAt || '');
        if (!fu) return false;
        const d = new Date(fu);
        if (!Number.isFinite(d.getTime())) return false;
        return d >= start && d <= end;
      })
      .sort((a, b) => String((a as any).followUpAt || '').localeCompare(String((b as any).followUpAt || '')));
  }, [sales]);

  const deliveredPlantillas = useMemo(() => {
    return (sales || [])
      .filter((s) => Boolean((s as any).delivered) || Boolean((s as any).deliveryActualAt))
      .slice()
      .sort((a, b) => String((b as any).deliveryActualAt || b.createdAt || '').localeCompare(String((a as any).deliveryActualAt || a.createdAt || '')));
  }, [sales]);

  const patientDuplicates = useMemo(() => {
    const normEmail = (v: any) => String(v || '').trim().toLowerCase();

    const byEmail = new Map<string, Patient[]>();
    for (const p of patients) {
      const email = normEmail(p.email);
      if (!email) continue;
      const arr = byEmail.get(email) || [];
      arr.push(p);
      byEmail.set(email, arr);
    }

    return Array.from(byEmail.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([email, arr]) => ({ email, items: arr }));
  }, [patients]);

  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  useEffect(() => {
    const pid = String((patientDraft as any)?.id || '').trim();
    if (!user || !pid) {
      setPatientSales([]);
      return;
    }
    const unsub = dbService.watchSalesByPatient(pid, setPatientSales);
    return () => unsub();
  }, [patientDraft, user]);

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
      const rawU = matricula.trim();
      const mappedU = rawU.toLowerCase() === 'luisana'
        ? 'dgnstcspprtdlnrst@gmail.com'
        : rawU;
      const profile = await loginWithMatricula(mappedU, password.trim());
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
        providerSentAt: saleDraft.providerSentAt ? String(saleDraft.providerSentAt) : '',
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
      setSaleDraft({ shipping: 0, shippingCost: 0, ivaRate: 0.16, invoiceRequired: false, delivered: false, providerPaid: false, providerDue: 0, providerSentAt: '', items: [{ name: '', qty: 1, unitPrice: 0, unitCost: 0 }] });
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

  const openSalePayments = (sale: Sale) => {
    setSalePaymentsTarget(sale);
    setSalePaymentEditId(null);
    setSalePaymentDraft({ method: 'cash', amount: 0, date: new Date().toISOString().slice(0, 10) });
  };

  const startEditSalePayment = (p: SalePayment) => {
    setSalePaymentEditId(p.id);
    setSalePaymentDraft({ ...p });
  };

  const saveSalePayment = async () => {
    const sale = salePaymentsTarget;
    if (!sale) return;

    const method: SalePaymentMethod = (salePaymentDraft.method as any) || 'cash';
    const amount = Number(salePaymentDraft.amount || 0);
    const date = String(salePaymentDraft.date || '').slice(0, 10);
    const notes = salePaymentDraft.notes ? String(salePaymentDraft.notes) : '';

    if (!amount || amount <= 0) return setUiMessage('Monto debe ser mayor a 0.');
    if (!date) return setUiMessage('Fecha es requerida.');

    const existing = Array.isArray((sale as any).payments) ? ((sale as any).payments as SalePayment[]) : [];
    const next: SalePayment = {
      id: salePaymentEditId || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())),
      method,
      amount,
      date,
      notes,
      createdAt: salePaymentEditId ? (salePaymentDraft.createdAt as any) : new Date().toISOString(),
      createdBy: salePaymentEditId ? (salePaymentDraft.createdBy as any) : (user?.uid || '')
    };

    const payments = salePaymentEditId
      ? existing.map((p) => (p.id === salePaymentEditId ? next : p))
      : [...existing, next];

    // sort by date asc for readability
    payments.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    await dbService.updateSale(sale.id, { payments } as any);

    // reset draft
    setSalePaymentEditId(null);
    setSalePaymentDraft({ method: 'cash', amount: 0, date: new Date().toISOString().slice(0, 10) });
    setUiMessage('Pago guardado.');
    setTimeout(() => setUiMessage(null), 1500);
  };

  const deleteSalePayment = async (paymentId: string) => {
    const sale = salePaymentsTarget;
    if (!sale) return;
    if (!confirm('¿Eliminar pago?')) return;

    const existing = Array.isArray((sale as any).payments) ? ((sale as any).payments as SalePayment[]) : [];
    const payments = existing.filter((p) => p.id !== paymentId);
    await dbService.updateSale(sale.id, { payments } as any);

    if (salePaymentEditId === paymentId) {
      setSalePaymentEditId(null);
      setSalePaymentDraft({ method: 'cash', amount: 0, date: new Date().toISOString().slice(0, 10) });
    }
    setUiMessage('Pago eliminado.');
    setTimeout(() => setUiMessage(null), 1500);
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

  if (loading && !user && !isPublicRegister) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 420, margin: '64px auto' }}>
          <h2>SICE</h2>
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (isPublicRegister) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 520, margin: '48px auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {resolvedLogo ? <img src={resolvedLogo} alt="Logo" style={{ height: 48, width: 48, objectFit: 'contain' }} /> : null}
            <div>
              <h2 style={{ margin: 0 }}>Diagnostic Support del Noroeste</h2>
              <div className="muted">Registro de paciente</div>
            </div>
          </div>

          <div style={{ height: 18 }} />

          {intakeSent ? (
            <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <div style={{ fontWeight: 800 }}>Listo</div>
              <div className="muted">Tu información fue enviada correctamente.</div>
            </div>
          ) : (
            <>
              <label className="label">Nombre completo</label>
              <input className="input" value={intakeDraft.fullName} onChange={(e) => setIntakeDraft((s) => ({ ...s, fullName: e.target.value }))} />

              <div style={{ height: 12 }} />
              <label className="label">Número de celular</label>
              <input className="input" value={intakeDraft.phone} onChange={(e) => setIntakeDraft((s) => ({ ...s, phone: e.target.value }))} />

              <div style={{ height: 12 }} />
              <label className="label">Correo electrónico</label>
              <input className="input" value={intakeDraft.email} onChange={(e) => setIntakeDraft((s) => ({ ...s, email: e.target.value }))} />

              <div style={{ height: 12 }} />
              <label className="label">Lugar de residencia</label>
              <input className="input" value={intakeDraft.residence} onChange={(e) => setIntakeDraft((s) => ({ ...s, residence: e.target.value }))} />

              {uiMessage ? <div className="toast" style={{ position: 'static', marginTop: 12 }}>{uiMessage}</div> : null}

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
                    await dbService.createIntake({ fullName, phone, email, residence });
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

  if (!user) {
    return (
      <div className="appShell">
        <div className="card" style={{ maxWidth: 460, margin: '64px auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {resolvedLogo ? <img src={resolvedLogo} alt="Logo" style={{ height: 48, width: 48, objectFit: 'contain' }} /> : null}
            <div>
              <h2 style={{ margin: 0 }}>Diagnostic Support del Noroeste</h2>
              <div className="muted">Acceso</div>
            </div>
          </div>

          <div style={{ height: 16 }} />
          <label className="label">Usuario</label>
          <input className="input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Nombre" />

          <div style={{ height: 12 }} />
          <label className="label">Contraseña</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            <button className="btn" onClick={() => setShowPassword((s) => !s)}>{showPassword ? 'Ocultar' : 'Ver'}</button>
          </div>

          {error ? <div className="errorBox" style={{ marginTop: 12 }}>{error}</div> : null}

          <div style={{ height: 12 }} />
          <button className="btnPrimary" onClick={doLogin} disabled={!matricula.trim() || !password}>Entrar</button>


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

      {salePaymentsTarget ? (
        <div className="modalOverlay" onClick={() => setSalePaymentsTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Cobros</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {salePaymentsTarget.folio} {salePaymentsTarget.patientName ? `· ${salePaymentsTarget.patientName}` : ''}
                </div>
              </div>
              <button className="btn" onClick={() => setSalePaymentsTarget(null)}>Cerrar</button>
            </div>

            <div style={{ height: 10 }} />
            <div className="summaryBox">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total venta</span><b>{formatCurrency(Number(salePaymentsTarget.total || 0))}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pagado</span><b>{formatCurrency(salePaidTotal(salePaymentsTarget))}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pendiente</span><b>{formatCurrency(salePendingTotal(salePaymentsTarget))}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Comisión MP (4.06% débito/crédito)</span><b>{formatCurrency(saleMpFeeTotal(salePaymentsTarget))}</b></div>
            </div>

            <div style={{ height: 12 }} />
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Pagos registrados</div>
            <div className="list" style={{ maxHeight: 220, overflow: 'auto' }}>
              {(Array.isArray((salePaymentsTarget as any).payments) ? ((salePaymentsTarget as any).payments as SalePayment[]) : [])
                .slice()
                .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                .map((p) => (
                  <div key={p.id} className="listRow" style={{ padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        {p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'debit_terminal' ? 'Terminal débito' : 'Terminal crédito'}
                        {' · '}
                        <span>{formatCurrency(Number(p.amount || 0))}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {String(p.date || '').slice(0, 10)}
                        {isCardPaymentMethod(p.method) ? ` · MP: ${formatCurrency(Number(p.amount || 0) * SALE_MP_FEE_RATE)}` : ''}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => startEditSalePayment(p)}>Editar</button>
                      <button className="btnDanger" onClick={() => deleteSalePayment(p.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              {!Array.isArray((salePaymentsTarget as any).payments) || !(salePaymentsTarget as any).payments.length ? (
                <div className="muted">Sin pagos registrados.</div>
              ) : null}
            </div>

            <div style={{ height: 12 }} />
            <hr />
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{salePaymentEditId ? 'Editar pago' : 'Agregar pago'}</div>

            <div className="grid3">
              <div>
                <label className="label">Método</label>
                <select className="input" value={String(salePaymentDraft.method || 'cash')} onChange={(e) => setSalePaymentDraft((s) => ({ ...s, method: e.target.value as any }))}>
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="debit_terminal">Terminal débito</option>
                  <option value="credit_terminal">Terminal crédito</option>
                </select>
              </div>
              <div>
                <label className="label">Monto</label>
                <input className="input" type="number" value={Number(salePaymentDraft.amount || 0)} onChange={(e) => setSalePaymentDraft((s) => ({ ...s, amount: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input className="input" type="date" value={String(salePaymentDraft.date || '').slice(0, 10)} onChange={(e) => setSalePaymentDraft((s) => ({ ...s, date: e.target.value }))} />
              </div>
            </div>

            <div style={{ height: 10 }} />
            <label className="label">Notas (opcional)</label>
            <input className="input" value={salePaymentDraft.notes || ''} onChange={(e) => setSalePaymentDraft((s) => ({ ...s, notes: e.target.value }))} />

            <div style={{ height: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {salePaymentEditId ? (
                <button className="btn" onClick={() => {
                  setSalePaymentEditId(null);
                  setSalePaymentDraft({ method: 'cash', amount: 0, date: new Date().toISOString().slice(0, 10) });
                }}>Cancelar</button>
              ) : null}
              <button className="btnPrimary" onClick={saveSalePayment}>{salePaymentEditId ? 'Guardar cambios' : 'Guardar pago'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="topbar">
        <div className="brand">
          {resolvedLogo ? <img src={resolvedLogo} alt="Logo" className="brandLogo" /> : <div className="brandLogoFallback" />}
          <div>
            <div className="brandTitle">Diagnostic Support del Noroeste</div>
            {/* Subtítulo oculto por solicitud (evitar mostrar usuario/unidad en header) */}
            <div className="brandSub" style={{ display: 'none' }}>{user.nombre} · {user.unidad}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => setShowChangePassword(true)} title="Cambiar contraseña"><KeyRound size={16} />&nbsp;Contraseña</button>
          <button className="btn" onClick={doLogout}><LogOut size={16} />&nbsp;Salir</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setTab('dashboard')}><LayoutDashboard size={16} />&nbsp;Tablero</button>
        <button className={tab === 'patients' ? 'tab active' : 'tab'} onClick={() => setTab('patients')}><Users size={16} />&nbsp;Pacientes</button>
        <button className={tab === 'sales' ? 'tab active' : 'tab'} onClick={() => setTab('sales')}><ShoppingCart size={16} />&nbsp;Ventas</button>
        <button className={tab === 'appointments' ? 'tab active' : 'tab'} onClick={() => setTab('appointments')}><CalendarDays size={16} />&nbsp;Agenda</button>
        <button className={tab === 'intakes' ? 'tab active' : 'tab'} onClick={() => setTab('intakes')}><ClipboardList size={16} />&nbsp;Registros</button>
        <button className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}><SettingsIcon size={16} />&nbsp;Settings</button>
      </nav>

      {uiMessage ? <div className="toast">{uiMessage}</div> : null}

      <main className="content">
        {tab === 'dashboard' ? (
          <div className="dashboardStack">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Tablero</h3>
                  <div className="muted" style={{ fontSize: 12 }}>Filtros por fecha (ventas) + KPIs + evolución mensual.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" style={dashboardPreset === 'quincena' ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)' } : undefined} onClick={() => { setDashboardPreset('quincena'); applyDashboardPreset('quincena'); }}>Quincena</button>
                  <button className="btn" style={dashboardPreset === 'mes' ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)' } : undefined} onClick={() => { setDashboardPreset('mes'); applyDashboardPreset('mes'); }}>Mes</button>
                  <button className="btn" style={dashboardPreset === 'anio' ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)' } : undefined} onClick={() => { setDashboardPreset('anio'); applyDashboardPreset('anio'); }}>Año</button>
                  <button className="btn" style={dashboardPreset === 'rango' ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)' } : undefined} onClick={() => setDashboardPreset('rango')}>Rango</button>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <div className="grid3">
                <div>
                  <label className="label">Desde</label>
                  <input className="input" type="date" value={cobranzaFrom} onChange={(e) => { setDashboardPreset('rango'); setCobranzaFrom(e.target.value); }} />
                </div>
                <div>
                  <label className="label">Hasta</label>
                  <input className="input" type="date" value={cobranzaTo} onChange={(e) => { setDashboardPreset('rango'); setCobranzaTo(e.target.value); }} />
                </div>
                <div>
                  <label className="label">Resumen</label>
                  <div className="summaryBox">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ventas</span><b>{dashboardSales.length}</b></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cobranza pendiente</span><b>{formatCurrency(dashboardSales.reduce((acc, s) => acc + salePendingTotal(s), 0))}</b></div>
                  </div>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <div className="grid4">
                <div className="statCard">
                  <div className="muted" style={{ fontSize: 12 }}>Ventas total</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.ventas)}</div>
                </div>
                <div className="statCard">
                  <div className="muted" style={{ fontSize: 12 }}>Costo proveedor/insumo</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.costo)}</div>
                </div>
                <div className="statCard">
                  <div className="muted" style={{ fontSize: 12 }}>IVA</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.iva)}</div>
                </div>
                <div className="statCard">
                  <div className="muted" style={{ fontSize: 12 }}>Ganancia neta (– MP)</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.gananciaNeta)}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>MP estimado: {formatCurrency(dashboardKpis.mp)}</div>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <div className="summaryBox" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div><b>Proveedor pendiente ({dashboardKpis.proveedorMes})</b></div>
                <div>{formatCurrency(dashboardKpis.proveedorPendienteMensual)}</div>
              </div>

              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Ventas por mes (últimos 12)</div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={dashboardMonthlySales} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={60} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v || 0))} />
                    <Bar dataKey="total" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Pendiente proveedor</h3>
              <div className="muted" style={{ marginTop: -6 }}>Ventas con pago a proveedor pendiente (para confirmar envío/pago).</div>
              <div style={{ height: 10 }} />
              {sales
                .filter((s) => !s.providerPaid && Number(s.providerDue || 0) > 0)
                .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                .slice(0, 20)
                .map((s) => (
                  <div key={s.id} className="listRow" style={{ padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{s.patientName || '(Sin nombre)'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(s.createdAt).toLocaleDateString('es-MX')} · Pendiente proveedor: <b>{formatCurrency(Number(s.providerDue || 0))}</b>
                        {s.providerSentAt ? ` · Enviado: ${String(s.providerSentAt).slice(0, 10)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn" onClick={async () => {
                        const today = new Date().toISOString().slice(0, 10);
                        await dbService.updateSale(s.id, { providerSentAt: today } as any);
                      }}>Marcar enviado</button>
                      <button className="btnPrimary" onClick={async () => {
                        await dbService.updateSale(s.id, { providerPaid: true } as any);
                      }}>Marcar pagado</button>
                    </div>
                  </div>
                ))}
              {!sales.some((s) => !s.providerPaid && Number(s.providerDue || 0) > 0) ? (
                <div className="muted">Sin pendientes con proveedor.</div>
              ) : null}
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                Nota: este listado es el que usaremos para el recordatorio de los sábados.
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Agenda (resumen)</h3>
              <div className="muted">Próximas citas (semana actual):</div>
              <div style={{ height: 10 }} />
              {appointments
                .filter((a) => String(a.status || 'scheduled') !== 'cancelled' && new Date(a.start).getTime() >= (Date.now() - 60_000))
                .slice()
                .sort((a, b) => String(a.start).localeCompare(String(b.start)))
                .slice(0, 10)
                .map((a) => (
                  <div key={a.id} className="listItem" style={{ alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700 }}>{new Date(a.start).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    <div>{a.patientName ? `${a.patientName} · ` : ''}{a.title}</div>
                  </div>
                ))}
              {!appointments.length ? <div className="muted">Sin citas en esta semana.</div> : null}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Cobranza</h3>
                  <div className="muted" style={{ fontSize: 12 }}>Ventas con saldo pendiente (por periodo de venta).</div>
                </div>
              </div>

              <div style={{ height: 10 }} />
              <div className="grid3">
                <div>
                  <label className="label">Desde</label>
                  <input className="input" type="date" value={cobranzaFrom} onChange={(e) => { setDashboardPreset('rango'); setCobranzaFrom(e.target.value); }} />
                </div>
                <div>
                  <label className="label">Hasta</label>
                  <input className="input" type="date" value={cobranzaTo} onChange={(e) => { setDashboardPreset('rango'); setCobranzaTo(e.target.value); }} />
                </div>
                <div>
                  <label className="label">Resumen</label>
                  {(() => {
                    const from = cobranzaFrom ? `${cobranzaFrom}T00:00:00.000Z` : '';
                    const to = cobranzaTo ? `${cobranzaTo}T23:59:59.999Z` : '';
                    const filtered = (sales || []).filter((s) => {
                      const t = String(s.createdAt || '');
                      if (from && t < from) return false;
                      if (to && t > to) return false;
                      return salePendingTotal(s) > 0.009;
                    });
                    const pending = filtered.reduce((acc, s) => acc + salePendingTotal(s), 0);
                    return (
                      <div className="summaryBox">
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ventas</span><b>{filtered.length}</b></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pendiente</span><b>{formatCurrency(pending)}</b></div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ height: 10 }} />
              <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
                {(() => {
                  const from = cobranzaFrom ? `${cobranzaFrom}T00:00:00.000Z` : '';
                  const to = cobranzaTo ? `${cobranzaTo}T23:59:59.999Z` : '';
                  const filtered = (sales || [])
                    .filter((s) => {
                      const t = String(s.createdAt || '');
                      if (from && t < from) return false;
                      if (to && t > to) return false;
                      return salePendingTotal(s) > 0.009;
                    })
                    .sort((a, b) => salePendingTotal(b) - salePendingTotal(a));

                  return (
                    <>
                      {filtered.slice(0, 50).map((s) => (
                        <div key={s.id} className="listRow" style={{ padding: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800 }}>{s.patientName || '(Sin nombre)'} <span className="muted" style={{ fontWeight: 400 }}>· {s.folio}</span></div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {new Date(s.createdAt).toLocaleDateString('es-MX')} · Total {formatCurrency(Number(s.total || 0))} · Pagado {formatCurrency(salePaidTotal(s))} · Pendiente <b>{formatCurrency(salePendingTotal(s))}</b>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button className="btn" onClick={() => openSalePayments(s)}>Cobros</button>
                          </div>
                        </div>
                      ))}
                      {!filtered.length ? <div className="muted">Sin pendientes en el periodo.</div> : null}
                      {filtered.length > 50 ? <div className="muted">Mostrando 50 de {filtered.length}.</div> : null}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Pagos pendientes (por paciente)</h3>
              <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>Suma de saldos pendientes de todas las ventas.</div>
              <div style={{ height: 10 }} />
              <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
                {pendingByPatient.slice(0, 20).map((r, idx) => (
                  <div key={idx} className="listRow" style={{ padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{r.patientName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Ventas con saldo: {r.salesCount}</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{formatCurrency(r.pending)}</div>
                  </div>
                ))}
                {!pendingByPatient.length ? <div className="muted">Sin pendientes.</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Plantillas entregadas</h3>
              <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>Últimas ventas marcadas como entregadas.</div>
              <div style={{ height: 10 }} />
              <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
                {deliveredPlantillas.slice(0, 15).map((s) => (
                  <div key={s.id} className="listRow" style={{ padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{s.patientName || '(Sin nombre)'} <span className="muted" style={{ fontWeight: 400 }}>· {s.folio}</span></div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {(s as any).deliveryActualAt ? String((s as any).deliveryActualAt).slice(0, 10) : new Date(s.createdAt).toLocaleDateString('es-MX')} · Total {formatCurrency(Number(s.total || 0))}
                      </div>
                    </div>
                    <button className="btn" onClick={() => setSalePrintTarget(s)}>Ver</button>
                  </div>
                ))}
                {!deliveredPlantillas.length ? <div className="muted">Aún no hay entregas.</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Renovaciones (próximo mes)</h3>
              <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>Basado en <code>followUpAt</code>.</div>
              <div style={{ height: 10 }} />
              <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
                {renewalsNextMonth.slice(0, 20).map((s) => (
                  <div key={s.id} className="listRow" style={{ padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{s.patientName || '(Sin nombre)'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{String((s as any).followUpAt || '').slice(0, 10)} · {s.folio}</div>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>Recordar</div>
                  </div>
                ))}
                {!renewalsNextMonth.length ? <div className="muted">Sin renovaciones programadas para el próximo mes.</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Proveedor mensual</h3>
              <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>Agrupado por mes de <code>providerSentAt</code> (enviado a proveedor).</div>
              <div style={{ height: 10 }} />
              {(() => {
                const byMonth = new Map<string, { month: string; count: number; total: number; pendingCount: number; pendingTotal: number }>();
                for (const s of (sales || [])) {
                  const sentAt = String((s as any).providerSentAt || '').slice(0, 10);
                  if (!sentAt) continue;
                  const month = sentAt.slice(0, 7);
                  const due = Number((s as any).providerDue || 0);
                  const paid = Boolean((s as any).providerPaid);
                  const row = byMonth.get(month) || { month, count: 0, total: 0, pendingCount: 0, pendingTotal: 0 };
                  row.count += 1;
                  row.total += due;
                  if (!paid && due > 0) {
                    row.pendingCount += 1;
                    row.pendingTotal += due;
                  }
                  byMonth.set(month, row);
                }
                const rows = Array.from(byMonth.values()).sort((a, b) => String(b.month).localeCompare(String(a.month)));
                return (
                  <div className="list">
                    {rows.map((r) => (
                      <div key={r.month} className="listRow" style={{ padding: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800 }}>{r.month}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Ventas: {r.count} · Total proveedor: <b>{formatCurrency(r.total)}</b> · Pendiente: <b>{formatCurrency(r.pendingTotal)}</b> ({r.pendingCount})
                          </div>
                        </div>
                      </div>
                    ))}
                    {!rows.length ? <div className="muted">Aún no hay registros con providerSentAt.</div> : null}
                  </div>
                );
              })()}
            </div>
          </div>
          </div>
        ) : null}

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
              {patientDuplicates.length ? (
                <div className="card" style={{ background: '#fffbeb', borderColor: '#fde68a', marginBottom: 12 }}>
                  <div style={{ fontWeight: 800 }}>Duplicados detectados (por correo)</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Solo se detectan duplicados por <b>correo</b> (el teléfono puede ser compartido en familia).
                  </div>
                  <div style={{ height: 10 }} />
                  {patientDuplicates.slice(0, 10).map((g, idx) => (
                    <div key={idx} className="listRow" style={{ padding: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{g.email}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{g.items.map((p) => `${p.name}${p.phone ? ` (${p.phone})` : ''}`).join(' · ')}</div>
                      </div>
                      <button className="btnDanger" onClick={async () => {
                        // Keep the first item; delete the rest (after explicit preview)
                        const items = g.items.slice();
                        const keep = items[0];
                        const del = items.slice(1);
                        const msg = `Se conservará:\n- ${keep.name} (id: ${keep.id})\n\nSe eliminarán:\n${del.map((p) => `- ${p.name} (id: ${p.id})`).join('\n')}\n\n¿Confirmas eliminar?`;
                        if (!confirm(msg)) return;
                        for (const p of del) {
                          await dbService.deletePatient(p.id);
                        }
                        setUiMessage('Duplicados eliminados.');
                        setTimeout(() => setUiMessage(null), 2000);
                      }}>Eliminar duplicados</button>
                    </div>
                  ))}
                </div>
              ) : null}

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

              {patientDraft.id ? (
                <>
                  <div style={{ height: 14 }} />
                  <div className="card" style={{ background: '#f8fafc' }}>
                    <h4 style={{ marginTop: 0, marginBottom: 8 }}>Histórico</h4>

                    {(() => {
                      const plantillaSales = (patientSales || []).filter((s) => Boolean((s as any).followUpAt) || Boolean((s as any).deliveryEstimatedAt));
                      const lastPlantilla = plantillaSales[0] || null;
                      const followUpAt = lastPlantilla ? String((lastPlantilla as any).followUpAt || '') : '';
                      const target = followUpAt ? new Date(followUpAt) : null;
                      const daysLeft = target && Number.isFinite(target.getTime()) ? Math.ceil((target.getTime() - Date.now()) / (24 * 3600 * 1000)) : null;

                      return (
                        <>
                          <div className="grid3">
                            <div className="stat">
                              <div className="muted">Última compra</div>
                              <div style={{ fontWeight: 800 }}>
                                {patientSales[0]?.createdAt ? new Date(String(patientSales[0].createdAt)).toLocaleDateString('es-MX') : '—'}
                              </div>
                            </div>
                            <div className="stat">
                              <div className="muted">Últimas plantillas</div>
                              <div style={{ fontWeight: 800 }}>
                                {lastPlantilla?.createdAt ? new Date(String(lastPlantilla.createdAt)).toLocaleDateString('es-MX') : '—'}
                              </div>
                            </div>
                            <div className="stat">
                              <div className="muted">Renovación</div>
                              <div style={{ fontWeight: 800 }}>
                                {target && Number.isFinite(target.getTime())
                                  ? `${target.toLocaleDateString('es-MX')} (${daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft} días` : `hace ${Math.abs(daysLeft)} días`) : ''})`
                                  : '—'}
                              </div>
                            </div>
                          </div>

                          <div style={{ height: 10 }} />
                          <div className="muted" style={{ fontSize: 12 }}>Ventas anteriores:</div>
                          <div style={{ height: 6 }} />
                          <div className="list">
                            {(patientSales || []).slice(0, 20).map((s) => (
                              <div key={s.id} className="listRow" style={{ padding: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700 }}>{s.folio || s.id}</div>
                                  <div className="muted" style={{ fontSize: 12 }}>{new Date(String(s.createdAt)).toLocaleString('es-MX')} · Total: <b>{formatCurrency(Number((s as any).total || 0))}</b></div>
                                </div>
                                <button className="btn" onClick={() => setSalePrintTarget(s)}>Ver nota</button>
                              </div>
                            ))}
                            {!patientSales.length ? <div className="muted">Sin ventas registradas.</div> : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : null}

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
                      <div style={{ fontSize: 12 }}>
                        Total: <b>{formatCurrency(s.total)}</b>
                        {' · '}Pagado: <b>{formatCurrency(salePaidTotal(s))}</b>
                        {' · '}Pendiente: <b>{formatCurrency(salePendingTotal(s))}</b>
                        {' · '}MP: {formatCurrency(saleMpFeeTotal(s))}
                      </div>
                      <div style={{ fontSize: 12 }}>Costo: {formatCurrency(s.costTotal)} · Utilidad: <b>{formatCurrency(s.profit)}</b></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => openSalePayments(s)}>Cobros</button>
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
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Si es 0, no aparece como pendiente en Tablero.</div>
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

        {tab === 'intakes' ? (
          <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Registros (formulario)</h3>
              <div className="muted">Total: {intakes.length}</div>
            </div>

            <div className="muted" style={{ marginTop: 8 }}>
              Enlace público para pacientes:
              <div><code>{`${window.location.origin}${(import.meta as any).env?.BASE_URL || '/'}#/registro`}</code></div>
            </div>

            <div style={{ height: 12 }} />
            <input className="input" value={intakeSearch} onChange={(e) => setIntakeSearch(e.target.value)} placeholder="Buscar por nombre / teléfono / correo" />

            <div style={{ height: 12 }} />
            <div className="list">
              {intakes
                .filter((r) => {
                  const q = intakeSearch.trim().toLowerCase();
                  if (!q) return true;
                  const hay = `${r.fullName || ''} ${r.phone || ''} ${r.email || ''} ${r.residence || ''}`.toLowerCase();
                  return hay.includes(q);
                })
                .map((r) => (
                <div key={r.id} className="listRow" style={{ padding: 10, opacity: (r.status === 'approved' || r.status === 'rejected') ? 0.65 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>{r.fullName}</span>
                      {r.status === 'approved' ? <span className="pill">Aprobado</span> : null}
                      {r.status === 'rejected' ? <span className="pill" style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b' }}>Rechazado</span> : null}
                      {!r.status || r.status === 'new' ? <span className="pill" style={{ background: '#e0f2fe', borderColor: '#bae6fd', color: '#075985' }}>Nuevo</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.phone} · {r.email} · {r.residence}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={() => setIntakeEdit(r)}>Editar</button>
                    <button className="btnDanger" onClick={async () => {
                      if (!confirm('¿Eliminar registro?')) return;
                      setIntakeBusyId(r.id);
                      try {
                        await dbService.deleteIntake(r.id);
                      } finally {
                        setIntakeBusyId(null);
                      }
                    }} disabled={intakeBusyId === r.id}>Eliminar</button>

                    <button className="btnPrimary" disabled={intakeBusyId === r.id || r.status === 'approved'} onClick={async () => {
                      setIntakeBusyId(r.id);
                      try {
                        await dbService.createOrUpdatePatientFromIntake({ fullName: r.fullName, phone: r.phone, email: r.email, residence: r.residence });
                        await dbService.markIntakeApproved(r.id);
                      } finally {
                        setIntakeBusyId(null);
                      }
                    }}>{r.status === 'approved' ? 'Aprobado' : 'Aprobar'}</button>

                    <button className="btnDanger" disabled={intakeBusyId === r.id || r.status === 'rejected'} onClick={async () => {
                      if (!confirm('¿Rechazar registro?')) return;
                      setIntakeBusyId(r.id);
                      try {
                        await dbService.markIntakeRejected(r.id);
                      } finally {
                        setIntakeBusyId(null);
                      }
                    }}>{r.status === 'rejected' ? 'Rechazado' : 'Rechazar'}</button>
                  </div>
                </div>
              ))}
              {!intakes.length ? <div className="muted">Sin registros.</div> : null}
            </div>
          </div>

          {intakeEdit ? (
            <div className="modalOverlay" onClick={() => setIntakeEdit(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Editar registro</h3>

                <label className="label">Nombre completo</label>
                <input className="input" value={intakeEdit.fullName || ''} onChange={(e) => setIntakeEdit((s) => s ? ({ ...s, fullName: e.target.value }) : s)} />

                <div style={{ height: 10 }} />
                <label className="label">Número de celular</label>
                <input className="input" value={intakeEdit.phone || ''} onChange={(e) => setIntakeEdit((s) => s ? ({ ...s, phone: e.target.value }) : s)} />

                <div style={{ height: 10 }} />
                <label className="label">Correo electrónico</label>
                <input className="input" value={intakeEdit.email || ''} onChange={(e) => setIntakeEdit((s) => s ? ({ ...s, email: e.target.value }) : s)} />

                <div style={{ height: 10 }} />
                <label className="label">Lugar de residencia</label>
                <input className="input" value={intakeEdit.residence || ''} onChange={(e) => setIntakeEdit((s) => s ? ({ ...s, residence: e.target.value }) : s)} />

                <div style={{ height: 14 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setIntakeEdit(null)}>Cancelar</button>
                  <button className="btnPrimary" onClick={async () => {
                    if (!intakeEdit) return;
                    setIntakeBusyId(intakeEdit.id);
                    try {
                      await dbService.updateIntake(intakeEdit.id, {
                        fullName: intakeEdit.fullName,
                        phone: intakeEdit.phone,
                        email: intakeEdit.email,
                        residence: intakeEdit.residence
                      } as any);
                      setIntakeEdit(null);
                    } finally {
                      setIntakeBusyId(null);
                    }
                  }} disabled={intakeBusyId === intakeEdit.id}>Guardar</button>
                </div>
              </div>
            </div>
          ) : null}
          </>
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
                value={calendarUrlDraft}
                onChange={(e) => setCalendarUrlDraft(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
              />

              <div style={{ height: 10 }} />
              <label className="label">Secret</label>
              <input
                className="input"
                value={calendarSecretDraft}
                onChange={(e) => setCalendarSecretDraft(e.target.value)}
                placeholder="(igual al SICE_WEBHOOK_SECRET del script)"
              />

              <div style={{ height: 10 }} />
              <button
                className="btnPrimary"
                disabled={savingCalendar}
                onClick={async () => {
                  try {
                    setSavingCalendar(true);
                    await dbService.updateSiceSettings({
                      calendarWebhookUrl: calendarUrlDraft.trim(),
                      calendarWebhookSecret: calendarSecretDraft.trim()
                    } as any);
                    setUiMessage('Automatización guardada.');
                    setTimeout(() => setUiMessage(null), 1500);
                  } catch (e: any) {
                    setUiMessage(e?.message || 'No se pudo guardar automatización.');
                  } finally {
                    setSavingCalendar(false);
                  }
                }}
              >
                {savingCalendar ? 'Guardando…' : 'Guardar'}
              </button>

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
