/**
 * SalinTayo Admin — backend integration stubs
 * ---------------------------------------------------------------------------
 * Point these functions at your PHP (or Node) API once routes exist.
 * Example PHP endpoint pattern:
 *   GET    /api/admin/users.php
 *   POST   /api/admin/users.php
 *   PATCH  /api/admin/users.php?id=...
 *   DELETE /api/admin/users.php?id=...
 *
 * All methods return Promises so you can swap `mockDelay` + in-memory data
 * for real `fetch()` without rewriting callers.
 */

(function (global) {
  'use strict';

  var API_BASE = ''; // e.g. '/api/admin' or 'https://your-host/admin-api'

  /**
   * Simulated network delay (ms). Set to 0 when using real HTTP.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function mockDelay(ms) {
    ms = ms || 0;
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Example: real list users
   * @returns {Promise<unknown>}
   */
  function fetchUsers() {
    return fetch(API_BASE + '/users.php', { credentials: 'include' }).then(function (r) {
      if (!r.ok) throw new Error('Failed to load users');
      return r.json();
    });
  }

  /**
   * Example: real save user
   * @param {string} method
   * @param {unknown} body
   * @param {string} [id]
   * @returns {Promise<unknown>}
   */
  function saveUser(method, body, id) {
    var url = API_BASE + '/users.php' + (id ? '?id=' + encodeURIComponent(id) : '');
    return fetch(url, {
      method: method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error('User save failed');
      return r.json().catch(function () { return {}; });
    });
  }

  /**
   * End admin session on the server (optional). No-op when API_BASE is unset.
   * @returns {Promise<void>}
   */
  function logout() {
    if (!API_BASE) return Promise.resolve();
    return fetch(API_BASE + '/logout.php', { method: 'POST', credentials: 'include' }).catch(function () {});
  }

  global.SalintayoAdminApi = {
    API_BASE: API_BASE,
    setApiBase: function (base) {
      API_BASE = base || '';
    },
    mockDelay: mockDelay,
    fetchUsers: fetchUsers,
    saveUser: saveUser,
    logout: logout,
  };
})(typeof window !== 'undefined' ? window : globalThis);
