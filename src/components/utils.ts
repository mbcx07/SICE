export const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const clampColor = (v: string) => (String(v || '').trim() || '#0ea5e9');

export function startOfWeekIso(d: Date) {
  const dd = new Date(d);
  const day = dd.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dd.setDate(dd.getDate() + diff);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString();
}

export function endOfWeekIso(d: Date) {
  const dd = new Date(d);
  const day = dd.getDay();
  const diff = (day === 0 ? 0 : 7 - day);
  dd.setDate(dd.getDate() + diff);
  dd.setHours(23, 59, 59, 999);
  return dd.toISOString();
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function addMonthsIso(baseIso: string, months: number): string {
  const d = new Date(baseIso);
  if (!Number.isFinite(d.getTime())) return baseIso;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d.toISOString();
}

export const SALE_MP_FEE_RATE = 0.0406;

export const isCardPaymentMethod = (m: any) => m === 'debit_terminal' || m === 'credit_terminal';

export const salePaidTotal = (s: any): number => {
  const payments = s?.payments;
  if (!Array.isArray(payments)) return 0;
  return payments.reduce((acc: number, p: any) => acc + Number(p?.amount || 0), 0);
};

export const salePendingTotal = (s: any): number => {
  const total = Number(s?.total || 0);
  return Math.max(0, total - salePaidTotal(s));
};

export const saleMpFeeTotal = (s: any): number => {
  const payments = s?.payments;
  if (!Array.isArray(payments)) return 0;
  return payments.reduce((acc: number, p: any) => acc + (isCardPaymentMethod(p?.method) ? Number(p?.amount || 0) * SALE_MP_FEE_RATE : 0), 0);
};
