
export enum Role {
  CAPTURISTA_UNIDAD = 'CAPTURISTA_UNIDAD',
  VALIDADOR_PRESTACIONES = 'VALIDADOR_PRESTACIONES',
  AUTORIZADOR_JSDP_DSPNC = 'AUTORIZADOR_JSDP_DSPNC',
  CONSULTA_CENTRAL = 'CONSULTA_CENTRAL',
  ADMIN_SISTEMA = 'ADMIN_SISTEMA'
}

export enum TipoBeneficiario {
  TRABAJADOR = 'TRABAJADOR',
  HIJO = 'HIJO',
  JUBILADO_PENSIONADO = 'JUBILADO_PENSIONADO',
  PENSIONADA = 'PENSIONADA' // Added for card specificity
}

export enum EstatusWorkflow {
  BORRADOR = 'BORRADOR',
  EN_REVISION_DOCUMENTAL = 'EN_REVISION_DOCUMENTAL',
  RECHAZADO = 'RECHAZADO',
  AUTORIZADO = 'AUTORIZADO',
  ENVIADO_A_OPTICA = 'ENVIADO_A_OPTICA',
  EN_PROCESO_OPTICA = 'EN_PROCESO_OPTICA',
  LISTO_PARA_ENTREGA = 'LISTO_PARA_ENTREGA',
  ENTREGADO = 'ENTREGADO',
  CERRADO = 'CERRADO'
}

export enum TipoDocumento {
  RECETA = 'RECETA',
  IDENTIFICACION = 'IDENTIFICACION',
  RECIBO_NOMINA = 'RECIBO_NOMINA',
  CONTRATO_08 = 'CONTRATO_08',
  ACTA_NACIMIENTO = 'ACTA_NACIMIENTO',
  CURP = 'CURP',
  CONSTANCIA_ESTUDIOS = 'CONSTANCIA_ESTUDIOS',
  DICTAMEN_MEDICO = 'DICTAMEN_MEDICO',
  OTRO = 'OTRO'
}

export interface Beneficiario {
  id: string;
  tipo: TipoBeneficiario;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nssTrabajador: string;
  nssHijo?: string;
  matricula?: string;
  claveAdscripcion?: string;
  entidadLaboral: string;
  tipoContratacion: string;
  fechaNacimiento?: string;
  ooad: string;
  titularNombreCompleto?: string;
  requiereConstanciaEstudios?: boolean;
  constanciaEstudiosVigente?: boolean;
  fechaConstanciaEstudios?: string;
}

export interface Evidencia {
  id: string;
  tipo: TipoDocumento;
  archivoUrl: string;
  fechaCarga: string;
  usuarioCarga: string;
}

export interface Tramite {
  id: string;
  folio: string; // OOAD-UNIDAD-AÑO-CONSECUTIVO
  beneficiario: Beneficiario;
  contratoColectivoAplicable: string;
  lugarSolicitud?: string;
  fechaCreacion: string;
  creadorId: string;
  unidad: string;
  estatus: EstatusWorkflow;
  dotacionNumero: number;
  requiereDictamenMedico: boolean;
  motivoRechazo?: string;

  // Control de importes
  importeSolicitado: number;
  importeAutorizado?: number;
  costoSolicitud?: number;
  validadoPor?: string;
  fechaValidacionImporte?: string;

  // Datos Receta
  folioRecetaImss: string;
  fechaExpedicionReceta: string;
  descripcionLente: string;
  dioptrias?: string;
  medicionAnteojos?: string;
  clavePresupuestal: string;
  qnaInclusion?: string; // Formato 2026/003

  // Fechas de proceso
  fechaRecepcionOptica?: string;
  fechaEntregaOptica?: string;
  fechaEntregaReal?: string;

  // Checklist
  checklist: Record<TipoDocumento, boolean>;
  evidencias: Evidencia[];

  // Firmas
  firmaSolicitante?: string;
  firmaAutorizacion?: string;
  firmaRecibiConformidad?: string;
  nombreAutorizador?: string;

  // Control de impresión / auditoría
  impresiones?: {
    formato: number;
    tarjeta: number;
    ultimaFecha?: string;
    ultimoUsuario?: string;
    ultimoMotivoReimpresion?: string;
  };

  eliminado?: boolean;
}

export interface Bitacora {
  id: string;
  tramiteId: string;
  accion: string;
  detalle: string;
  fecha: string;
  usuarioId: string;
  usuarioNombre: string;
  unidad?: string;
}

export interface User {
  id: string;
  uid: string;
  matricula: string;
  nombre: string;
  role: Role | string;
  unidad: string;
  activo: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

// =====================
// SICE (MVP) domain
// =====================

export type CatalogItemType = 'product' | 'service';

export interface CatalogItem {
  id: string;
  type: CatalogItemType;
  name: string;
  sku?: string;
  unitPrice: number; // price before IVA
  unitCost: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Patient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SaleLineItem {
  catalogItemId?: string;
  name: string;
  qty: number;
  unitPrice: number; // pre-IVA
  unitCost: number;
}

export interface Sale {
  id: string;
  folio: string; // e.g. VTA-2026-000123
  year: number;
  consecutive: number;
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;

  // flags / logistics
  invoiceRequired?: boolean;
  delivered?: boolean;
  deliveryEstimatedAt?: string; // ISO date (yyyy-mm-dd or full ISO)
  deliveryActualAt?: string;    // ISO
  providerPaid?: boolean;
  providerDue?: number; // MXN
  providerSentAt?: string; // ISO date when requested/sent to provider

  // follow-up (11 months after estimated delivery)
  followUpAt?: string; // ISO
  followUpCalendarEventId?: string;

  items: SaleLineItem[];
  shipping: number; // charge to customer (pre-IVA)
  shippingCost?: number; // cost you pay (pre-IVA)
  ivaRate: number; // default 0.16
  subtotal: number; // pre-IVA, includes shipping
  iva: number;
  total: number;
  costTotal: number; // itemsCost + shippingCost
  profit: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Appointment {
  id: string;
  title: string;
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  start: string; // ISO
  end: string;   // ISO
  status?: 'scheduled' | 'done' | 'cancelled';
  notes?: string;
  calendarEventId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiceSettings {
  id: 'global';
  themeColor: string;
  logoDataUrl?: string; // base64 data URL

  // Google Apps Script webhook (Calendar automation)
  calendarWebhookUrl?: string; // deployed web app URL
  calendarWebhookSecret?: string; // shared secret
  calendarInvitePatient?: boolean; // default true

  updatedAt?: string;
  updatedBy?: string;
}
