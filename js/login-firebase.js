/**
 * SalinTayo Admin — login via Firebase Auth (email/password)
 */
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-client.js';

function $(id) {
  return document.getElementById(id);
}

function safeReturn() {
  var r = new URLSearchParams(window.location.search).get('return');
  return r === 'index.html' ? r : 'index.html';
}

function tryLocalFallback(A, email, pass, errEl) {
  if (!A.allowLocalFallback) return false;
  function norm(s) {
    return (s || '').trim().toLowerCase();
  }
  if (norm(email) !== norm(A.username) || pass !== A.password) return false;
  try {
    var gateKey = A.localGateSessionKey || 'salintayo_admin_local_gate';
    sessionStorage.setItem(gateKey, '1');
    sessionStorage.setItem(A.sessionStorageKey, A.sessionMarker);
    sessionStorage.setItem(A.displayUserKey, (email || '').trim());
  } catch (ex) {
    if (errEl) errEl.textContent = 'Could not save session. Check browser storage settings.';
    return false;
  }
  return true;
}

function mapAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled. In Firebase Console → Authentication → Sign-in method, turn on Email/Password.';
    case 'auth/network-request-failed':
      return 'Network error. Use http://localhost (or your hosted URL), not file:// — and check your connection.';
    case 'auth/unauthorized-domain':
      return 'This domain is not allowed. In Firebase Console → Authentication → Settings → Authorized domains, add localhost (or your site host).';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Firebase configuration error. Check the API key in js/firebase-client.js.';
    default:
      return (
        'Sign in failed' +
        (code ? ' (' + code + ').' : '.') +
        ' Open the browser console (F12) for details.'
      );
  }
}

function init() {
  var D = window.SalintayoAdminData;
  if (!D || !D.ADMIN_AUTH) {
    console.error('SalinTayo: load js/data.js before login-firebase.js');
    return;
  }
  var A = D.ADMIN_AUTH;

  try {
    if (sessionStorage.getItem(A.sessionStorageKey) === A.sessionMarker) {
      window.location.replace(safeReturn());
      return;
    }
  } catch (e) {}

  if (new URLSearchParams(window.location.search).get('signed_out')) {
    var banner = $('login-banner');
    if (banner) {
      banner.hidden = false;
      banner.textContent = 'You have been signed out.';
    }
  }

  var form = $('login-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = ($('login-user') && $('login-user').value) || '';
    var pass = ($('login-pass') && $('login-pass').value) || '';
    var errEl = $('login-error');
    var submit = form.querySelector('.login-form__submit');
    if (errEl) errEl.textContent = '';

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Signing in…';
    }

    signInWithEmailAndPassword(auth, email.trim(), pass)
      .then(function (cred) {
        try {
          var gateKey = A.localGateSessionKey || 'salintayo_admin_local_gate';
          sessionStorage.removeItem(gateKey);
          sessionStorage.setItem(A.sessionStorageKey, A.sessionMarker);
          sessionStorage.setItem(A.displayUserKey, (cred.user && cred.user.email) || email.trim());
        } catch (ex) {
          if (errEl) errEl.textContent = 'Could not save session. Check browser storage settings.';
          if (submit) {
            submit.disabled = false;
            submit.textContent = 'Sign in';
          }
          return;
        }
        window.location.replace(safeReturn());
      })
      .catch(function (err) {
        console.error('SalinTayo login:', err);
        if (tryLocalFallback(A, email, pass, errEl)) {
          window.location.replace(safeReturn());
          return;
        }
        if (errEl) errEl.textContent = mapAuthError(err && err.code ? err.code : '');
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'Sign in';
        }
      });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
