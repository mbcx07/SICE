import React, { useState } from 'react';
import { Tramite, TipoBeneficiario } from '../types';

interface PDFFormatoViewProps {
  tramite: Tramite;
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const valueOrEmpty = (value?: string) => (value || '').trim();

export const PDFFormatoView: React.FC<PDFFormatoViewProps> = ({ tramite }) => {
  const b = tramite.beneficiario;
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  const [logoSrc, setLogoSrc] = useState(`${baseUrl}imss-logo.svg`);
  const titularNombre = b.tipo === TipoBeneficiario.HIJO
    ? valueOrEmpty(b.titularNombreCompleto)
    : `${valueOrEmpty(b.apellidoPaterno)} ${valueOrEmpty(b.apellidoMaterno)} ${valueOrEmpty(b.nombre)}`.trim();
  const nombreHijo = b.tipo === TipoBeneficiario.HIJO ? `${valueOrEmpty(b.apellidoPaterno)} ${valueOrEmpty(b.apellidoMaterno)} ${valueOrEmpty(b.nombre)}`.trim() : '';
  const matriculaTitular = valueOrEmpty(b.matricula) || 'NO CAPTURA';
  const claveAdscripcionTitular = valueOrEmpty(b.claveAdscripcion) || 'NO CAPTURA';

  const checkbox = (checked: boolean) => (
    <div className="w-6 h-6 border border-black flex items-center justify-center font-black text-xs leading-none">
      {checked ? 'X' : ''}
    </div>
  );

  return (
    <div className="print-sheet-letter print-container p-[8mm] text-[10px] font-sans uppercase text-black leading-tight">
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12">
            <img src={logoSrc} onError={() => setLogoSrc(`${baseUrl}imss-logo.jpg`)} alt="IMSS" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-[13px] font-black">Instituto Mexicano del Seguro Social</h1>
            <p className="text-[10px] font-black mt-1">FORMATO TRAMITE DE ANTEOJOS</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold">Receta No.</p>
          <div className="border-b border-black min-w-[120px] font-black text-sm text-center">{valueOrEmpty(tramite.folioRecetaImss)}</div>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <span className="font-bold">Prescripcion para:</span>
        <div className="flex items-center gap-2"><span className="font-bold">Persona trabajadora</span>{checkbox(b.tipo === TipoBeneficiario.TRABAJADOR)}</div>
        <div className="flex items-center gap-2"><span className="font-bold">Hija/Hijo</span>{checkbox(b.tipo === TipoBeneficiario.HIJO)}</div>
        <div className="flex items-center gap-2"><span className="font-bold">Persona jubilada/pensionada</span>{checkbox(b.tipo === TipoBeneficiario.JUBILADO_PENSIONADO)}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><p className="font-bold mb-1">Lugar</p><div className="border-b border-black h-6 flex items-end justify-center font-semibold">{valueOrEmpty(tramite.lugarSolicitud || b.entidadLaboral)}</div></div>
        <div><p className="font-bold mb-1">Fecha elaboracion</p><div className="border-b border-black h-6 flex items-end justify-center font-semibold">{formatDate(tramite.fechaCreacion)}</div></div>
        <div><p className="font-bold mb-1">Clave presupuestal unidad</p><div className="border-b border-black h-6 flex items-end justify-center font-semibold">{valueOrEmpty(tramite.clavePresupuestal)}</div></div>
      </div>

      <div className="space-y-3 mb-4">
        <div><p className="font-bold">Nombre persona trabajadora/jubilada/pensionada</p><div className="border-b border-black h-6 flex items-end px-2 font-semibold">{titularNombre}</div></div>
        <div><p className="font-bold">Nombre hija/hijo</p><div className="border-b border-black h-6 flex items-end px-2 font-semibold">{nombreHijo}</div></div>
      </div>

      <div className="space-y-3 mb-4">
        <div><p className="font-bold">NSS persona trabajadora/jubilada/pensionada</p><div className="border-b border-black h-6 flex items-end px-2 font-semibold tracking-widest">{valueOrEmpty(b.nssTrabajador)}</div></div>
        <div><p className="font-bold">NSS hija/hijo</p><div className="border-b border-black h-6 flex items-end px-2 font-semibold tracking-widest">{valueOrEmpty(b.nssHijo)}</div></div>
      </div>

      <div className="mb-3 space-y-2">
        <div>
          <p className="font-bold">Descripcion del lente</p>
          <div className="border border-black min-h-[40px] p-2 font-semibold leading-tight">{valueOrEmpty(tramite.descripcionLente)}</div>
        </div>
      </div>

      <p className="font-bold mb-2">Se autoriza la prescripcion descrita a la persona trabajadora, hija o hijo de la persona trabajadora, jubilada o pensionada con:</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4">
        <div className="flex"><span className="font-bold w-36">Matricula:</span><div className="border-b border-black flex-1 text-center font-bold">{matriculaTitular}</div></div>
        <div className="flex"><span className="font-bold w-36">Clave adscripcion:</span><div className="border-b border-black flex-1 text-center font-bold">{claveAdscripcionTitular}</div></div>
        <div className="flex"><span className="font-bold w-36">Folio receta IMSS:</span><div className="border-b border-black flex-1 text-center font-bold">{valueOrEmpty(tramite.folioRecetaImss)}</div></div>
        <div className="flex"><span className="font-bold w-36">Fecha expedicion:</span><div className="border-b border-black flex-1 text-center font-bold">{formatDate(tramite.fechaExpedicionReceta)}</div></div>
         
        <div className="flex"><span className="font-bold w-36">Fecha recepcion optica:</span><div className="border-b border-black flex-1 text-center font-bold">{formatDate(tramite.fechaRecepcionOptica)}</div></div>
        <div className="flex"><span className="font-bold w-36">Fecha entrega optica:</span><div className="border-b border-black flex-1 text-center font-bold">{formatDate(tramite.fechaEntregaOptica)}</div></div>
      </div>

      <div className="grid grid-cols-3 border-2 border-black divide-x-2 divide-black h-32">
        <div className="flex flex-col"><div className="p-1 text-center font-bold border-b-2 border-black">Autorizacion</div><div className="flex-1 flex flex-col items-center justify-end pb-2"><span className="font-bold text-[10px] border-b border-black w-4/5 text-center mb-1">{valueOrEmpty(tramite.nombreAutorizador)}</span><span className="font-bold text-[9px]">Nombre y firma</span></div></div>
        <div className="flex flex-col"><div className="p-1 text-center font-bold border-b-2 border-black text-[9px]">Persona trabajadora/jubilada/pensionada</div><div className="flex-1 flex flex-col items-center justify-end pb-2"><div className="border-b border-black w-4/5 h-1" /><span className="font-bold text-[9px] mt-1">Firma</span></div></div>
        <div className="flex flex-col"><div className="p-1 text-center font-bold border-b-2 border-black">Recibi de conformidad</div><div className="flex-1 flex flex-col items-center justify-end pb-2"><div className="border-b border-black w-4/5 h-1" /><span className="font-bold text-[9px] mt-1">Firma</span></div></div>
      </div>

      <div className="mt-2 flex justify-end items-center text-[10px]">
        <span className="font-bold">Clave: 1A14-009-027</span>
      </div>
    </div>
  );
};