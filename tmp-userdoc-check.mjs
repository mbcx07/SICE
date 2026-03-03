import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyA_V82BKDeUOHExz-zUiazBxsfP6eXadmU',
  authDomain: 'prestaciones-d3f9a.firebaseapp.com',
  projectId: 'prestaciones-d3f9a',
  storageBucket: 'prestaciones-d3f9a.firebasestorage.app',
  messagingSenderId: '510072300294',
  appId: '1:510072300294:web:213688c873acb375f47487'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const cred = await signInWithEmailAndPassword(auth, 'moises.beltran@imss.gob.mx', 'LuMo221407');
console.log('uid', cred.user.uid);
const snap = await getDoc(doc(db,'usuarios', cred.user.uid));
console.log('exists', snap.exists());
if (snap.exists()) console.log(snap.data());
