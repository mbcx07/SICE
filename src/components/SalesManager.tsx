import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlusCircle, Printer, Trash2, Package } from 'lucide-react';
import { formatCurrency, salePaidTotal, salePendingTotal, saleMpFeeTotal, addMonthsIso } from './utils';
import { siceService } from '../../services/sice';
import { dbService } from '../../services/db';
import type { Sale, SaleLineItem, CatalogItem, Patient, SalePayment, SiceSettings } from './types';

// ---------- Template seeds (3 plantillas con fotos de /catalog/) ----------
const TEMPLATE_SEEDS: Array<Partial<CatalogItem>> = [
  {
    type: 'product',
    name: 'Plantilla de silicona',
    salePrice: 450,
    providerCost: 120,
    isTemplate: true,
    active: true,
    photoDataUrl: '/catalog/plantilla-silicona.jpg'
  },
  {
    type: 'product',
    name: 'Plantilla ortopédica estándar',
    salePrice: 600,
    providerCost: 180,
    isTemplate: true,
    active: true,
    photoDataUrl: '/catalog/plantilla-ortopedica.jpg'
  },
  {
    type: 'product',
    name: 'Plantilla deportiva',
    salePrice: 750,
    providerCost: 220,
    isTemplate: true,
    active: true,
    photoDataUrl: '/catalog/plantilla-deportiva.jpg'
  }
];

const currentYear = new Date().getFullYear();

const SalesManager: React.FC = () => {
  // ---- State: Sales ----
  const [sales, setSales] = useState<Sale[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [settings, setSettings] = useState<SiceSettings>({ id: 'global', themeColor: '#0ea5e9' });

  // ---- State: Sale form ----
  const [patientId, setPatientId] = useState('');
  const [items, setItems] = useState<SaleLineItem[]>([]);
  const [ivaRate, setIvaRate] = useState(0.16);
  const [shippingCost, setShippingCost] = useState(0);
  const [deliveryEstimatedAt, setDeliveryEstimatedAt] = useState('');
  const [providerDue, setProviderDue] = useState(0);
  const [invoiceRequired, setInvoiceRequired] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [providerPaid, setProviderPaid] = useState(false);
  const [saleNotes, setSaleNotes] = useState('');

  // ---- State: Catalog form ----
  const [catForm, setCatForm] = useState<Partial<CatalogItem>>({
    type: 'product',
    name: '',
    salePrice: 0,
    providerCost: 0,
    isTemplate: false,
    active: true,
    photoDataUrl: ''
  });
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const catalogPhotoRef = useRef<HTMLInputElement>(null);

  // ---- State: Payments modal ----
  const [paymentsTargetSaleId, setPaymentsTargetSaleId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ method: string; amount: string; date: string; notes: string }>({
    method: 'cash',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  // ---- Watchers ----
  useEffect(() => {
    const unsub1 = siceService.watchSales(currentYear, setSales);
    // wrap async
    let cancelled = false;
    siceService.watchSales(currentYear, setSales).then((unsub) => {
      if (cancelled) unsub();
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsub1 = siceService.watchCatalogItems(setCatalog);
    const unsub2 = siceService.watchPatients(setPatients);
    const unsub3 = siceService.watchSiceSettings(setSettings);
    // Sales watcher
    let cleanupSales: (() => void) | null = null;
    siceService.watchSales(currentYear, setSales).then((unsub) => { cleanupSales = unsub; });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      if (cleanupSales) cleanupSales();
    };
  }, []);

  // ---- Seed templates ----
  useEffect(() => {
    const seedIfMissing = async () => {
      const existingNames = new Set(catalog.map((c) => c.name.toLowerCase().trim()));
      for (const seed of TEMPLATE_SEEDS) {
        if (existingNames.has((seed.name || '').toLowerCase().trim())) continue;
        try {
          await siceService.upsertCatalogItem(seed as any);
        } catch (_) { /* ignore */ }
      }
    };
    if (catalog.length > 0) seedIfMissing();
  }, [catalog]);

  // ---- Derived ----
  const activeCatalog = useMemo(() => catalog.filter((c) => c.active !== false), [catalog]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId) ?? null,
    [patients, patientId]
  );

  // Sale form preview
  const itemsSubtotal = useMemo(
    () => items.reduce((acc, it) => acc + (it.qty || 0) * (it.unitPrice || 0), 0),
    [items]
  );
  const itemsCost = useMemo(
    () => items.reduce((acc, it) => acc + (it.qty || 0) * (it.unitCost || 0), 0),
    [items]
  );
  const subtotal = itemsSubtotal; // shipping not charged to patient per sice spec
  const iva = subtotal * ivaRate;
  const total = subtotal + iva;
  const costTotal = itemsCost + shippingCost;
  const profit = subtotal - costTotal;

  // ---- Line item helpers ----
  const addLineItem = () => {
    setItems((prev) => [
      ...prev,
      { catalogItemId: '', name: '', qty: 1, unitPrice: 0, unitCost: 0 }
    ]);
  };

  const removeLineItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx: number, field: keyof SaleLineItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };

      // If catalogItemId changed, auto-fill name/price/cost
      if (field === 'catalogItemId' && value) {
        const cat = catalog.find((c) => c.id === value);
        if (cat) {
          next[idx] = {
            ...next[idx],
            name: cat.name || next[idx].name,
            unitPrice: cat.salePrice ?? cat.unitPrice ?? next[idx].unitPrice,
            unitCost: cat.providerCost ?? cat.unitCost ?? next[idx].unitCost
          };
        }
      }
      return next;
    });
  };

  // ---- Register sale ----
  const handleRegisterSale = async () => {
    if (itemsSubtotal <= 0) {
      alert('Agrega al menos un concepto con precio.');
      return;
    }

    const followUpAt = (() => {
      if (!deliveryEstimatedAt) return undefined;
      // 11 months after estimated delivery
      return addMonthsIso(new Date(deliveryEstimatedAt).toISOString(), 11);
    })();

    // Check for template items
    const hasTemplate = items.some((it) => {
      if (!it.catalogItemId) return false;
      const cat = catalog.find((c) => c.id === it.catalogItemId);
      return cat?.isTemplate === true;
    });

    try {
      const saleId = await siceService.createSale({
        patientId: patientId || undefined,
        patientName: selectedPatient?.name || undefined,
        patientEmail: selectedPatient?.email || undefined,
        patientPhone: selectedPatient?.phone || undefined,
        invoiceRequired,
        delivered,
        deliveryEstimatedAt: deliveryEstimatedAt || undefined,
        providerPaid,
        providerDue: providerDue || 0,
        items,
        shipping: 0,
        shippingCost,
        ivaRate,
        notes: saleNotes || undefined
      });

      // If template items exist, update with followUp
      if (hasTemplate && followUpAt) {
        await siceService.updateSale(saleId, { followUpAt, deliveryEstimatedAt: deliveryEstimatedAt || undefined } as any);
      }

      // Calendar webhook
      if (settings.calendarWebhookUrl && selectedPatient && deliveryEstimatedAt) {
        const webhookUrl = settings.calendarWebhookUrl;
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'createEvent',
              secret: settings.calendarWebhookSecret || '',
              title: `Entrega: ${selectedPatient.name}`,
              date: deliveryEstimatedAt.slice(0, 10),
              patientName: selectedPatient.name,
              patientEmail: selectedPatient.email || '',
              patientPhone: selectedPatient.phone || '',
              saleFolio: `VTA-${currentYear}-XXXXXX`,
              notes: saleNotes || ''
            })
          });
        } catch (_) { /* ignore webhook errors */ }
      }

      // Reset form
      setPatientId('');
      setItems([]);
      setShippingCost(0);
      setDeliveryEstimatedAt('');
      setProviderDue(0);
      setInvoiceRequired(false);
      setDelivered(false);
      setProviderPaid(false);
      setSaleNotes('');

      alert('Venta registrada exitosamente.');
    } catch (err: any) {
      alert('Error al registrar venta: ' + (err?.message ?? err));
    }
  };

  // ---- Print ----
  const handlePrint = () => {
    window.print();
  };

  // ---- Delete sale ----
  const handleDeleteSale = async (id: string) => {
    if (!window.confirm('¿Eliminar esta venta?')) return;
    try {
      await siceService.deleteSale(id);
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message ?? err));
    }
  };

  // ---- Payments ----
  const openPayments = (saleId: string) => {
    setPaymentsTargetSaleId(saleId);
    setPaymentForm({ method: 'cash', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  };

  const addPayment = async () => {
    if (!paymentsTargetSaleId) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) return;

    const sale = sales.find((s) => s.id === paymentsTargetSaleId);
    if (!sale) return;

    const newPayments: SalePayment[] = [
      ...(sale.payments || []),
      {
        id: Math.random().toString(36).slice(2, 11),
        method: paymentForm.method as any,
        amount,
        date: paymentForm.date || new Date().toISOString().slice(0, 10),
        notes: paymentForm.notes || undefined,
        createdAt: new Date().toISOString()
      }
    ];

    try {
      await siceService.updateSale(paymentsTargetSaleId, { payments: newPayments } as any);
      setPaymentForm({ method: 'cash', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' });
    } catch (err: any) {
      alert('Error al registrar pago: ' + (err?.message ?? err));
    }
  };

  const deletePayment = async (saleId: string, paymentId: string) => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;
    const newPayments = (sale.payments || []).filter((p) => p.id !== paymentId);
    try {
      await siceService.updateSale(saleId, { payments: newPayments } as any);
    } catch (err: any) {
      alert('Error al eliminar pago: ' + (err?.message ?? err));
    }
  };

  const paymentsTargetSale = useMemo(
    () => sales.find((s) => s.id === paymentsTargetSaleId) ?? null,
    [sales, paymentsTargetSaleId]
  );

  // ---- Catalog CRUD ----
  const handleCatSave = async () => {
    const name = (catForm.name || '').trim();
    if (!name) return;
    try {
      await siceService.upsertCatalogItem({
        id: editingCatalogId || undefined,
        type: catForm.type || 'product',
        name,
        salePrice: Number(catForm.salePrice) || 0,
        providerCost: Number(catForm.providerCost) || 0,
        isTemplate: Boolean(catForm.isTemplate),
        active: catForm.active !== false,
        photoDataUrl: catForm.photoDataUrl || undefined
      } as any);
      setEditingCatalogId(null);
      setCatForm({ type: 'product', name: '', salePrice: 0, providerCost: 0, isTemplate: false, active: true, photoDataUrl: '' });
    } catch (err: any) {
      alert('Error al guardar catálogo: ' + (err?.message ?? err));
    }
  };

  const handleCatDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este ítem del catálogo?')) return;
    try {
      await siceService.deleteCatalogItem(id);
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message ?? err));
    }
  };

  const editCatalogItem = (item: CatalogItem) => {
    setEditingCatalogId(item.id);
    setCatForm({
      type: item.type || 'product',
      name: item.name || '',
      salePrice: item.salePrice ?? item.unitPrice ?? 0,
      providerCost: item.providerCost ?? item.unitCost ?? 0,
      isTemplate: Boolean(item.isTemplate),
      active: item.active !== false,
      photoDataUrl: item.photoDataUrl || ''
    });
    setShowCatalogPanel(true);
  };

  const handleCatPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCatForm((f) => ({ ...f, photoDataUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  // ===================== RENDER =====================
  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>
      {/* LEFT: Sales list */}
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>📋 Ventas {currentYear}</span>
          <button
            onClick={() => setShowCatalogPanel((v) => !v)}
            style={{
              padding: '6px 12px',
              background: showCatalogPanel ? '#3b82f6' : '#f1f5f9',
              color: showCatalogPanel ? '#fff' : '#475569',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Package size={14} /> Catálogo
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sales.map((s) => (
            <div
              key={s.id}
              style={{
                padding: 10,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 12
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.folio}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => openPayments(s.id)}
                    title="Pagos"
                    style={{
                      padding: '2px 8px',
                      border: '1px solid #3b82f6',
                      borderRadius: 4,
                      background: '#eff6ff',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    💳 {formatCurrency(salePaidTotal(s))} / {formatCurrency(Number(s.total) || 0)}
                  </button>
                  <button
                    onClick={() => handleDeleteSale(s.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#ef4444',
                      padding: 2
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div style={{ color: '#475569', marginTop: 2 }}>
                {s.patientName || 'Sin paciente'}
                {s.patientPhone ? ` · 📞 ${s.patientPhone}` : ''}
              </div>

              <div style={{ color: '#64748b', marginTop: 2 }}>
                {(s.items || []).map((it) => `${it.name} ×${it.qty}`).join(', ')}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11 }}>
                {s.invoiceRequired && <span style={{ color: '#2563eb' }}>📄 Factura</span>}
                {s.delivered ? (
                  <span style={{ color: '#16a34a' }}>✅ Entregado</span>
                ) : (
                  <span style={{ color: '#f59e0b' }}>⏳ Pendiente</span>
                )}
                {s.providerPaid ? (
                  <span style={{ color: '#16a34a' }}>💰 Proveedor pagado</span>
                ) : s.providerDue ? (
                  <span style={{ color: '#ef4444' }}>⚠️ Debe proveedor: {formatCurrency(Number(s.providerDue))}</span>
                ) : null}
              </div>

              {salePendingTotal(s) > 0 && (
                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                  Pendiente: {formatCurrency(salePendingTotal(s))}
                </div>
              )}
            </div>
          ))}
          {sales.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>
              No hay ventas en {currentYear}
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE: Sale form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          flex: 1
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>🛒 Nueva venta</div>

          {/* Patient select */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Paciente</label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
              >
                <option value="">— Sin paciente —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Entrega probable</label>
              <input
                type="date"
                value={deliveryEstimatedAt}
                onChange={(e) => setDeliveryEstimatedAt(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Conceptos</span>
              <button
                onClick={addLineItem}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  border: '1px solid #3b82f6',
                  borderRadius: 6,
                  background: '#eff6ff',
                  color: '#2563eb',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                <PlusCircle size={14} /> Agregar
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: 12, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
                Agrega conceptos del catálogo
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={it.catalogItemId || ''}
                      onChange={(e) => updateLineItem(idx, 'catalogItemId', e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                    >
                      <option value="">— Seleccionar —</option>
                      {activeCatalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({formatCurrency(c.salePrice ?? c.unitPrice ?? 0)})
                          {c.isTemplate ? ' 🦶' : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateLineItem(idx, 'name', e.target.value)}
                      placeholder="Nombre"
                      style={{ width: 120, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                    />
                    <input
                      type="number"
                      value={it.qty}
                      min={1}
                      onChange={(e) => updateLineItem(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 50, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                    />
                    <input
                      type="number"
                      value={it.unitPrice}
                      min={0}
                      step="0.01"
                      onChange={(e) => updateLineItem(idx, 'unitPrice', Number(e.target.value) || 0)}
                      placeholder="Precio"
                      title="Precio unitario"
                      style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                    />
                    <input
                      type="number"
                      value={it.unitCost}
                      min={0}
                      step="0.01"
                      onChange={(e) => updateLineItem(idx, 'unitCost', Number(e.target.value) || 0)}
                      placeholder="Costo"
                      title="Costo unitario"
                      style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => removeLineItem(idx)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IVA + Shipping + Provider */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>IVA</label>
              <select
                value={ivaRate}
                onChange={(e) => setIvaRate(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
              >
                <option value={0.16}>16%</option>
                <option value={0}>0%</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Costo envío</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={shippingCost}
                onChange={(e) => setShippingCost(Number(e.target.value) || 0)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Pago proveedor</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={providerDue}
                onChange={(e) => setProviderDue(Number(e.target.value) || 0)}
                placeholder="Monto pendiente"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={invoiceRequired} onChange={(e) => setInvoiceRequired(e.target.checked)} />
                📄 Factura
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
                ✅ Entregado
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={providerPaid} onChange={(e) => setProviderPaid(e.target.checked)} />
                💰 Proveedor pagado
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {/* PREVIEW */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            fontSize: 12
          }}>
            <div>
              <span style={{ color: '#64748b' }}>Subtotal:</span>{' '}
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>IVA ({(ivaRate * 100).toFixed(0)}%):</span>{' '}
              <strong>{formatCurrency(iva)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Total:</span>{' '}
              <strong style={{ color: '#2563eb', fontSize: 14 }}>{formatCurrency(total)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Costo:</span>{' '}
              <strong>{formatCurrency(costTotal)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Utilidad:</span>{' '}
              <strong style={{ color: profit >= 0 ? '#16a34a' : '#ef4444' }}>
                {formatCurrency(profit)}
              </strong>
            </div>
            {selectedPatient && (
              <div>
                <span style={{ color: '#64748b' }}>Cliente:</span>{' '}
                <strong>{selectedPatient.name}</strong>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRegisterSale}
              style={{
                padding: '10px 24px',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              ✅ Registrar venta
            </button>
            <button
              onClick={handlePrint}
              style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Printer size={16} /> Imprimir nota
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Catalog panel (toggle) */}
      {showCatalogPanel && (
        <div style={{
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'hidden',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
            📦 Catálogo
          </div>

          {/* Catalog form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={catForm.type || 'product'}
                onChange={(e) => setCatForm((f) => ({ ...f, type: e.target.value as any }))}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
              >
                <option value="product">Producto</option>
                <option value="service">Servicio</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={catForm.isTemplate || false}
                  onChange={(e) => setCatForm((f) => ({ ...f, isTemplate: e.target.checked }))}
                />
                🦶 Plantilla
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={catForm.active !== false}
                  onChange={(e) => setCatForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Activo
              </label>
            </div>
            <input
              type="text"
              value={catForm.name || ''}
              onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre"
              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Precio</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={catForm.salePrice ?? 0}
                  onChange={(e) => setCatForm((f) => ({ ...f, salePrice: Number(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Costo</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={catForm.providerCost ?? 0}
                  onChange={(e) => setCatForm((f) => ({ ...f, providerCost: Number(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Photo */}
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Foto</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => catalogPhotoRef.current?.click()}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  📷 Seleccionar
                </button>
                <input
                  ref={catalogPhotoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCatPhotoChange}
                />
                {catForm.photoDataUrl && (
                  <img
                    src={catForm.photoDataUrl}
                    alt="Preview"
                    style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleCatSave}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 12
                }}
              >
                {editingCatalogId ? 'Actualizar' : 'Crear'}
              </button>
              {editingCatalogId && (
                <button
                  onClick={() => {
                    setEditingCatalogId(null);
                    setCatForm({ type: 'product', name: '', salePrice: 0, providerCost: 0, isTemplate: false, active: true, photoDataUrl: '' });
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Catalog list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {catalog.map((c) => (
              <div
                key={c.id}
                onClick={() => editCatalogItem(c)}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: editingCatalogId === c.id ? '#dbeafe' : '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.photoDataUrl && (
                    <img
                      src={c.photoDataUrl}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {c.name}
                      {c.isTemplate ? ' 🦶' : ''}
                    </div>
                    <div style={{ color: '#64748b' }}>
                      {c.type === 'service' ? 'Servicio' : 'Producto'}
                      {' · '}
                      {formatCurrency(c.salePrice ?? c.unitPrice ?? 0)}
                      {' / Costo: '}
                      {formatCurrency(c.providerCost ?? c.unitCost ?? 0)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {c.active === false && (
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>Inactivo</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCatDelete(c.id); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYMENTS MODAL */}
      {paymentsTargetSaleId && paymentsTargetSale && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            width: 440,
            maxHeight: '80vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                  💳 Pagos — {paymentsTargetSale.folio}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Total: {formatCurrency(Number(paymentsTargetSale.total) || 0)}
                  {' · '}
                  Pagado: {formatCurrency(salePaidTotal(paymentsTargetSale))}
                  {' · '}
                  Pendiente: {formatCurrency(salePendingTotal(paymentsTargetSale))}
                </div>
              </div>
              <button
                onClick={() => setPaymentsTargetSaleId(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {/* Existing payments */}
            {(paymentsTargetSale.payments || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(paymentsTargetSale.payments || []).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 12
                    }}
                  >
                    <div>
                      <strong style={{ color: '#1e293b' }}>{formatCurrency(Number(p.amount))}</strong>
                      {' · '}
                      <span style={{ color: '#64748b' }}>{p.method}</span>
                      {' · '}
                      <span style={{ color: '#94a3b8' }}>{new Date(p.date).toLocaleDateString('es-MX')}</span>
                    </div>
                    <button
                      onClick={() => deletePayment(paymentsTargetSaleId!, p.id)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 8 }}>
                Sin pagos registrados
              </div>
            )}

            {/* Add payment form */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>Nuevo pago</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="debit_terminal">Terminal Débito</option>
                  <option value="credit_terminal">Terminal Crédito</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="Monto"
                  style={{ width: 100, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                />
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Notas (opcional)"
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                />
                <button
                  onClick={addPayment}
                  style={{
                    padding: '6px 16px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    whiteSpace: 'nowrap'
                  }}
                >
                  Registrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesManager;
