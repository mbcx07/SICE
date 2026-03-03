import React, { useState } from 'react';
import { Tramite, TipoBeneficiario } from '../types';

interface PDFTarjetaControlViewProps {
  beneficiario: any;
  dotaciones: Tramite[];
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

export const PDFTarjetaControlView: React.FC<PDFTarjetaControlViewProps> = ({ beneficiario: b, dotaciones }) => {
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  const [logoSrc, setLogoSrc] = useState(`${baseUrl}imss-logo.svg`);
  const getDotacionData = (num: number) => dotaciones.find(d => d.dotacionNumero === num);
  const titularNombre = b.tipo === TipoBeneficiario.HIJO
    ? valueOrEmpty(b.titularNombreCompleto)
    : `${valueOrEmpty(b.apellidoPaterno)} ${valueOrEmpty(b.apellidoMaterno)} ${valueOrEmpty(b.nombre)}`.trim();
  const nombreHijo = b.tipo === TipoBeneficiario.HIJO
    ? `${valueOrEmpty(b.apellidoPaterno)} ${valueOrEmpty(b.apellidoMaterno)} ${valueOrEmpty(b.nombre)}`.trim()
    : '';
  const matriculaTitular = valueOrEmpty(b.matricula) || valueOrEmpty(dotaciones.find(d => valueOrEmpty(d.beneficiario?.matricula))?.beneficiario?.matricula);

  const checkbox = (checked: boolean) => (
    <div className="w-6 h-6 border border-black flex items-center justify-center text-xs font-black">{checked ? 'X' : ''}</div>
  );

  const dotData = (num: number) => {
    const data = getDotacionData(num);
    const firmaTitular = data
      ? (valueOrEmpty(data?.beneficiario?.titularNombreCompleto)
        || valueOrEmpty(b.titularNombreCompleto)
        || `${valueOrEmpty(data?.beneficiario?.apellidoPaterno)} ${valueOrEmpty(data?.beneficiario?.apellidoMaterno)} ${valueOrEmpty(data?.beneficiario?.nombre)}`.trim())
      : '';
    return {
      receta: valueOrEmpty(data?.folioRecetaImss),
      anteojos: valueOrEmpty(data?.descripcionLente),
      folio: valueOrEmpty(data?.folio),
      fecha: formatDate(data?.fechaCreacion),
      qna: valueOrEmpty(data?.qnaInclusion),
      firmaTitular,
    };
  };

  const DotacionPairTable = ({ a, b: bNum, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) => {
    const da = dotData(a);
    const db = dotData(bNum);
    return (
      <table className="w-full border-2 border-black border-collapse table-fixed mb-3 text-[9px]">
        <colgroup>
          <col style={{ width: '27%' }} />
          <col style={{ width: '36.5%' }} />
          <col style={{ width: '36.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="h-7 border border-black" />
            <th className="h-7 border border-black font-bold text-center px-1">{labelA}</th>
            <th className="h-7 border border-black font-bold text-center px-1">{labelB}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="h-8 border border-black font-bold px-2 align-middle">Receta No.</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{da.receta}</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{db.receta}</td>
          </tr>
          <tr>
            <td className="h-12 border border-black font-bold px-2 align-middle">Tipo de anteojos</td>
            <td className="h-12 border border-black font-bold text-center px-1 align-middle break-words">{da.anteojos}</td>
            <td className="h-12 border border-black font-bold text-center px-1 align-middle break-words">{db.anteojos}</td>
          </tr>
          <tr>
            <td className="h-8 border border-black font-bold px-2 align-middle">Folio</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{da.folio}</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{db.folio}</td>
          </tr>
          <tr>
            <td className="h-8 border border-black font-bold px-2 align-middle">Fecha</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{da.fecha}</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{db.fecha}</td>
          </tr>
          <tr>
            <td className="h-8 border border-black font-bold px-2 align-middle">Qna/Mes inclusion</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{da.qna}</td>
            <td className="h-8 border border-black font-bold text-center px-1 align-middle">{db.qna}</td>
          </tr>
          <tr>
            <td className="h-14 border border-black font-bold px-2 align-top py-1 text-[8px] leading-tight">Firma de la persona trabajadora, jubilada o pensionada</td>
            <td className="h-14 border border-black font-bold text-center px-1 align-bottom pb-1 text-[8px] break-words">{da.firmaTitular}</td>
            <td className="h-14 border border-black font-bold text-center px-1 align-bottom pb-1 text-[8px] break-words">{db.firmaTitular}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div className="print-sheet-letter print-container p-[6mm] sm:p-[8mm] text-[9px] sm:text-[10px] font-sans uppercase text-black leading-tight">
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
        <div className="flex gap-3 items-center">
          <div className="w-12 h-12"><img src={logoSrc} onError={() => setLogoSrc(`${baseUrl}imss-logo.jpg`)} alt="IMSS" className="w-full h-full object-contain" /></div>
          <div>
            <h1 className="text-[12px] font-black">Tarjeta de Control de Dotacion de Anteojos</h1>
            <div className="flex gap-2 items-baseline text-[9px]"><span className="font-bold">OOAD:</span><span className="border-b border-black min-w-[160px] font-bold">{valueOrEmpty(b.ooad)}</span></div>
            <p className="font-bold text-[9px]">Jefatura de Servicios de Desarrollo de Personal</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold">Matricula</p>
          <div className="border-b border-black min-w-[140px] text-center font-black text-sm">{matriculaTitular}</div>
        </div>
      </div>

      <div className="mb-3">
        <p className="font-bold mb-1">Se autoriza la dotacion de anteojos a la persona:</p>
        <div className="flex justify-between text-[9px] gap-3">
          <div className="flex items-center gap-1">{checkbox(b.tipo === TipoBeneficiario.TRABAJADOR)}<span className="font-bold">Trabajadora</span></div>
          <div className="flex items-center gap-1">{checkbox(b.tipo === TipoBeneficiario.JUBILADO_PENSIONADO)}<span className="font-bold">Jubilada</span></div>
          <div className="flex items-center gap-1">{checkbox(b.tipo === TipoBeneficiario.PENSIONADA)}<span className="font-bold">Pensionada</span></div>
          <div className="flex items-center gap-1">{checkbox(b.tipo === TipoBeneficiario.HIJO)}<span className="font-bold">Beneficiario(a)</span></div>
        </div>
      </div>

      <div className="space-y-2 mb-3 text-[9px]">
        <div className="flex gap-2 items-baseline"><span className="font-bold min-w-[90px]">Nombre(s):</span><span className="border-b border-black flex-1 font-black">{titularNombre}</span></div>
        <div className="flex gap-2 items-baseline"><span className="font-bold min-w-[250px]">Nombre(s) de la hija o hijo de la persona trabajadora:</span><span className="border-b border-black flex-1 font-bold">{nombreHijo}</span></div>
        <div className="flex gap-2 items-baseline"><span className="font-bold min-w-[90px]">Adscripcion:</span><span className="border-b border-black flex-1 font-bold">{valueOrEmpty(b.entidadLaboral)}</span></div>
      </div>

      <DotacionPairTable a={1} b={2} labelA="Primera dotacion" labelB="Segunda dotacion" />
      <DotacionPairTable a={3} b={4} labelA="Tercera dotacion" labelB="Cuarta dotacion" />

      <div className="mt-2 flex justify-end items-center text-[10px]">
        <span className="font-bold">Clave: 1A14-009-028</span>
      </div>
    </div>
  );
};