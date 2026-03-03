
import React, { useState, useEffect, useMemo, useRef } from 'react';
import './App.css';
import { 
  Role, 
  EstatusWorkflow, 
  Tramite, 
  TipoBeneficiario, 
  User,
  Bitácora
} from './types';
import { dbService, ensureSession, loginWithMatricula, logoutSession, adminCreateCapturista, adminResetPassword, changeOwnPassword, AuthError, validatePasswordStrength, canAccessTabByRole, canAuthorizeImporte, validateLoginInput, validateNuevoTramiteStep1, validateNuevoTramiteStep2, UX_MESSAGES, TABS_BY_ROLE, SESSION_INVALID_TOKENS } from './services/db';
import { 
  LayoutDashboard, 
  FileText, 
  Search, 
  PlusCircle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  ArrowLeft,
  ShieldCheck,
  Printer,
  CreditCard,
  Loader2,
  AlertTriangle,
  ClipboardCheck,
  Settings,
  LogOut,
  DollarSign,
  ChevronDown,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { generateFolio } from './utils';
import { COLOR_ESTATUS, TIPOS_CONTRATACION_PERMITIDOS, VIGENCIA_CONSTANCIA_ESTUDIOS_MESES } from './constants';
import { PDFFormatoView } from './components/PDFFormatoView';
import { PDFTarjetaControlView } from './components/PDFTarjetaControlView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

type PrintDocumentType = 'formato' | 'tarjeta';
type PrintEmissionType = 'ORIGINAL' | 'REIMPRESION';

interface PrintMetadata {
  folio: string;
  documento: PrintDocumentType;
  emision: PrintEmissionType;
  autorizadoPor: string;
  fechaAutorizacion: string;
  motivoReimpresion?: string;
}

const SESSION_INVALID_MESSAGES = SESSION_INVALID_TOKENS;

const formatStatusLabel = (estatus: string) => {
  if (estatus === EstatusWorkflow.EN_REVISION_DOCUMENTAL) return 'SOLICITADO';
  return String(estatus || '').replace(/_/g, ' ');
};

const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isAdminRole = (role: any) => role === Role.ADMIN_SISTEMA || String(role || '').toLowerCase() === 'admin';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tramites' | 'nuevo' | 'central' | 'adminUsers'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);
  const [printConfig, setPrintConfig] = useState<{show: boolean, type: PrintDocumentType, metadata?: PrintMetadata}>({show: false, type: 'formato'});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [captureEditTarget, setCaptureEditTarget] = useState<Tramite | null>(null);
  const [resumenSolicitudesGlobal, setResumenSolicitudesGlobal] = useState<Array<{ unidad: string; totalSolicitudes: number; totalCosto: number }>>([]);
  const [dashboardTotalsGlobal, setDashboardTotalsGlobal] = useState<{ totalSolicitudes: number; totalImporte: number; resumenPorUnidad: Array<{ unidad: string; totalSolicitudes: number; totalCosto: number }> } | null>(null);
  const [presupuestoGlobal, setPresupuestoGlobal] = useState<number>(() => {
    const raw = localStorage.getItem('sistra.presupuestoGlobal');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 800000;
  });
  const [cctCatalog, setCctCatalog] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('sistra.cctCatalog');
      const parsed = raw ? JSON.parse(raw) : null;
      const cleaned = Array.isArray(parsed)
        ? parsed.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      return cleaned.length ? cleaned : ['CCT 2025-2027'];
    } catch {
      return ['CCT 2025-2027'];
    }
  });
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // EFECTO DE INICIALIZACION: Unico punto de entrada
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const userProfile = await ensureSession();
        if (!isMounted) return;
        setUser(userProfile);

        if (!userProfile) {
          setLoading(false);
          return;
        }

        const data = await dbService.getTramites();
        if (!isMounted) return;
        setTramites(data || []);
      } catch (e: any) {
        console.error("Critical App Crash:", e);
        if (isMounted) setError(e.message || "Fallo en la conexion institucional.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initialize();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('sistra.presupuestoGlobal', String(presupuestoGlobal));
  }, [presupuestoGlobal]);

  useEffect(() => {
    if (!user) return;

    const runAdminRebuild = async () => {
      if (!isAdminRole(user.role)) return;
      try {
        await dbService.rebuildDashboardGlobalTotals(user);
      } catch {
        // noop
      }
    };
    void runAdminRebuild();

    const loadPresupuestoGlobal = async () => {
      try {
        const remote = await dbService.getPresupuestoGlobal();
        if (remote !== null) {
          setPresupuestoGlobal(remote);
        }
      } catch {
        // fallback local storage
      }
    };
    void loadPresupuestoGlobal();

    const unsubscribePresupuesto = dbService.watchPresupuestoGlobal((value) => {
      setPresupuestoGlobal(value);
    });

    const applyGlobalTotals = (totals: any) => {
      setDashboardTotalsGlobal(totals);
    };

    const unsubscribeResumen = dbService.watchResumenSolicitudesGlobal((rows) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      setResumenSolicitudesGlobal(safeRows);
    });

    const loadDashboardTotals = async () => {
      const totals = await dbService.getDashboardGlobalTotals();
      applyGlobalTotals(totals);
    };
    void loadDashboardTotals();

    const unsubscribeDashboardTotals = dbService.watchDashboardGlobalTotals((totals) => {
      applyGlobalTotals(totals);
    });

    return () => {
      unsubscribePresupuesto();
      unsubscribeResumen();
      unsubscribeDashboardTotals();
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('sistra.cctCatalog', JSON.stringify(cctCatalog));
  }, [cctCatalog]);

  const forceLogoutWithMessage = (message: string) => {
    logoutSession();
    setUser(null);
    setTramites([]);
    setSelectedTramite(null);
    setActiveTab('dashboard');
    setUiMessage(message);
  };

  const isSessionInvalidError = (e: any) => {
    const msg = String(e?.message || '');
    return (e instanceof AuthError && e.code === 'INVALID_SESSION') || SESSION_INVALID_MESSAGES.some(token => msg.includes(token));
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await dbService.getTramites();
      setTramites(data || []);
    } catch (e: any) {
      if (isSessionInvalidError(e)) {
        forceLogoutWithMessage(UX_MESSAGES.SESSION_INVALID);
        return;
      }
      setError(UX_MESSAGES.SYNC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const allowedTabs = TABS_BY_ROLE[user.role] || ['dashboard', 'tramites'];
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
      setUiMessage(UX_MESSAGES.TAB_REDIRECTED);
    }
  }, [user, activeTab]);

  const canAccessTab = (tab: 'dashboard' | 'tramites' | 'nuevo' | 'central' | 'adminUsers') => {
    if (!user) return false;
    return canAccessTabByRole(user.role, tab);
  };

  const goToTab = (tab: 'dashboard' | 'tramites' | 'nuevo' | 'central' | 'adminUsers') => {
    if (!canAccessTab(tab)) {
      setUiMessage(UX_MESSAGES.ACCESS_RESTRICTED);
      return;
    }
    setActiveTab(tab);
  };

  // MEMOS DEFENSIVOS: Verifican existencia antes de filtrar
  const filteredTramites = useMemo(() => {
    if (!Array.isArray(tramites)) return [];
    return tramites.filter(t => {
      const search = searchTerm.toLowerCase();
      const nombre = t.beneficiario?.nombre?.toLowerCase() || '';
      const paterno = t.beneficiario?.apellidoPaterno?.toLowerCase() || '';
      const nss = t.beneficiario?.nssTrabajador || '';
      const folio = t.folio?.toLowerCase() || '';
      
      return nombre.includes(search) || 
             paterno.includes(search) || 
             nss.includes(search) || 
             folio.includes(search);
    });
  }, [tramites, searchTerm]);

  const stats = useMemo(() => {
    if (!Array.isArray(tramites)) return { total: 0, pendientes: 0, autorizados: 0, entregados: 0, rechazados: 0 };
    return {
      total: tramites.length,
      pendientes: tramites.filter(t => t.estatus === EstatusWorkflow.EN_REVISION_DOCUMENTAL).length,
      autorizados: tramites.filter(t => t.estatus === EstatusWorkflow.AUTORIZADO).length,
      entregados: tramites.filter(t => t.estatus === EstatusWorkflow.ENTREGADO).length,
      rechazados: tramites.filter(t => t.estatus === EstatusWorkflow.RECHAZADO).length,
    };
  }, [tramites]);

  const chartData = [
    { name: 'Revision', value: stats.pendientes },
    { name: 'Autorizados', value: stats.autorizados },
    { name: 'Entregados', value: stats.entregados },
    { name: 'Rechazados', value: stats.rechazados }
  ];

  const resumenSolicitudesPorUnidad = useMemo(() => {
    const toMoney = (v: any) => {
      const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    const map = (tramites || []).reduce((acc: Record<string, { totalSolicitudes: number; totalCosto: number }>, t: Tramite) => {
      if (!String((t as any)?.folio || '').trim()) return acc;
      if (!String((t as any)?.fechaCreacion || '').trim()) return acc;
      if ((t as any)?.eliminado === true) return acc;

      const unidad = t.unidad || t.beneficiario?.entidadLaboral || 'SIN_UNIDAD';
      const importe = toMoney((t as any).importeAutorizado ?? (t as any).importeSolicitado ?? (t as any).costoSolicitud ?? (t as any).importe ?? (t as any).monto ?? 0);
      if (!acc[unidad]) acc[unidad] = { totalSolicitudes: 0, totalCosto: 0 };
      acc[unidad].totalSolicitudes += 1;
      acc[unidad].totalCosto += importe;
      return acc;
    }, {});

    return Object.entries(map)
      .map(([unidad, val]) => ({ unidad, totalSolicitudes: val.totalSolicitudes, totalCosto: val.totalCosto }))
      .sort((a, b) => a.unidad.localeCompare(b.unidad));
  }, [tramites]);

  const handleLogin = async (matricula: string, password: string) => {
    setLoading(true);
    setError(null);
    setUiMessage(null);
    try {
      const logged = await loginWithMatricula(matricula, password);
      setUser(logged);
      const allowedTabs = TABS_BY_ROLE[logged.role] || ['dashboard', 'tramites'];
      setActiveTab(allowedTabs[0]);
      const data = await dbService.getTramites();
      setTramites(data || []);
    } catch (e: any) {
      setError(e?.message || UX_MESSAGES.LOGIN_GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logoutSession();
    setUser(null);
    setTramites([]);
    setSelectedTramite(null);
    setActiveTab('dashboard');
    setUserMenuOpen(false);
    setShowChangePasswordModal(false);
    setUiMessage('sesión cerrada correctamente.');
  };

  const handleSavePresupuestoGlobal = async (value: number) => {
    if (!user) return;
    await dbService.setPresupuestoGlobal(user, value);
    setPresupuestoGlobal(Math.max(0, Number(value || 0)));
  };

  const gastoMetrics = useMemo(() => {
    if (!Array.isArray(tramites)) {
      return { global: 0, porUnidad: [], porPeriodo: [] };
    }

    const autorizados = tramites.filter(t => t.estatus === EstatusWorkflow.AUTORIZADO || t.estatus === EstatusWorkflow.ENTREGADO || t.estatus === EstatusWorkflow.CERRADO);
    const monto = (t: Tramite) => Number(t.importeAutorizado ?? t.importeSolicitado ?? 0);

    const global = autorizados.reduce((acc, t) => acc + monto(t), 0);

    const porUnidadMap = autorizados.reduce((acc: Record<string, number>, t) => {
      const key = t.unidad || t.beneficiario?.entidadLaboral || 'SIN_UNIDAD';
      acc[key] = (acc[key] || 0) + monto(t);
      return acc;
    }, {});

    const porPeriodoMap = autorizados.reduce((acc: Record<string, number>, t) => {
      const fecha = new Date(t.fechaValidacionImporte || t.fechaCreacion);
      const key = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
      acc[key] = (acc[key] || 0) + monto(t);
      return acc;
    }, {});

    const porUnidad = Object.entries(porUnidadMap)
      .map(([unidad, total]) => ({ unidad, total }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    const porPeriodo = Object.entries(porPeriodoMap)
      .map(([periodo, total]) => ({ periodo, total }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    return { global, porUnidad, porPeriodo };
  }, [tramites]);

  const handleCreateTramite = async (newTramite: Tramite, options?: { redirectToTramites?: boolean }) => {
    if (!user) return null;
    setLoading(true);
    try {
      const newId = await dbService.saveTramite(newTramite);
      await dbService.addBitacora({
        tramiteId: newId,
        usuario: user.nombre,
        accion: 'CREACION CLOUD',
        descripcion: `Tramite ${newTramite.folio} creado exitosamente.`
      });
      const savedTramite: Tramite = { ...newTramite, id: newId };
      setSelectedTramite(savedTramite);
      await loadData();
      if (options?.redirectToTramites !== false) {
        setActiveTab('tramites');
      }
      return savedTramite;
    } catch (e: any) {
      if (isSessionInvalidError(e)) {
        forceLogoutWithMessage(UX_MESSAGES.SESSION_INVALID);
        return null;
      }
      setUiMessage(e?.message || 'No fue posible guardar el tramite.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleImprocedenteIntent = async (draft: Tramite, reason: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await dbService.addBitacora({
        tramiteId: `INTENTO-IMPROCEDENTE-${Date.now()}`,
        usuario: user.nombre,
        accion: 'INTENTO_IMPROCEDENTE',
        descripcion: `Solicitud no procedente para NSS ${draft.beneficiario?.nssTrabajador || 'N/D'} y contrato ${draft.contratoColectivoAplicable || 'N/D'}. ${reason}`,
        categoria: 'SISTEMA',
        datos: {
          folioTemporal: draft.folio,
          contratoColectivoAplicable: draft.contratoColectivoAplicable,
          nssTrabajador: draft.beneficiario?.nssTrabajador,
          tipoBeneficiario: draft.beneficiario?.tipo,
          dotacionNumeroIntentada: draft.dotacionNumero
        }
      });
      setUiMessage('Solicitud marcada como IMPROCEDENTE. No se guardo tramite y se registro bitacora de intento.');
      setActiveTab('nuevo');
    } catch (e: any) {
      setUiMessage(e?.message || 'No fue posible registrar la bitacora de improcedente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEstatus = async (tramiteId: string, nuevoEstatus: EstatusWorkflow, nota?: string, importeAutorizado?: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const updateData: any = { id: tramiteId, estatus: nuevoEstatus };
      if (nota) updateData.motivoRechazo = nota;
      
      if (nuevoEstatus === EstatusWorkflow.AUTORIZADO) {
        if (!canAuthorizeImporte(user.role)) {
          throw new Error(UX_MESSAGES.UPDATE_STATUS_DENIED);
        }
        updateData.importeAutorizado = Number(importeAutorizado || 0);
        updateData.validadoPor = user.nombre;
        updateData.fechaValidacionImporte = new Date().toISOString();
        updateData.firmaAutorizacion = `AUTORIZADO ELECTRONICAMENTE POR ${user.nombre}`;
        updateData.nombreAutorizador = user.nombre;
      }

      await dbService.saveTramite(updateData);
      await loadData();
      const updated = (await dbService.getTramites()).find(t => t.id === tramiteId);
      if (updated) setSelectedTramite(updated);
    } catch (e: any) {
      if (isSessionInvalidError(e)) {
        forceLogoutWithMessage(UX_MESSAGES.SESSION_INVALID);
        return;
      }
      setUiMessage(e?.message || 'No fue posible actualizar el estatus.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewPrint = (tramite: Tramite, type: PrintDocumentType) => {
    if (!tramite) return;
    setSelectedTramite(tramite);
    setPrintConfig({
      show: true,
      type,
      metadata: {
        folio: tramite.folio,
        documento: type,
        emision: 'ORIGINAL',
        autorizadoPor: user?.nombre || 'CAPTURISTA',
        fechaAutorizacion: new Date().toISOString()
      }
    });
  };

  const handlePrintForTramite = async (tramite: Tramite, type: PrintDocumentType) => {
    if (!user || !tramite?.id) return;

    setLoading(true);

    const fechaAutorizacion = new Date().toISOString();
    let metadata: PrintMetadata = {
      folio: tramite.folio,
      documento: type,
      emision: 'ORIGINAL',
      autorizadoPor: tramite.nombreAutorizador || user.nombre,
      fechaAutorizacion
    };

    try {
      const BitácoraActual = await dbService.getBitacora(tramite.id);
      const impresionesPrevias = BitácoraActual.filter(
        (b) => b.categoria === 'IMPRESION' && b.datos?.documento === type
      ).length;

      const esReimpresion = impresionesPrevias > 0;
      let motivoReimpresion: string | undefined;

      if (esReimpresion) {
        const motivo = window.prompt('Este documento ya fue impreso. Captura el motivo de reimpresion (obligatorio):', '');
        if (!motivo || !motivo.trim()) {
          alert('La reimpresion requiere motivo obligatorio.');
          return;
        }
        motivoReimpresion = motivo.trim();
      }

      metadata = {
        ...metadata,
        emision: esReimpresion ? 'REIMPRESION' : 'ORIGINAL',
        motivoReimpresion
      };

      // abrir vista de impresion aunque falle la Bitácora
      setSelectedTramite(tramite);
      setPrintConfig({ show: true, type, metadata });

      await dbService.addBitacora({
        tramiteId: tramite.id,
        usuario: user.nombre,
        accion: 'IMPRESION_DOCUMENTO',
        categoria: 'IMPRESION',
        descripcion: `${metadata.emision} de ${type.toUpperCase()} registrada para folio ${tramite.folio}.`,
        datos: metadata
      });

      await dbService.saveTramite({
        id: tramite.id,
        impresiones: {
          formato: (tramite.impresiones?.formato || 0) + (type === 'formato' ? 1 : 0),
          tarjeta: (tramite.impresiones?.tarjeta || 0) + (type === 'tarjeta' ? 1 : 0),
          ultimaFecha: fechaAutorizacion,
          ultimoUsuario: user.nombre,
          ultimoMotivoReimpresion: motivoReimpresion
        }
      });
    } catch (e: any) {
      if (isSessionInvalidError(e)) {
        forceLogoutWithMessage(UX_MESSAGES.SESSION_INVALID);
        return;
      }
      // fallback: permitir impresion aunque falle registro secundario
      setSelectedTramite(tramite);
      setPrintConfig({ show: true, type, metadata });
      setUiMessage('Se abrio la vista de impresion, pero fallo el registro en Bitácora.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintRequest = async (type: PrintDocumentType) => {
    if (!selectedTramite) return;
    await handlePrintForTramite(selectedTramite, type);
  };

  const handleEditCapture = (tramite: Tramite) => {
    setCaptureEditTarget(tramite);
  };

  const handleSaveCaptureEdit = async (tramiteId: string, payload: any) => {
    if (!user) return;
    setLoading(true);
    try {
      await dbService.saveTramite({ id: tramiteId, ...payload } as Partial<Tramite>);
      const target = captureEditTarget;
      await dbService.addBitacora({
        tramiteId,
        usuario: user.nombre,
        accion: 'EDICION_CAPTURA_COMPLETA',
        categoria: 'WORKFLOW',
        descripcion: `Captura actualizada de forma integral para folio ${target?.folio || tramiteId}.`
      });
      setCaptureEditTarget(null);
      await loadData();
      const refreshed = (await dbService.getTramites()).find((t) => t.id === tramiteId);
      if (refreshed) setSelectedTramite(refreshed);
      setUiMessage('Captura actualizada correctamente.');
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo actualizar la captura.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTramite = async (tramite: Tramite) => {
    if (!user) return;
    const confirmed = window.confirm(`Se eliminara la solicitud ${tramite.folio}. Esta accion no se puede deshacer. ¿Deseas continuar?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      await dbService.addBitacora({
        tramiteId: tramite.id,
        usuario: user.nombre,
        accion: 'ELIMINACION_SOLICITUD',
        categoria: 'WORKFLOW',
        descripcion: `Solicitud ${tramite.folio} marcada para eliminacion por ${user.nombre}.`
      });
      await dbService.deleteTramite(tramite.id);
      setSelectedTramite(null);
      await loadData();
      setUiMessage('Solicitud eliminada correctamente.');
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo eliminar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCostoSolicitud = async (tramiteId: string, costoSolicitud: number): Promise<boolean> => {
    if (!user || !isAdminRole(user.role)) {
      setUiMessage('Solo ADMIN_SISTEMA puede editar el costo de solicitud.');
      return false;
    }

    setLoading(true);
    try {
      await dbService.saveTramite({ id: tramiteId, costoSolicitud: Number(costoSolicitud || 0) } as Partial<Tramite>);
      await loadData();
      const refreshed = (await dbService.getTramites()).find((t) => t.id === tramiteId);
      if (refreshed) setSelectedTramite(refreshed);
      setUiMessage('Costo de solicitud actualizado.');
      return true;
    } catch (e: any) {
      setUiMessage(e?.message || 'No se pudo actualizar el costo.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // VISTAS DE CARGA Y ERROR
  if (loading && !user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-imss-dark text-white">
        <Loader2 className="animate-spin mb-6 text-imss-gold" size={64} />
        <h2 className="text-2xl font-black uppercase tracking-[0.3em] animate-pulse">SISTRA Cloud</h2>
        <p className="text-imss-gold/60 mt-4 font-bold text-xs">INICIALIZANDO sesión SEGURA...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-12 rounded-[40px] shadow-2xl max-w-lg border border-red-100 text-center">
          <AlertTriangle className="text-red-500 mx-auto mb-6" size={64} />
          <h2 className="text-2xl font-black text-slate-800 uppercase mb-4">Error de Sincronizacion</h2>
          <p className="text-slate-600 mb-8">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full py-4 bg-imss text-white font-black uppercase rounded-2xl">Reintentar</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} loading={loading} error={error} infoMessage={uiMessage} />;
  }

  // VISTA DE IMPRESION (Separada del flujo principal para evitar fugas de memoria)
  if (printConfig.show && selectedTramite) {
    return (
      <div className="bg-white p-0">
        <div className="no-print p-4 bg-imss-dark text-white flex justify-between items-center sticky top-0 z-50">
          <button onClick={() => { setPrintConfig({show: false, type: 'formato'}); if (!selectedTramite?.id) setSelectedTramite(null); }} className="flex items-center gap-2 font-bold uppercase text-xs">
            <ArrowLeft size={16} /> Volver al Sistema
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="bg-imss px-6 py-2 rounded-xl flex items-center gap-2 font-black uppercase text-xs border border-white/20">
              <Printer size={16} /> Imprimir Documento
            </button>
            <button onClick={() => window.print()} className="bg-white/10 px-6 py-2 rounded-xl flex items-center gap-2 font-black uppercase text-xs border border-white/20">
              <FileText size={16} /> Descargar PDF
            </button>
          </div>
        </div>
        <div className="print-stage print-container py-4 bg-slate-100 min-h-screen">
           {printConfig.type === 'formato' ? (
             <PDFFormatoView tramite={selectedTramite} />
           ) : (
             <PDFTarjetaControlView 
               beneficiario={selectedTramite.beneficiario}
               dotaciones={(() => {
                 const normalize = (v: any) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
                 const s: any = selectedTramite?.beneficiario || {};
                 const sTipo = String(s.tipo || '').trim();
                 const sTitular = String(s.nssTrabajador || '').replace(/\D/g, '').trim();
                 const sNssHijo = String(s.nssHijo || '').replace(/\D/g, '').trim();
                 const sNombre = normalize(`${s.nombre || ''} ${s.apellidoPaterno || ''} ${s.apellidoMaterno || ''}`);
                 const sFecha = String(s.fechaNacimiento || '').slice(0, 10);

                 const sameScope = (t: any) => {
                   const b: any = t?.beneficiario || {};
                   const tTipo = String(b.tipo || '').trim();
                   const tTitular = String(b.nssTrabajador || '').replace(/\D/g, '').trim();
                   if (!sTitular || tTitular !== sTitular) return false;

                   if (sTipo !== TipoBeneficiario.HIJO && tTipo !== TipoBeneficiario.HIJO) return true;

                   const tNssHijo = String(b.nssHijo || '').replace(/\D/g, '').trim();
                   const sNssValido = sNssHijo && sNssHijo !== sTitular;
                   const tNssValido = tNssHijo && tNssHijo !== tTitular;
                   if (sNssValido && tNssValido) return sNssHijo === tNssHijo;

                   const tNombre = normalize(`${b.nombre || ''} ${b.apellidoPaterno || ''} ${b.apellidoMaterno || ''}`);
                   const tFecha = String(b.fechaNacimiento || '').slice(0, 10);
                   if (!sNombre || !tNombre || sNombre !== tNombre) return false;
                   if (sFecha && tFecha) return sFecha === tFecha;
                   return true;
                 };

                 const base = tramites.filter((t) => sameScope(t));
                 const list = selectedTramite.id ? base : [...base, selectedTramite];
                 const seen = new Set<string>();
                 return list.filter((x: any) => {
                   const key = String(x.id || x.folio || '').trim();
                   if (!key) return true;
                   if (seen.has(key)) return false;
                   seen.add(key);
                   return true;
                 });
               })()}
             />
           )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app-shell flex flex-col lg:flex-row overflow-hidden bg-white">
        {/* Sidebar */}
        <aside className="w-full lg:w-64 bg-imss-dark text-imss-light flex flex-col no-print border-b lg:border-b-0 lg:border-r border-white/5">
          <div className="p-4 lg:p-8">
            <div className="flex items-center gap-3 text-white mb-2">
              <div className="p-2 bg-imss rounded-xl shadow-lg border border-white/10">
                <ShieldCheck size={24} className="text-white" />
              </div>
              <span className="text-2xl font-black tracking-tighter">SISTRA</span>
            </div>
            <p className="text-[10px] text-white/70 font-bold">Sistema para el trámite de anteojos</p>
            <div className="flex items-center gap-2 mt-4">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <p className="text-[10px] text-emerald-400 uppercase font-black tracking-widest">En Linea (v2.7)</p>
            </div>
          </div>

          <nav className="mobile-scroll-x flex-1 px-3 lg:px-4 lg:space-y-2 mt-2 lg:mt-6 flex lg:block gap-2">
            <SidebarItem icon={<LayoutDashboard size={20} />} label="Tablero" active={activeTab === 'dashboard'} onClick={() => goToTab('dashboard')} />
            <SidebarItem icon={<Search size={20} />} label="Tramites" active={activeTab === 'tramites'} onClick={() => goToTab('tramites')} />
            {canAccessTab('nuevo') && (
              <SidebarItem icon={<PlusCircle size={20} />} label="Nueva Captura" active={activeTab === 'nuevo'} onClick={() => goToTab('nuevo')} />
            )}
            {/* vista central deshabilitada por requerimiento operativo */}
            {canAccessTab('adminUsers') && (
              <SidebarItem icon={<Settings size={20} />} label="Configuracion" active={activeTab === 'adminUsers'} onClick={() => goToTab('adminUsers')} />
            )}
          </nav>

          <div className="hidden lg:block p-6 border-t border-white/5">
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="w-10 h-10 rounded-full bg-imss flex items-center justify-center text-white font-black border border-imss-gold/40 shadow-inner">
                {user?.nombre?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-black text-white truncate uppercase">{user?.nombre?.split(' ')[0] || 'Usuario'}</p>
                <p className="text-[9px] text-imss-gold font-black truncate uppercase tracking-tighter">{user?.role.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden no-print bg-[#F9FBFC]">
          <header className="min-h-20 bg-white border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between px-4 py-4 lg:px-10 shadow-sm z-10 gap-3">
            <div className="flex items-center gap-3">
              {activeTab !== 'dashboard' && (
                <button className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase" onClick={() => setActiveTab('dashboard')}>
                  Regresar
                </button>
              )}
              <h2 className="text-base lg:text-xl font-black text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                <span className="w-1.5 h-8 bg-imss rounded-full"></span>
                {activeTab === 'dashboard' && 'Resumen Institucional'}
                {activeTab === 'tramites' && 'Gestión de Tramites'}
                {activeTab === 'nuevo' && 'Solicitud de Dotacion'}
                {activeTab === 'central' && 'Gestión de Tramites'}
              </h2>
            </div>
            
            <div className="flex items-center gap-3 lg:gap-6 w-full lg:w-auto">
               {activeTab === 'tramites' && (
                <div className="relative group flex-1 lg:flex-none">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-imss transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar NSS o Folio..." 
                    aria-label="Buscar por NSS, folio o nombre"
                    className="pl-12 pr-6 py-3 bg-slate-50 border-2 border-transparent rounded-[20px] text-sm font-bold focus:bg-white focus:border-imss outline-none w-full lg:w-80 transition-all shadow-inner"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}
              {loading && <Loader2 className="animate-spin text-imss" size={24} />}

              <div className="relative" ref={userMenuRef}>
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-label="Abrir menu de usuario"
                >
                  <div className="w-8 h-8 rounded-full bg-imss text-white text-xs font-black flex items-center justify-center">
                    {user?.nombre?.charAt(0)}
                  </div>
                  <span className="hidden lg:inline text-xs font-black uppercase text-slate-700 max-w-24 truncate">{user?.nombre}</span>
                  <ChevronDown size={16} className="text-slate-500" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2">
                    {canAccessTab('adminUsers') && (
                      <button
                        className="w-full text-left px-3 py-3 text-sm font-bold rounded-xl hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                        onClick={() => {
                          setActiveTab('adminUsers');
                          setUserMenuOpen(false);
                        }}
                      >
                        <Settings size={16} /> Ir a Configuracion
                      </button>
                    )}
                    <button
                      className="w-full text-left px-3 py-3 text-sm font-bold rounded-xl hover:bg-red-50 text-red-700 flex items-center gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-4 lg:p-10">
            {uiMessage && activeTab !== 'nuevo' && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 px-5 py-4 text-sm font-bold flex items-center justify-between">
                <span>{uiMessage}</span>
                <button className="text-xs uppercase" onClick={() => setUiMessage(null)}>Cerrar</button>
              </div>
            )}
            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                chartData={chartData}
                gastoMetrics={gastoMetrics}
                presupuestoGlobal={presupuestoGlobal}
                resumenSolicitudesPorUnidad={resumenSolicitudesPorUnidad}
                dashboardTotalsGlobal={dashboardTotalsGlobal}
              />
            )}
            {activeTab === 'tramites' && <TramitesListView tramites={filteredTramites} onSelect={setSelectedTramite} searchTerm={searchTerm} />}
            {activeTab === 'nuevo' && (canAccessTab('nuevo') ? <NuevoTramiteWizard user={user!} tramites={tramites} cctCatalog={cctCatalog} uiMessage={uiMessage} clearUiMessage={() => setUiMessage(null)} onSave={handleCreateTramite} onPrint={handlePrintForTramite} onPreviewPrint={handlePreviewPrint} onImprocedente={handleImprocedenteIntent} /> : <AccessDeniedView />)}
            {/* central view removida por operacion */}
            {activeTab === 'adminUsers' && (canAccessTab('adminUsers') ? <AdminUsersView currentUser={user} cctCatalog={cctCatalog} onSaveCctCatalog={setCctCatalog} presupuestoGlobal={presupuestoGlobal} onSavePresupuestoGlobal={handleSavePresupuestoGlobal} onChangePassword={() => setShowChangePasswordModal(true)} onLogout={handleLogout} /> : <AccessDeniedView />)}
          </div>
        </main>

        {showChangePasswordModal && (
          <ChangePasswordModal
            onClose={() => setShowChangePasswordModal(false)}
            onSuccess={(message) => {
              setShowChangePasswordModal(false);
              forceLogoutWithMessage(`${message} Por seguridad inicia sesión nuevamente.`);
            }}
            onAuthFailure={(message) => {
              forceLogoutWithMessage(message);
              setShowChangePasswordModal(false);
            }}
          />
        )}

        {selectedTramite && (
          <TramiteDetailModal 
            tramite={selectedTramite} 
            user={user!}
            onClose={() => setSelectedTramite(null)} 
            onUpdateEstatus={handleUpdateEstatus}
            onEditCapture={handleEditCapture}
            onDeleteTramite={handleDeleteTramite}
            onUpdateCostoSolicitud={handleUpdateCostoSolicitud}
            onPrint={handlePrintRequest}
            historicalDotations={tramites.filter(t => t.beneficiario?.nssTrabajador === selectedTramite.beneficiario?.nssTrabajador)}
            loading={loading}
          />
        )}

        {captureEditTarget && (
          <EditCaptureModal
            tramite={captureEditTarget}
            onClose={() => setCaptureEditTarget(null)}
            onSave={handleSaveCaptureEdit}
            loading={loading}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

// COMPONENTES AUXILIARES CON GUARDS
const LoginView = ({ onLogin, loading, error, infoMessage }: any) => {
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const matriculaNormalized = (matricula || '').trim();
    const passwordValue = password || '';

    const validationError = validateLoginInput(matriculaNormalized, passwordValue);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    onLogin(matriculaNormalized, passwordValue);
  };

  return (
    <div className="h-screen bg-slate-100 flex items-center justify-center p-4 lg:p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md institutional-card p-6 lg:p-10"
      >
        <h1 className="text-2xl font-black text-imss-dark uppercase mb-2">Acceso SISTRA</h1>
        <p className="text-xs text-slate-500 font-bold mb-6">Sistema para el trámite de anteojos</p>
        <label className="field-label">Matricula</label>
        <input value={matricula} onChange={(e) => setMatricula(e.target.value)} className="field-input mb-5" placeholder="Ej. 99032103" inputMode="numeric" pattern="[0-9]*" required />
        <label className="field-label">contraseña</label>
        <div className="relative mb-6">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input pr-12"
            placeholder="********"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {infoMessage && <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-bold mb-4">{infoMessage}</p>}
        {(localError || error) && <p className="text-red-600 text-sm font-bold mb-4">{localError || error}</p>}
        <button disabled={loading} className="w-full py-4 rounded-xl btn-institutional disabled:opacity-50">
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
        {/* nota de acceso removida por requerimiento */}
      </form>
    </div>
  );
};

const AdminUsersView = ({ currentUser, cctCatalog, onSaveCctCatalog, presupuestoGlobal, onSavePresupuestoGlobal, onChangePassword, onLogout }: { currentUser: User; cctCatalog: string[]; onSaveCctCatalog: (values: string[]) => void; presupuestoGlobal: number; onSavePresupuestoGlobal: (value: number) => Promise<void>; onChangePassword: () => void; onLogout: () => void }) => {
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [nuevoCct, setNuevoCct] = useState('');
  const [nombre, setNombre] = useState('');
  const [matricula, setMatricula] = useState('');
  const [unidad, setUnidad] = useState('');
  const [ooad, setOoad] = useState('');
  const [role, setRole] = useState<Role>(Role.CAPTURISTA_UNIDAD);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPasswordByUser, setShowResetPasswordByUser] = useState<Record<string, boolean>>({});
  const [resetPasswordByUser, setResetPasswordByUser] = useState<Record<string, string>>({});
  const [resetFeedbackByUser, setResetFeedbackByUser] = useState<Record<string, string>>({});
  const [editRoleByUser, setEditRoleByUser] = useState<Record<string, Role>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [presupuestoDraft, setPresupuestoDraft] = useState<number>(Number(presupuestoGlobal || 0));

  useEffect(() => {
    setPresupuestoDraft(Number(presupuestoGlobal || 0));
  }, [presupuestoGlobal]);

  const ROLES_PERMITIDOS: Role[] = [Role.CAPTURISTA_UNIDAD, Role.ADMIN_SISTEMA];

  const refresh = async () => setUsuarios(await dbService.getUsers());
  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3">
        <button className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold" onClick={onChangePassword}>Cambiar contraseña</button>
        <button className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-black" onClick={onLogout}>Cerrar sesión</button>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-100 space-y-3">
        <h3 className="font-black uppercase">Configuración de presupuesto global</h3>
        <p className="text-xs font-semibold text-slate-500">Solo administradores pueden cambiar el presupuesto total mostrado en tablero.</p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            className="flex-1 p-3 border rounded-xl"
            value={presupuestoDraft}
            onChange={(e) => setPresupuestoDraft(Number(e.target.value || 0))}
          />
          <button
            className="px-4 py-2 rounded-xl bg-imss text-white text-sm font-black"
            onClick={async () => {
              try {
                await onSavePresupuestoGlobal(Math.max(0, Number(presupuestoDraft || 0)));
                setFeedback('Presupuesto global actualizado y sincronizado.');
              } catch (e: any) {
                setFeedback(e?.message || 'No se pudo guardar el presupuesto global.');
              }
            }}
          >Guardar presupuesto</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-100 space-y-3">
        <h3 className="font-black uppercase">Configuración de contratos colectivos (CCT)</h3>
        <p className="text-xs font-semibold text-slate-500">El capturista solo podrá seleccionar contratos dados de alta aquí.</p>
        <div className="flex gap-2">
          <input className="flex-1 p-3 border rounded-xl" placeholder="Ej. CCT 2025-2027" value={nuevoCct} onChange={(e) => setNuevoCct(e.target.value)} />
          <button className="px-4 py-2 rounded-xl bg-imss text-white text-sm font-black" onClick={() => {
            const next = String(nuevoCct || '').trim().toUpperCase();
            if (!next) return;
            const merged = Array.from(new Set([...(cctCatalog || []), next]));
            onSaveCctCatalog(merged);
            setNuevoCct('');
            setFeedback('CCT agregado correctamente.');
          }}>Agregar CCT</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(cctCatalog || []).map((cct) => (
            <div key={cct} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-2">
              <span>{cct}</span>
              <button className="text-red-700" onClick={() => {
                const filtered = (cctCatalog || []).filter((x) => x !== cct);
                if (!filtered.length) {
                  setFeedback('Debe existir al menos un CCT vigente.');
                  return;
                }
                onSaveCctCatalog(filtered);
                setFeedback('CCT eliminado.');
              }}>Quitar</button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-3xl p-8 border border-slate-100">
        <h3 className="font-black uppercase mb-6">Alta de Usuario</h3>
        {feedback && <p className="mb-3 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg px-3 py-2">{feedback}</p>}
        <div className="space-y-3">
          <input className="w-full p-3 border rounded-xl" placeholder="Nombre" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
          <input className="w-full p-3 border rounded-xl" placeholder="Matricula" inputMode="numeric" pattern="[0-9]*" value={matricula} onChange={(e)=>setMatricula(e.target.value.replace(/\D/g, ''))} />
          <input className="w-full p-3 border rounded-xl" placeholder="Unidad" value={unidad} onChange={(e)=>setUnidad(e.target.value)} />
          <input className="w-full p-3 border rounded-xl" placeholder="OOAD" value={ooad} onChange={(e)=>setOoad(e.target.value)} />
          <select className="w-full p-3 border rounded-xl bg-white" value={role} onChange={(e)=>setRole(e.target.value as Role)}>
            {ROLES_PERMITIDOS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} className="w-full p-3 border rounded-xl pr-10" placeholder="contraseña inicial" value={password} onChange={(e)=>setPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 font-semibold">La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula, un número y un carácter especial.</p>
          <button className="w-full py-3 bg-imss text-white rounded-xl font-black uppercase" onClick={async ()=>{
            const issues = validatePasswordStrength(password);
            if (issues.length > 0) {
              setFeedback(`No se puede crear usuario. ${issues.join(' ')}`);
              return;
            }
            try {
              await adminCreateCapturista(currentUser, { nombre, matricula, unidad, ooad, password, role });
              setNombre('');setMatricula('');setUnidad('');setOoad('');setPassword('');setRole(Role.CAPTURISTA_UNIDAD);
              await refresh();
              setFeedback('Usuario creado correctamente.');
            } catch (e: any) { setFeedback(e?.message || 'No se pudo crear el usuario.'); }
          }}>Crear usuario</button>
        </div>
      </div>
      <div className="bg-white rounded-3xl p-8 border border-slate-100">
        <h3 className="font-black uppercase mb-6">Reset administrativo</h3>
        <div className="space-y-3 max-h-[500px] overflow-auto">
          {usuarios.map((u) => (
            <div key={u.id} className="border rounded-xl p-3">
              <p className="font-black text-sm">{u.nombre} · {u.matricula}</p>
              <p className="text-xs text-slate-500">{u.role} · {u.unidad} · {u.activo ? 'ACTIVO' : 'INACTIVO'}</p>
              <div className="mt-2 flex gap-2 items-center">
                <select
                  className="p-2 border rounded-lg text-xs"
                  value={editRoleByUser[u.id] || (ROLES_PERMITIDOS.includes(u.role as Role) ? u.role : Role.CAPTURISTA_UNIDAD)}
                  onChange={(e) => setEditRoleByUser(prev => ({ ...prev, [u.id]: e.target.value as Role }))}
                >
                  {ROLES_PERMITIDOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="px-3 bg-imss text-white rounded-lg text-xs" onClick={async ()=>{
                  try {
                    const nextRole = (editRoleByUser[u.id] || u.role) as Role;
                    await dbService.adminUpdateUserRole(currentUser, u.id, nextRole);
                    setFeedback(`Rol actualizado para ${u.matricula}.`);
                    await refresh();
                  } catch(e:any){ setFeedback(e?.message || 'No se pudo actualizar el rol.'); }
                }}>Guardar rol</button>
                <button className="px-3 bg-red-700 text-white rounded-lg text-xs" onClick={async ()=>{
                  const ok = window.confirm(`Eliminar usuario ${u.matricula}?`);
                  if (!ok) return;
                  try {
                    await dbService.adminDeleteUser(currentUser, u.id);
                    setFeedback(`Usuario ${u.matricula} eliminado.`);
                    await refresh();
                  } catch(e:any){ setFeedback(e?.message || 'No se pudo eliminar el usuario.'); }
                }}>Eliminar</button>
              </div>
              <div className="mt-2 flex gap-2 items-center">
                <div className="relative flex-1">
                  <input
                    type={showResetPasswordByUser[u.id] ? 'text' : 'password'}
                    className="w-full p-2 border rounded-lg pr-9"
                    placeholder="Nueva contraseña"
                    value={resetPasswordByUser[u.id] || ''}
                    onChange={(e)=>setResetPasswordByUser(prev => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss"
                    onClick={() => setShowResetPasswordByUser(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                    aria-label={showResetPasswordByUser[u.id] ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showResetPasswordByUser[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button className="px-3 bg-slate-800 text-white rounded-lg text-xs" onClick={async ()=>{
                  const candidate = (resetPasswordByUser[u.id] || '').trim();
                  const issues = validatePasswordStrength(candidate);
                  if (issues.length > 0) {
                    const msg = `No se pudo resetear a ${u.matricula}. ${issues.join(' ')}`;
                    setFeedback(msg);
                    setResetFeedbackByUser(prev => ({ ...prev, [u.id]: msg }));
                    return;
                  }
                  try {
                    await adminResetPassword(currentUser, u.id, candidate);
                    setResetPasswordByUser(prev => ({ ...prev, [u.id]: '' }));
                    const okMsg = `Contraseña actualizada correctamente para ${u.matricula}.`;
                    setFeedback(okMsg);
                    setResetFeedbackByUser(prev => ({ ...prev, [u.id]: okMsg }));
                  }
                  catch(e:any){ 
                    const errMsg = e?.message || 'No se pudo resetear la contraseña.';
                    setFeedback(errMsg);
                    setResetFeedbackByUser(prev => ({ ...prev, [u.id]: errMsg }));
                  }
                }}>Reset</button>
                {resetFeedbackByUser[u.id] && <span className="text-[10px] text-slate-600 font-semibold">{resetFeedbackByUser[u.id]}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
};

const AccessDeniedView = () => (
  <div className="bg-white rounded-3xl border border-red-100 p-10 text-center">
    <AlertTriangle className="mx-auto text-red-500 mb-4" />
    <p className="font-black text-slate-700 uppercase text-sm">No tienes permisos para ver esta seccion.</p>
    <p className="text-xs text-slate-500 mt-2">Si consideras que es un error, contacta al administrador del sistema.</p>
  </div>
);

const SidebarItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-auto lg:w-full whitespace-nowrap flex items-center gap-3 px-4 lg:px-5 py-3 lg:py-4 rounded-2xl text-xs lg:text-sm font-black uppercase tracking-widest transition-all ${active ? 'bg-imss text-white shadow-xl' : 'hover:bg-white/5 text-imss-light/60 hover:text-white'}`}>
    {icon}{label}
  </button>
);

const DashboardView = ({ presupuestoGlobal, resumenSolicitudesPorUnidad, dashboardTotalsGlobal }: any) => {
  const totalSolicitudes = (resumenSolicitudesPorUnidad || []).reduce((acc: number, r: any) => acc + Number(r.totalSolicitudes || 0), 0);
  const totalImporte = (resumenSolicitudesPorUnidad || []).reduce((acc: number, r: any) => acc + Number(r.totalCosto || 0), 0);
  const porcentajeUso = presupuestoGlobal > 0 ? (totalImporte / presupuestoGlobal) * 100 : 0;
  const presupuestoRestante = Math.max(0, Number(presupuestoGlobal || 0) - Number(totalImporte || 0));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="bg-white rounded-[32px] border border-slate-100 p-6 lg:p-8 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 items-end">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Presupuesto</p>
            <p className="text-2xl font-black text-imss">{formatCurrency(presupuestoGlobal)}</p>
                      </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Total solicitudes</p>
            <p className="text-2xl font-black text-slate-800">{totalSolicitudes}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Importe total solicitudes</p>
            <p className="text-2xl font-black text-imss">{formatCurrency(totalImporte)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Presupuesto restante</p>
            <p className="text-2xl font-black text-emerald-700">{formatCurrency(presupuestoRestante)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Porcentaje de uso</p>
            <p className="text-2xl font-black text-slate-800">{porcentajeUso.toFixed(2)}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 p-8">
        <h4 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-6">Resumen por unidad (cantidad e importe)</h4>
        <div className="space-y-3 max-h-80 overflow-auto">
          {(resumenSolicitudesPorUnidad || []).length ? (resumenSolicitudesPorUnidad || []).map((r: any, idx: number) => (
            <div key={`${r.unidad}-${idx}`} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between gap-4">
              <p className="text-xs font-black uppercase text-slate-700">{r.unidad}</p>
              <p className="text-[11px] font-bold text-slate-600">Solicitudes: {r.totalSolicitudes}</p>
              <p className="text-[11px] font-bold text-imss">Importe: {formatCurrency(r.totalCosto)}</p>
            </div>
          )) : <p className="text-xs text-slate-400 font-bold">Sin solicitudes por unidad.</p>}
        </div>
      </div>
    </div>
  );
};
const StatCard = ({ label, value, icon, color }: any) => {
  const bgColors: any = { imss: 'bg-imss-light', amber: 'bg-amber-100', emerald: 'bg-emerald-100', slate: 'bg-slate-100' };
  return (
    <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex items-center justify-between group transition-all hover:shadow-xl hover:-translate-y-1">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{label}</p>
        <p className="text-4xl font-black text-slate-800">{value}</p>
      </div>
      <div className={`p-5 rounded-[24px] ${bgColors[color]} group-hover:scale-110 transition-transform`}>{icon}</div>
    </div>
  );
};

const SimpleSpendTable = ({ title, rows }: any) => (
  <div className="bg-white rounded-[40px] border border-slate-100 p-8">
    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-6">{title}</h4>
    <div className="space-y-3 max-h-64 overflow-auto">
      {rows.length ? rows.map((row: any, idx: number) => (
        <div key={`${row.label}-${idx}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
          <span className="text-xs font-black uppercase text-slate-600">{row.label}</span>
          <span className="text-xs font-black text-imss">${Number(row.value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )) : (
        <p className="text-xs text-slate-400 font-bold">Sin datos de gasto.</p>
      )}
    </div>
  </div>
);

const TramitesListView = ({ tramites, onSelect, searchTerm = '' }: any) => (
  <div className="institutional-card rounded-[28px] lg:rounded-[50px] overflow-hidden animate-in slide-in-from-bottom-6 duration-500" aria-live="polite">
    <div className="mobile-scroll-x">
    <table className="w-full min-w-[760px] text-left border-collapse">
      <caption className="sr-only">Bandeja de tramites</caption>
      <thead className="bg-imss-dark">
        <tr>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest">Identificador</th>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest">Solicitante</th>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest">Operador captura</th>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest text-center">Estatus Cloud</th>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest text-right">Costo solicitud</th>
          <th scope="col" className="px-10 py-8 text-[11px] font-black text-white/60 uppercase tracking-widest text-right">Accion</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {tramites.length > 0 ? tramites.map((t: Tramite) => (
          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => onSelect(t)}>
            <td className="px-10 py-8">
              <p className="font-black text-imss-dark text-sm tracking-tight">{t.folio}</p>
              <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">Fecha: {new Date(t.fechaCreacion).toLocaleDateString()}</p>
            </td>
            <td className="px-10 py-8">
              <p className="font-black text-slate-800 text-sm uppercase">{[t.beneficiario?.nombre, t.beneficiario?.apellidoPaterno, t.beneficiario?.apellidoMaterno].filter(Boolean).join(' ') || 'N/A'}</p>
              <p className="text-[10px] text-imss font-black mt-1">NSS: {t.beneficiario?.nssTrabajador || 'SIN NSS'}</p>
            </td>
            <td className="px-10 py-8">
              <p className="font-black text-slate-700 text-xs uppercase">{String((t as any).creadorNombre || 'SIN DATO')}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">{String((t as any).creadorMatricula || (t as any).creadorId || 'N/D')}</p>
            </td>
            <td className="px-10 py-8 text-center">
              <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest ${(COLOR_ESTATUS as any)[t.estatus]}`}>
                {formatStatusLabel(t.estatus)}
              </span>
            </td>
            <td className="px-10 py-8 text-right">
              <p className="text-xs font-black text-slate-700">{formatCurrency(Number(t.costoSolicitud || 0))}</p>
            </td>
            <td className="px-10 py-8 text-right">
              <button aria-label={`Abrir detalle del folio ${t.folio}`} className="p-4 bg-slate-100 rounded-2xl text-slate-400 group-hover:bg-imss group-hover:text-white transition-all shadow-sm">
                <ChevronRight size={20} />
              </button>
            </td>
          </tr>
        )) : (
          <tr>
            <td colSpan={6} className="px-10 py-32 text-center text-slate-400 font-black uppercase tracking-[0.2em]">
              {searchTerm ? `Sin coincidencias para "${searchTerm}".` : 'Sin registros sincronizados'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  </div>
);

const TramiteDetailModal = ({ tramite, user, onClose, onUpdateEstatus, onEditCapture, onDeleteTramite, onUpdateCostoSolicitud, onPrint, historicalDotations, loading }: any) => {
  const [activeTab, setActiveTab] = useState<'info' | 'Bitácora' | 'tarjeta'>('info');
  const [Bitácora, setBitácora] = useState<Bitácora[]>([]);
  const [costoSolicitud, setCostoSolicitud] = useState<number>(Number(tramite.costoSolicitud || 0));
  const [costoSaveFeedback, setCostoSaveFeedback] = useState<string | null>(null);
  // control de importe se Gestióna fuera de la unidad

  useEffect(() => {
    let isMounted = true;
    const fetchBitácora = async () => {
      try {
        const data = await dbService.getBitacora(tramite.id);
        if (isMounted) setBitácora(data);
      } catch (e) {
        if (isMounted) setBitácora([]);
      }
    };
    fetchBitácora();
    return () => { isMounted = false; };
  }, [tramite.id]);

  const canApprove = false;
  const tipoContratacionTitular = tramite.beneficiario?.tipoContratacion
    || historicalDotations.find((d: Tramite) => String(d?.beneficiario?.tipoContratacion || '').trim())?.beneficiario?.tipoContratacion
    || 'SIN CAPTURA';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleGuardarCosto = async () => {
    setCostoSaveFeedback(null);
    const ok = await onUpdateCostoSolicitud(tramite.id, costoSolicitud);
    setCostoSaveFeedback(ok ? 'Guardado correctamente.' : 'No se pudo guardar.');
  };

  return (
    <div className="fixed inset-0 bg-imss-dark/80 backdrop-blur-xl z-50 flex items-center justify-center p-2 lg:p-8 animate-in fade-in duration-300" role="dialog" aria-modal="true" aria-label={`Detalle del tramite ${tramite.folio}`}>
       <div className="bg-white rounded-3xl lg:rounded-[60px] w-full max-w-6xl h-[96vh] lg:h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/20">
          <div className="px-4 py-4 lg:px-12 lg:py-10 bg-imss-dark text-white flex flex-col lg:flex-row justify-between lg:items-center shrink-0 border-b border-imss-gold/20 gap-3">
             <div>
               <div className="flex items-center gap-6">
                 <h2 className="text-4xl font-black tracking-tighter">{tramite.folio}</h2>
                 <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${(COLOR_ESTATUS as any)[tramite.estatus]}`}>
                   {formatStatusLabel(tramite.estatus)}
                 </span>
               </div>
               <p className="text-imss-gold font-black text-[10px] uppercase tracking-[0.3em] mt-3">SISTRA ID: {tramite.id}</p>
             </div>
             <div className="flex items-center gap-3 flex-wrap justify-end">
               <button onClick={() => onPrint('formato')} className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all flex items-center gap-3 text-xs font-black uppercase tracking-widest border border-white/5">
                 <Printer size={20} className="text-imss-gold" /> Imprimir/Reimprimir 027
               </button>
               <button onClick={() => onPrint('tarjeta')} className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all flex items-center gap-3 text-xs font-black uppercase tracking-widest border border-white/5">
                 <CreditCard size={20} className="text-imss-gold" /> Imprimir/Reimprimir 028
               </button>
               <button onClick={() => onEditCapture(tramite)} className="px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-xs font-black uppercase tracking-widest border border-white/5">
                 Editar captura
               </button>
               <button onClick={() => onDeleteTramite(tramite)} className="px-6 py-4 bg-red-500/20 hover:bg-red-500/35 rounded-2xl transition-all text-xs font-black uppercase tracking-widest border border-red-200/30 text-red-100">
                 Eliminar solicitud
               </button>
               <button onClick={onClose} className="p-3 shrink-0 bg-white/10 hover:bg-white/25 rounded-2xl text-white border border-white/20 hover:border-white/40 transition-all" aria-label="Cerrar ventana de tramite">
                 <XCircle size={26} />
               </button>
             </div>
          </div>

          <div className="mobile-scroll-x flex border-b border-slate-100 bg-slate-50 px-2 lg:px-12">
             <TabButton label="Información General" active={activeTab === 'info'} onClick={() => setActiveTab('info')} />
             <TabButton label="Historial Institucional" active={activeTab === 'tarjeta'} onClick={() => setActiveTab('tarjeta')} />
             {/* Bitacora Cloud oculto por requerimiento */}
          </div>

          <div className="flex-1 overflow-auto p-4 lg:p-12 bg-white">
            {/* impresion/reimpresion habilitada desde captura completada */}
            {activeTab === 'info' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
                <div className="space-y-10">
                  <div className="p-10 bg-slate-50 rounded-[40px] border border-slate-100 shadow-inner">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase mb-8 tracking-[0.2em]">Cedula del Beneficiario</h4>
                    <div className="grid grid-cols-1 gap-8">
                      <div><p className="text-slate-400 font-black uppercase text-[9px] mb-2 tracking-widest">Nombre del solicitante</p><p className="font-black text-slate-800 text-xl uppercase leading-tight">{[tramite.beneficiario?.nombre, tramite.beneficiario?.apellidoPaterno, tramite.beneficiario?.apellidoMaterno].filter(Boolean).join(' ')}</p></div>
                      <div className="grid grid-cols-2 gap-6">
                        <div><p className="text-slate-400 font-black uppercase text-[9px] mb-2 tracking-widest">Tipo beneficiario</p><p className="font-black text-slate-800 uppercase text-lg">{tramite.beneficiario?.tipo === TipoBeneficiario.HIJO ? 'HIJA/HIJO' : tramite.beneficiario?.tipo === TipoBeneficiario.TRABAJADOR ? 'PERSONA TRABAJADORA' : 'JUBILADA/PENSIONADA'}</p></div>
                        <div><p className="text-slate-400 font-black uppercase text-[9px] mb-2 tracking-widest">Tipo de contratación titular</p><p className="font-black text-slate-800 uppercase text-lg">{tipoContratacionTitular}</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div><p className="text-slate-400 font-black uppercase text-[9px] mb-2 tracking-widest">NSS titular</p><p className="font-black text-imss text-lg tracking-widest">{tramite.beneficiario?.nssTrabajador || 'SIN NSS'}</p></div>
                        <div><p className="text-slate-400 font-black uppercase text-[9px] mb-2 tracking-widest">Unidad</p><p className="font-black text-slate-800 uppercase text-lg">{tramite.beneficiario?.entidadLaboral || 'SIN CAPTURA'}</p></div>
                      </div>
                      {tramite.beneficiario?.tipo === TipoBeneficiario.HIJO && (
                        <div className="grid grid-cols-1 gap-3 p-4 rounded-2xl border border-imss/20 bg-imss-light/20">
                          <div><p className="text-slate-500 font-black uppercase text-[9px] mb-1 tracking-widest">Titular (padre/madre trabajador/a)</p><p className="font-black text-slate-800 uppercase">{tramite.beneficiario?.titularNombreCompleto || 'SIN CAPTURA'}</p></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-slate-500 font-black uppercase text-[9px] mb-1 tracking-widest">Matrícula titular</p><p className="font-black text-slate-800 uppercase">{tramite.beneficiario?.matricula || 'SIN CAPTURA'}</p></div>
                            <div><p className="text-slate-500 font-black uppercase text-[9px] mb-1 tracking-widest">Clave adscripción titular</p><p className="font-black text-slate-800 uppercase">{tramite.beneficiario?.claveAdscripcion || 'SIN CAPTURA'}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-10">
                  <div className="p-10 bg-imss-light/30 rounded-[40px] border border-imss/10 space-y-6">
                    <h4 className="text-[11px] font-black text-imss/50 uppercase tracking-[0.2em]">Control normativo</h4>
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 space-y-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contrato colectivo aplicable</p>
                      <p className="text-sm font-black text-slate-800">{tramite.contratoColectivoAplicable || 'SIN CAPTURA'}</p>
                      <p className="text-[10px] text-slate-500 font-bold">Dotaciones registradas para este contrato: {historicalDotations.filter((d: Tramite) => String(d.contratoColectivoAplicable || '').trim().toUpperCase() === String(tramite.contratoColectivoAplicable || '').trim().toUpperCase()).length} de 2</p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 space-y-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Costo de solicitud</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={costoSolicitud}
                          onChange={(e) => setCostoSolicitud(Number(e.target.value || 0))}
                          disabled={!isAdminRole(user.role)}
                          className="w-full p-3 rounded-xl border border-slate-200 font-black text-slate-800 disabled:bg-slate-100"
                        />
                        {isAdminRole(user.role) && (
                          <button
                            type="button"
                            className="px-3 py-2 rounded-xl bg-imss text-white text-xs font-black"
                            onClick={handleGuardarCosto}
                          >Guardar</button>
                        )}
                      </div>
                      {costoSaveFeedback && (
                        <p className={`text-[11px] font-bold ${costoSaveFeedback.includes('correctamente') ? 'text-emerald-700' : 'text-red-600'}`}>
                          {costoSaveFeedback}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bitacora Cloud removido por requerimiento */}

            {activeTab === 'tarjeta' && (
              <div className="grid grid-cols-1 gap-6">
                 {historicalDotations.length > 0 ? historicalDotations.sort((a: any, b: any) => a.dotacionNumero - b.dotacionNumero).map((d: Tramite) => (
                   <div key={d.id} className="flex items-center justify-between p-8 bg-slate-50 border border-slate-100 rounded-[32px] hover:bg-white hover:shadow-xl transition-all cursor-default">
                     <div className="flex items-center gap-8">
                       <div className="w-16 h-16 bg-white rounded-2xl flex flex-col items-center justify-center shadow-sm border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400">DOT</span>
                          <span className="text-2xl font-black text-imss">{d.dotacionNumero}</span>
                       </div>
                       <div>
                         <p className="font-black text-slate-800 text-lg uppercase tracking-tight">Folio: {d.folio}</p>
                         <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Sincronizado el {new Date(d.fechaCreacion).toLocaleDateString()}</p>
                       </div>
                     </div>
                     <span className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${(COLOR_ESTATUS as any)[d.estatus]}`}>
                        {formatStatusLabel(d.estatus)}
                     </span>
                   </div>
                 )) : (
                   <div className="text-center py-32 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
                      <p className="text-slate-400 font-black uppercase tracking-[0.3em] opacity-40">Sin historial previo de dotaciones</p>
                   </div>
                 )}
              </div>
            )}
          </div>
       </div>
    </div>
  );
};

const toDateInputValue = (value?: string) => value ? String(value).slice(0, 10) : '';

const EditCaptureModal = ({ tramite, onClose, onSave, loading }: {
  tramite: Tramite;
  onClose: () => void;
  onSave: (tramiteId: string, payload: Partial<Tramite>) => Promise<void>;
  loading: boolean;
}) => {
  const [form, setForm] = useState({
    tipo: tramite.beneficiario?.tipo || TipoBeneficiario.TRABAJADOR,
    nombre: tramite.beneficiario?.nombre || '',
    apellidoPaterno: tramite.beneficiario?.apellidoPaterno || '',
    apellidoMaterno: tramite.beneficiario?.apellidoMaterno || '',
    nssTrabajador: tramite.beneficiario?.nssTrabajador || '',
    nssHijo: tramite.beneficiario?.nssHijo || '',
    titularNombreCompleto: tramite.beneficiario?.titularNombreCompleto || '',
    fechaNacimiento: toDateInputValue(tramite.beneficiario?.fechaNacimiento),
    entidadLaboral: tramite.beneficiario?.entidadLaboral || '',
    ooad: tramite.beneficiario?.ooad || '',
    matricula: tramite.beneficiario?.matricula || '',
    claveAdscripcion: tramite.beneficiario?.claveAdscripcion || '',
    tipoContratacion: tramite.beneficiario?.tipoContratacion || '',
    constanciaEstudiosVigente: !!tramite.beneficiario?.constanciaEstudiosVigente,
    requiereConstanciaEstudios: !!tramite.beneficiario?.requiereConstanciaEstudios,
    fechaConstanciaEstudios: toDateInputValue(tramite.beneficiario?.fechaConstanciaEstudios),
    contratoColectivoAplicable: tramite.contratoColectivoAplicable || '',
    folioRecetaImss: tramite.folioRecetaImss || '',
    fechaExpedicionReceta: toDateInputValue(tramite.fechaExpedicionReceta),
    descripcionLente: tramite.descripcionLente || '',
    // medicion de anteojos removida de captura de unidad,
    qnaInclusion: tramite.qnaInclusion || '',
    fechaRecepcionOptica: toDateInputValue(tramite.fechaRecepcionOptica),
    fechaEntregaOptica: toDateInputValue(tramite.fechaEntregaOptica)
  });

  const setField = (name: string, value: any) => setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(tramite.id, {
      contratoColectivoAplicable: form.contratoColectivoAplicable.trim(),
      beneficiario: {
        ...tramite.beneficiario,
        tipo: form.tipo,
        nombre: form.nombre.trim(),
        apellidoPaterno: form.apellidoPaterno.trim(),
        apellidoMaterno: form.apellidoMaterno.trim(),
        nssTrabajador: String(form.nssTrabajador).replace(/\D/g, '').slice(0, 11),
        nssHijo: String(form.nssHijo).replace(/\D/g, '').slice(0, 11),
        titularNombreCompleto: form.titularNombreCompleto.trim(),
        fechaNacimiento: form.fechaNacimiento.trim(),
        entidadLaboral: form.entidadLaboral.trim(),
        ooad: form.ooad.trim(),
        matricula: form.matricula.trim(),
        claveAdscripcion: form.claveAdscripcion.trim(),
        tipoContratacion: form.tipoContratacion.trim(),
        requiereConstanciaEstudios: !!form.requiereConstanciaEstudios,
        constanciaEstudiosVigente: !!form.constanciaEstudiosVigente,
        fechaConstanciaEstudios: form.fechaConstanciaEstudios.trim()
      },
      folioRecetaImss: form.folioRecetaImss.trim(),
      fechaExpedicionReceta: form.fechaExpedicionReceta.trim() ? new Date(form.fechaExpedicionReceta).toISOString() : '',
      descripcionLente: form.descripcionLente.trim(),
      // medicion de anteojos removida de captura de unidad,
      qnaInclusion: form.qnaInclusion.trim(),
      fechaRecepcionOptica: form.fechaRecepcionOptica.trim() ? new Date(form.fechaRecepcionOptica).toISOString() : '',
      fechaEntregaOptica: form.fechaEntregaOptica.trim() ? new Date(form.fechaEntregaOptica).toISOString() : ''
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-imss-dark/80 backdrop-blur-sm flex items-center justify-center p-2 lg:p-6" role="dialog" aria-modal="true" aria-label="Editar captura completa">
      <div className="w-full max-w-5xl max-h-[96vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-4 lg:px-8 bg-imss-dark text-white flex items-center justify-between">
          <h3 className="text-sm lg:text-lg font-black uppercase tracking-wider">Editar captura completa</h3>
          <button type="button" onClick={onClose} className="text-xs font-bold uppercase">Cerrar</button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-auto p-4 lg:p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tipo beneficiario</p>
            <select className="field-input" value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
              <option value={TipoBeneficiario.TRABAJADOR}>Trabajador(a)</option>
              <option value={TipoBeneficiario.HIJO}>Hija/Hijo</option>
              <option value={TipoBeneficiario.JUBILADO_PENSIONADO}>Jubilado/Pensionado</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Nombre(s)</p>
            <input className="field-input" placeholder="Nombre(s)" value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Apellido paterno</p>
            <input className="field-input" placeholder="Apellido paterno" value={form.apellidoPaterno} onChange={(e) => setField('apellidoPaterno', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Apellido materno</p>
            <input className="field-input" placeholder="Apellido materno" value={form.apellidoMaterno} onChange={(e) => setField('apellidoMaterno', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">NSS titular</p>
            <input className="field-input" placeholder="NSS titular" inputMode="numeric" value={form.nssTrabajador} onChange={(e) => setField('nssTrabajador', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">NSS hija/hijo</p>
            <input className="field-input" placeholder="NSS hija/hijo" inputMode="numeric" value={form.nssHijo} onChange={(e) => setField('nssHijo', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Titular nombre completo</p>
            <input className="field-input md:col-span-2" placeholder="Titular nombre completo" value={form.titularNombreCompleto} onChange={(e) => setField('titularNombreCompleto', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Fecha nacimiento</p>
            <input className="field-input" type="date" value={form.fechaNacimiento} onChange={(e) => setField('fechaNacimiento', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Unidad/adscripcion</p>
            <input className="field-input" placeholder="Unidad/adscripcion" value={form.entidadLaboral} onChange={(e) => setField('entidadLaboral', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">OOAD</p>
            <input className="field-input" placeholder="OOAD" value={form.ooad} onChange={(e) => setField('ooad', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Matricula</p>
            <input className="field-input" placeholder="Matricula" value={form.matricula} onChange={(e) => setField('matricula', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Clave adscripcion</p>
            <input className="field-input" placeholder="Clave adscripcion" value={form.claveAdscripcion} onChange={(e) => setField('claveAdscripcion', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tipo contratacion</p>
            <input className="field-input" placeholder="Tipo contratacion" value={form.tipoContratacion} onChange={(e) => setField('tipoContratacion', e.target.value)} />
          </div>
          <label className="text-xs font-bold flex items-center gap-2"><input type="checkbox" checked={form.requiereConstanciaEstudios} onChange={(e) => setField('requiereConstanciaEstudios', e.target.checked)} />Requiere constancia</label>
          <label className="text-xs font-bold flex items-center gap-2"><input type="checkbox" checked={form.constanciaEstudiosVigente} onChange={(e) => setField('constanciaEstudiosVigente', e.target.checked)} />Constancia vigente</label>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Fecha constancia estudios</p>
            <input className="field-input" type="date" value={form.fechaConstanciaEstudios} onChange={(e) => setField('fechaConstanciaEstudios', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Contrato colectivo aplicable</p>
            <input className="field-input md:col-span-2" placeholder="Contrato colectivo aplicable" value={form.contratoColectivoAplicable} onChange={(e) => setField('contratoColectivoAplicable', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Folio receta IMSS</p>
            <input className="field-input" placeholder="Folio receta IMSS" value={form.folioRecetaImss} onChange={(e) => setField('folioRecetaImss', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Fecha expedicion receta</p>
            <input className="field-input" type="date" value={form.fechaExpedicionReceta} onChange={(e) => setField('fechaExpedicionReceta', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Descripcion del lente</p>
            <textarea className="field-input md:col-span-2 min-h-24" placeholder="Descripcion del lente" value={form.descripcionLente} onChange={(e) => setField('descripcionLente', e.target.value)} />
          </div>
          {/* medicion de anteojos no se captura en unidad */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Qna/Mes inclusion</p>
            <input className="field-input" placeholder="Qna/Mes inclusion" value={form.qnaInclusion} onChange={(e) => setField('qnaInclusion', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Fecha recepcion optica</p>
            <input className="field-input" type="date" value={form.fechaRecepcionOptica} onChange={(e) => setField('fechaRecepcionOptica', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Fecha entrega optica</p>
            <input className="field-input" type="date" value={form.fechaEntregaOptica} onChange={(e) => setField('fechaEntregaOptica', e.target.value)} />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold" disabled={loading}>Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-imss text-white text-sm font-black disabled:opacity-50" disabled={loading}>{loading ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ onClose, onSuccess, onAuthFailure }: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  onAuthFailure: (message: string) => void;
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const strengthIssues = useMemo(() => validatePasswordStrength(newPassword), [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!currentPassword.trim()) {
      setFeedback('Captura tu contraseña actual para continuar.');
      return;
    }

    if (strengthIssues.length > 0) {
      setFeedback(`La nueva contraseña no cumple la politica: ${strengthIssues.join(' ')}`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback('La confirmacion no coincide con la nueva contraseña.');
      return;
    }

    if (currentPassword === newPassword) {
      setFeedback('La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    setSubmitting(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      onSuccess('contraseña actualizada correctamente. Usa la nueva contraseña en tu proximo inicio de sesión.');
    } catch (error: any) {
      if (error instanceof AuthError && (error.code === 'INVALID_CREDENTIALS' || error.code === 'INVALID_SESSION')) {
        onAuthFailure('No fue posible reautenticar tu identidad. Por seguridad se cerro tu sesión. Inicia de nuevo.');
        return;
      }

      setFeedback(error?.message || 'No se pudo cambiar la contraseña. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Cambiar contraseña</h3>
          <button className="text-xs font-bold uppercase text-slate-500 hover:text-slate-800" onClick={onClose} disabled={submitting}>Cerrar</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="field-label">contraseña actual</label>
            <div className="relative">
              <input type={showCurrentPassword ? 'text' : 'password'} className="field-input pr-12" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss" onClick={() => setShowCurrentPassword((prev) => !prev)} aria-label={showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="field-label">Nueva contraseña</label>
            <div className="relative">
              <input type={showNewPassword ? 'text' : 'password'} className="field-input pr-12" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss" onClick={() => setShowNewPassword((prev) => !prev)} aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-[11px]">
              {[
                { ok: newPassword.length >= 10, text: 'Minimo 10 caracteres' },
                { ok: /[A-Z]/.test(newPassword), text: 'Al menos una mayuscula' },
                { ok: /[a-z]/.test(newPassword), text: 'Al menos una minuscula' },
                { ok: /\d/.test(newPassword), text: 'Al menos un numero' },
                { ok: /[^A-Za-z0-9]/.test(newPassword), text: 'Al menos un caracter especial' }
              ].map((rule) => (
                <li key={rule.text} className={rule.ok ? 'text-emerald-600 font-semibold' : 'text-slate-500'}>
                  {rule.ok ? 'OK' : '-'} {rule.text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="field-label">Confirmar nueva contraseña</label>
            <div className="relative">
              <input type={showConfirmPassword ? 'text' : 'password'} className="field-input pr-12" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-imss" onClick={() => setShowConfirmPassword((prev) => !prev)} aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {feedback && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{feedback}</p>}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold" disabled={submitting}>Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-imss text-white text-sm font-black disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Actualizando...' : 'Guardar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TabButton = ({ label, active, onClick }: any) => (
  <button onClick={onClick} className={`whitespace-nowrap px-4 lg:px-10 py-4 lg:py-5 text-[10px] font-black uppercase tracking-widest transition-all border-b-4 ${active ? 'border-imss text-imss bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label}</button>
);

const NuevoTramiteWizard = ({ user, tramites, cctCatalog, uiMessage, clearUiMessage, onSave, onPrint, onPreviewPrint, onImprocedente }: any) => {
  const WIZARD_SNAPSHOT_KEY = 'sistra.nuevoWizardSnapshot';
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string>('');
  const [draftTramite, setDraftTramite] = useState<Tramite | null>(null);
  const [viabilidadConfirmada, setViabilidadConfirmada] = useState(false);
  const [beneficiario, setBeneficiario] = useState<any>({
    tipo: TipoBeneficiario.TRABAJADOR,
    nombre: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    nssTrabajador: '',
    nssHijo: '',
    titularNombreCompleto: '',
    matricula: '',
    claveAdscripcion: '',
    tipoContratacion: '',
    fechaNacimiento: '',
    fechaConstanciaEstudios: '',
    constanciaEstudiosVigente: false,
    requiereConstanciaEstudios: false,
    entidadLaboral: user.unidad,
    ooad: user.ooad
  });
  const [receta, setReceta] = useState({ folio: '', descripcion: '', contratoColectivoAplicable: (cctCatalog?.[0] || ''), qnaInclusion: '', fechaExpedicionReceta: '', clavePresupuestal: '', lugarSolicitud: '', dotacionNo: 1 });

  const edadBeneficiario = useMemo(() => {
    if (!beneficiario.fechaNacimiento) return null;
    const nacimiento = new Date(beneficiario.fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
    return edad;
  }, [beneficiario.fechaNacimiento]);

  const requiereConstanciaEstudios = beneficiario.tipo === TipoBeneficiario.HIJO && (edadBeneficiario ?? 0) > 18;

  useEffect(() => {
    setBeneficiario((prev: any) => ({ ...prev, requiereConstanciaEstudios }));
  }, [requiereConstanciaEstudios]);

  useEffect(() => {
    if (!Array.isArray(cctCatalog) || !cctCatalog.length) return;
    if (!receta.contratoColectivoAplicable || !cctCatalog.includes(receta.contratoColectivoAplicable)) {
      setReceta((prev) => ({ ...prev, contratoColectivoAplicable: cctCatalog[0] }));
    }
  }, [cctCatalog]);

  useEffect(() => {
    if (uiMessage) clearUiMessage?.();
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WIZARD_SNAPSHOT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (snap?.beneficiario) setBeneficiario(snap.beneficiario);
      if (snap?.receta) setReceta(snap.receta);
      if (typeof snap?.step === 'number') setStep(snap.step);
      if (typeof snap?.stepError === 'string') setStepError(snap.stepError);
      if (snap?.draftTramite) setDraftTramite(snap.draftTramite);
      if (typeof snap?.viabilidadConfirmada === 'boolean') setViabilidadConfirmada(snap.viabilidadConfirmada);
    } catch {
      // ignore snapshot parse errors
    }
  }, []);

  const normalizePersonText = (v: any) => String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const isSameDotacionScope = (a: Partial<Tramite> | null | undefined, b: Partial<Tramite> | null | undefined) => {
    const ba: any = a?.beneficiario || {};
    const bb: any = b?.beneficiario || {};
    const tipoA = String(ba.tipo || '').trim();
    const tipoB = String(bb.tipo || '').trim();
    const titularA = String(ba.nssTrabajador || '').replace(/\D/g, '').trim();
    const titularB = String(bb.nssTrabajador || '').replace(/\D/g, '').trim();
    if (!titularA || !titularB || titularA !== titularB) return false;

    if (tipoA !== TipoBeneficiario.HIJO && tipoB !== TipoBeneficiario.HIJO) return true;

    const nssHijoA = String(ba.nssHijo || '').replace(/\D/g, '').trim();
    const nssHijoB = String(bb.nssHijo || '').replace(/\D/g, '').trim();
    const nssHijoAEsDistintivo = nssHijoA && nssHijoA !== titularA;
    const nssHijoBEsDistintivo = nssHijoB && nssHijoB !== titularB;
    if (nssHijoAEsDistintivo && nssHijoBEsDistintivo) return nssHijoA === nssHijoB;

    const nombreA = normalizePersonText(`${ba.nombre || ''} ${ba.apellidoPaterno || ''} ${ba.apellidoMaterno || ''}`);
    const nombreB = normalizePersonText(`${bb.nombre || ''} ${bb.apellidoPaterno || ''} ${bb.apellidoMaterno || ''}`);
    const fechaA = String(ba.fechaNacimiento || '').slice(0, 10);
    const fechaB = String(bb.fechaNacimiento || '').slice(0, 10);
    if (Boolean(nombreA) && Boolean(nombreB) && nombreA === nombreB) {
      if (fechaA && fechaB) return fechaA === fechaB;
      return true;
    }
    return false;
  };

  const historialMismoContrato = useMemo(() => {
    if (!draftTramite) return [];
    const nssTitular = String(draftTramite.beneficiario?.nssTrabajador || '').replace(/\D/g, '').trim();
    const contrato = String(draftTramite.contratoColectivoAplicable || '').trim().toUpperCase();
    if (!nssTitular || !contrato) return [];
    return (tramites || []).filter((t: Tramite) =>
      String(t.beneficiario?.nssTrabajador || '').replace(/\D/g, '').trim() === nssTitular &&
      String(t.contratoColectivoAplicable || '').trim().toUpperCase() === contrato &&
      isSameDotacionScope(t, draftTramite)
    );
  }, [draftTramite, tramites]);

  const totalMismoContrato = (() => {
    const nums = new Set<number>();
    for (const h of historialMismoContrato || []) {
      const n = Number((h as any).dotacionNumero || 0);
      if (Number.isFinite(n) && n > 0) nums.add(n);
    }
    return nums.size || historialMismoContrato.length;
  })();
  const bloqueadoPorContrato = totalMismoContrato >= 2;

  const suggestions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean)));
    const b = (tramites || []).map((t: Tramite) => t.beneficiario || {} as any);
    return {
      titularNombreCompleto: uniq(b.map((x: any) => x.titularNombreCompleto)),
      nombre: uniq(b.map((x: any) => x.nombre)),
      apellidoPaterno: uniq(b.map((x: any) => x.apellidoPaterno)),
      apellidoMaterno: uniq(b.map((x: any) => x.apellidoMaterno)),
      entidadLaboral: uniq(b.map((x: any) => x.entidadLaboral)),
      ooad: uniq(b.map((x: any) => x.ooad)),
      matricula: uniq(b.map((x: any) => x.matricula)),
      claveAdscripcion: uniq(b.map((x: any) => x.claveAdscripcion)),
      nssTrabajador: uniq(b.map((x: any) => x.nssTrabajador)),
      nssHijo: uniq(b.map((x: any) => x.nssHijo)),
    };
  }, [tramites]);

  const SuggestionChips = ({ items, value, onPick }: { items: string[]; value?: string; onPick: (v: string) => void }) => {
    const q = String(value || '').trim().toUpperCase();
    if (q.length < 2) return null;
    const filtered = (items || []).filter((x) => {
      const v = String(x || '').trim().toUpperCase();
      return v && v !== q && v.includes(q);
    }).slice(0, 5);
    if (!filtered.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {filtered.map((opt) => (
          <button key={opt} type="button" className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black" onClick={() => onPick(opt)}>
            {opt}
          </button>
        ))}
      </div>
    );
  };

  const validateStep1 = () => {
    const baseError = validateNuevoTramiteStep1({
      nombre: beneficiario.nombre,
      nssTrabajador: beneficiario.nssTrabajador
    });
    if (baseError) return baseError;

    if (!beneficiario.apellidoPaterno?.trim()) return 'Captura apellido paterno del beneficiario.';
    if (!beneficiario.apellidoMaterno?.trim()) return 'Captura apellido materno del beneficiario.';
    if (!beneficiario.entidadLaboral?.trim()) return 'Captura la unidad o adscripcion laboral.';

    if (beneficiario.tipo === TipoBeneficiario.TRABAJADOR || beneficiario.tipo === TipoBeneficiario.JUBILADO_PENSIONADO) {
      if (!beneficiario.matricula?.trim()) return 'Captura la matricula para trabajador o jubilado/pensionado.';
      if (!beneficiario.claveAdscripcion?.trim()) return 'Captura la clave de adscripcion.';
      if (!beneficiario.tipoContratacion?.trim()) return 'Selecciona tipo de contratacion.';
    }

    if (beneficiario.tipo === TipoBeneficiario.HIJO) {
      if (!beneficiario.titularNombreCompleto?.trim()) return 'Captura nombre completo de la persona trabajadora titular.';
      if (!beneficiario.matricula?.trim()) return 'Captura la matricula de la persona trabajadora titular.';
      if (!beneficiario.claveAdscripcion?.trim()) return 'Captura la clave de adscripcion de la persona trabajadora titular.';
      if (!beneficiario.tipoContratacion?.trim()) return 'Captura el tipo de contratacion de la persona trabajadora titular.';
      if (!beneficiario.nssHijo?.trim() || !/^\d{10,11}$/.test(beneficiario.nssHijo.trim())) return 'El NSS de hija/hijo debe tener 10 u 11 digitos.';
      if (!beneficiario.fechaNacimiento) return 'Captura fecha de nacimiento de hija/hijo.';
      if (String(beneficiario.nssHijo || '').replace(/\D/g, '') === String(beneficiario.nssTrabajador || '').replace(/\D/g, '')) {
        if (!beneficiario.nombre?.trim() || !beneficiario.apellidoPaterno?.trim() || !beneficiario.apellidoMaterno?.trim()) return 'Cuando NSS hija/hijo coincide con NSS titular, completa nombre y apellidos para diferenciar beneficiario.';
      }
      if (requiereConstanciaEstudios) {
        if (!beneficiario.constanciaEstudiosVigente) return 'Marca constancia de estudios vigente para hija/hijo mayor de 18 anos.';
        if (!beneficiario.fechaConstanciaEstudios) return 'Captura fecha de emision de constancia de estudios.';
        const fechaConstancia = new Date(beneficiario.fechaConstanciaEstudios);
        if (Number.isNaN(fechaConstancia.getTime())) return 'La fecha de constancia de estudios no es valida.';
        const hoy = new Date();
        const diffMs = hoy.getTime() - fechaConstancia.getTime();
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        if (diffDias > 90) return 'La constancia de estudios tiene mas de 3 meses. Solicita comprobante actualizado.';
      }
    }

    return '';
  };

  const validateStep2 = () => {
    const step2Error = validateNuevoTramiteStep2({
      folioRecetaImss: receta.folio,
      descripcionLente: receta.descripcion
    });
    if (step2Error) return step2Error;
    if (!receta.contratoColectivoAplicable?.trim()) return 'Captura el contrato colectivo aplicable.';
    if (!receta.qnaInclusion?.trim()) return 'Captura la Qna/Mes de inclusion.';
    if (!receta.fechaExpedicionReceta) return 'Captura la fecha de expedicion de receta.';
    if (!receta.clavePresupuestal?.trim()) return 'Captura la clave presupuestal de la receta medica.';
    if (!receta.lugarSolicitud?.trim()) return 'Captura el lugar de solicitud (ciudad y estado).';
    return '';
  };

  const goToStep = async (targetStep: number) => {
    const validationError = step === 1 ? validateStep1() : step === 2 ? validateStep2() : '';
    if (targetStep > step && validationError) {
      setStepError(validationError);
      return;
    }

    if (step === 2 && targetStep === 3) {
      const titularNombre = beneficiario.tipo === TipoBeneficiario.HIJO
        ? beneficiario.titularNombreCompleto
        : `${beneficiario.nombre} ${beneficiario.apellidoPaterno} ${beneficiario.apellidoMaterno}`.trim();

      const tramite: Tramite = {
        id: '',
        folio: generateFolio(user.unidad, Math.floor(Math.random() * 1000)),
        beneficiario: {
          ...beneficiario,
          titularNombreCompleto: titularNombre,
          matricula: String(beneficiario.matricula || '').trim(),
          constanciaEstudiosVigente: Boolean(beneficiario.constanciaEstudiosVigente),
          requiereConstanciaEstudios
        },
        contratoColectivoAplicable: receta.contratoColectivoAplicable.trim(),
        lugarSolicitud: receta.lugarSolicitud.trim(),
        fechaCreacion: new Date().toISOString(),
        creadorId: user.id,
        unidad: user.unidad,
        estatus: EstatusWorkflow.EN_REVISION_DOCUMENTAL,
        dotacionNumero: receta.dotacionNo,
        requiereDictamenMedico: receta.dotacionNo >= 3,
        importeSolicitado: 0,
        costoSolicitud: 0,
        folioRecetaImss: receta.folio,
        fechaExpedicionReceta: new Date(receta.fechaExpedicionReceta).toISOString(),
        descripcionLente: receta.descripcion,
        qnaInclusion: receta.qnaInclusion.trim(),
        clavePresupuestal: receta.clavePresupuestal.trim(),
        checklist: {} as any,
        evidencias: [],
      };

      setDraftTramite(tramite);
      setViabilidadConfirmada(false);
    }

    setStepError('');
    setStep(targetStep);
  };

  const saveWizardSnapshot = () => {
    try {
      sessionStorage.setItem(WIZARD_SNAPSHOT_KEY, JSON.stringify({
        step,
        stepError,
        beneficiario,
        receta,
        draftTramite,
        viabilidadConfirmada
      }));
    } catch {
      // ignore storage issues
    }
  };

  const clearWizardSnapshot = () => {
    try { sessionStorage.removeItem(WIZARD_SNAPSHOT_KEY); } catch {}
  };

  const handlePrintHistorial = async () => {
    if (!draftTramite) return;
    const draftForPreview: Tramite = {
      ...draftTramite,
      dotacionNumero: Math.min(4, totalMismoContrato + 1),
      requiereDictamenMedico: Math.min(4, totalMismoContrato + 1) >= 3
    };
    saveWizardSnapshot();
    onPreviewPrint(draftForPreview, 'tarjeta');
  };

  const resetWizard = () => {
    clearWizardSnapshot();
    setStep(1);
    setStepError('');
    setDraftTramite(null);
    setViabilidadConfirmada(false);
    setBeneficiario({
      tipo: TipoBeneficiario.TRABAJADOR,
      nombre: '',
      apellidoPaterno: '',
      apellidoMaterno: '',
      nssTrabajador: '',
      nssHijo: '',
      titularNombreCompleto: '',
      matricula: '',
      claveAdscripcion: '',
      tipoContratacion: '',
      fechaNacimiento: '',
      fechaConstanciaEstudios: '',
      constanciaEstudiosVigente: false,
      requiereConstanciaEstudios: false,
      entidadLaboral: user.unidad,
      ooad: user.ooad
    });
    setReceta({ folio: '', descripcion: '', contratoColectivoAplicable: (cctCatalog?.[0] || ''), qnaInclusion: '', fechaExpedicionReceta: '', clavePresupuestal: '', lugarSolicitud: '', dotacionNo: 1 });
  };

  const handleImprocedente = async () => {
    if (!draftTramite) return;
    await onImprocedente(draftTramite, bloqueadoPorContrato
      ? `Bloqueado por limite de dotaciones para contrato (${totalMismoContrato} de 2).`
      : 'Marcado manualmente por capturista en validacion de formato 28.');
    resetWizard();
  };

  const handleConfirmarViabilidadEImprimirFormato = async () => {
    if (!draftTramite || !viabilidadConfirmada) return;
    if (bloqueadoPorContrato) {
      setStepError(`IMPROCEDENTE: la persona solicitante ya cuenta con ${totalMismoContrato} dotaciones para el contrato colectivo ${draftTramite.contratoColectivoAplicable}. Limite maximo: 2.`);
      return;
    }

    const tramiteToSave: Tramite = {
      ...draftTramite,
      dotacionNumero: Math.min(4, totalMismoContrato + 1),
      requiereDictamenMedico: Math.min(4, totalMismoContrato + 1) >= 3
    };
    const saved = await onSave(tramiteToSave, { redirectToTramites: false });
    if (!saved) return;
    await onPrint(saved, 'formato');
    resetWizard();
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-[60px] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in duration-500">
      <div className="bg-imss-dark px-12 py-12 flex gap-12 justify-center border-b border-imss-gold/20">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black transition-all ${step === s ? 'bg-imss-gold text-white shadow-xl scale-110' : step > s ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/40'}`}>
              {step > s ? <CheckCircle2 size={28} /> : s}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${step === s ? 'text-white' : 'text-white/20'}`}>
              {s === 1 ? 'Solicitante' : s === 2 ? 'Medico' : 'Finalizar'}
            </span>
          </div>
        ))}
      </div>
      <div className="p-20">
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
          Antes de capturar, valida en ventanilla: receta IMSS vigente, identificacion oficial y (si aplica) constancia de estudios para hija/hijo.
        </div>
        {stepError && (
          <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold" role="alert">
            {stepError}
          </div>
        )}
        {/* uiMessage moved to step 3 footer area */}
        {step === 1 && (
          <div className="space-y-10 animate-in slide-in-from-right-8 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Tipo de beneficiario</label>
                <select className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                  value={beneficiario.tipo}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, tipo: e.target.value as TipoBeneficiario }); }}>
                  <option value={TipoBeneficiario.TRABAJADOR}>Trabajador(a)</option>
                  <option value={TipoBeneficiario.HIJO}>Hija/Hijo</option>
                  <option value={TipoBeneficiario.JUBILADO_PENSIONADO}>Jubilado/Pensionado</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Unidad / adscripcion</label>
                <input list="sug-entidadLaboral" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                  value={beneficiario.entidadLaboral}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, entidadLaboral: e.target.value }); }} />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">OOAD</label>
                <input list="sug-ooad" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                  value={beneficiario.ooad}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, ooad: e.target.value }); }} />
              </div>

              {beneficiario.tipo === TipoBeneficiario.HIJO && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Nombre completo de la persona titular (trabajador/a)</label>
                    <input list="sug-titularNombreCompleto" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black uppercase text-slate-800"
                      value={beneficiario.titularNombreCompleto}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, titularNombreCompleto: e.target.value }); }} />
                    <SuggestionChips items={suggestions.titularNombreCompleto} value={beneficiario.titularNombreCompleto} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, titularNombreCompleto: v }); }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Matricula titular</label>
                    <input list="sug-matricula" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.matricula}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, matricula: e.target.value }); }} />
                    <SuggestionChips items={suggestions.matricula} value={beneficiario.matricula} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, matricula: v }); }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Clave adscripcion titular</label>
                    <input list="sug-claveAdscripcion" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.claveAdscripcion}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, claveAdscripcion: e.target.value }); }} />
                    <SuggestionChips items={suggestions.claveAdscripcion} value={beneficiario.claveAdscripcion} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, claveAdscripcion: v }); }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Tipo de contratacion titular</label>
                    <select className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.tipoContratacion}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, tipoContratacion: e.target.value }); }}>
                      <option value="">Selecciona...</option>
                      {TIPOS_CONTRATACION_PERMITIDOS.map((t) => <option key={t.code} value={t.label}>{t.code} - {t.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">{beneficiario.tipo === TipoBeneficiario.HIJO ? 'Nombre(s) de hija/hijo beneficiario' : 'Nombre(s) del beneficiario'}</label>
                <input list="sug-nombre" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black uppercase text-slate-800"
                  value={beneficiario.nombre}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, nombre: e.target.value }); }} />
                <SuggestionChips items={suggestions.nombre} value={beneficiario.nombre} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, nombre: v }); }} />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Apellido paterno</label>
                <input list="sug-apellidoPaterno" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black uppercase text-slate-800"
                  value={beneficiario.apellidoPaterno}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, apellidoPaterno: e.target.value }); }} />
                <SuggestionChips items={suggestions.apellidoPaterno} value={beneficiario.apellidoPaterno} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, apellidoPaterno: v }); }} />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Apellido materno</label>
                <input list="sug-apellidoMaterno" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black uppercase text-slate-800"
                  value={beneficiario.apellidoMaterno}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, apellidoMaterno: e.target.value }); }} />
                <SuggestionChips items={suggestions.apellidoMaterno} value={beneficiario.apellidoMaterno} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, apellidoMaterno: v }); }} />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">NSS titular</label>
                <input list="sug-nssTrabajador" inputMode="numeric" maxLength={11} className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-imss text-xl tracking-[0.2em]"
                  value={beneficiario.nssTrabajador}
                  onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, nssTrabajador: e.target.value.replace(/\D/g, '') }); }} />
                <SuggestionChips items={suggestions.nssTrabajador} value={beneficiario.nssTrabajador} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, nssTrabajador: String(v).replace(/\D/g, '') }); }} />
              </div>

              {beneficiario.tipo === TipoBeneficiario.HIJO && (
                <>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">NSS hija/hijo</label>
                    <input list="sug-nssHijo" inputMode="numeric" maxLength={11} className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-imss text-xl tracking-[0.2em]"
                      value={beneficiario.nssHijo}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, nssHijo: e.target.value.replace(/\D/g, '') }); }} />
                    <SuggestionChips items={suggestions.nssHijo} value={beneficiario.nssHijo} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, nssHijo: String(v).replace(/\D/g, '') }); }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Fecha de nacimiento</label>
                    <input type="date" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.fechaNacimiento}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, fechaNacimiento: e.target.value }); }} />
                  </div>
                </>
              )}

              {(beneficiario.tipo === TipoBeneficiario.TRABAJADOR || beneficiario.tipo === TipoBeneficiario.JUBILADO_PENSIONADO) && (
                <>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Matricula</label>
                    <input list="sug-matricula" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.matricula}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, matricula: e.target.value }); }} />
                    <SuggestionChips items={suggestions.matricula} value={beneficiario.matricula} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, matricula: v }); }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Clave adscripcion</label>
                    <input list="sug-claveAdscripcion" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.claveAdscripcion}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, claveAdscripcion: e.target.value }); }} />
                    <SuggestionChips items={suggestions.claveAdscripcion} value={beneficiario.claveAdscripcion} onPick={(v) => { setStepError(''); setBeneficiario({ ...beneficiario, claveAdscripcion: v }); }} />
                    <p className="mt-2 text-[11px] font-bold text-amber-700">Aviso OOAD: se debera verificar que la adscripcion se encuentre dentro del OOAD, toda vez que el contrato de anteojos esta formalizado por estado y no aplica para usuarios de otros OOAD o estados.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Tipo de contratacion</label>
                    <select className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss font-black text-slate-800"
                      value={beneficiario.tipoContratacion}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, tipoContratacion: e.target.value }); }}>
                      <option value="">Selecciona...</option>
                      {TIPOS_CONTRATACION_PERMITIDOS.map((t) => <option key={t.code} value={t.label}>{t.code} - {t.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {beneficiario.tipo === TipoBeneficiario.HIJO && requiereConstanciaEstudios && (
                <div className="md:col-span-2 p-6 rounded-3xl bg-amber-50 border border-amber-200">
                  <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest mb-3">Constancia de estudios requerida (mayor de 18 anos)</p>
                  <div className="flex items-center gap-3 mb-3">
                    <input type="checkbox" checked={Boolean(beneficiario.constanciaEstudiosVigente)}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, constanciaEstudiosVigente: e.target.checked }); }} />
                    <span className="text-sm font-bold text-slate-700">Se presento constancia de estudios vigente</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase mb-2 tracking-widest">Fecha constancia</label>
                    <input type="date" className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl outline-none focus:border-imss font-black text-slate-700"
                      value={beneficiario.fechaConstanciaEstudios}
                      onChange={(e) => { setStepError(''); setBeneficiario({ ...beneficiario, fechaConstanciaEstudios: e.target.value }); }} />
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">Vigencia maxima de referencia: {VIGENCIA_CONSTANCIA_ESTUDIOS_MESES} meses.</p>
                </div>
              )}
            </div>
            <button onClick={() => goToStep(2)} className="w-full py-7 bg-imss text-white rounded-[32px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-imss-dark transition-all">Siguiente Fase</button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-10 animate-in slide-in-from-right-8 duration-500">
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Folio de Receta 1A14</label>
              <input placeholder="FOLIO RECETA" aria-label="Folio de receta" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black uppercase text-slate-800 shadow-inner" value={receta.folio} onChange={(e) => { setStepError(''); setReceta({ ...receta, folio: e.target.value }); }} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Diagnostico y especificacion de anteojos</label>
              <textarea placeholder="DESCRIBA LA GRADUACION Y CARACTERISTICAS DE LOS ANTEOJOS..." aria-label="Diagnostico y especificacion de anteojos" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl h-44 outline-none focus:border-imss transition-all font-bold uppercase text-slate-800 shadow-inner" value={receta.descripcion} onChange={(e) => { setStepError(''); setReceta({ ...receta, descripcion: e.target.value }); }} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Contrato colectivo aplicable (obligatorio)</label>
              <select className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black uppercase text-slate-800 shadow-inner" value={receta.contratoColectivoAplicable} onChange={(e) => { setStepError(''); setReceta({ ...receta, contratoColectivoAplicable: e.target.value }); }}>
                {(cctCatalog || []).map((cct: string) => <option key={cct} value={cct}>{cct}</option>)}
              </select>
              {!cctCatalog?.length && <p className="mt-2 text-[11px] font-bold text-red-700">No hay CCT configurados. Solicita al administrador dar de alta al menos uno.</p>}
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Qna/Mes inclusion</label>
              <input className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black uppercase text-slate-800 shadow-inner" value={receta.qnaInclusion} onChange={(e) => { setStepError(''); setReceta({ ...receta, qnaInclusion: e.target.value }); }} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Fecha expedicion de receta</label>
              <input type="date" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black text-slate-800 shadow-inner" value={receta.fechaExpedicionReceta} onChange={(e) => { setStepError(''); setReceta({ ...receta, fechaExpedicionReceta: e.target.value }); }} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Clave presupuestal (receta medica)</label>
              <input className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black uppercase text-slate-800 shadow-inner" value={receta.clavePresupuestal} onChange={(e) => { setStepError(''); setReceta({ ...receta, clavePresupuestal: e.target.value }); }} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Lugar de solicitud (ciudad y estado)</label>
              <input className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-imss transition-all font-black uppercase text-slate-800 shadow-inner" value={receta.lugarSolicitud} onChange={(e) => { setStepError(''); setReceta({ ...receta, lugarSolicitud: e.target.value }); }} />
            </div>
            {/* campo de medicion removido por requerimiento operativo */}
            <div className="flex gap-6">
              <button onClick={() => goToStep(1)} className="px-12 py-7 text-slate-400 font-black uppercase tracking-widest hover:text-slate-800 transition-colors">Atrás</button>
              <button onClick={() => goToStep(3)} className="flex-1 py-7 bg-imss text-white rounded-[32px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-imss-dark transition-all">Siguiente Fase</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="py-4 lg:py-8 animate-in zoom-in duration-500 space-y-8">
            <div className="w-20 h-20 lg:w-24 lg:h-24 bg-imss-light rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="text-imss" size={44} />
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">Validacion de Formato 28 (historial por contrato)</h3>
              <p className="text-sm font-bold text-slate-600">Contrato actual: <span className="text-imss">{draftTramite?.contratoColectivoAplicable || 'SIN CAPTURA'}</span></p>
              <p className={`text-sm font-black ${bloqueadoPorContrato ? 'text-red-700' : 'text-emerald-700'}`}>Contador para contrato: {totalMismoContrato} de 2</p>
            </div>

            <button
              onClick={handlePrintHistorial}
              className="w-full py-5 lg:py-7 bg-imss text-white rounded-[24px] lg:rounded-[32px] font-black uppercase tracking-[0.15em] lg:tracking-[0.3em] shadow-2xl hover:bg-imss-dark transition-all"
            >
              Imprimir historial de dotaciones
            </button>

            <div className={`p-5 lg:p-6 rounded-3xl border text-xs lg:text-sm font-bold leading-relaxed uppercase tracking-wide ${bloqueadoPorContrato ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {bloqueadoPorContrato
                ? `IMPROCEDENTE: la persona solicitante ya cuenta con ${totalMismoContrato} dotaciones del mismo contrato colectivo. No se permite guardar tramite.`
                : 'Revisar historial de la persona solicitante y confirmar viabilidad del contrato colectivo antes de guardar.'}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Historial de la persona solicitante para el contrato actual</p>
              {historialMismoContrato.length === 0 ? (
                <p className="text-sm font-bold text-slate-500">Sin dotaciones previas para este contrato.</p>
              ) : (
                <div className="space-y-2">
                  {historialMismoContrato.map((h: Tramite) => (
                    <div key={h.id} className="text-xs font-bold text-slate-700 border border-slate-100 rounded-xl px-3 py-2 flex flex-wrap gap-3 justify-between">
                      <span>Folio: {h.folio}</span>
                      <span>Dotacion: {h.dotacionNumero || '-'}</span>
                      <span>Fecha: {new Date(h.fechaCreacion).toLocaleDateString('es-MX')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 lg:gap-4 p-4 lg:p-5 rounded-2xl border-2 border-slate-200 bg-white">
              <input
                type="checkbox"
                className="mt-1 w-5 h-5"
                checked={viabilidadConfirmada}
                onChange={(e) => setViabilidadConfirmada(e.target.checked)}
              />
              <span className="text-sm lg:text-base font-black text-slate-700 uppercase tracking-wide">Confirmo que la solicitud es PROCEDENTE para continuar a formato 27</span>
            </label>

            {uiMessage && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold flex items-center justify-between gap-3" role="status">
                <span>{uiMessage}</span>
                <button type="button" className="text-[11px] uppercase" onClick={clearUiMessage}>Cerrar</button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 lg:gap-6">
              <button onClick={() => goToStep(2)} className="px-6 lg:px-12 py-4 lg:py-7 text-slate-400 font-black uppercase tracking-widest hover:text-slate-800 transition-colors">Revisar</button>
              <button
                onClick={handleImprocedente}
                className="flex-1 py-5 lg:py-7 bg-red-700 text-white rounded-[24px] lg:rounded-[32px] font-black uppercase tracking-[0.12em] lg:tracking-[0.22em] shadow-2xl hover:bg-red-800 transition-all"
              >
                Improcedente (cancelar alta)
              </button>
              <button
                onClick={handleConfirmarViabilidadEImprimirFormato}
                disabled={!viabilidadConfirmada || bloqueadoPorContrato}
                className="flex-1 py-5 lg:py-7 bg-imss-dark text-white rounded-[24px] lg:rounded-[32px] font-black uppercase tracking-[0.12em] lg:tracking-[0.22em] shadow-2xl hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-imss-dark"
              >
                Procedente: guardar e imprimir formato 27
              </button>
            </div>
          </div>
        )}

        <datalist id="sug-titularNombreCompleto">{suggestions.titularNombreCompleto.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-nombre">{suggestions.nombre.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-apellidoPaterno">{suggestions.apellidoPaterno.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-apellidoMaterno">{suggestions.apellidoMaterno.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-entidadLaboral">{suggestions.entidadLaboral.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-ooad">{suggestions.ooad.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-matricula">{suggestions.matricula.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-claveAdscripcion">{suggestions.claveAdscripcion.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-nssTrabajador">{suggestions.nssTrabajador.map((x: string) => <option key={x} value={x} />)}</datalist>
        <datalist id="sug-nssHijo">{suggestions.nssHijo.map((x: string) => <option key={x} value={x} />)}</datalist>
      </div>
    </div>
  );
};
const CentralView = ({ tramites }: any) => (
  <div className="space-y-10 animate-in fade-in duration-700">
     <div className="bg-imss-dark p-16 rounded-[60px] shadow-2xl flex justify-between items-center border-b-8 border-imss-gold/30">
        <div>
           <h3 className="text-4xl font-black text-white uppercase tracking-tighter">Consolidado Nacional</h3>
           <p className="text-imss-gold font-black text-xs uppercase tracking-[0.4em] mt-3">Gestión de Auditoria y Control Fiscal</p>
        </div>
        <div className="bg-white/10 px-8 py-5 rounded-[24px] backdrop-blur-md border border-white/5">
           <p className="text-white font-black text-lg">{tramites.length} REGISTROS</p>
        </div>
     </div>
     <TramitesListView tramites={tramites} onSelect={() => {}} />
  </div>
);

export default App;













