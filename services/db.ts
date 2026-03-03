import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFirestore,
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
  increment
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  setPersistence,
  inMemoryPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from "firebase/auth";
import { Tramite, Bitacora, Role, User, EstatusWorkflow, TipoBeneficiario } from '../types';
import { validateWorkflowTransition } from './workflow';

const firebaseConfig = {
  apiKey: "AIzaSyA_V82BKDeUOHExz-zUiazBxsfP6eXadmU",
  authDomain: "prestaciones-d3f9a.firebaseapp.com",
  projectId: "prestaciones-d3f9a",
  storageBucket: "prestaciones-d3f9a.firebasestorage.app",
  messagingSenderId: "510072300294",
  appId: "1:510072300294:web:213688c873acb375f47487",
  measurementId: "G-R20P8ZRHEE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const authPersistenceReady = setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.warn('No se pudo establecer persistencia de sesion en navegador.', error);
});

const AUTH_EMAIL_DOMAIN = (import.meta as any).env?.VITE_AUTH_EMAIL_DOMAIN || 'sistra.local';

let currentUserProfile: User | null = null;
let creatorAuthPromise: Promise<ReturnType<typeof getAuth>> | null = null;

const normalizeMatricula = (matricula: string) => matricula.trim().toUpperCase();
const normalizePersonText = (v: any) => String(v || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const isSameDotacionScope = (a: Partial<Tramite> | undefined, b: Partial<Tramite> | undefined): boolean => {
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

const dedupeDotaciones = (items: Tramite[]): Tramite[] => {
  const byId = new Map<string, Tramite>();
  for (const t of items || []) {
    const idKey = String((t as any).id || '').trim();
    if (idKey) byId.set(idKey, t);
  }
  const base = byId.size ? Array.from(byId.values()) : items;

  const byFolio = new Map<string, Tramite>();
  for (const t of base || []) {
    const key = `${String(t.folio || '').trim().toUpperCase()}|${String(t.contratoColectivoAplicable || '').trim().toUpperCase()}|${String((t as any).unidad || '').trim().toUpperCase()}`;
    if (!byFolio.has(key)) byFolio.set(key, t);
  }
  return Array.from(byFolio.values());
};

const getUniqueDotacionCount = (items: Tramite[]): number => {
  const nums = new Set<number>();
  for (const t of items || []) {
    const n = Number((t as any).dotacionNumero || 0);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return nums.size || (items || []).length;
};

const parseMoneyLike = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  // soporta "1,234.56" y "1.234,56"
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, ''))
    : cleaned.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const resolveTramiteImporte = (t: any): number => {
  const preferred = [
    t?.importeAutorizado,
    t?.importeSolicitado,
    t?.costoSolicitud,
    t?.importe,
    t?.monto,
    t?.montoAutorizado,
    t?.montoSolicitado,
    t?.costo,
    t?.costoTotal,
    t?.total
  ];

  for (const candidate of preferred) {
    const v = parseMoneyLike(candidate);
    if (v > 0) return v;
  }

  const candidates: number[] = [];
  const walk = (obj: any, depth: number) => {
    if (!obj || typeof obj !== 'object' || depth > 3) return;
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k || '');
      if (/importe|monto|costo|total/i.test(key)) {
        const parsed = parseMoneyLike(v);
        if (parsed > 0) candidates.push(parsed);
      }
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(t, 0);

  candidates.sort((a, b) => b - a);
  return candidates[0] || 0;
};
const PRIMARY_ADMIN_MATRICULA = '99032103';
const MATRICULA_EMAIL_OVERRIDES: Record<string, string> = {
  '99032103': 'moises.beltran@imss.gob.mx',
};
const MATRICULA_EMAIL_ALIASES: Record<string, string[]> = {
  '99032103': ['moises.beltran@imss.gob.mx', 'moises.beltranx7@gmail.com'],
};
const matriculaToEmail = (matricula: string) => {
  const normalized = normalizeMatricula(matricula);
  if (MATRICULA_EMAIL_OVERRIDES[normalized]) return MATRICULA_EMAIL_OVERRIDES[normalized];
  return `${normalized.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
};
const matriculaToEmailCandidates = (matricula: string): string[] => {
  const normalized = normalizeMatricula(matricula);
  const aliases = MATRICULA_EMAIL_ALIASES[normalized] || [];
  const primary = matriculaToEmail(normalized);
  return Array.from(new Set([primary, ...aliases]));
};

const getCreatorAuth = async () => {
  if (!creatorAuthPromise) {
    creatorAuthPromise = (async () => {
      const secondary = initializeApp(firebaseConfig, 'sistra-user-creator');
      const secondaryAuth = getAuth(secondary);
      await setPersistence(secondaryAuth, inMemoryPersistence);
      return secondaryAuth;
    })();
  }
  return creatorAuthPromise;
};

const waitForAuthState = async () => {
  await authPersistenceReady;
  if (auth.currentUser) return auth.currentUser;

  return await new Promise<any>((resolve) => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      unsub();
      resolve(firebaseUser);
    });
  });
};

const bootstrapPrimaryAdminProfile = async (uid: string, matricula: string, email: string) => {
  if (normalizeMatricula(matricula) !== PRIMARY_ADMIN_MATRICULA) return;

  const bootstrapUser: User = {
    id: uid,
    nombre: 'Moises Beltran Castro',
    matricula: PRIMARY_ADMIN_MATRICULA,
    role: Role.ADMIN_SISTEMA,
    unidad: 'CENTRAL',
    ooad: 'BCS',
    activo: true,
    authEmail: email
  };

  await setDoc(doc(db, 'usuarios', uid), bootstrapUser, { merge: true });
};

export type AppTab = 'dashboard' | 'tramites' | 'nuevo' | 'central' | 'adminUsers';

export const TABS_BY_ROLE: Record<Role, AppTab[]> = {
  [Role.ADMIN_SISTEMA]: ['dashboard', 'tramites', 'nuevo', 'adminUsers'],
  [Role.CAPTURISTA_UNIDAD]: ['dashboard', 'tramites', 'nuevo'],
  [Role.CONSULTA_CENTRAL]: ['dashboard', 'tramites'],
  [Role.VALIDADOR_PRESTACIONES]: ['dashboard', 'tramites'],
  [Role.AUTORIZADOR_JSDP_DSPNC]: ['dashboard', 'tramites']
};

export const VALIDATION_RULES = {
  LOGIN_PASSWORD_MIN: 10,
  NSS_REGEX: /^\d{10,11}$/,
  DIAGNOSTICO_MIN_CHARS: 10
};

export const UX_MESSAGES = {
  SESSION_INVALID: 'Tu sesion expiro o ya no es valida. Inicia sesion nuevamente.',
  ACCESS_RESTRICTED: 'Acceso restringido para tu perfil.',
  TAB_REDIRECTED: 'No tienes permisos para esa seccion. Te redirigimos a una vista permitida.',
  SYNC_ERROR: 'Error al sincronizar con la nube.',
  LOGIN_GENERIC_ERROR: 'No fue posible iniciar sesion.',
  LOGIN_REQUIRED: 'Captura matricula y contrasena.',
  LOGIN_PASSWORD_MIN: `La contrasena debe tener al menos ${VALIDATION_RULES.LOGIN_PASSWORD_MIN} caracteres.`,
  UPDATE_STATUS_DENIED: 'Solo ADMIN_SISTEMA o AUTORIZADOR_JSDP_DSPNC pueden validar importes y autorizar.',
  CREATE_DENIED: 'Perfil de consulta sin permisos de captura.'
};

export const SESSION_INVALID_TOKENS = ['Sesion invalida', 'INVALID_SESSION'];

export const canAccessTabByRole = (role: Role, tab: AppTab): boolean => {
  return (TABS_BY_ROLE[role] || ['dashboard', 'tramites']).includes(tab);
};

export const canAuthorizeImporte = (role: Role): boolean => role === Role.ADMIN_SISTEMA || role === Role.AUTORIZADOR_JSDP_DSPNC;

export const validateLoginInput = (matricula: string, password: string): string | null => {
  const matriculaNormalized = normalizeMatricula(matricula || '');
  if (!matriculaNormalized || !password) return UX_MESSAGES.LOGIN_REQUIRED;
  if (password.length < VALIDATION_RULES.LOGIN_PASSWORD_MIN) return UX_MESSAGES.LOGIN_PASSWORD_MIN;
  return null;
};

export const validateNuevoTramiteStep1 = (payload: { nombre?: string; nssTrabajador?: string }): string => {
  if (!payload.nombre?.trim()) return 'Captura el nombre del beneficiario.';
  if (!VALIDATION_RULES.NSS_REGEX.test((payload.nssTrabajador || '').trim())) return 'El NSS debe tener 10 u 11 digitos numericos.';
  return '';
};

export const validateNuevoTramiteStep2 = (payload: { folioRecetaImss?: string; descripcionLente?: string; importeSolicitado?: number }): string => {
  if (!payload.folioRecetaImss?.trim()) return 'Captura el folio de receta 1A14.';
  if (!payload.descripcionLente?.trim() || payload.descripcionLente.trim().length < VALIDATION_RULES.DIAGNOSTICO_MIN_CHARS) {
    return `Describe el diagnostico con al menos ${VALIDATION_RULES.DIAGNOSTICO_MIN_CHARS} caracteres.`;
  }
  return '';
};

export const validateNuevoTramiteInput = (payload: {
  nombre?: string;
  nssTrabajador?: string;
  folioRecetaImss?: string;
  descripcionLente?: string;
  importeSolicitado?: number;
}): string[] => {
  const issues: string[] = [];
  const step1 = validateNuevoTramiteStep1(payload);
  const step2 = validateNuevoTramiteStep2(payload);
  if (step1) issues.push(step1);
  if (step2) issues.push(step2);
  return issues;
};

export class AuthError extends Error {
  code: 'INVALID_CREDENTIALS' | 'INACTIVE_USER' | 'INVALID_INPUT' | 'WEAK_PASSWORD' | 'UNAUTHORIZED' | 'INVALID_SESSION';

  constructor(
    code: 'INVALID_CREDENTIALS' | 'INACTIVE_USER' | 'INVALID_INPUT' | 'WEAK_PASSWORD' | 'UNAUTHORIZED' | 'INVALID_SESSION',
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const clearSession = () => {
  currentUserProfile = null;
};

export const validatePasswordStrength = (password: string): string[] => {
  const issues: string[] = [];
  if (!password || password.trim().length === 0) {
    issues.push('La contrasena es obligatoria.');
    return issues;
  }

  if (password.length < 10) issues.push('Debe contener al menos 10 caracteres.');
  if (!/[A-Z]/.test(password)) issues.push('Debe incluir al menos una letra mayuscula.');
  if (!/[a-z]/.test(password)) issues.push('Debe incluir al menos una letra minuscula.');
  if (!/\d/.test(password)) issues.push('Debe incluir al menos un numero.');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('Debe incluir al menos un caracter especial.');

  return issues;
};

const isAdminRole = (role: any): boolean => role === Role.ADMIN_SISTEMA || String(role || '').toLowerCase() === 'admin';

const canUpdateStatus = (role: Role, estatus: EstatusWorkflow): boolean => {
  if (isAdminRole(role)) return true;

  if (role === Role.CONSULTA_CENTRAL) return false;

  if (estatus === EstatusWorkflow.AUTORIZADO) {
    return canAuthorizeImporte(role);
  }

  if (['ENVIADO_A_OPTICA', 'EN_PROCESO_OPTICA', 'LISTO_PARA_ENTREGA', 'ENTREGADO', 'CERRADO'].includes(estatus)) {
    return role === Role.VALIDADOR_PRESTACIONES || role === Role.AUTORIZADOR_JSDP_DSPNC;
  }

  if (['EN_REVISION_DOCUMENTAL', 'RECHAZADO', 'BORRADOR'].includes(estatus)) {
    return role === Role.CAPTURISTA_UNIDAD || role === Role.VALIDADOR_PRESTACIONES || role === Role.AUTORIZADOR_JSDP_DSPNC;
  }

  return false;
};

const addWorkflowBitacora = async (payload: {
  tramiteId: string;
  usuario: string;
  accion: string;
  descripcion: string;
  datos: Record<string, any>;
}) => {
  await addDoc(collection(db, 'bitacora'), {
    ...payload,
    categoria: 'WORKFLOW',
    fecha: new Date().toISOString()
  });
};

const canAccessTramiteByScope = (user: User, tramite: Tramite): boolean => {
  if (isAdminRole(user.role)) return true;
  if (user.role === Role.CAPTURISTA_UNIDAD) {
    return (tramite.unidad || '').trim().toUpperCase() === (user.unidad || '').trim().toUpperCase();
  }
  return true;
};

export const ensureSession = async (): Promise<User | null> => {
  if (currentUserProfile) return currentUserProfile;

  try {
    const firebaseUser = await waitForAuthState();
    if (!firebaseUser) return null;

    const userDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      clearSession();
      return null;
    }

    const user = { id: firebaseUser.uid, ...(userDoc.data() as Omit<User, 'id'>) } as User;
    if (!user.activo) {
      await signOut(auth);
      clearSession();
      return null;
    }

    currentUserProfile = user;
    return user;
  } catch (error) {
    console.error('DB: Error en ensureSession', error);
    clearSession();
    return null;
  }
};

export const loginWithMatricula = async (matricula: string, password: string): Promise<User> => {
  const matriculaNormalized = normalizeMatricula(matricula || '');
  const loginValidationError = validateLoginInput(matricula, password);
  if (loginValidationError) {
    throw new AuthError('INVALID_INPUT', loginValidationError);
  }

  try {
    await authPersistenceReady;
    const candidates = matriculaToEmailCandidates(matriculaNormalized);

    let lastAuthError: any = null;
    for (const email of candidates) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);

        let userDoc;
        try {
          userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid));
        } catch (readError: any) {
          if (String(readError?.code || '') === 'permission-denied' && matriculaNormalized === PRIMARY_ADMIN_MATRICULA) {
            await bootstrapPrimaryAdminProfile(cred.user.uid, matriculaNormalized, email);
            userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid));
          } else {
            throw readError;
          }
        }

        if (!userDoc.exists()) {
          if (matriculaNormalized === PRIMARY_ADMIN_MATRICULA) {
            await bootstrapPrimaryAdminProfile(cred.user.uid, matriculaNormalized, email);
            userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid));
          }
        }

        if (!userDoc.exists()) {
          await signOut(auth);
          throw new AuthError('INVALID_SESSION', 'Tu cuenta no esta mapeada en usuarios/{uid}.');
        }

        const user = { id: cred.user.uid, ...(userDoc.data() as Omit<User, 'id'>) } as User;

        if (!user.activo) {
          await signOut(auth);
          throw new AuthError('INACTIVE_USER', 'Tu cuenta esta inactiva. Contacta al administrador.');
        }

        currentUserProfile = user;
        return user;
      } catch (candidateError: any) {
        const code = candidateError?.code || '';
        if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
          lastAuthError = candidateError;
          continue;
        }
        if (candidateError instanceof AuthError) throw candidateError;
        lastAuthError = candidateError;
      }
    }

    const finalCode = lastAuthError?.code || '';
    if (finalCode === 'auth/invalid-credential' || finalCode === 'auth/user-not-found' || finalCode === 'auth/wrong-password') {
      throw new AuthError('INVALID_CREDENTIALS', 'Matricula o contrasena incorrecta.');
    }

    throw new AuthError('INVALID_CREDENTIALS', 'Matricula o contrasena incorrecta.');
  } catch (error: any) {
    if (error instanceof AuthError) throw error;
    const code = error?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
      throw new AuthError('INVALID_CREDENTIALS', 'Matricula o contrasena incorrecta.');
    }
    throw new AuthError('INVALID_CREDENTIALS', 'Matricula o contrasena incorrecta.');
  }
};

export const logoutSession = () => {
  void signOut(auth);
  clearSession();
};

export const adminCreateCapturista = async (
  adminUser: User,
  payload: { nombre: string; matricula: string; unidad: string; ooad: string; password: string; role?: Role }
): Promise<string> => {
  if (!isAdminRole(adminUser.role)) throw new AuthError('UNAUTHORIZED', 'Solo admin puede crear usuarios.');

  const weakPasswordIssues = validatePasswordStrength(payload.password);
  if (weakPasswordIssues.length > 0) {
    throw new AuthError('WEAK_PASSWORD', `Contrasena insegura: ${weakPasswordIssues.join(' ')}`);
  }

  const matricula = normalizeMatricula(payload.matricula);
  const existsQ = query(collection(db, 'usuarios'), where('matricula', '==', matricula), limit(1));
  const exists = await getDocs(existsQ);
  if (!exists.empty) throw new Error('La matricula ya esta registrada.');

  const creatorAuth = await getCreatorAuth();
  const email = matriculaToEmail(matricula);
  const created = await createUserWithEmailAndPassword(creatorAuth, email, payload.password);

  const user: User = {
    id: created.user.uid,
    nombre: payload.nombre.trim(),
    matricula,
    role: payload.role || Role.CAPTURISTA_UNIDAD,
    unidad: payload.unidad.trim(),
    ooad: payload.ooad.trim(),
    activo: true,
    authEmail: email
  };

  await setDoc(doc(db, 'usuarios', created.user.uid), user);
  await signOut(creatorAuth);
  return user.id;
};

export const adminResetPassword = async (
  adminUser: User,
  userId: string,
  newPassword: string
): Promise<void> => {
  if (!isAdminRole(adminUser.role)) throw new AuthError('UNAUTHORIZED', 'Solo admin puede resetear contrasenas.');

  const issues = validatePasswordStrength(newPassword);
  if (issues.length > 0) {
    throw new AuthError('WEAK_PASSWORD', `Contrasena insegura: ${issues.join(' ')}`);
  }

  const call = httpsCallable(functions, 'adminResetUserPassword');
  await call({ userId, newPassword });
};

export const changeOwnPassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    clearSession();
    throw new AuthError('INVALID_SESSION', 'Sesion invalida. Inicia sesion nuevamente.');
  }

  const strengthIssues = validatePasswordStrength(newPassword);
  if (strengthIssues.length > 0) {
    throw new AuthError('WEAK_PASSWORD', `La nueva contrasena no cumple la politica: ${strengthIssues.join(' ')}`);
  }

  const email = firebaseUser.email;
  if (!email) {
    throw new AuthError('INVALID_SESSION', 'No fue posible validar tu cuenta. Inicia sesion nuevamente.');
  }

  try {
    const credential = EmailAuthProvider.credential(email, currentPassword);
    await reauthenticateWithCredential(firebaseUser, credential);
    await updatePassword(firebaseUser, newPassword);
  } catch (error: any) {
    const code = String(error?.code || '');

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new AuthError('INVALID_CREDENTIALS', 'La contrasena actual es incorrecta.');
    }

    if (code === 'auth/too-many-requests') {
      throw new AuthError('INVALID_CREDENTIALS', 'Demasiados intentos fallidos. Inicia sesion nuevamente.');
    }

    if (code === 'auth/requires-recent-login' || code === 'auth/user-token-expired') {
      clearSession();
      throw new AuthError('INVALID_SESSION', 'Tu sesion expiro. Inicia sesion nuevamente.');
    }

    throw new Error('No se pudo actualizar la contrasena. Intenta nuevamente.');
  }
};

export const dbService = {
  async getPresupuestoGlobal(): Promise<number | null> {
    try {
      const cfgDoc = await getDoc(doc(db, 'configuracion', 'global'));
      if (!cfgDoc.exists()) return null;
      const raw = Number((cfgDoc.data() as any)?.presupuestoGlobal);
      return Number.isFinite(raw) && raw >= 0 ? raw : null;
    } catch {
      return null;
    }
  },

  async setPresupuestoGlobal(adminUser: User, value: number): Promise<void> {
    if (!isAdminRole(adminUser.role)) {
      throw new AuthError('UNAUTHORIZED', 'Solo admin puede actualizar el presupuesto global.');
    }
    await setDoc(doc(db, 'configuracion', 'global'), { presupuestoGlobal: Math.max(0, Number(value || 0)) }, { merge: true });
  },

  watchPresupuestoGlobal(onValue: (value: number) => void): () => void {
    const ref = doc(db, 'configuracion', 'global');
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const raw = Number((snap.data() as any)?.presupuestoGlobal);
      if (Number.isFinite(raw) && raw >= 0) onValue(raw);
    });
    return () => unsub();
  },

  watchResumenSolicitudesGlobal(onValue: (rows: Array<{ unidad: string; totalSolicitudes: number; totalCosto: number }>) => void): () => void {
    const q = query(collection(db, 'tramites'), limit(3000));
    const unsub = onSnapshot(q, (snap) => {
      const map = (snap.docs || []).reduce((acc: Record<string, { totalSolicitudes: number; totalCosto: number }>, d) => {
        const t: any = d.data() || {};
        // Mantener coherencia con listados: ignorar documentos incompletos/huérfanos
        if (!String(t?.folio || '').trim()) return acc;
        if (!String(t?.fechaCreacion || '').trim()) return acc;
        if (t?.eliminado === true) return acc;

        const unidad = String(t.unidad || t?.beneficiario?.entidadLaboral || 'SIN_UNIDAD');
        if (!acc[unidad]) acc[unidad] = { totalSolicitudes: 0, totalCosto: 0 };
        acc[unidad].totalSolicitudes += 1;
        acc[unidad].totalCosto += resolveTramiteImporte(t);
        return acc;
      }, {});

      const rows = Object.entries(map)
        .map(([unidad, val]) => ({ unidad, totalSolicitudes: val.totalSolicitudes, totalCosto: val.totalCosto }))
        .sort((a, b) => a.unidad.localeCompare(b.unidad));

      onValue(rows);
    }, () => {
      onValue([]);
    });
    return () => unsub();
  },

  async getDashboardGlobalTotals(): Promise<{ totalSolicitudes: number; totalImporte: number; resumenPorUnidad: Array<{ unidad: string; totalSolicitudes: number; totalCosto: number }> }> {
    try {
      const cfgDoc = await getDoc(doc(db, 'configuracion', 'global'));
      if (!cfgDoc.exists()) return { totalSolicitudes: 0, totalImporte: 0, resumenPorUnidad: [] };
      const data: any = cfgDoc.data() || {};
      return {
        totalSolicitudes: Number(data.totalSolicitudesGlobal || 0),
        totalImporte: Number(data.totalImporteGlobal || 0),
        resumenPorUnidad: Array.isArray(data.resumenPorUnidadGlobal) ? data.resumenPorUnidadGlobal : []
      };
    } catch {
      return { totalSolicitudes: 0, totalImporte: 0, resumenPorUnidad: [] };
    }
  },

  watchDashboardGlobalTotals(onValue: (totals: { totalSolicitudes: number; totalImporte: number; resumenPorUnidad: Array<{ unidad: string; totalSolicitudes: number; totalCosto: number }> }) => void): () => void {
    const ref = doc(db, 'configuracion', 'global');
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data: any = snap.data() || {};
      onValue({
        totalSolicitudes: Number(data.totalSolicitudesGlobal || 0),
        totalImporte: Number(data.totalImporteGlobal || 0),
        resumenPorUnidad: Array.isArray(data.resumenPorUnidadGlobal) ? data.resumenPorUnidadGlobal : [],
      });
    });
    return () => unsub();
  },

  async rebuildDashboardGlobalTotals(adminUser: User): Promise<void> {
    if (!isAdminRole(adminUser.role)) {
      throw new AuthError('UNAUTHORIZED', 'Solo admin puede recalcular los totales globales.');
    }
    const qAll = query(collection(db, 'tramites'), limit(2000));
    const snap = await getDocs(qAll);
    const validDocs = (snap.docs || []).filter((d) => {
      const t: any = d.data() || {};
      if (!String(t?.folio || '').trim()) return false;
      if (!String(t?.fechaCreacion || '').trim()) return false;
      if (t?.eliminado === true) return false;
      return true;
    });

    const totalSolicitudes = validDocs.length;
    const totalImporte = validDocs.reduce((acc, d) => acc + resolveTramiteImporte(d.data() as any), 0);

    const map = validDocs.reduce((acc: Record<string, { totalSolicitudes: number; totalCosto: number }>, d) => {
      const t: any = d.data() || {};
      const unidad = String(t.unidad || t?.beneficiario?.entidadLaboral || 'SIN_UNIDAD');
      if (!acc[unidad]) acc[unidad] = { totalSolicitudes: 0, totalCosto: 0 };
      acc[unidad].totalSolicitudes += 1;
      acc[unidad].totalCosto += resolveTramiteImporte(t);
      return acc;
    }, {});
    const resumenPorUnidadGlobal = Object.entries(map)
      .map(([unidad, val]) => ({ unidad, totalSolicitudes: val.totalSolicitudes, totalCosto: val.totalCosto }))
      .sort((a, b) => a.unidad.localeCompare(b.unidad));

    await setDoc(doc(db, 'configuracion', 'global'), {
      totalSolicitudesGlobal: totalSolicitudes,
      totalImporteGlobal: totalImporte,
      resumenPorUnidadGlobal,
    }, { merge: true });
  },

  async getUsers(): Promise<User[]> {
    const q = query(collection(db, 'usuarios'), orderBy('nombre', 'asc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ ...d.data(), id: d.id } as User));
  },

  async adminUpdateUserRole(adminUser: User, userId: string, role: Role): Promise<void> {
    if (!isAdminRole(adminUser.role)) throw new AuthError('UNAUTHORIZED', 'Solo admin puede actualizar roles.');
    await updateDoc(doc(db, 'usuarios', userId), { role });
  },

  async adminDeleteUser(adminUser: User, userId: string): Promise<void> {
    if (!isAdminRole(adminUser.role)) throw new AuthError('UNAUTHORIZED', 'Solo admin puede eliminar usuarios.');
    if (adminUser.id === userId) throw new Error('No puedes eliminar tu propio usuario administrador.');
    await deleteDoc(doc(db, 'usuarios', userId));
  },

  async getTramites(): Promise<Tramite[]> {
    try {
      const user = await ensureSession();
      if (!user) return [];

      let q;
      if (user.role === Role.CAPTURISTA_UNIDAD) {
        q = query(
          collection(db, "tramites"),
          where("unidad", "==", user.unidad),
          orderBy("fechaCreacion", "desc"),
          limit(500)
        );
      } else {
        q = query(
          collection(db, "tramites"),
          orderBy("fechaCreacion", "desc"),
          limit(500)
        );
      }

      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => ({
        ...(doc.data() as any),
        id: doc.id
      })) as Tramite[];

      return Array.isArray(results) ? results : [];
    } catch (error: any) {
      console.error("DB Error (getTramites):", error);
      return [];
    }
  },

  async saveTramite(tramite: Partial<Tramite>): Promise<string> {
    const user = await ensureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida. Inicia sesion nuevamente.');

    try {
      if (tramite.id) {
        const docRef = doc(db, "tramites", tramite.id);
        const prevSnapshot = await getDoc(docRef);
        if (!prevSnapshot.exists()) {
          throw new Error('El tramite no existe o fue eliminado.');
        }

        const previo = prevSnapshot.data() as Tramite;

        if (!canAccessTramiteByScope(user, previo)) {
          throw new Error('No tienes permisos para editar tramites de otra unidad.');
        }

        if (tramite.estatus) {
          if (!canUpdateStatus(user.role, tramite.estatus)) {
            const reason = tramite.estatus === EstatusWorkflow.AUTORIZADO
              ? UX_MESSAGES.UPDATE_STATUS_DENIED
              : 'No tienes permisos para cambiar a ese estatus.';
            await addWorkflowBitacora({
              tramiteId: tramite.id,
              usuario: user.nombre,
              accion: 'TRANSICION_RECHAZADA_PERMISOS',
              descripcion: reason,
              datos: {
                from: previo.estatus,
                to: tramite.estatus,
                role: user.role
              }
            });
            throw new Error(reason);
          }

          const validation = validateWorkflowTransition(previo.estatus, tramite.estatus);
          if (!validation.isValid) {
            await addWorkflowBitacora({
              tramiteId: tramite.id,
              usuario: user.nombre,
              accion: 'TRANSICION_RECHAZADA_WORKFLOW',
              descripcion: validation.reason || 'Transicion invalida.',
              datos: {
                from: previo.estatus,
                to: tramite.estatus,
                role: user.role,
                allowedNext: validation.allowedNext
              }
            });
            throw new Error(validation.reason || 'Transicion invalida.');
          }
        }

        if (typeof tramite.contratoColectivoAplicable === 'string') {
          const contrato = tramite.contratoColectivoAplicable.trim();
          if (!contrato) {
            throw new Error('El campo contratoColectivoAplicable es obligatorio.');
          }
          const nssTitular = String((tramite.beneficiario?.nssTrabajador || previo.beneficiario?.nssTrabajador || '')).trim();
          const historialQ = query(
            collection(db, "tramites"),
            where("beneficiario.nssTrabajador", "==", nssTitular),
            limit(200)
          );
          const historialSnap = await getDocs(historialQ);
          const historialMismoContrato = dedupeDotaciones(
            historialSnap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Tramite) }))
              .filter((t) => t.id !== tramite.id)
              .filter((t) => String(t.unidad || '').trim().toUpperCase() === String(user.unidad || '').trim().toUpperCase())
              .filter((t) => String(t.contratoColectivoAplicable || '').trim().toUpperCase() === contrato.toUpperCase())
              .filter((t) => isSameDotacionScope(t, tramite))
          );
          const totalDotacionesUnicas = getUniqueDotacionCount(historialMismoContrato);
          if (totalDotacionesUnicas >= 2) {
            const folios = historialMismoContrato.map((x) => x.folio).filter(Boolean).join(', ');
            throw new Error(`No se puede guardar. La persona solicitante ya cuenta con ${totalDotacionesUnicas} dotaciones para el contrato colectivo ${contrato} (limite maximo: 2). Folios considerados: ${folios || 'N/D'}.`);
          }
        }

        const { id, ...data } = tramite;
        await updateDoc(docRef, data);

        const prevImporte = resolveTramiteImporte(previo as any);
        const nextImporte = resolveTramiteImporte({ ...previo, ...data } as any);
        const deltaImporte = nextImporte - prevImporte;
        if (deltaImporte !== 0) {
          await setDoc(doc(db, 'configuracion', 'global'), {
            totalImporteGlobal: increment(deltaImporte)
          }, { merge: true });
        }

        if (tramite.estatus && tramite.estatus !== previo.estatus) {
          await addWorkflowBitacora({
            tramiteId: tramite.id,
            usuario: user.nombre,
            accion: 'TRANSICION_APLICADA',
            descripcion: `Transicion de estatus aplicada: ${previo.estatus} -> ${tramite.estatus}.`,
            datos: {
              from: previo.estatus,
              to: tramite.estatus,
              role: user.role
            }
          });
        }

        return tramite.id;
      } else {
        if (user.role === Role.CONSULTA_CENTRAL) {
          throw new Error(UX_MESSAGES.CREATE_DENIED);
        }

        const createIssues = validateNuevoTramiteInput({
          nombre: tramite.beneficiario?.nombre,
          nssTrabajador: tramite.beneficiario?.nssTrabajador,
          folioRecetaImss: tramite.folioRecetaImss,
          descripcionLente: tramite.descripcionLente,
          importeSolicitado: Number(tramite.importeSolicitado || 0)
        });
        if (createIssues.length > 0) {
          throw new Error(createIssues[0]);
        }

        const contrato = String(tramite.contratoColectivoAplicable || '').trim();
        if (!contrato) {
          throw new Error('El campo contratoColectivoAplicable es obligatorio.');
        }

        const nssTitular = String(tramite.beneficiario?.nssTrabajador || '').trim();
        const historialQ = query(
          collection(db, "tramites"),
          where("beneficiario.nssTrabajador", "==", nssTitular),
          limit(200)
        );
        const historialSnap = await getDocs(historialQ);
        const historialMismoContrato = dedupeDotaciones(
          historialSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Tramite) }))
            .filter((t) => String(t.unidad || '').trim().toUpperCase() === String(user.unidad || '').trim().toUpperCase())
            .filter((t) => String(t.contratoColectivoAplicable || '').trim().toUpperCase() === contrato.toUpperCase())
            .filter((t) => isSameDotacionScope(t, tramite))
        );

        const totalDotacionesUnicas = getUniqueDotacionCount(historialMismoContrato);
        if (totalDotacionesUnicas >= 2) {
          const folios = historialMismoContrato.map((x) => x.folio).filter(Boolean).join(', ');
          throw new Error(`No se puede registrar una nueva solicitud. La persona solicitante ya cuenta con ${totalDotacionesUnicas} dotaciones para el contrato colectivo ${contrato} (limite maximo: 2). Folios considerados: ${folios || 'N/D'}.`);
        }

        const nextDotacionNumero = Math.min(4, totalDotacionesUnicas + 1);
        const costoSolicitud = Number(tramite.costoSolicitud || 0);
        const importeInicial = resolveTramiteImporte({ ...tramite, costoSolicitud });
        const docRef = await addDoc(collection(db, "tramites"), {
          ...tramite,
          costoSolicitud,
          contratoColectivoAplicable: contrato,
          dotacionNumero: nextDotacionNumero,
          requiereDictamenMedico: nextDotacionNumero >= 3,
          creadorId: user.id,
          creadorNombre: user.nombre,
          creadorMatricula: user.matricula,
          unidad: user.unidad
        });

        await setDoc(doc(db, 'configuracion', 'global'), {
          totalSolicitudesGlobal: increment(1),
          totalImporteGlobal: increment(importeInicial)
        }, { merge: true });

        return docRef.id;
      }
    } catch (error: any) {
      console.error("DB Error (saveTramite):", error);
      throw error;
    }
  },

  async deleteTramite(tramiteId: string): Promise<void> {
    const user = await ensureSession();
    if (!user) throw new AuthError('INVALID_SESSION', 'Sesion invalida. Inicia sesion nuevamente.');

    const docRef = doc(db, "tramites", tramiteId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) throw new Error('El tramite no existe o ya fue eliminado.');

    const previo = snapshot.data() as Tramite;
    if (!canAccessTramiteByScope(user, previo)) {
      throw new Error('No tienes permisos para eliminar tramites de otra unidad.');
    }

    await deleteDoc(docRef);

    await setDoc(doc(db, 'configuracion', 'global'), {
      totalSolicitudesGlobal: increment(-1),
      totalImporteGlobal: increment(-resolveTramiteImporte(previo as any))
    }, { merge: true });
  },

  async getBitacora(tramiteId: string): Promise<Bitacora[]> {
    try {
      const q = query(
        collection(db, "bitacora"),
        where("tramiteId", "==", tramiteId),
        orderBy("fecha", "asc")
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        ...(doc.data() as any),
        id: doc.id
      })) as Bitacora[];
    } catch (error: any) {
      return [];
    }
  },

  async addBitacora(bitacora: Omit<Bitacora, 'id' | 'fecha'>) {
    const user = await ensureSession();
    if (!user) return;

    try {
      await addDoc(collection(db, "bitacora"), {
        ...bitacora,
        fecha: new Date().toISOString(),
        usuario: user.nombre
      });
    } catch (error: any) {}
  }
};
