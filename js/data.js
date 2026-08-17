/**
 * SalinTayo Admin — static / dummy data
 * ---------------------------------------------------------------------------
 * Replace with API responses from PHP, Firebase Admin, etc.
 * The mobile app uses:
 *   - Firebase Auth + Firestore `users/{uid}` (displayName, email, phone, bio, photoBase64)
 *   - Local quiz progress (could sync to backend later)
 *   - Learn streak dates locally
 *   - Chat via OpenRouter / Cloud Functions
 */

(function (global) {
  'use strict';

  /**
   * Admin gate: Firebase Auth and/or session flags.
   *
   * - useFirebaseAuth: false → login uses username/password below only (no Firebase).
   * - useFirebaseAuth: true → Firebase Email/Password first. If allowLocalFallback is true,
   *   the same username/password below still work when Firebase has no matching user (dev only;
   *   set false before production).
   *
   * For real Firebase-only admin: create the user in Firebase Console → Authentication → Users
   * (and enable Email/Password under Sign-in method). The placeholder account below is not
   * created automatically.
   */
  const ADMIN_AUTH = {
    sessionStorageKey: 'salintayo_admin_session',
    sessionMarker: 'authenticated',
    displayUserKey: 'salintayo_admin_display_user',
    localGateSessionKey: 'salintayo_admin_local_gate',
    useFirebaseAuth: true,
    allowLocalFallback: false,
    username: 'admin@salintayo.com',
    password: 'admin123',
  };

  /**
   * Optional: after logout, send the user here instead of the login page
   * (e.g. public marketing site). Leave empty to use login.html.
   */
  const ADMIN_LOGOUT_REDIRECT = '';

  /**
   * Learner app root (for your reference). Live data loads from Firebase (same project as salintayo-app).
   * Deploy firestore.rules from this repo (npm run deploy:firestore) and add admins/{your Firebase Auth UID}.
   * Sign in with Firebase Email/Password (not local fallback only) so Firestore requests carry a valid ID token.
   */
  const APP_PROJECT_HINT = 'C:\\Users\\justi\\salintayo-app';

  /** Firestore collections — must match rules in salintayo-app once deployed. */
  const APP_FIRESTORE = {
    enabled: true,
    usersCollection: 'users',
    dialectsCollection: 'dialects',
    chatSessionsCollection: 'chatSessions',
    bugReportsCollection: 'bugReports',
    appFeedbackCollection: 'appFeedback',
  };

  /**
   * Default dialects aligned with salintayo-app/src/pages/LanguageModal.tsx (seed into Firestore from admin UI).
   */
  const SEED_DIALECTS = [
    { slug: 'en', title: 'English', dialect: 'English', name: 'English', native: 'English', speakers: '1.5B+', visible: true, region: 'Global / Default', flag: '🇺🇸', gradient: 'linear-gradient(135deg, #4f46e5, #0ea5e9)', order: 0 },
    { slug: 'fil', title: 'Filipino', dialect: 'Filipino', name: 'Filipino', native: 'Filipino', speakers: '90M+', visible: true, region: 'Philippines', flag: '🇵🇭', gradient: 'linear-gradient(135deg, #dc2626, #fbbf24)', order: 1 },
    { slug: 'ceb', title: 'Cebuano', dialect: 'Bisaya', name: 'Cebuano', native: 'Bisaya', speakers: '20M+', visible: true, region: 'Visayas / Mindanao', flag: '🌴', gradient: 'linear-gradient(135deg, #0d9488, #10b981)', order: 2 },
    { slug: 'ilo', title: 'Ilocano', dialect: 'Ilokano', name: 'Ilocano', native: 'Ilokano', speakers: '9M+', visible: true, region: 'Northern Luzon', flag: '🏝️', gradient: 'linear-gradient(135deg, #0047ab, #06b6d4)', order: 3 },
    { slug: 'hil', title: 'Hiligaynon', dialect: 'Ilonggo', name: 'Hiligaynon', native: 'Ilonggo', speakers: '7M+', visible: true, region: 'Western Visayas', flag: '🌺', gradient: 'linear-gradient(135deg, #db2777, #f472b6)', order: 4 },
    { slug: 'war', title: 'Waray', dialect: 'Winaray', name: 'Waray', native: 'Winaray', speakers: '3M+', visible: true, region: 'Eastern Visayas', flag: '⛵', gradient: 'linear-gradient(135deg, #ea580c, #fbbf24)', order: 5 },
    { slug: 'bik', title: 'Bikol', dialect: 'Bikol', name: 'Bikol', native: 'Bikol', speakers: '2.5M+', visible: true, region: 'Bicol Region', flag: '🌋', gradient: 'linear-gradient(135deg, #be123c, #f97316)', order: 6 },
    { slug: 'pam', title: 'Kapampangan', dialect: 'Kapampangan', name: 'Kapampangan', native: 'Kapampangan', speakers: '2M+', visible: true, region: 'Central Luzon', flag: '🦅', gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)', order: 7 },
    { slug: 'tsg', title: 'Tausug', dialect: 'Bahasa Sug', name: 'Tausug', native: 'Bahasa Sug', speakers: '1M+', visible: true, region: 'Sulu Archipelago', flag: '🌊', gradient: 'linear-gradient(135deg, #0369a1, #67e8f9)', order: 8 },
  ];

  /** @typedef {{ id: string; displayName: string; email: string; phone: string; bio: string; dialect: string; status: 'active'|'suspended'; lastActive: string }} AdminUser */

  /** @type {AdminUser[]} */
  const USERS = [];

  /** @typedef {{ slug: string; title: string; dialect: string; speakers: string; visible: boolean }} CulturalRow */
  /** @type {CulturalRow[]} */
  const CULTURAL = [
    { slug: 'manila', title: 'Manila', dialect: 'Tagalog / Filipino', speakers: '90M+', visible: true },
    { slug: 'cebu', title: 'Cebu', dialect: 'Cebuano', speakers: '20M+', visible: true },
    { slug: 'davao', title: 'Davao', dialect: 'Davaoeño Cebuano', speakers: '2M+', visible: true },
    { slug: 'iloilo', title: 'Iloilo', dialect: 'Hiligaynon', speakers: '9M+', visible: false },
  ];

  global.SalintayoAdminData = {
    ADMIN_AUTH,
    ADMIN_LOGOUT_REDIRECT,
    APP_PROJECT_HINT,
    APP_FIRESTORE,
    SEED_DIALECTS,
    USERS,
    CULTURAL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
