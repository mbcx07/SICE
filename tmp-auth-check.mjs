import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

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
const password = 'LuMo221407';

for (const email of ['moises.beltran@imss.gob.mx','moises.beltranx7@gmail.com']) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log(email, 'OK', cred.user.uid);
  } catch (e) {
    console.log(email, 'ERR', e.code || e.message);
  }
}
