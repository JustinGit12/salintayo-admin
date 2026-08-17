/**
 * SalinTayo Admin — login without Firebase (session only; use when useFirebaseAuth is false in data.js)
 */
(function () {
  'use strict';

  var D = window.SalintayoAdminData;
  var A = D && D.ADMIN_AUTH;
  if (!A) return;

  function $(id) {
    return document.getElementById(id);
  }

  function safeReturn() {
    var r = new URLSearchParams(window.location.search).get('return');
    return r === 'index.html' ? r : 'index.html';
  }

  function init() {
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
      var user = $('login-user') && $('login-user').value;
      var pass = $('login-pass') && $('login-pass').value;
      var err = $('login-error');
      if (err) err.textContent = '';
      function norm(s) {
        return (s || '').trim().toLowerCase();
      }
      if (norm(user) === norm(A.username) && pass === A.password) {
        try {
          sessionStorage.setItem(A.sessionStorageKey, A.sessionMarker);
          sessionStorage.setItem(A.displayUserKey, (user || '').trim());
        } catch (ex) {
          if (err) err.textContent = 'Could not save session. Check browser storage settings.';
          return;
        }
        window.location.replace(safeReturn());
      } else {
        if (err) err.textContent = 'Invalid username or password.';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
