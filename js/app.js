/**
 * SalinTayo Admin — UI logic (vanilla JS)
 * Sections: dashboard, users, bug-reports, feedback
 */

(function () {
  'use strict';

  function jsModuleUrl(fileName) {
    return new URL(fileName, new URL('js/', window.location.href)).href;
  }

  var D = window.SalintayoAdminData;
  var Api = window.SalintayoAdminApi;

  /** Deep-clone seed data so CRUD mutates a working copy */
  var users = JSON.parse(JSON.stringify(D.USERS));
  var cultural = JSON.parse(JSON.stringify(D.CULTURAL));

  /** True after Firestore bootstrap succeeds (Firebase-signed admin only). */
  var isFirestoreLive = false;
  var unsubscribeUsersLive = null;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    var t = els.toast;
    t.textContent = msg;
    t.className = 'toast is-visible' + (type ? ' toast--' + type : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      t.classList.remove('is-visible');
    }, 2800);
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime()) || d.getTime() === 0) return '—';
      return d.toLocaleString();
    } catch (e) {
      return iso || '—';
    }
  }

  function formatStatusLabel(st) {
    if (st === 'suspended') return 'Suspended';
    if (st === 'inactive') return 'Inactive';
    return 'Active';
  }

  /** After loading users + dialect rows, fill dialectLabel on users for the table. */
  function enrichLocalUserDialectLabels() {
    var map = {};
    (cultural || []).forEach(function (row) {
      map[row.slug] = row.title + ' · ' + row.dialect;
    });
    users.forEach(function (u) {
      var code = u.dialect;
      u.dialectLabel = map[code] || code;
    });
  }

  /** Shown when Firestore has no dialect docs yet (same list as seed button). */
  function seedCulturalFallback() {
    if (D.SEED_DIALECTS && D.SEED_DIALECTS.length) {
      return D.SEED_DIALECTS.map(function (s) {
        return {
          slug: s.slug,
          title: s.title,
          dialect: s.dialect,
          speakers: s.speakers,
          visible: s.visible !== false,
          gradient: s.gradient || '',
        };
      });
    }
    return JSON.parse(JSON.stringify(D.CULTURAL));
  }

  function buildDialectOptionsHtml(selectedSlug) {
    var map = {};
    cultural.forEach(function (c) {
      map[c.slug] = c.title + ' (' + c.slug + ')';
    });
    (D.SEED_DIALECTS || []).forEach(function (s) {
      if (!map[s.slug]) map[s.slug] = s.title + ' (' + s.slug + ')';
    });
    var keys = Object.keys(map).sort();
    return keys
      .map(function (slug) {
        return (
          '<option value="' +
          escapeAttr(slug) +
          '"' +
          (slug === selectedSlug ? ' selected' : '') +
          '>' +
          escapeHtml(map[slug]) +
          '</option>'
        );
      })
      .join('');
  }

  /* ——— Navigation ——— */
  function setSection(id) {
    var titles = {
      dashboard: 'Dashboard',
      users: 'Users',
      'bug-reports': 'Bug reports',
      feedback: 'Ratings & feedback',
    };
    document.querySelectorAll('.admin-section').forEach(function (sec) {
      sec.classList.remove('is-visible');
    });
    var target = $('section-' + id);
    if (target) target.classList.add('is-visible');

    document.querySelectorAll('.admin-nav__link').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-section') === id);
    });

    $('page-title').textContent = titles[id] || id;
    document.getElementById('admin-app').classList.remove('drawer-open');
  }

  function bindNav() {
    document.querySelectorAll('.admin-nav__link').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSection(btn.getAttribute('data-section'));
      });
    });
  }

  /* ——— Dashboard (Growth · Usage · Quality analytics) ——— */
  var CHATS = [];

  function renderDashboard() {
    if (!window.SalintayoDashboardAnalytics) return;
    var pack = window.__salintayoLivePack || {};
    window.SalintayoDashboardAnalytics.render({
      users: users,
      chats: CHATS,
      analytics: pack.analytics || null,
      bugReports: BUG_REPORTS,
      feedbackRows: FEEDBACK_ROWS,
    });
  }

  /* ——— Users table ——— */
  function renderUsers(filter) {
    var q = (filter || '').toLowerCase().trim();
    var tbody = $('users-tbody');
    var rows = users.filter(function (u) {
      if (!q) return true;
      return (
        (u.displayName && u.displayName.toLowerCase().indexOf(q) >= 0) ||
        (u.email && u.email.toLowerCase().indexOf(q) >= 0)
      );
    });
    if (!rows.length) {
      var emptyMsg = q
        ? '<strong>No users match</strong>Try a different search.'
        : isFirestoreLive
          ? '<strong>No learner profiles in Firestore</strong>The Authentication tab lists sign-in accounts; this table only shows documents from Firestore (default collection <code>users</code>, one document per learner using their Auth UID as the document ID). Add or sync those profile documents from the learner app. If profiles live in another collection name, set <code>usersCollection</code> under <code>APP_FIRESTORE</code> in <code>js/data.js</code>.'
          : '<strong>No users yet</strong>Add a user or load from your backend.';
      tbody.innerHTML =
        '<tr><td colspan="6"><div class="empty-state">' + emptyMsg + '</div></td></tr>';
      var um = $('users-meta');
      if (um) um.textContent = q ? '0 matches' : '0 users';
      return;
    }
    tbody.innerHTML = rows
      .map(function (u) {
        var statusClass = 'badge--success';
        if (u.status === 'suspended') statusClass = 'badge--danger';
        else if (u.status === 'inactive') statusClass = 'badge--muted';
        var dlab = u.dialectLabel || u.dialect || '—';
        return (
          '<tr data-user-id="' +
          escapeAttr(u.id) +
          '"><td>' +
          escapeHtml(u.displayName) +
          '</td><td>' +
          escapeHtml(u.email) +
          '</td><td><span class="badge badge--muted" title="' +
          escapeAttr(u.dialect || '') +
          '">' +
          escapeHtml(dlab) +
          '</span></td><td><span class="badge ' +
          statusClass +
          '">' +
          escapeHtml(formatStatusLabel(u.status)) +
          '</span></td><td>' +
          formatDate(u.lastActive) +
          '</td><td class="cell-actions">' +
          '<button type="button" class="admin-btn-link" data-act="view-user">View</button>' +
          '</td></tr>'
        );
      })
      .join('');

    var um = $('users-meta');
    if (um) um.textContent = rows.length + (rows.length === 1 ? ' user' : ' users');

    tbody.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr && tr.getAttribute('data-user-id');
        var user = users.find(function (x) {
          return x.id === id;
        });
        if (!user) return;
        var act = btn.getAttribute('data-act');
        if (act === 'view-user') openUserModal(user, true);
      });
    });
  }

  function applyLivePack(pack) {
    window.__salintayoLivePack = pack;
    if (!pack || pack.error || !pack.api) {
      isFirestoreLive = false;
      return;
    }
    isFirestoreLive = true;
    users = pack.users.slice();
    cultural = pack.dialects.slice();
    if (!cultural.length) {
      cultural = seedCulturalFallback();
      window.__salintayoDialectsFromSeed = true;
    } else {
      window.__salintayoDialectsFromSeed = false;
    }
    CHATS = pack.chats.slice();
    BUG_REPORTS = Array.isArray(pack.bugReports) ? pack.bugReports.slice() : [];
    FEEDBACK_ROWS = Array.isArray(pack.feedbackRows) ? pack.feedbackRows.slice() : [];
    enrichLocalUserDialectLabels();
    renderDashboard();
    renderUsers($('user-search') ? $('user-search').value : '');
    renderBugReports($('bug-report-search') ? $('bug-report-search').value : '');
    renderFeedback($('feedback-search') ? $('feedback-search').value : '');
  }

  /** Firestore snapshot updates (users + dialects + chats) without full page reload. */
  function applyLiveRealtimePayload(payload) {
    if (!payload || !Array.isArray(payload.users)) return;
    users = payload.users.slice();
    if (Array.isArray(payload.dialects)) {
      if (payload.dialects.length) {
        cultural = payload.dialects.slice();
        window.__salintayoDialectsFromSeed = false;
      } else {
        cultural = seedCulturalFallback();
        window.__salintayoDialectsFromSeed = true;
      }
    }
    if (Array.isArray(payload.chats)) {
      CHATS = payload.chats.slice();
    }
    if (Array.isArray(payload.bugReports)) {
      BUG_REPORTS = payload.bugReports.slice();
    }
    if (Array.isArray(payload.feedbackRows)) {
      FEEDBACK_ROWS = payload.feedbackRows.slice();
    }
    var lp = window.__salintayoLivePack;
    if (lp) {
      lp.users = users.slice();
      lp.dialects = cultural.slice();
      lp.chats = CHATS.slice();
      if (payload.analytics) lp.analytics = payload.analytics;
      if (Array.isArray(payload.bugReports)) lp.bugReports = BUG_REPORTS.slice();
      if (Array.isArray(payload.feedbackRows)) lp.feedbackRows = FEEDBACK_ROWS.slice();
    }
    enrichLocalUserDialectLabels();
    renderDashboard();
    renderUsers($('user-search') ? $('user-search').value : '');
    renderBugReports($('bug-report-search') ? $('bug-report-search').value : '');
    renderFeedback($('feedback-search') ? $('feedback-search').value : '');
  }

  function startUsersRealtimeSync() {
    var p = window.__salintayoLivePack;
    if (!isFirestoreLive || !p || !p.api) return;
    if (typeof unsubscribeUsersLive === 'function') {
      unsubscribeUsersLive();
      unsubscribeUsersLive = null;
    }
    if (p.api.subscribeLiveUpdates) {
      unsubscribeUsersLive = p.api.subscribeLiveUpdates(
        function (payload) {
          applyLiveRealtimePayload(payload);
        },
        function (e) {
          console.warn('Live sync:', e);
        }
      );
      return;
    }
    if (p.api.subscribeUsers) {
      unsubscribeUsersLive = p.api.subscribeUsers(
        function (payload) {
          if (!payload || !Array.isArray(payload.users)) return;
          users = payload.users.slice();
          if (window.__salintayoLivePack) {
            window.__salintayoLivePack.users = payload.users.slice();
            if (payload.analytics) window.__salintayoLivePack.analytics = payload.analytics;
          }
          renderUsers($('user-search') ? $('user-search').value : '');
          renderDashboard();
        },
        function (e) {
          console.warn('Users realtime sync:', e);
        }
      );
    }
  }

  function openUserModal(user, readOnly) {
    if (!user && !readOnly && isFirestoreLive) {
      toast(
        'New learners register in the SalinTayo app first. Edit their Firestore profile from the table.',
        'error'
      );
      return;
    }
    var title = readOnly ? 'User details' : user ? 'Edit user' : 'Add user';
    $('modal-title').textContent = title;
    var u = user || {
      id: 'uid_new_' + Date.now(),
      displayName: '',
      email: '',
      phone: '',
      bio: '',
      dialect: 'fil',
      status: 'active',
      lastActive: new Date().toISOString(),
    };
    var ro = readOnly ? 'readonly disabled' : '';

    var dialectCode =
      u.dialect && u.dialect !== '—' ? u.dialect : cultural[0] ? cultural[0].slug : 'fil';

    var readOnlyBlock = readOnly
      ? '<div class="form-row">' +
        '<div class="form-group"><label>Account status</label><p class="user-view-meta" style="margin:0;color:var(--color-text-secondary)">' +
        escapeHtml(formatStatusLabel(u.status)) +
        '</p></div>' +
        '<div class="form-group"><label>Last active</label><p class="user-view-meta" style="margin:0;color:var(--color-text-secondary)">' +
        formatDate(u.lastActive) +
        '</p></div>' +
        '<div class="form-group"><label>Learner dialect</label><p class="user-view-meta" style="margin:0;color:var(--color-text-secondary)">' +
        escapeHtml(u.dialectLabel || u.dialect || '—') +
        '</p></div></div>'
      : '';

    $('modal-body').innerHTML =
      '<div class="form-row">' +
      '<div class="form-group"><label>Display name</label><input class="admin-input" id="f_u_name" ' +
      ro +
      ' value="' +
      escapeAttr(u.displayName) +
      '" /></div>' +
      '<div class="form-group"><label>Email</label><input class="admin-input" id="f_u_email" type="email" ' +
      ro +
      ' value="' +
      escapeAttr(u.email) +
      '" /></div></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label>Phone</label><input class="admin-input" id="f_u_phone" ' +
      ro +
      ' value="' +
      escapeAttr(u.phone) +
      '" /></div>' +
      (readOnly
        ? '<div class="form-group"></div>'
        : '<div class="form-group"><label>Learner dialect</label><select class="admin-select" id="f_u_dialect">' +
          buildDialectOptionsHtml(dialectCode) +
          '</select></div>') +
      '</div>' +
      '<div class="form-group"><label>Bio</label><textarea class="admin-textarea" id="f_u_bio" ' +
      ro +
      '>' +
      escapeHtml(u.bio) +
      '</textarea></div>' +
      readOnlyBlock +
      (readOnly
        ? ''
        : '<div class="form-group"><label>Account status</label><select class="admin-select" id="f_u_status">' +
          '<option value="active"' +
          (u.status === 'active' ? ' selected' : '') +
          '>Active</option>' +
          '<option value="inactive"' +
          (u.status === 'inactive' ? ' selected' : '') +
          '>Inactive</option>' +
          '<option value="suspended"' +
          (u.status === 'suspended' ? ' selected' : '') +
          '>Suspended</option></select></div>');

    $('modal-footer').innerHTML = '';
    if (readOnly) {
      var canRemoveLearner =
        isFirestoreLive &&
        user &&
        window.__salintayoLivePack &&
        window.__salintayoLivePack.api &&
        typeof window.__salintayoLivePack.api.softDeleteUser === 'function';
      $('modal-footer').innerHTML =
        '<button type="button" class="admin-btn admin-btn--ghost" data-close-modal>Close</button>' +
        (canRemoveLearner
          ? '<button type="button" class="admin-btn admin-btn--danger" id="f_u_remove_learner">Remove from directory…</button>'
          : '');
      var removeLearner = $('f_u_remove_learner');
      if (removeLearner) {
        removeLearner.addEventListener('click', function () {
          if (
            !confirm(
              'Remove this learner from the admin directory?\n\n' +
                'Their Firestore profile will be marked deleted (hidden from this list and dashboard counts). ' +
                'The Firebase client SDK cannot delete another user’s sign-in account — to remove Authentication, delete that user in Firebase Console → Authentication (Spark/free tier is fine for Console).'
            )
          ) {
            return;
          }
          var actor =
            (function () {
              try {
                return sessionStorage.getItem(D.ADMIN_AUTH.displayUserKey) || 'admin';
              } catch (e) {
                return 'admin';
              }
            })();
          var p = window.__salintayoLivePack;
          if (!p || !p.api || !p.api.softDeleteUser) return;
          removeLearner.disabled = true;
          p.api
            .softDeleteUser(u.id)
            .then(function () {
              closeModal();
              toast('Learner removed from directory. Remove sign-in in Authentication console if needed.', 'success');
            })
            .catch(function (e) {
              removeLearner.disabled = false;
              toast(e.message || 'Remove failed', 'error');
            });
        });
      }
    } else {
      $('modal-footer').innerHTML =
        '<button type="button" class="admin-btn admin-btn--ghost" data-close-modal>Cancel</button>' +
        '<button type="button" class="admin-btn admin-btn--primary" id="f_u_save">Save</button>';
      $('f_u_save').addEventListener('click', function () {
        var dialectVal = $('f_u_dialect') ? $('f_u_dialect').value.trim() || 'fil' : 'fil';
        var payload = {
          id: u.id,
          displayName: $('f_u_name').value.trim(),
          email: $('f_u_email').value.trim(),
          phone: $('f_u_phone').value.trim(),
          bio: $('f_u_bio').value.trim(),
          dialect: dialectVal,
          status: $('f_u_status').value,
          lastActive: u.lastActive,
        };
        if (!payload.displayName || !payload.email) {
          toast('Name and email required', 'error');
          return;
        }
        var actor =
          (function () {
            try {
              return sessionStorage.getItem(D.ADMIN_AUTH.displayUserKey) || 'admin';
            } catch (e) {
              return 'admin';
            }
          })();
        var p = window.__salintayoLivePack;
        if (isFirestoreLive && p && p.api) {
          var idx0 = users.findIndex(function (x) {
            return x.id === u.id;
          });
          if (idx0 < 0) {
            toast('Unknown user', 'error');
            return;
          }
          p.api
            .saveUser(payload)
            .then(function () {
              return p.api.reload();
            })
            .then(function (fresh) {
              applyLivePack(fresh);
              closeModal();
              toast('Saved to Firestore', 'success');
            })
            .catch(function (e) {
              toast(e.message || 'Save failed', 'error');
            });
          return;
        }
        var idx = users.findIndex(function (x) {
          return x.id === u.id;
        });
        if (idx >= 0) users[idx] = payload;
        else {
          payload.lastActive = new Date().toISOString();
          users.push(payload);
        }
        closeModal();
        renderUsers($('user-search').value);
        toast('User saved (demo)', 'success');
      });
    }
    openModal();
    bindModalClose();
  }

  /* ——— Bug reports & app feedback (Firestore) ——— */
  var BUG_REPORTS = [];
  var FEEDBACK_ROWS = [];

  function renderBugReports(filter) {
    var tbody = $('bug-reports-tbody');
    if (!tbody) return;
    var q = (filter || '').toLowerCase().trim();
    var rows = BUG_REPORTS.filter(function (r) {
      if (!q) return true;
      var blob =
        (r.userEmail || '') +
        ' ' +
        (r.userName || '') +
        ' ' +
        (r.bugType || '') +
        ' ' +
        (r.description || '') +
        ' ' +
        (r.platform || '');
      return blob.toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5"><div class="empty-state"><strong>No bug reports yet</strong>' +
        (isFirestoreLive
          ? ' Submissions appear when learners use Help → Report a Bug in the app.'
          : ' Connect Firebase to load data.') +
        '</div></td></tr>';
      var bm = $('bug-reports-meta');
      if (bm) bm.textContent = q ? '0 matches' : '0 reports';
      return;
    }
    tbody.innerHTML = rows
      .map(function (r) {
        var who = escapeHtml(r.userName || r.userEmail || r.userId || '—');
        var emailLine = r.userEmail
          ? '<br/><span style="color:var(--color-text-muted);font-size:12px">' + escapeHtml(r.userEmail) + '</span>'
          : '';
        var desc = escapeHtml((r.description || '').slice(0, 500));
        if ((r.description || '').length > 500) desc += '…';
        return (
          '<tr><td>' +
          formatDate(r.createdAt) +
          '</td><td>' +
          who +
          emailLine +
          '</td><td><span class="badge badge--muted">' +
          escapeHtml(r.bugType || '—') +
          '</span></td><td>' +
          escapeHtml(r.platform || '—') +
          '</td><td style="max-width:280px;white-space:normal;font-size:13px;line-height:1.45">' +
          desc +
          '</td></tr>'
        );
      })
      .join('');
    var bm = $('bug-reports-meta');
    if (bm) bm.textContent = rows.length + (rows.length === 1 ? ' report' : ' reports');
  }

  function renderFeedback(filter) {
    var tbody = $('feedback-tbody');
    if (!tbody) return;
    var q = (filter || '').toLowerCase().trim();
    var rows = FEEDBACK_ROWS.filter(function (r) {
      if (!q) return true;
      var blob =
        (r.userEmail || '') +
        ' ' +
        (r.userName || '') +
        ' ' +
        (r.comment || '') +
        ' ' +
        String(r.rating != null ? r.rating : '');
      return blob.toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5"><div class="empty-state"><strong>No feedback yet</strong>' +
        (isFirestoreLive
          ? ' Ratings appear when learners use Help → Rate SalinTayo in the app.'
          : ' Connect Firebase to load data.') +
        '</div></td></tr>';
      var fm = $('feedback-meta');
      if (fm) fm.textContent = q ? '0 matches' : '0 entries';
      return;
    }
    tbody.innerHTML = rows
      .map(function (r) {
        var who = escapeHtml(r.userName || r.userEmail || r.userId || '—');
        var emailLine = r.userEmail
          ? '<br/><span style="color:var(--color-text-muted);font-size:12px">' + escapeHtml(r.userEmail) + '</span>'
          : '';
        var stars =
          typeof r.rating === 'number'
            ? '<span title="' +
              escapeAttr(String(r.rating)) +
              '/5">' +
              '★'.repeat(Math.min(5, Math.max(0, r.rating))) +
              '</span>'
            : '—';
        var comm = escapeHtml((r.comment || '').slice(0, 500));
        if ((r.comment || '').length > 500) comm += '…';
        return (
          '<tr><td>' +
          formatDate(r.createdAt) +
          '</td><td>' +
          who +
          emailLine +
          '</td><td>' +
          stars +
          '</td><td>' +
          escapeHtml(r.platform || '—') +
          '</td><td style="max-width:280px;white-space:normal;font-size:13px;line-height:1.45">' +
          comm +
          '</td></tr>'
        );
      })
      .join('');
    var fm = $('feedback-meta');
    if (fm) fm.textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');
  }

  /* ——— Chats (populated from backend / API when wired) ——— */
  var CHATS = [];

  var selectedChatId = null;

  function chatInitials(name) {
    var parts = (name || '').trim().split(/\s+/);
    var s = '';
    for (var i = 0; i < parts.length && i < 2; i++) s += parts[i].charAt(0) || '';
    return (s || '?').toUpperCase();
  }

  function relativeChatTime(iso) {
    try {
      var d = new Date(iso);
      var diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    } catch (e) {
      return iso;
    }
  }

  function renderChatList(filter) {
    var q = (filter || '').toLowerCase().trim();
    var list = CHATS.filter(function (c) {
      if (!q) return true;
      return (
        (c.userName && c.userName.toLowerCase().indexOf(q) >= 0) ||
        (c.userEmail && c.userEmail.toLowerCase().indexOf(q) >= 0) ||
        (c.userId && c.userId.toLowerCase().indexOf(q) >= 0) ||
        (c.lastMessage && c.lastMessage.toLowerCase().indexOf(q) >= 0)
      );
    });
    var meta = $('chats-meta');
    if (meta) meta.textContent = list.length + (list.length === 1 ? ' conversation' : ' conversations');

    var host = $('chats-list');
    if (!host) return;

    if (!list.length) {
      host.innerHTML =
        CHATS.length === 0
          ? '<div class="empty-state" style="margin:12px"><strong>No synced chats yet</strong><p style="margin:8px 0 0;font-size:13px;line-height:1.5">Learners must be signed into the SalinTayo app. Chat sessions sync to Firestore within a few seconds after they use Chat.</p></div>'
          : '<div class="empty-state" style="margin:12px"><strong>No chats match</strong>Try a different search.</div>';
      return;
    }

    host.innerHTML = list
      .map(function (c) {
        var sel = selectedChatId === c.id ? ' is-selected' : '';
        return (
          '<button type="button" class="chat-row' +
          sel +
          '" data-chat-id="' +
          escapeAttr(c.id) +
          '">' +
          '<span class="chat-row__avatar" style="background:' +
          c.color +
          '22;border:1.5px solid ' +
          c.color +
          '44;color:' +
          c.color +
          '">' +
          chatInitials(c.userName) +
          '</span>' +
          '<div class="chat-row__main">' +
          '<div class="chat-row__top"><span class="chat-row__name">' +
          escapeHtml(c.userName) +
          '</span>' +
          '<span class="chat-row__time">' +
          relativeChatTime(c.lastAt) +
          '</span></div>' +
          '<div class="chat-row__preview">' +
          escapeHtml(c.lastMessage) +
          '</div>' +
          '<div class="chat-row__meta">💬 ' +
          c.messageCount +
          (c.imagesSent ? ' · 🖼 ' + c.imagesSent : '') +
          (c.voiceMessages ? ' · 🎤 ' + c.voiceMessages : '') +
          '</div>' +
          '</div></button>'
        );
      })
      .join('');

    host.querySelectorAll('.chat-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedChatId = btn.getAttribute('data-chat-id');
        renderChatList($('chat-search') ? $('chat-search').value : '');
        renderChatDetail();
      });
    });
  }

  function chatMessageBodyText(m) {
    if (!m || m.content == null) return '';
    if (typeof m.content === 'string') return m.content;
    try {
      return JSON.stringify(m.content, null, 2);
    } catch (e) {
      return String(m.content);
    }
  }

  function buildChatMessagesModalHtml(messages) {
    if (!messages || !messages.length) {
      return (
        '<p class="page-meta" style="margin:0">No messages are stored for this session.</p>'
      );
    }
    return (
      '<div class="chat-messages-modal">' +
      messages
        .map(function (m) {
          var roleKey = String(m.role || '').toLowerCase();
          var mod =
            roleKey === 'user'
              ? 'chat-msg--user'
              : roleKey === 'assistant'
                ? 'chat-msg--assistant'
                : '';
          var text = chatMessageBodyText(m);
          return (
            '<div class="chat-msg' +
            (mod ? ' ' + mod : '') +
            '"><span class="chat-msg__role">' +
            escapeHtml(m.role || 'message') +
            '</span><div class="chat-msg__text">' +
            escapeHtml(text) +
            '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function openChatMessagesModal(chat) {
    if (!chat) return;
    var root = $('modal-root');
    if (root) {
      root.classList.add('modal--wide', 'modal--chat-transcript');
    }
    $('modal-title').textContent =
      'Messages · ' + (chat.userName || chat.userEmail || 'Chat session');
    $('modal-footer').innerHTML =
      '<button type="button" class="admin-btn admin-btn--ghost" data-close-modal>Close</button>';

    var p = window.__salintayoLivePack;
    var needFetch =
      chat._messagesTruncated &&
      p &&
      p.api &&
      typeof p.api.fetchChatSessionFull === 'function' &&
      (!chat.messages || !chat.messages.length);

    if (needFetch) {
      $('modal-body').innerHTML =
        '<p class="page-meta" style="margin:0">Loading messages…</p>';
      openModal();
      bindModalClose();
      p.api
        .fetchChatSessionFull(chat.id)
        .then(function (full) {
          var ix = CHATS.findIndex(function (x) {
            return x.id === chat.id;
          });
          if (ix >= 0) CHATS[ix] = full;
          $('modal-body').innerHTML = buildChatMessagesModalHtml(full.messages || []);
        })
        .catch(function (e) {
          $('modal-body').innerHTML =
            '<p class="page-meta" style="margin:0;color:var(--color-danger)">' +
            escapeHtml(e.message || 'Failed to load messages') +
            '</p>';
        });
      return;
    }

    $('modal-body').innerHTML = buildChatMessagesModalHtml(chat.messages || []);
    openModal();
    bindModalClose();
  }

  function deleteChatSession(chat) {
    if (!chat || !confirm('Delete this chat session from Firestore?')) return;
    var actor =
      (function () {
        try {
          return sessionStorage.getItem(D.ADMIN_AUTH.displayUserKey) || 'admin';
        } catch (e) {
          return 'admin';
        }
      })();
    var p = window.__salintayoLivePack;
    if (isFirestoreLive && p && p.api && p.api.deleteChatSession) {
      p.api
        .deleteChatSession(chat.id)
        .then(function () {
          return p.api.reload();
        })
        .then(function (fresh) {
          applyLivePack(fresh);
          selectedChatId = CHATS[0] ? CHATS[0].id : null;
          renderChatList($('chat-search') ? $('chat-search').value : '');
          renderChatDetail();
          logActivity(actor, 'chat.delete', chat.id, chat.userEmail || chat.userName || '');
          toast('Chat session removed', 'success');
        })
        .catch(function (e) {
          toast(e.message || 'Delete failed', 'error');
        });
    }
  }

  function renderChatDetail() {
    var empty = $('chat-detail-empty');
    var body = $('chat-detail-body');
    if (!empty || !body) return;
    var c = CHATS.find(function (x) {
      return x.id === selectedChatId;
    });
    if (!c) {
      empty.hidden = false;
      body.hidden = true;
      body.innerHTML = '';
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    var actions =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
      '<button type="button" class="admin-btn admin-btn--sm" id="btn-chat-view-json" style="background:var(--color-background-tertiary)">View messages</button>' +
      '<button type="button" class="admin-btn admin-btn--sm admin-btn-link--danger" id="btn-chat-del">Delete</button>' +
      '</div>';
    var msgPreview = '';
    if (c.messages && c.messages.length) {
      var lastFew = c.messages.slice(-5);
      msgPreview =
        '<div style="margin-top:12px;font-size:12px;color:var(--color-text-secondary)"><strong>Recent messages</strong></div><ul style="margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.5">';
      lastFew.forEach(function (m) {
        msgPreview +=
          '<li><strong>' +
          escapeHtml(m.role || '') +
          ':</strong> ' +
          escapeHtml((m.content || '').slice(0, 200)) +
          '</li>';
      });
      msgPreview += '</ul>';
    }
    body.innerHTML =
      actions +
      '<h3 class="panel__title" style="margin:0 0 12px">Chat session</h3>' +
      '<dl class="chat-detail-block">' +
      '<dt>User</dt><dd>' +
      escapeHtml(c.userName) +
      (c.userEmail ? ' · ' + escapeHtml(c.userEmail) : '') +
      '</dd>' +
      '<dt>User ID</dt><dd>' +
      escapeHtml(c.userId || '—') +
      '</dd>' +
      '<dt>Dialect</dt><dd>' +
      escapeHtml(c.dialectLabel) +
      '</dd>' +
      '<dt>Messages</dt><dd>' +
      c.messageCount +
      '</dd>' +
      '<dt>Last activity</dt><dd>' +
      escapeHtml(formatDate(c.lastAt)) +
      ' (' +
      escapeHtml(relativeChatTime(c.lastAt)) +
      ')</dd>' +
      '</dl>' +
      '<div class="chat-detail-quote">Last: "' +
      escapeHtml(c.lastMessage) +
      '"</div>' +
      msgPreview;

    var delBtn = $('btn-chat-del');
    if (delBtn) {
      delBtn.onclick = function () {
        deleteChatSession(c);
      };
    }
    var vj = $('btn-chat-view-json');
    if (vj) {
      vj.onclick = function () {
        openChatMessagesModal(c);
      };
    }
  }

  function renderChat() {
    var live = window.__salintayoLivePack && window.__salintayoLivePack.analytics;
    var hint = 'Connect your analytics API';
    var threads = live && live.chatThreads != null ? String(live.chatThreads) : '—';
    var msgs = live && live.totalMessages != null ? String(live.totalMessages) : '—';
    var vtot = live && live.voiceMessagesTotal != null ? String(live.voiceMessagesTotal) : '—';
    var itot = live && live.imagesSentTotal != null ? String(live.imagesSentTotal) : '—';
    $('chat-stats').innerHTML =
      '<div class="stat-card"><span class="stat-card__label">Chat sessions</span>' +
      '<div class="stat-card__value-row"><span class="stat-card__value">' +
      threads +
      '</span></div>' +
      '<span class="stat-card__hint">' +
      (live && live.source === 'firestore' ? 'Firestore chatSessions documents' : hint) +
      '</span></div>' +
      '<div class="stat-card"><span class="stat-card__label">Total messages (stored)</span>' +
      '<div class="stat-card__value-row"><span class="stat-card__value">' +
      msgs +
      '</span></div>' +
      '<span class="stat-card__hint">' +
      (live && live.source === 'firestore' ? 'Sum of messageCount' : hint) +
      '</span></div>' +
      '<div class="stat-card"><span class="stat-card__label">Voice messages</span>' +
      '<div class="stat-card__value-row"><span class="stat-card__value">' +
      vtot +
      '</span></div>' +
      '<span class="stat-card__hint">' +
      (live ? 'Sum across sessions' : hint) +
      '</span></div>' +
      '<div class="stat-card"><span class="stat-card__label">Images sent</span>' +
      '<div class="stat-card__value-row"><span class="stat-card__value">' +
      itot +
      '</span></div>' +
      '<span class="stat-card__hint">' +
      (live ? 'Sum across sessions' : hint) +
      '</span></div>';

    $('chat-checklist').innerHTML =
      '<li>Chats are created in the learner app; this page is read-only except <strong>Delete</strong> (moderation).</li>' +
      '<li>Deploy updated <code>firestore.rules</code> from the app repo so learners can sync their own <code>chatSessions</code> documents.</li>';

    var chBanner = $('chat-empty-banner');
    if (chBanner) {
      chBanner.hidden = !(isFirestoreLive && (!CHATS || !CHATS.length));
    }

    selectedChatId = CHATS[0] ? CHATS[0].id : null;
    renderChatList('');
    renderChatDetail();
  }

  /* ——— Settings ——— */
  function renderSettingsForm() {
    var s = loadSettings();
    $('cfg-functions-url').value = s.functionsBaseUrl || '';
    $('cfg-logic-url').value = s.logicServiceUrl || '';

    var toggles = [
      { key: 'chatEnabled', label: 'AI chat available to learners' },
      { key: 'whisperEnabled', label: 'Voice transcription (Whisper) enabled' },
      { key: 'registrationOpen', label: 'Allow new sign-ups' },
      { key: 'maintenanceMode', label: 'Maintenance mode (read-only app)' },
    ];

    $('settings-toggles').innerHTML = toggles
      .map(function (t) {
        var on = s[t.key] ? ' checked' : '';
        return (
          '<div class="toggle-row">' +
          '<div><strong>' +
          escapeHtml(t.label) +
          '</strong><br /><span style="font-size:0.8rem;color:var(--color-text-muted)">' +
          t.key +
          '</span></div>' +
          '<label class="toggle">' +
          '<input type="checkbox" data-settings-key="' +
          t.key +
          '"' +
          on +
          ' />' +
          '<span class="toggle__slider"></span></label></div>'
        );
      })
      .join('');
  }

  function saveSettingsClick() {
    var s = loadSettings();
    s.functionsBaseUrl = $('cfg-functions-url').value.trim();
    s.logicServiceUrl = $('cfg-logic-url').value.trim();
    document.querySelectorAll('[data-settings-key]').forEach(function (inp) {
      s[inp.getAttribute('data-settings-key')] = inp.checked;
    });
    saveSettings(s);
    logActivity('admin@salintayo.com', 'settings.save', 'config', 'URLs + flags');
    toast('Settings saved locally', 'success');
  }

  /* ——— Activity ——— */
  function renderActivity() {
    var tbody = $('activity-tbody');
    if (!tbody) return;
    if (!activityLog.length) {
      tbody.innerHTML =
        '<tr><td colspan="5"><div class="empty-state"><strong>No activity recorded</strong>Entries will appear here when you wire an audit log or perform admin actions in this session.</div></td></tr>';
      return;
    }
    tbody.innerHTML = activityLog
      .map(function (a) {
        return (
          '<tr><td>' +
          formatDate(a.time) +
          '</td><td>' +
          escapeHtml(a.actor) +
          '</td><td><code>' +
          escapeHtml(a.action) +
          '</code></td><td>' +
          escapeHtml(a.target) +
          '</td><td>' +
          escapeHtml(a.details) +
          '</td></tr>'
        );
      })
      .join('');
  }

  /* ——— Modal ——— */
  function openModal() {
    var o = $('modal-overlay');
    o.classList.add('is-open');
    o.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    var o = $('modal-overlay');
    o.classList.remove('is-open');
    o.setAttribute('aria-hidden', 'true');
    var root = $('modal-root');
    if (root) {
      root.classList.remove('modal--wide', 'modal--chat-transcript');
    }
  }

  function bindModalClose() {
    $('modal-close').onclick = closeModal;
    document.querySelectorAll('[data-close-modal]').forEach(function (b) {
      b.addEventListener('click', closeModal);
    });
    $('modal-overlay').onclick = function (e) {
      if (e.target === $('modal-overlay')) closeModal();
    };
  }

  /* ——— Init ——— */
  function init() {
    var auth = D.ADMIN_AUTH;
    try {
      if (sessionStorage.getItem(auth.sessionStorageKey) !== auth.sessionMarker) {
        var ret = 'index.html';
        window.location.replace('login.html?return=' + encodeURIComponent(ret));
        return;
      }
    } catch (e) {
      window.location.replace('login.html');
      return;
    }

    function finishInit() {
      els.toast = $('toast');
      els.app = $('admin-app');

      bindNav();
      $('menu-toggle').addEventListener('click', function () {
        els.app.classList.toggle('drawer-open');
      });
      $('sidebar-backdrop').addEventListener('click', function () {
        els.app.classList.remove('drawer-open');
      });

      $('user-search').addEventListener('input', function () {
        renderUsers(this.value);
      });

      $('btn-save-settings').addEventListener('click', saveSettingsClick);
      $('btn-logout').addEventListener('click', function () {
        var afterServer = function () {
          return import(jsModuleUrl('firebase-auth-helpers.js'))
            .then(function (m) {
              return m.signOutFirebase();
            })
            .catch(function () {});
        };
        Api.logout()
          .catch(function () {})
          .then(afterServer)
          .then(function () {
            try {
              sessionStorage.removeItem(D.ADMIN_AUTH.sessionStorageKey);
              sessionStorage.removeItem(D.ADMIN_AUTH.displayUserKey);
              sessionStorage.removeItem(D.ADMIN_AUTH.localGateSessionKey || 'salintayo_admin_local_gate');
            } catch (e) {}
            var next = (D.ADMIN_LOGOUT_REDIRECT || '').trim();
            window.location.replace(next || 'login.html?signed_out=1');
          });
      });

      var s = loadSettings();
      var sessionUser = '';
      try {
        sessionUser = sessionStorage.getItem(D.ADMIN_AUTH.displayUserKey) || '';
      } catch (e) {}
      var displayName = s.adminDisplayName || sessionUser || 'Admin';
      $('admin-name').textContent = displayName;
      $('admin-avatar').textContent = displayName.charAt(0).toUpperCase();

      var pill = document.querySelector('.admin-status-pill');
      if (pill) {
        if (isFirestoreLive) {
          pill.textContent = 'Live · Firestore';
        } else if (D.APP_FIRESTORE && D.APP_FIRESTORE.enabled) {
          pill.textContent = 'Firestore blocked — rules / admin sign-in';
        } else {
          pill.textContent = 'Demo · local session';
        }
      }

      renderDashboard();
      renderUsers('');
      renderChat();
      renderSettingsForm();
      renderActivity();
      renderBugReports('');
      renderFeedback('');

      var bugSearch = $('bug-report-search');
      if (bugSearch) {
        bugSearch.addEventListener('input', function () {
          renderBugReports(this.value);
        });
      }
      var feedbackSearch = $('feedback-search');
      if (feedbackSearch) {
        feedbackSearch.addEventListener('input', function () {
          renderFeedback(this.value);
        });
      }

      var chatSearch = $('chat-search');
      if (chatSearch) {
        chatSearch.addEventListener('input', function () {
          renderChatList(this.value);
        });
      }

      startUsersRealtimeSync();

      var fp = window.__salintayoLivePack;
      if (D.APP_FIRESTORE && D.APP_FIRESTORE.enabled && fp && fp.error) {
        toast(
          'Firestore: ' +
            (fp.error.code || fp.error.message || 'permission or network') +
            '. Deploy firestore.rules (npm run deploy:firestore), add Firestore doc admins/{your Auth UID}, and sign in with Firebase email/password.',
          'error'
        );
      }
    }

    if (D.APP_FIRESTORE && D.APP_FIRESTORE.enabled) {
      import(jsModuleUrl('app-firestore.js'))
        .then(function (m) {
          return m.bootstrapFirestore(D.APP_FIRESTORE);
        })
        .then(function (pack) {
          applyLivePack(pack);
          finishInit();
        })
        .catch(function (e) {
          window.__salintayoLivePack = { error: e, users: [], dialects: [], chats: [], api: null };
          applyLivePack(window.__salintayoLivePack);
          finishInit();
        });
      return;
    }

    finishInit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', function () {
    if (typeof unsubscribeUsersLive === 'function') unsubscribeUsersLive();
    unsubscribeUsersLive = null;
  });
})();
