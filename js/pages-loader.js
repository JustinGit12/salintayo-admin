/**
 * Loads page fragments from pages/*.html into #admin-pages-host, then runs app.js.
 * Uses embedded fallback (js/pages-inline.js) when fetch fails (e.g. opening index.html as file://).
 */
(function () {
  'use strict';

  function jsModuleUrl(fileName) {
    return new URL(fileName, new URL('js/', window.location.href)).href;
  }

  var adminAuth = window.SalintayoAdminData && window.SalintayoAdminData.ADMIN_AUTH;
  if (adminAuth && adminAuth.useFirebaseAuth === false) {
    window.__salintayoFirebaseReady = Promise.resolve();
  } else {
    window.__salintayoFirebaseReady = import(jsModuleUrl('firebase-bootstrap.js')).then(function (m) {
      return m.ready;
    });
  }

  var FILES = [
    'dashboard',
    'users',
    'bug-reports',
    'feedback',
  ];
  var host = document.getElementById('admin-pages-host');

  function loadScript(src) {
    var s = document.createElement('script');
    s.src = src;
    document.body.appendChild(s);
  }

  function loadAppWhenFirebaseReady() {
    var p = window.__salintayoFirebaseReady;
    if (p && typeof p.then === 'function') {
      p.then(
        function () {
          loadScript('js/app.js');
        },
        function () {
          loadScript('js/app.js');
        }
      );
      return;
    }
    loadScript('js/app.js');
  }

  function injectAndStart(htmls) {
    if (!host) return;
    host.innerHTML = '';
    htmls.forEach(function (html) {
      host.insertAdjacentHTML('beforeend', html.trim());
    });
    loadAppWhenFirebaseReady();
  }

  function showError(msg) {
    if (!host) return;
    host.innerHTML =
      '<div class="panel" style="margin:1rem"><div class="panel__body">' +
      '<p style="margin:0;color:var(--color-danger, #c00)"><strong>Could not load admin pages</strong></p>' +
      '<p style="margin:0.75rem 0 0;color:var(--color-text-muted)">' +
      (msg ||
        'Missing embedded fallback. Ensure js/pages-inline.js is loaded before this script.') +
      '</p></div></div>';
  }

  function getInlineFallback() {
    var arr = window.SalintayoAdminPageHtml;
    if (!arr || arr.length !== FILES.length) return null;
    return arr;
  }

  if (!host) {
    loadAppWhenFirebaseReady();
    return;
  }

  Promise.all(
    FILES.map(function (name) {
      return fetch('pages/' + name + '.html').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for pages/' + name + '.html');
        return r.text();
      });
    })
  )
    .then(function (htmls) {
      injectAndStart(htmls);
    })
    .catch(function (err) {
      console.warn('SalinTayo admin: fetch pages failed, using inline HTML.', err);
      var inline = getInlineFallback();
      if (inline) {
        injectAndStart(inline);
        return;
      }
      console.error(err);
      showError(err && err.message ? String(err.message) : '');
    });
})();
