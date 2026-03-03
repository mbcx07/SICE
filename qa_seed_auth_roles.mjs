import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyA_V82BKDeUOHExz-zUiazBxsfP6eXadmU',
  authDomain: 'prestaciones-d3f9a.firebaseapp.com',
  projectId: 'prestaciones-d3f9a',
  storageBucket: 'prestaciones-d3f9a.firebasestorage.app',
  messagingSenderId: '510072300294',
  appId: '1:510072300294:web:213688c873acb375f47487'
};

const app = initializeApp(firebaseConfig, 'qa-seed-auth-roles-v2');
const auth = getAuth(app);
await setPersistence(auth, inMemoryPersistence);
const db = getFirestore(app);

const pass = 'QaTest#2026';
const users = [
  { matricula: 'ADMQA26', nombre: 'QA Admin', role: 'ADMIN_SISTEMA', unidad: 'NACIONAL', ooad: 'CENTRAL' },
  { matricula: 'CAPQA26', nombre: 'QA Capturista', role: 'CAPTURISTA_UNIDAD', unidad: 'UMF01', ooad: 'NORTE' },
  { matricula: 'VALQA26', nombre: 'QA Validador', role: 'VALIDADOR_PRESTACIONES', unidad: 'NACIONAL', ooad: 'CENTRAL' },
  { matricula: 'AUTQA26', nombre: 'QA Autorizador', role: 'AUTORIZADOR_JSDP_DSPNC', unidad: 'NACIONAL', ooad: 'CENTRAL' },
  { matricula: 'CONQA26', nombre: 'QA Consulta', role: 'CONSULTA_CENTRAL', unidad: 'NACIONAL', ooad: 'CENTRAL' }
];

for (const u of users) {
  const email = `${u.matricula.toLowerCase()}@sistra.local`;
  try {
    const created = await createUserWithEmailAndPassword(auth, email, pass);
    const payload = {
      id: created.user.uid,
      nombre: u.nombre,
      matricula: u.matricula,
      role: u.role,
      unidad: u.unidad,
      ooad: u.ooad,
      activo: true,
      authEmail: email
    };
    await setDoc(doc(db, 'usuarios', created.user.uid), payload, { merge: true });
    console.log('CREATED', u.matricula, u.role, created.user.uid);
    await signOut(auth);
  } catch (e) {
    console.log('SKIP', u.matricula, e.code || e.message);
  }
}

console.log('DONE PASS=', pass);
