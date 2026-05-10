import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyB7OrbWe3_dksWgIqDijPzoF4EgltekJHU",
  authDomain: "sice-23295.firebaseapp.com",
  projectId: "sice-23295",
  storageBucket: "sice-23295.firebasestorage.app",
  messagingSenderId: "298295905546",
  appId: "1:298295905546:web:eaba5d4d4dbc27a82afef3",
  measurementId: "G-THF2K8Y3ZN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

const authPersistenceReady = setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.warn('No se pudo establecer persistencia de sesion en navegador.', error);
});

// Shared auth error class (used by both SISTRA and SICE)
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

// Lightweight session check for SICE services (no bootstrap, no SISTRA state)
const _waitForAuth = async () => {
  await authPersistenceReady;
  if (auth.currentUser) return auth.currentUser;
  return await new Promise<any>((resolve) => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      unsub();
      resolve(firebaseUser);
    });
  });
};

export const siceEnsureSession = async (): Promise<{ uid: string; role?: string } | null> => {
  try {
    const fbUser = await _waitForAuth();
    if (!fbUser) return null;
    const snap = await getDoc(doc(db, 'usuarios', fbUser.uid));
    if (!snap.exists()) return null;
    const data: any = snap.data() || {};
    if (data.activo === false) { await signOut(auth); return null; }
    return { uid: fbUser.uid, role: data.role };
  } catch { return null; }
};

export { app, db, auth, functions, authPersistenceReady };
