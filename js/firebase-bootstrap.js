/**
 * After Auth has finished restoring persisted state (authStateReady), syncs
 * sessionStorage with js/data.js, then subscribes to auth changes.
 * Avoids clearing the session on a transient null before persistence loads.
 */
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-client.js';

function syncSessionFromUser(user) {
  var A = typeof window.SalintayoAdminData !== 'undefined' && window.SalintayoAdminData.ADMIN_AUTH;
  if (!A) return;
  try {
    if (user) {
      sessionStorage.setItem(A.sessionStorageKey, A.sessionMarker);
      sessionStorage.setItem(A.displayUserKey, user.email || user.displayName || '');
      try {
        sessionStorage.removeItem(A.localGateSessionKey || 'salintayo_admin_local_gate');
      } catch (e) {}
    } else {
      var gate = A.localGateSessionKey || 'salintayo_admin_local_gate';
      try {
        if (sessionStorage.getItem(gate) === '1') return;
      } catch (e) {}
      sessionStorage.removeItem(A.sessionStorageKey);
      sessionStorage.removeItem(A.displayUserKey);
    }
  } catch (e) {}
}

var authReady =
  typeof auth.authStateReady === 'function' ? auth.authStateReady() : Promise.resolve();

const ready = authReady.then(function () {
  syncSessionFromUser(auth.currentUser);
  onAuthStateChanged(auth, syncSessionFromUser);
});

export { ready };
