
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
}

export interface Bitacora {
  id: string;
  tramiteId: string;
  fecha: string;
  usuario: string;
  accion: string;
  descripcion: string;
  categoria?: 'WORKFLOW' | 'IMPRESION' | 'SISTEMA';
  datos?: Record<string, any>;
}

export interface User {
  id: string;
  nombre: string;
  matricula: string;
  role: Role;
  unidad: string;
  ooad: string;
  activo: boolean;
  authEmail?: string;
}
