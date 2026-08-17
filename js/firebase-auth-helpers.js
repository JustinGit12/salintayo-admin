/**
 * Sign out Firebase (used from admin shell logout).
 */
import { signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-client.js';

function signOutFirebase() {
  return signOut(auth);
}

export { signOutFirebase };
