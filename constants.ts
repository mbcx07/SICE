
export const TIPOS_CONTRATACION_PERMITIDOS = [
  { code: '01', label: 'Confianza' },
  { code: '02', label: 'Base' },
  { code: '03', label: 'Temporal' },
  { code: '08', label: 'Sustituto' },
  { code: '05', label: 'Interno de Pregrado' },
  { code: '07', label: 'Becado' },
  { code: '09', label: 'Residente' },
  { code: '10', label: 'Jubilado/Pensionado Régimen Anterior' },
  { code: '11', label: 'Jubilado/Pensionado Régimen Actual' }
];

export const VIGENCIA_RECETA_DIAS = 90;
export const VIGENCIA_CONSTANCIA_ESTUDIOS_MESES = 3;

export const DOCUMENTOS_REQUERIDOS = {
  TRABAJADOR: [
    'RECETA',
    'IDENTIFICACION',
    'RECIBO_NOMINA'
  ],
  HIJO: [
    'ACTA_NACIMIENTO',
    'CURP',
    'RECETA',
    'IDENTIFICACION', // del trabajador
    'RECIBO_NOMINA'   // del trabajador
  ],
  JUBILADO_PENSIONADO: [
    'RECETA',
    'IDENTIFICACION',
    'RECIBO_NOMINA'
  ]
};

export const COLOR_ESTATUS = {
  BORRADOR: 'bg-slate-100 text-slate-700',
  EN_REVISION_DOCUMENTAL: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  RECHAZADO: 'bg-red-50 text-red-700 border border-red-200',
  AUTORIZADO: 'bg-imss-light text-imss font-bold border border-imss/20',
  ENVIADO_A_OPTICA: 'bg-slate-100 text-slate-700 border border-slate-200',
  EN_PROCESO_OPTICA: 'bg-amber-50 text-amber-800 border border-amber-200',
  LISTO_PARA_ENTREGA: 'bg-imss-light text-imss font-bold border border-imss/30',
  ENTREGADO: 'bg-imss text-white font-bold',
  CERRADO: 'bg-slate-300 text-slate-800'
};
