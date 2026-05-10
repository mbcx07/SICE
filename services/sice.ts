import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import { db, AuthError, siceEnsureSession } from './firebase';
import type {
  Patient,
  CatalogItem,
  ProviderShipment,
  Sale,
  SaleLineItem,
  Appointment,
  SiceSettings,
  IntakeRequest
} from '../types';

const nowIso = () => new Date().toISOString();

export const siceService = {
  // =====================
  // Settings
  // =====================

  async getSiceSettings(): Promise<SiceSettings> {
    const ref = doc(db, 'siceSettings', 'global');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { id: 'global', themeColor: '#0ea5e9' };
    }
    const data: any = snap.data() || {};
    return {
      id: 'global',
      themeColor: String(data.themeColor || '#0ea5e9'),
      logoDataUrl: data.logoDataUrl ? String(data.logoDataUrl) : undefined,
      updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
      updatedBy: data.updatedBy ? String(data.updatedBy) : undefined
    };
  },

  async updateSiceSettings(patch: Partial<SiceSettings>): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await setDoc(doc(db, 'siceSettings', 'global'), {
      ...patch,
      updatedAt: nowIso(),
      updatedBy: (user as any).uid || (user as any).id
    }, { merge: true });
  },

  watchSiceSettings(onValue: (settings: SiceSettings) => void): () => void {
    const ref = doc(db, 'siceSettings', 'global');
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        onValue({ id: 'global', themeColor: '#2b5ea7', calendarInvitePatient: true });
        return;
      }
      const d: any = snap.data() || {};
      onValue({
        id: 'global',
        themeColor: String(d.themeColor || '#2b5ea7'),
        logoDataUrl: d.logoDataUrl ? String(d.logoDataUrl) : undefined,
        calendarWebhookUrl: d.calendarWebhookUrl ? String(d.calendarWebhookUrl) : undefined,
        calendarWebhookSecret: d.calendarWebhookSecret ? String(d.calendarWebhookSecret) : undefined,
        calendarInvitePatient: d.calendarInvitePatient === false ? false : true,
        updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
        updatedBy: d.updatedBy ? String(d.updatedBy) : undefined
      });
    });
    return () => unsub();
  },

  // =====================
  // Intakes (public + owner)
  // =====================

  async createIntake(input: { fullName: string; phone: string; email: string; residence: string }): Promise<string> {
    const payload: any = {
      fullName: String(input.fullName || '').trim(),
      phone: String(input.phone || '').trim(),
      email: String(input.email || '').trim(),
      residence: String(input.residence || '').trim(),
      status: 'new',
      createdAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, 'intakes'), payload);
    return ref.id;
  },

  watchIntakes(onValue: (items: IntakeRequest[]) => void): () => void {
    const q = query(collection(db, 'intakes'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as IntakeRequest[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async updateIntake(id: string, patch: Partial<IntakeRequest>): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await updateDoc(doc(db, 'intakes', id), { ...patch } as any);
  },

  async deleteIntake(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'intakes', id));
  },

  async markIntakeApproved(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await updateDoc(doc(db, 'intakes', id), { status: 'approved', approvedAt: serverTimestamp() } as any);
  },

  async markIntakeRejected(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await updateDoc(doc(db, 'intakes', id), { status: 'rejected', approvedAt: serverTimestamp() } as any);
  },

  async createOrUpdatePatientFromIntake(input: { fullName: string; phone: string; email: string; residence: string }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const name = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim();
    const residence = String(input.residence || '').trim();

    if (phone) {
      const qPhone = query(collection(db, 'patients'), where('phone', '==', phone), limit(1));
      const snap = await getDocs(qPhone);
      if (!snap.empty) {
        const d = snap.docs[0];
        await setDoc(doc(db, 'patients', d.id), { name, phone, email, notesGeneral: `Residencia: ${residence}`, updatedAt: nowIso() } as any, { merge: true });
        return d.id;
      }
    }

    if (email) {
      const qEmail = query(collection(db, 'patients'), where('email', '==', email), limit(1));
      const snap = await getDocs(qEmail);
      if (!snap.empty) {
        const d = snap.docs[0];
        await setDoc(doc(db, 'patients', d.id), { name, phone, email, notesGeneral: `Residencia: ${residence}`, updatedAt: nowIso() } as any, { merge: true });
        return d.id;
      }
    }

    const newId = await this.upsertPatient({ name, phone, email, notesGeneral: `Residencia: ${residence}` } as any);
    return newId;
  },

  // =====================
  // Catalog
  // =====================

  async listCatalogItems(): Promise<CatalogItem[]> {
    const q = query(collection(db, 'catalogItems'), orderBy('name', 'asc'), limit(2000));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CatalogItem[];
  },

  watchCatalogItems(onValue: (items: CatalogItem[]) => void): () => void {
    const q = query(collection(db, 'catalogItems'), orderBy('name', 'asc'), limit(2000));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CatalogItem[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async upsertCatalogItem(item: Partial<CatalogItem> & { name: string }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const salePrice = Number((item as any).salePrice ?? item.unitPrice ?? 0);
    const providerCost = Number((item as any).providerCost ?? item.unitCost ?? 0);

    const payload: any = {
      type: (item.type === 'service' ? 'service' : 'product'),
      name: String(item.name || '').trim(),
      sku: item.sku ? String(item.sku).trim() : '',
      salePrice,
      providerCost,
      unitPrice: salePrice,
      unitCost: providerCost,
      photoDataUrl: (item as any).photoDataUrl ? String((item as any).photoDataUrl) : '',
      isTemplate: Boolean((item as any).isTemplate),
      active: item.active !== false,
      updatedAt: nowIso()
    };

    if (item.id) {
      await setDoc(doc(db, 'catalogItems', item.id), payload, { merge: true });
      return item.id;
    }

    payload.createdAt = nowIso();
    const ref = await addDoc(collection(db, 'catalogItems'), payload);
    return ref.id;
  },

  async deleteCatalogItem(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'catalogItems', id));
  },

  // =====================
  // Provider Shipments
  // =====================

  watchProviderShipments(onValue: (items: ProviderShipment[]) => void): () => void {
    const q = query(collection(db, 'providerShipments'), orderBy('date', 'desc'), limit(2000));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProviderShipment[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async upsertProviderShipment(sh: Partial<ProviderShipment> & { date: string }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const payload: any = {
      date: String(sh.date || '').slice(0, 10),
      cost: Number(sh.cost ?? 348),
      notes: sh.notes ? String(sh.notes) : '',
      updatedAt: nowIso(),
      createdBy: (user as any).uid || (user as any).id
    };

    if (sh.id) {
      await setDoc(doc(db, 'providerShipments', sh.id), payload, { merge: true });
      return sh.id;
    }

    payload.createdAt = nowIso();
    const ref = await addDoc(collection(db, 'providerShipments'), payload);
    return ref.id;
  },

  async deleteProviderShipment(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'providerShipments', id));
  },

  // =====================
  // Patients
  // =====================

  watchPatients(onValue: (items: Patient[]) => void): () => void {
    const q = query(collection(db, 'patients'), orderBy('name', 'asc'), limit(2000));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Patient[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async upsertPatient(patient: Partial<Patient> & { name: string }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const payload: any = {
      name: String(patient.name || '').trim(),
      phone: patient.phone ? String(patient.phone).trim() : '',
      email: patient.email ? String(patient.email).trim() : '',
      address: patient.address ? String(patient.address).trim() : '',
      notes: patient.notes ? String(patient.notes) : '',
      updatedAt: nowIso()
    };

    if (patient.id) {
      await setDoc(doc(db, 'patients', patient.id), payload, { merge: true });
      return patient.id;
    }

    payload.createdAt = nowIso();
    const ref = await addDoc(collection(db, 'patients'), payload);
    return ref.id;
  },

  async deletePatient(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'patients', id));
  },

  // =====================
  // Sales
  // =====================

  watchSalesByPatient(patientId: string, onValue: (items: Sale[]) => void): () => void {
    const pid = String(patientId || '').trim();
    if (!pid) {
      onValue([]);
      return () => {};
    }
    const q = query(
      collection(db, 'sales'),
      where('patientId', '==', pid),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Sale[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async watchSales(year: number, onValue: (items: Sale[]) => void): Promise<() => void> {
    const q = query(collection(db, 'sales'), where('year', '==', year), orderBy('consecutive', 'desc'), limit(2000));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Sale[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async createSale(input: {
    patientId?: string;
    patientName?: string;
    patientEmail?: string;
    patientPhone?: string;
    invoiceRequired?: boolean;
    delivered?: boolean;
    deliveryEstimatedAt?: string;
    deliveryActualAt?: string;
    providerPaid?: boolean;
    providerDue?: number;
    providerSentAt?: string;
    items: SaleLineItem[];
    shipping?: number;
    shippingCost?: number;
    ivaRate?: number;
    notes?: string;
  }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const year = new Date().getFullYear();
    const ivaRate = Number.isFinite(Number(input.ivaRate)) ? Number(input.ivaRate) : 0.16;
    const shipping = 0;
    const shippingCost = Number((input as any).shippingCost || 0);
    const items = Array.isArray(input.items) ? input.items : [];

    const cleanItems = items
      .filter((x) => x && Number(x.qty) > 0)
      .map((x) => ({
        catalogItemId: x.catalogItemId ? String(x.catalogItemId) : undefined,
        name: String(x.name || '').trim(),
        qty: Number(x.qty || 0),
        unitPrice: Number(x.unitPrice || 0),
        unitCost: Number(x.unitCost || 0)
      }))
      .filter((x) => x.name && x.qty > 0);

    const itemsSubtotal = cleanItems.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
    const itemsCost = cleanItems.reduce((acc, it) => acc + it.qty * it.unitCost, 0);
    const subtotal = Math.max(0, itemsSubtotal + shipping);
    const iva = Math.max(0, subtotal * ivaRate);
    const total = subtotal + iva;
    const costTotal = itemsCost + Math.max(0, shippingCost);
    const profit = subtotal - costTotal;

    const counterRef = doc(db, 'counters', `sales-${year}`);

    const result = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const current = counterSnap.exists() ? Number((counterSnap.data() as any)?.current || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { current: next, year, updatedAt: nowIso() }, { merge: true });

      const folio = `VTA-${year}-${String(next).padStart(6, '0')}`;
      const salePayload: any = {
        folio,
        year,
        consecutive: next,

        patientId: input.patientId ? String(input.patientId) : '',
        patientName: input.patientName ? String(input.patientName) : '',
        patientEmail: input.patientEmail ? String(input.patientEmail) : '',
        patientPhone: input.patientPhone ? String(input.patientPhone) : '',

        invoiceRequired: Boolean(input.invoiceRequired),
        delivered: Boolean(input.delivered),
        deliveryEstimatedAt: input.deliveryEstimatedAt ? String(input.deliveryEstimatedAt) : '',
        deliveryActualAt: input.deliveryActualAt ? String(input.deliveryActualAt) : '',
        providerPaid: Boolean(input.providerPaid),
        providerDue: Number(input.providerDue || 0),
        providerSentAt: (input as any).providerSentAt ? String((input as any).providerSentAt) : '',

        items: cleanItems,
        payments: [],
        shipping,
        shippingCost,
        ivaRate,
        subtotal,
        iva,
        total,
        costTotal,
        profit,
        notes: input.notes ? String(input.notes) : '',
        createdAt: nowIso(),
        createdBy: user.uid
      };

      const saleRef = doc(collection(db, 'sales'));
      tx.set(saleRef, salePayload);
      return saleRef.id;
    });

    return result;
  },

  async updateSale(id: string, patch: Partial<Sale>): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await setDoc(doc(db, 'sales', id), { ...patch, updatedAt: nowIso() } as any, { merge: true });
  },

  async deleteSale(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'sales', id));
  },

  // =====================
  // Appointments
  // =====================

  watchAppointments(range: { startIso: string; endIso: string }, onValue: (items: Appointment[]) => void): () => void {
    const q = query(
      collection(db, 'appointments'),
      where('start', '>=', range.startIso),
      where('start', '<=', range.endIso),
      orderBy('start', 'asc'),
      limit(2000)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Appointment[];
      onValue(items);
    }, () => onValue([]));
    return () => unsub();
  },

  async upsertAppointment(appt: Partial<Appointment> & { title: string; start: string; end: string }): Promise<string> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');

    const payload: any = {
      title: String(appt.title || '').trim(),
      patientId: appt.patientId ? String(appt.patientId) : '',
      patientName: appt.patientName ? String(appt.patientName) : '',
      patientEmail: (appt as any).patientEmail ? String((appt as any).patientEmail) : '',
      patientPhone: (appt as any).patientPhone ? String((appt as any).patientPhone) : '',
      start: String(appt.start),
      end: String(appt.end),
      status: appt.status || 'scheduled',
      notes: appt.notes ? String(appt.notes) : '',
      calendarEventId: (appt as any).calendarEventId ? String((appt as any).calendarEventId) : '',
      updatedAt: nowIso()
    };

    if (appt.id) {
      await setDoc(doc(db, 'appointments', appt.id), payload, { merge: true });
      return appt.id;
    }

    payload.createdAt = nowIso();
    const ref = await addDoc(collection(db, 'appointments'), payload);
    return ref.id;
  },

  async updateAppointment(id: string, patch: Partial<Appointment>): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await setDoc(doc(db, 'appointments', id), { ...patch, updatedAt: nowIso() } as any, { merge: true });
  },

  async deleteAppointment(id: string): Promise<void> {
    const user = await siceEnsureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida.');
    await deleteDoc(doc(db, 'appointments', id));
  }
};
