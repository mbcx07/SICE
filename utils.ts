
import { differenceInDays, differenceInMonths, parseISO, addDays } from 'date-fns';
import { VIGENCIA_RECETA_DIAS, VIGENCIA_CONSTANCIA_ESTUDIOS_MESES } from './constants';

export const isRecetaVigente = (fechaExpedicion: string): boolean => {
  if (!fechaExpedicion) return false;
  const hoy = new Date();
  const expedicion = parseISO(fechaExpedicion);
  // Simplificado a días naturales para el MVP, en producción usaría lógica de días hábiles bancarios
  const diasTranscurridos = differenceInDays(hoy, expedicion);
  return diasTranscurridos <= VIGENCIA_RECETA_DIAS;
};

export const isConstanciaEstudiosVigente = (fechaExpedicion: string): boolean => {
  if (!fechaExpedicion) return false;
  const hoy = new Date();
  const expedicion = parseISO(fechaExpedicion);
  const mesesTranscurridos = differenceInMonths(hoy, expedicion);
  return mesesTranscurridos <= VIGENCIA_CONSTANCIA_ESTUDIOS_MESES;
};

export const calcularEdad = (fechaNacimiento: string): number => {
  if (!fechaNacimiento) return 0;
  const hoy = new Date();
  const nacimiento = parseISO(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
};

export const generateFolio = (unidad: string, consecutivo: number): string => {
  const anio = new Date().getFullYear();
  const unidadRaw = String(unidad || '').toUpperCase().trim();
  const unidadSinPrefijo = unidadRaw.replace(/^OOAD\s*-?\s*/i, '').trim();
  const unidadToken = unidadSinPrefijo || unidadRaw || '00';
  return `${unidadToken}-${anio}-${consecutivo.toString().padStart(5, '0')}`;
};
