import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, startOfWeekIso, endOfWeekIso, addMonthsIso, salePaidTotal, salePendingTotal, saleMpFeeTotal, SALE_MP_FEE_RATE } from './utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { dbService } from '../../services/db';

interface DashboardProps {
  settings: any;
  sales: any[];
  patients: any[];
  appointments: any[];
  setUiMessage: (msg: string | null) => void;
}

type DashboardRangePreset = 'quincena' | 'mes' | 'anio' | 'rango';

const Dashboard: React.FC<DashboardProps> = ({
  settings,
  sales,
  patients,
  appointments,
  setUiMessage
}) => {
  // Dashboard range state
  const [dashboardPreset, setDashboardPreset] = useState<DashboardRangePreset>('mes');
  const [cobranzaFrom, setCobranzaFrom] = useState<string>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [cobranzaTo, setCobranzaTo] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );

  // Chart controls
  const [dashboardChartMetric, setDashboardChartMetric] = useState<'ventas' | 'gananciaNeta'>('ventas');
  const [dashboardChartBucket, setDashboardChartBucket] = useState<'mes' | 'quincena' | 'dia'>('mes');

  // Provider shipments
  const [providerShipments, setProviderShipments] = useState<any[]>([]);
  const [providerShipmentDraft, setProviderShipmentDraft] = useState<any>({
    date: new Date().toISOString().slice(0, 10),
    cost: 348,
    notes: ''
  });

  // Watch provider shipments
  useEffect(() => {
    const unsub = dbService.watchProviderShipments(setProviderShipments);
    return () => unsub();
  }, []);

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

    // quincena
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

  // Dashboard range
  const dashboardRange = useMemo(() => {
    const from = cobranzaFrom ? `${cobranzaFrom}T00:00:00.000Z` : '';
    const to = cobranzaTo ? `${cobranzaTo}T23:59:59.999Z` : '';
    return { from, to };
  }, [cobranzaFrom, cobranzaTo]);

  // Filtered sales
  const dashboardSales = useMemo(() => {
    const { from, to } = dashboardRange;
    return (sales || []).filter((s) => {
      const t = String(s.createdAt || '');
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [sales, dashboardRange]);

  // KPIs
  const dashboardKpis = useMemo(() => {
    const ventas = dashboardSales.reduce((acc: number, s: any) => acc + Number(s.total || 0), 0);
    const costo = dashboardSales.reduce((acc: number, s: any) => acc + Number(s.costTotal || 0), 0);
    const iva = dashboardSales.reduce((acc: number, s: any) => acc + Number(s.iva || 0), 0);
    const mp = dashboardSales.reduce((acc: number, s: any) => acc + saleMpFeeTotal(s), 0);
    const gananciaNeta = dashboardSales.reduce(
      (acc: number, s: any) =>
        acc + (Number(s.subtotal || 0) - Number(s.costTotal || 0) - saleMpFeeTotal(s)),
      0
    );

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const proveedorPendienteMensual = (sales || [])
      .filter((s: any) => !s.providerPaid && Number(s.providerDue || 0) > 0 && String(s.providerSentAt || '').slice(0, 7) === thisMonth)
      .reduce((acc: number, s: any) => acc + Number(s.providerDue || 0), 0);

    const proveedorPendienteAcumulado = (sales || [])
      .filter((s: any) => !s.providerPaid && Number(s.providerDue || 0) > 0)
      .reduce((acc: number, s: any) => acc + Number(s.providerDue || 0), 0);

    const proveedorEnviosMensual = (providerShipments || [])
      .filter((x: any) => String(x.date || '').slice(0, 7) === thisMonth)
      .reduce((acc: number, x: any) => acc + Number(x.cost || 0), 0);

    const proveedorVentasMensualTotal = (sales || [])
      .filter((s: any) => String(s.providerSentAt || '').slice(0, 7) === thisMonth)
      .reduce((acc: number, s: any) => acc + Number(s.providerDue || 0), 0);

    const proveedorTotalMensual = proveedorVentasMensualTotal + proveedorEnviosMensual;

    return {
      ventas, costo, iva, mp, gananciaNeta,
      proveedorPendienteMensual, proveedorPendienteAcumulado,
      proveedorEnviosMensual, proveedorVentasMensualTotal,
      proveedorTotalMensual, proveedorMes: thisMonth
    };
  }, [dashboardSales, sales, providerShipments]);

  // Chart data
  const dashboardChartData = useMemo(() => {
    const getValue = (s: any) => {
      if (dashboardChartMetric === 'ventas') return Number(s.total || 0);
      return Number(s.subtotal || 0) - Number(s.costTotal || 0) - saleMpFeeTotal(s);
    };

    const toKey = (iso: string) => {
      const d = new Date(String(iso || ''));
      if (!Number.isFinite(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (dashboardChartBucket === 'dia') return { key: `${y}-${m}-${day}`, label: `${day}/${m}` };
      if (dashboardChartBucket === 'quincena') {
        const q = d.getDate() <= 15 ? '1Q' : '2Q';
        return { key: `${y}-${m}-${q}`, label: `${m}/${String(y).slice(-2)} ${q}` };
      }
      return { key: `${y}-${m}`, label: `${m}/${String(y).slice(-2)}` };
    };

    const agg = new Map<string, { key: string; label: string; total: number }>();
    for (const s of dashboardSales || []) {
      const k = toKey(String(s.createdAt || ''));
      if (!k) continue;
      const row = agg.get(k.key) || { key: k.key, label: k.label, total: 0 };
      row.total += getValue(s);
      agg.set(k.key, row);
    }

    const out = Array.from(agg.values()).sort((a, b) => a.key.localeCompare(b.key));
    if (dashboardChartBucket === 'dia' && out.length > 31) return out.slice(out.length - 31);
    return out;
  }, [dashboardSales, dashboardChartMetric, dashboardChartBucket]);

  // Pending by patient
  const pendingByPatient = useMemo(() => {
    const by = new Map<string, { patientId?: string; patientName: string; pending: number; salesCount: number }>();
    for (const s of sales || []) {
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

  // Renewals next month
  const renewalsNextMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return (sales || [])
      .filter((s: any) => {
        const fu = String(s.followUpAt || '');
        if (!fu) return false;
        const d = new Date(fu);
        if (!Number.isFinite(d.getTime())) return false;
        return d >= start && d <= end;
      })
      .sort((a: any, b: any) => String(a.followUpAt || '').localeCompare(String(b.followUpAt || '')));
  }, [sales]);

  // Delivered plantillas
  const deliveredPlantillas = useMemo(() => {
    return (sales || [])
      .filter((s: any) => Boolean(s.delivered) || Boolean(s.deliveryActualAt))
      .slice()
      .sort((a: any, b: any) =>
        String(b.deliveryActualAt || b.createdAt || '').localeCompare(
          String(a.deliveryActualAt || a.createdAt || '')
        )
      );
  }, [sales]);

  // Provider monthly summary
  const providerMonthlySummary = useMemo(() => {
    const byMonth = new Map<string, {
      month: string; count: number; salesTotal: number;
      shipmentCost: number; total: number; pendingCount: number; pendingTotal: number;
    }>();

    for (const s of sales || []) {
      const sentAt = String(s.providerSentAt || '').slice(0, 10);
      if (!sentAt) continue;
      const month = sentAt.slice(0, 7);
      const due = Number(s.providerDue || 0);
      const paid = Boolean(s.providerPaid);
      const row = byMonth.get(month) || {
        month, count: 0, salesTotal: 0, shipmentCost: 0,
        total: 0, pendingCount: 0, pendingTotal: 0
      };
      row.count += 1;
      row.salesTotal += due;
      row.total += due;
      if (!paid && due > 0) {
        row.pendingCount += 1;
        row.pendingTotal += due;
      }
      byMonth.set(month, row);
    }

    for (const sh of providerShipments || []) {
      const month = String(sh.date || '').slice(0, 7);
      if (!month) continue;
      const row = byMonth.get(month) || {
        month, count: 0, salesTotal: 0, shipmentCost: 0,
        total: 0, pendingCount: 0, pendingTotal: 0
      };
      row.shipmentCost += Number(sh.cost || 0);
      row.total += Number(sh.cost || 0);
      byMonth.set(month, row);
    }

    return Array.from(byMonth.values()).sort((a, b) => String(b.month).localeCompare(String(a.month)));
  }, [sales, providerShipments]);

  // Cobranza filtered sales
  const cobranzaFiltered = useMemo(() => {
    const { from, to } = dashboardRange;
    return (sales || [])
      .filter((s) => {
        const t = String(s.createdAt || '');
        if (from && t < from) return false;
        if (to && t > to) return false;
        return salePendingTotal(s) > 0.009;
      })
      .sort((a, b) => salePendingTotal(b) - salePendingTotal(a));
  }, [sales, dashboardRange]);

  return (
    <div className="dashboardStack">
      {/* Header with presets */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Tablero de Control</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Periodo:{' '}
              <b>{new Date(cobranzaFrom + 'T00:00:00').toLocaleDateString('es-MX')}</b>{' '}
              –{' '}
              <b>{new Date(cobranzaTo + 'T00:00:00').toLocaleDateString('es-MX')}</b>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['quincena', 'mes', 'anio', 'rango'] as const).map((p) => (
              <button
                key={p}
                className="btn"
                style={
                  dashboardPreset === p
                    ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)' }
                    : undefined
                }
                onClick={() => {
                  setDashboardPreset(p);
                  if (p !== 'rango') applyDashboardPreset(p);
                }}
              >
                {p === 'quincena' ? 'Quincena' : p === 'mes' ? 'Mes' : p === 'anio' ? 'Año' : 'Rango'}
              </button>
            ))}
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cobranza pendiente</span><b>{formatCurrency(dashboardSales.reduce((acc: number, s: any) => acc + salePendingTotal(s), 0))}</b></div>
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
            <div className="muted" style={{ fontSize: 12 }}>IVA cobrado</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.iva)}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>IVA por pagar: {formatCurrency(dashboardKpis.iva)}</div>
          </div>
          <div className="statCard">
            <div className="muted" style={{ fontSize: 12 }}>Ganancia neta (– MP)</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{formatCurrency(dashboardKpis.gananciaNeta)}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>MP estimado: {formatCurrency(dashboardKpis.mp)}</div>
          </div>
        </div>

        <div style={{ height: 12 }} />
        <div className="summaryBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div><b>Proveedor pendiente ({dashboardKpis.proveedorMes})</b></div>
            <div>{formatCurrency(dashboardKpis.proveedorPendienteMensual)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
            <div><b>Envíos proveedor ({dashboardKpis.proveedorMes})</b></div>
            <div>{formatCurrency(dashboardKpis.proveedorEnviosMensual)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
            <div><b>Total proveedor ({dashboardKpis.proveedorMes})</b></div>
            <div>{formatCurrency(dashboardKpis.proveedorTotalMensual)}</div>
          </div>
        </div>

        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontWeight: 800 }}>Gráfica</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 160 }} value={dashboardChartMetric} onChange={(e) => setDashboardChartMetric(e.target.value as any)}>
              <option value="ventas">Ventas</option>
              <option value="gananciaNeta">Ganancia neta</option>
            </select>
            <select className="input" style={{ width: 160 }} value={dashboardChartBucket} onChange={(e) => setDashboardChartBucket(e.target.value as any)}>
              <option value="mes">Por mes</option>
              <option value="quincena">Por quincena</option>
              <option value="dia">Diario</option>
            </select>
          </div>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={dashboardChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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
        {/* Pendiente proveedor */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pendiente proveedor</h3>
          <div className="muted" style={{ marginTop: -6 }}>Ventas con pago a proveedor pendiente (para confirmar envío/pago).</div>
          <div style={{ height: 10 }} />
          {sales
            .filter((s: any) => !s.providerPaid && Number(s.providerDue || 0) > 0)
            .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 20)
            .map((s: any) => (
              <div key={s.id} className="listRow" style={{ padding: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{s.patientName || '(Sin nombre)'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleDateString('es-MX')} · Pendiente proveedor:{' '}
                    <b>{formatCurrency(Number(s.providerDue || 0))}</b>
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
          {!sales.some((s: any) => !s.providerPaid && Number(s.providerDue || 0) > 0) ? (
            <div className="muted">Sin pendientes con proveedor.</div>
          ) : null}
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Nota: este listado es el que usaremos para el recordatorio de los sábados.
          </div>
        </div>

        {/* Agenda resumen */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Agenda (resumen)</h3>
          <div className="muted">Próximas citas (semana actual):</div>
          <div style={{ height: 10 }} />
          {appointments
            .filter((a: any) => String(a.status || 'scheduled') !== 'cancelled' && new Date(a.start).getTime() >= (Date.now() - 60_000))
            .slice()
            .sort((a: any, b: any) => String(a.start).localeCompare(String(b.start)))
            .slice(0, 10)
            .map((a: any) => (
              <div key={a.id} className="listItem" style={{ alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700 }}>
                  {new Date(a.start).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>{a.patientName ? `${a.patientName} · ` : ''}{a.title}</div>
              </div>
            ))}
          {!appointments.length ? <div className="muted">Sin citas en esta semana.</div> : null}
        </div>

        {/* Cobranza */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Cobranza</h3>
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
              <div className="summaryBox">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ventas</span><b>{cobranzaFiltered.length}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pendiente</span>
                  <b>{formatCurrency(cobranzaFiltered.reduce((acc: number, s: any) => acc + salePendingTotal(s), 0))}</b>
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
            {cobranzaFiltered.slice(0, 50).map((s: any) => (
              <div key={s.id} className="listRow" style={{ padding: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {s.patientName || '(Sin nombre)'}{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>· {s.folio}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleDateString('es-MX')} · Total {formatCurrency(Number(s.total || 0))} · Pagado {formatCurrency(salePaidTotal(s))} · Pendiente <b>{formatCurrency(salePendingTotal(s))}</b>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn" onClick={() => {
                    // Signal to parent via a custom event or just show message
                    // The original App used openSalePayments, which opened a modal.
                    // Since that modal lives in the parent, we emit a custom event
                    window.dispatchEvent(new CustomEvent('sice:open-sale-payments', { detail: s }));
                  }}>Cobros</button>
                </div>
              </div>
            ))}
            {!cobranzaFiltered.length ? <div className="muted">Sin pendientes en el periodo.</div> : null}
            {cobranzaFiltered.length > 50 ? <div className="muted">Mostrando 50 de {cobranzaFiltered.length}.</div> : null}
          </div>
        </div>

        {/* Pagos pendientes por paciente */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pagos pendientes (por paciente)</h3>
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

        {/* Plantillas entregadas */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Plantillas entregadas</h3>
          <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>Últimas ventas marcadas como entregadas.</div>
          <div style={{ height: 10 }} />
          <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
            {deliveredPlantillas.slice(0, 15).map((s: any) => (
              <div key={s.id} className="listRow" style={{ padding: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {s.patientName || '(Sin nombre)'}{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>· {s.folio}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.deliveryActualAt
                      ? String(s.deliveryActualAt).slice(0, 10)
                      : new Date(s.createdAt).toLocaleDateString('es-MX')
                    }{' '}
                    · Total {formatCurrency(Number(s.total || 0))}
                  </div>
                </div>
                <button className="btn" onClick={() => {
                  window.dispatchEvent(new CustomEvent('sice:print-sale', { detail: s }));
                }}>Ver</button>
              </div>
            ))}
            {!deliveredPlantillas.length ? <div className="muted">Aún no hay entregas.</div> : null}
          </div>
        </div>

        {/* Renovaciones próximo mes */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Renovaciones (próximo mes)</h3>
          <div style={{ height: 10 }} />
          <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>
            {renewalsNextMonth.slice(0, 20).map((s: any) => (
              <div key={s.id} className="listRow" style={{ padding: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{s.patientName || '(Sin nombre)'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {String(s.followUpAt || '').slice(0, 10)} · {s.folio}
                  </div>
                </div>
              </div>
            ))}
            {!renewalsNextMonth.length ? (
              <div className="muted">Sin renovaciones programadas para el próximo mes.</div>
            ) : null}
          </div>
        </div>

        {/* Proveedor mensual */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Proveedor mensual</h3>
          <div style={{ height: 10 }} />
          <div className="list">
            {providerMonthlySummary.map((r) => (
              <div key={r.month} className="listRow" style={{ padding: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{r.month}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Ventas: {r.count} · Proveedor ventas: <b>{formatCurrency(r.salesTotal)}</b> · Envíos: <b>{formatCurrency(r.shipmentCost)}</b> · Total proveedor: <b>{formatCurrency(r.total)}</b> · Pendiente: <b>{formatCurrency(r.pendingTotal)}</b> ({r.pendingCount})
                  </div>
                </div>
              </div>
            ))}
            {!providerMonthlySummary.length ? <div className="muted">Aún no hay registros.</div> : null}
          </div>
        </div>

        {/* Envíos proveedor */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Envíos proveedor</h3>
          <div className="muted" style={{ marginTop: -6 }}>Gasto mensual de envío/paquetería hacia el proveedor.</div>

          <div style={{ height: 10 }} />
          <div className="grid3">
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={String(providerShipmentDraft.date || '')}
                onChange={(e) =>
                  setProviderShipmentDraft((s: any) => ({ ...s, date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Costo</label>
              <input
                className="input"
                type="number"
                value={Number(providerShipmentDraft.cost ?? 348)}
                onChange={(e) =>
                  setProviderShipmentDraft((s: any) => ({ ...s, cost: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <label className="label">Notas</label>
              <input
                className="input"
                value={String(providerShipmentDraft.notes || '')}
                onChange={(e) =>
                  setProviderShipmentDraft((s: any) => ({ ...s, notes: e.target.value }))
                }
                placeholder="Opcional"
              />
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btnPrimary"
              onClick={async () => {
                const date = String(providerShipmentDraft.date || '').slice(0, 10);
                if (!date) return;
                await dbService.upsertProviderShipment({
                  id: providerShipmentDraft.id,
                  date,
                  cost: Number(providerShipmentDraft.cost ?? 348),
                  notes: String(providerShipmentDraft.notes || '')
                } as any);
                setProviderShipmentDraft({
                  date: new Date().toISOString().slice(0, 10),
                  cost: 348,
                  notes: ''
                });
                setUiMessage('Envío guardado.');
                setTimeout(() => setUiMessage(null), 2000);
              }}
            >
              {providerShipmentDraft.id ? 'Actualizar envío' : 'Agregar envío'}
            </button>
            {providerShipmentDraft.id ? (
              <button
                className="btn"
                onClick={() =>
                  setProviderShipmentDraft({
                    date: new Date().toISOString().slice(0, 10),
                    cost: 348,
                    notes: ''
                  })
                }
              >
                Cancelar
              </button>
            ) : null}
          </div>

          <div style={{ height: 12 }} />
          <div className="list" style={{ maxHeight: 320, overflow: 'auto' }}>
            {providerShipments
              .slice()
              .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))
              .slice(0, 40)
              .map((sh: any) => (
                <div key={sh.id} className="listRow" style={{ padding: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>
                      {String(sh.date || '').slice(0, 10)}{' '}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        · {formatCurrency(Number(sh.cost || 0))}
                      </span>
                    </div>
                    {sh.notes ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {sh.notes}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn"
                      onClick={() => setProviderShipmentDraft(sh)}
                    >
                      Editar
                    </button>
                    <button
                      className="btnDanger"
                      onClick={async () => {
                        if (!confirm('¿Eliminar este envío?')) return;
                        await dbService.deleteProviderShipment(sh.id);
                        setUiMessage('Envío eliminado.');
                        setTimeout(() => setUiMessage(null), 2000);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            {!providerShipments.length ? <div className="muted">Sin envíos registrados.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
