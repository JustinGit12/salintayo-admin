/**
 * SalinTayo Admin — Firebase app + Auth + Analytics (ES module, CDN SDK)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBcfY7s082XWQNBcSOkf4VAewsnmGxgyhY',
  authDomain: 'salintayo-74453.firebaseapp.com',
  projectId: 'salintayo-74453',
  storageBucket: 'salintayo-74453.firebasestorage.app',
  messagingSenderId: '446844764828',
  appId: '1:446844764828:web:fd7e85511eb681bf096359',
  measurementId: 'G-GVL20KQEPD',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let analytics = null;
isSupported()
  .then(function (ok) {
    if (ok) analytics = getAnalytics(app);
  })
  .catch(function () {});

export { app, auth, analytics, db };
