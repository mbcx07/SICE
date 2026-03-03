import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

const firebaseConfig = {
  apiKey: 'AIzaSyA_V82BKDeUOHExz-zUiazBxsfP6eXadmU',
  authDomain: 'prestaciones-d3f9a.firebaseapp.com',
  projectId: 'prestaciones-d3f9a',
  storageBucket: 'prestaciones-d3f9a.firebasestorage.app',
  messagingSenderId: '510072300294',
  appId: '1:510072300294:web:213688c873acb375f47487'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const hashPassword = async (password) => {
  const digest = crypto.createHash('sha256').update(password).digest('hex');
  return digest;
};

const pass = 'QaTest#2026';
const hash = await hashPassword(pass);

const users = [
  { id: 'qa-capt', nombre: 'QA Capturista', matricula: 'CAPQA01', role: 'CAPTURISTA_UNIDAD', unidad: 'UMF01', ooad: 'NORTE', activo: true, passwordHash: hash },
  { id: 'qa-cons', nombre: 'QA Consulta', matricula: 'CONQA01', role: 'CONSULTA_CENTRAL', unidad: 'NACIONAL', ooad: 'CENTRAL', activo: true, passwordHash: hash },
  { id: 'qa-val', nombre: 'QA Validador', matricula: 'VALQA01', role: 'VALIDADOR_PRESTACIONES', unidad: 'NACIONAL', ooad: 'CENTRAL', activo: true, passwordHash: hash }
];

for (const u of users) {
  await setDoc(doc(db, 'usuarios', u.id), u, { merge: true });
  console.log('upserted', u.matricula, u.role);
}
console.log('seed done');