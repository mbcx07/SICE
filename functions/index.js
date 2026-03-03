const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.adminResetUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const callerRef = admin.firestore().doc(`usuarios/${context.auth.uid}`);
  const callerSnap = await callerRef.get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || caller.activo !== true || caller.role !== 'ADMIN_SISTEMA') {
    throw new functions.https.HttpsError('permission-denied', 'Solo ADMIN_SISTEMA puede resetear contraseñas.');
  }

  const userId = String(data?.userId || '').trim();
  const newPassword = String(data?.newPassword || '');
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId es requerido.');
  }
  if (newPassword.length < 10) {
    throw new functions.https.HttpsError('invalid-argument', 'La contraseña debe tener mínimo 10 caracteres.');
  }

  await admin.auth().updateUser(userId, { password: newPassword });
  await admin.firestore().doc(`usuarios/${userId}`).set({
    passwordResetAt: new Date().toISOString(),
    passwordResetBy: context.auth.uid
  }, { merge: true });

  return { ok: true };
});