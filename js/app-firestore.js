/**
 * Load / update SalinTayo learner data (Firestore) — same project as salintayo-app.
 */
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

/** Firestore profile hidden from admin list + analytics (soft delete). */
function isProfileHidden(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.deleted === true) return true;
  if (d.accountStatus === 'deleted') return true;
  return false;
}

function normalizeDate(v) {
  if (v == null || v === '') return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && v.seconds != null) return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeYmdArray(arr) {
  if (!Array.isArray(arr)) return [];
  var out = [];
  var seen = {};
  arr.forEach(function (ymd) {
    if (typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !seen[ymd]) {
      seen[ymd] = true;
      out.push(ymd);
    }
  });
  return out.sort();
}

/** Salintayo-app writes streakCount / loginStreak; legacy admin seed may use streak. */
function mapStreakFromProfile(d) {
  if (typeof d.streakCount === 'number' && !isNaN(d.streakCount)) {
    return Math.max(0, Math.floor(d.streakCount));
  }
  if (typeof d.loginStreak === 'number' && !isNaN(d.loginStreak)) {
    return Math.max(0, Math.floor(d.loginStreak));
  }
  if (typeof d.streak === 'number' && !isNaN(d.streak)) {
    return Math.max(0, Math.floor(d.streak));
  }
  return null;
}

/** Merge learn + login activity day keys from salintayo-app user profiles. */
function mergeActivityDates(d) {
  return normalizeYmdArray([].concat(d.learnActivityDates || [], d.loginActivityDates || []));
}

function bestLastActiveIso(d) {
  var times = [];
  var la = normalizeDate(d.lastActive);
  if (la) times.push(la.getTime());
  mergeActivityDates(d).forEach(function (ymd) {
    times.push(new Date(ymd + 'T12:00:00.000Z').getTime());
  });
  if (!times.length) return new Date(0).toISOString();
  return new Date(Math.max.apply(null, times)).toISOString();
}

function mapUserStatus(d) {
  if (d.status === 'suspended') return 'suspended';
  if (d.status === 'inactive' || d.accountStatus === 'inactive') return 'inactive';
  return 'active';
}

/** @returns {object | null} Null when profile is soft-deleted / hidden from admin. */
function mapUserDoc(id, d) {
  if (isProfileHidden(d)) return null;
  var createdNorm = normalizeDate(d.createdAt);
  return {
    id: id,
    displayName: d.displayName || '',
    email: d.email || '',
    phone: d.phone || '',
    bio: d.bio || '',
    dialect: d.languageCode || d.dialect || '—',
    dialectLabel: '',
    status: mapUserStatus(d),
    lastActive: bestLastActiveIso(d),
    createdAt: createdNorm ? createdNorm.toISOString() : null,
    streak: mapStreakFromProfile(d),
    learnActivityDates: mergeActivityDates(d),
  };
}

function enrichUsersDialectLabels(users, dialectRows) {
  var map = {};
  (dialectRows || []).forEach(function (row) {
    map[row.slug] = row.title + ' · ' + row.dialect;
  });
  users.forEach(function (u) {
    var code = u.dialect;
    u.dialectLabel = map[code] || code;
  });
}

function mapDialectDoc(id, d) {
  return {
    slug: id,
    title: d.title || d.name || id,
    dialect: d.dialect || d.native || '',
    speakers: d.speakers || '',
    visible: d.visible !== false,
    gradient: d.gradient || '',
    order: typeof d.order === 'number' ? d.order : 999,
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} d
 * @param {{ includeMessages?: boolean }} [opts] List views omit message bodies for speed / memory.
 */
function mapChatDoc(id, d, opts) {
  opts = opts || {};
  var includeMessages = opts.includeMessages === true;
  var lastAt = d.lastAt;
  if (lastAt && typeof lastAt.toDate === 'function') {
    lastAt = lastAt.toDate().toISOString();
  } else if (typeof lastAt !== 'string') {
    lastAt = new Date().toISOString();
  }
  var rawMessages = Array.isArray(d.messages) ? d.messages : [];
  return {
    id: id,
    userId: d.userId || '',
    userName: d.userName || d.userEmail || 'Learner',
    userEmail: d.userEmail || '',
    lastMessage: d.lastMessage || '',
    lastAt: lastAt,
    messageCount: typeof d.messageCount === 'number' ? d.messageCount : rawMessages.length,
    color: d.color || '#1d6ef7',
    dialectLabel: d.dialectLabel || '—',
    imagesSent: d.imagesSent || 0,
    voiceMessages: d.voiceMessages || 0,
    messages: includeMessages ? rawMessages : [],
    _messagesTruncated: !includeMessages && rawMessages.length > 0,
  };
}

function todayYmd() {
  var x = new Date();
  var m = String(x.getMonth() + 1);
  var day = String(x.getDate());
  return x.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
}

function computeAnalytics(users, chats) {
  var td = todayYmd();
  var activeToday = 0;
  var streakSum = 0;
  var streakN = 0;
    var inactiveUsers = 0;
  users.forEach(function (u) {
    if (u.learnActivityDates && u.learnActivityDates.indexOf(td) >= 0) activeToday++;
    if (typeof u.streak === 'number') {
      streakSum += u.streak;
      streakN++;
    }
    if (u.status === 'inactive' || u.status === 'suspended') inactiveUsers++;
  });
  var totalMessages = 0;
  var voiceTotal = 0;
  var imageTotal = 0;
  chats.forEach(function (c) {
    totalMessages += c.messageCount || 0;
    voiceTotal += c.voiceMessages || 0;
    imageTotal += c.imagesSent || 0;
  });
  var dialectCounts = {};
  users.forEach(function (u) {
    var k = u.dialectLabel || u.dialect || '—';
    dialectCounts[k] = (dialectCounts[k] || 0) + 1;
  });
  return {
    source: 'firestore',
    totalUsers: users.length,
    activeToday: activeToday,
    inactiveUsers: inactiveUsers,
    totalMessages: totalMessages,
    avgStreak: streakN ? streakSum / streakN : null,
    dialectCounts: dialectCounts,
    chatThreads: chats.length,
    voiceMessagesTotal: voiceTotal,
    imagesSentTotal: imageTotal,
  };
}

function mapActivityDoc(id, d) {
  var t = d.time;
  var iso;
  if (t && typeof t.toDate === 'function') iso = t.toDate().toISOString();
  else if (typeof d.time === 'string') iso = d.time;
  else iso = new Date().toISOString();
  return {
    id: id,
    time: iso,
    actor: d.actor || '',
    action: d.action || '',
    target: d.target || '',
    details: d.details || '',
  };
}

function isoFromCreatedField(d) {
  var c = d.createdAt;
  var n = normalizeDate(c);
  if (n) return n.toISOString();
  return new Date(0).toISOString();
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} d
 */
function mapBugReportDoc(id, d) {
  return {
    id: id,
    userId: d.userId || id,
    userEmail: d.userEmail || '',
    userName: d.userName || '',
    bugType: d.bugType || '',
    description: d.description || '',
    platform: d.platform || '',
    createdAt: isoFromCreatedField(d),
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} d
 */
function mapAppFeedbackDoc(id, d) {
  return {
    id: id,
    userId: d.userId || id,
    userEmail: d.userEmail || '',
    userName: d.userName || '',
    rating: typeof d.rating === 'number' ? d.rating : null,
    comment: d.comment || '',
    platform: d.platform || '',
    createdAt: isoFromCreatedField(d),
  };
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} col
 */
async function loadBugReportsCollection(db, col) {
  var snap = await getDocs(collection(db, col));
  var rows = [];
  snap.forEach(function (s) {
    rows.push(mapBugReportDoc(s.id, s.data()));
  });
  rows.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return rows;
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} col
 */
async function loadAppFeedbackCollection(db, col) {
  var snap = await getDocs(collection(db, col));
  var rows = [];
  snap.forEach(function (s) {
    rows.push(mapAppFeedbackDoc(s.id, s.data()));
  });
  rows.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return rows;
}

/** Max chat session docs to keep in memory (newest first). Full transcripts load on demand. */
var CHAT_LIST_LIMIT = 150;

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} dCol
 */
async function loadDialects(db, dCol) {
  var dSnap = await getDocs(collection(db, dCol));
  var dialects = [];
  dSnap.forEach(function (s) {
    dialects.push(mapDialectDoc(s.id, s.data()));
  });
  dialects.sort(function (a, b) {
    return (a.order || 0) - (b.order || 0) || a.slug.localeCompare(b.slug);
  });
  return dialects;
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} cCol
 */
async function loadChatsLimited(db, cCol) {
  try {
    var q = query(collection(db, cCol), orderBy('lastAt', 'desc'), limit(CHAT_LIST_LIMIT));
    var cSnap = await getDocs(q);
    var chats = [];
    cSnap.forEach(function (s) {
      chats.push(mapChatDoc(s.id, s.data(), { includeMessages: false }));
    });
    return chats;
  } catch (e) {
    console.warn('SalinTayo: chatSessions orderBy query failed, using scan + trim:', e);
    var cSnap = await getDocs(collection(db, cCol));
    var all = [];
    cSnap.forEach(function (s) {
      all.push(mapChatDoc(s.id, s.data(), { includeMessages: false }));
    });
    all.sort(function (a, b) {
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });
    return all.slice(0, CHAT_LIST_LIMIT);
  }
}

/**
 * Try candidate collection names in order; stop at the first non-empty (minimizes Firestore reads).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string[]} names
 */
async function discoverUsersCollection(db, names) {
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var snap = await getDocs(collection(db, name));
    if (snap.size === 0) continue;
    var loaded = [];
    snap.forEach(function (s) {
      var m = mapUserDoc(s.id, s.data());
      if (m) loaded.push(m);
    });
    return { users: loaded, userCollection: name };
  }
  return { users: [], userCollection: names[0] || 'users' };
}

/** @param {Record<string, unknown>} cfg */
export async function bootstrapFirestore(cfg) {
  var uCol = cfg.usersCollection || 'users';
  var dCol = cfg.dialectsCollection || 'dialects';
  var cCol = cfg.chatSessionsCollection || 'chatSessions';
  var aCol = cfg.adminActivityCollection || 'adminActivity';
  var bCol = cfg.bugReportsCollection || 'bugReports';
  var fbCol = cfg.appFeedbackCollection || 'appFeedback';

  var out = {
    users: [],
    dialects: [],
    chats: [],
    activity: [],
    bugReports: [],
    feedbackRows: [],
    analytics: null,
    api: null,
    error: null,
    userCollection: uCol,
  };

  try {
    var userCollectionsToTry = [uCol, 'userProfiles', 'profiles', 'Users'].filter(function (name, idx, arr) {
      return !!name && arr.indexOf(name) === idx;
    });
    var discovered = await discoverUsersCollection(db, userCollectionsToTry);
    out.users = discovered.users;
    out.userCollection = discovered.userCollection;

    var dialectsP = loadDialects(db, dCol);
    var chatsP = loadChatsLimited(db, cCol);
    var activityP = (async function () {
      var rows = [];
      try {
        var actQ = query(collection(db, aCol), orderBy('time', 'desc'), limit(150));
        var aSnap = await getDocs(actQ);
        aSnap.forEach(function (s) {
          rows.push(mapActivityDoc(s.id, s.data()));
        });
      } catch (actErr) {
        console.warn('SalinTayo: adminActivity load (add index if needed):', actErr);
      }
      return rows;
    })();

    var bugP = loadBugReportsCollection(db, bCol).catch(function (e) {
      console.warn('SalinTayo: bugReports load:', e);
      return [];
    });
    var feedbackP = loadAppFeedbackCollection(db, fbCol).catch(function (e) {
      console.warn('SalinTayo: appFeedback load:', e);
      return [];
    });

    var results = await Promise.all([dialectsP, chatsP, activityP, bugP, feedbackP]);
    out.dialects = results[0];
    out.chats = results[1];
    out.activity = results[2];
    out.bugReports = results[3];
    out.feedbackRows = results[4];

    enrichUsersDialectLabels(out.users, out.dialects);

    out.analytics = computeAnalytics(out.users, out.chats);

    out.api = {
      saveUser: function (payload) {
        var ref = doc(db, out.userCollection || uCol, payload.id);
        var st = payload.status || 'active';
        if (st !== 'active' && st !== 'inactive' && st !== 'suspended') st = 'active';
        return updateDoc(ref, {
          displayName: payload.displayName,
          phone: payload.phone,
          bio: payload.bio,
          languageCode: payload.dialect,
          status: st,
          lastActive: Timestamp.now(),
        });
      },
      /** Hard-delete the Firestore profile document (document removed). */
      deleteUser: function (id) {
        return deleteDoc(doc(db, out.userCollection || uCol, id));
      },
      /**
       * Soft-delete: keeps the document but marks it removed. Hidden from Users + dashboard via
       * `mapUserDoc` + `onSnapshot`. Does not delete Firebase Authentication (not possible for
       * other users from the client SDK; use Firebase Console for that).
       * @param {string} id
       */
      softDeleteUser: function (id) {
        if (!id || typeof id !== 'string') {
          return Promise.reject(new Error('User id required'));
        }
        var ref = doc(db, out.userCollection || uCol, id);
        return updateDoc(ref, {
          deleted: true,
          deletedAt: Timestamp.now(),
          accountStatus: 'deleted',
          status: 'inactive',
        });
      },
      saveDialect: function (payload) {
        return setDoc(
          doc(db, dCol, payload.slug),
          {
            title: payload.title,
            dialect: payload.dialect,
            speakers: payload.speakers,
            visible: payload.visible,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      },
      deleteDialect: function (slug) {
        return deleteDoc(doc(db, dCol, slug));
      },
      seedDefaultDialects: function (seeds) {
        return Promise.all(
          seeds.map(function (row) {
            return setDoc(
              doc(db, dCol, row.slug),
              {
                title: row.title,
                dialect: row.dialect,
                speakers: row.speakers,
                visible: row.visible !== false,
                name: row.name,
                native: row.native,
                region: row.region,
                flag: row.flag,
                gradient: row.gradient,
                order: typeof row.order === 'number' ? row.order : 0,
              },
              { merge: true }
            );
          })
        );
      },
      saveChatSession: function (payload) {
        var id = payload.id || 'cs_' + Date.now();
        var ref = doc(db, cCol, id);
        var lastAt = payload.lastAt ? Timestamp.fromDate(new Date(payload.lastAt)) : Timestamp.now();
        var msgCount =
          typeof payload.messageCount === 'number'
            ? payload.messageCount
            : Array.isArray(payload.messages)
              ? payload.messages.length
              : 0;
        return setDoc(
          ref,
          {
            userId: payload.userId || '',
            userName: payload.userName || '',
            userEmail: payload.userEmail || '',
            lastMessage: payload.lastMessage || '',
            lastAt: lastAt,
            messageCount: msgCount,
            dialectLabel: payload.dialectLabel || '',
            color: payload.color || '#1d6ef7',
            imagesSent: payload.imagesSent || 0,
            voiceMessages: payload.voiceMessages || 0,
            messages: Array.isArray(payload.messages) ? payload.messages : [],
            updatedAt: Date.now(),
          },
          { merge: true }
        ).then(function () {
          return id;
        });
      },
      deleteChatSession: function (id) {
        return deleteDoc(doc(db, cCol, id));
      },
      appendActivity: function (entry) {
        return addDoc(collection(db, aCol), {
          time: Timestamp.now(),
          actor: entry.actor || '',
          action: entry.action || '',
          target: entry.target || '',
          details: String(entry.details || '').slice(0, 2000),
        });
      },
      reload: function () {
        return bootstrapFirestore(cfg);
      },
      /** Full session doc including messages (for transcript modal). */
      fetchChatSessionFull: function (id) {
        return getDoc(doc(db, cCol, id)).then(function (s) {
          if (!s.exists) throw new Error('Chat session not found');
          return mapChatDoc(s.id, s.data(), { includeMessages: true });
        });
      },
      /**
       * Live updates for users, dialects, and chat list (newest sessions only).
       * Debounced so rapid writes coalesce into one UI refresh.
       */
      subscribeLiveUpdates: function (onData, onError) {
        var notifyTimer = null;
        function push() {
          if (typeof onData !== 'function') return;
          clearTimeout(notifyTimer);
          notifyTimer = setTimeout(function () {
            enrichUsersDialectLabels(out.users, out.dialects);
            out.analytics = computeAnalytics(out.users, out.chats);
            onData({
              users: out.users.slice(),
              dialects: out.dialects.slice(),
              chats: out.chats.slice(),
              analytics: out.analytics,
              bugReports: (out.bugReports || []).slice(),
              feedbackRows: (out.feedbackRows || []).slice(),
            });
          }, 80);
        }

        var refUsers = collection(db, out.userCollection || uCol);
        var refDialects = collection(db, dCol);
        var chatQuery = query(collection(db, cCol), orderBy('lastAt', 'desc'), limit(CHAT_LIST_LIMIT));

        var u1 = onSnapshot(
          refUsers,
          function (snap) {
            out.users = [];
            snap.forEach(function (s) {
              var m = mapUserDoc(s.id, s.data());
              if (m) out.users.push(m);
            });
            push();
          },
          function (err) {
            if (typeof onError === 'function') onError(err);
          }
        );

        var u2 = onSnapshot(
          refDialects,
          function (snap) {
            out.dialects = [];
            snap.forEach(function (s) {
              out.dialects.push(mapDialectDoc(s.id, s.data()));
            });
            out.dialects.sort(function (a, b) {
              return (a.order || 0) - (b.order || 0) || a.slug.localeCompare(b.slug);
            });
            push();
          },
          function (err) {
            if (typeof onError === 'function') onError(err);
          }
        );

        var chatUnsub = null;
        function applyChatSnap(snap) {
          out.chats = [];
          snap.forEach(function (s) {
            out.chats.push(mapChatDoc(s.id, s.data(), { includeMessages: false }));
          });
          push();
        }

        chatUnsub = onSnapshot(
          chatQuery,
          applyChatSnap,
          function (err) {
            console.warn('SalinTayo: ordered chat snapshot failed, using collection + trim:', err);
            if (chatUnsub) chatUnsub();
            chatUnsub = onSnapshot(
              collection(db, cCol),
              function (snap) {
                out.chats = [];
                snap.forEach(function (s) {
                  out.chats.push(mapChatDoc(s.id, s.data(), { includeMessages: false }));
                });
                out.chats.sort(function (a, b) {
                  return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
                });
                out.chats = out.chats.slice(0, CHAT_LIST_LIMIT);
                push();
              },
              function (err2) {
                if (typeof onError === 'function') onError(err2);
              }
            );
          }
        );

        var refBugs = collection(db, bCol);
        var u3 = onSnapshot(
          refBugs,
          function (snap) {
            out.bugReports = [];
            snap.forEach(function (s) {
              out.bugReports.push(mapBugReportDoc(s.id, s.data()));
            });
            out.bugReports.sort(function (a, b) {
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            push();
          },
          function (err) {
            if (typeof onError === 'function') onError(err);
          }
        );

        var refFb = collection(db, fbCol);
        var u4 = onSnapshot(
          refFb,
          function (snap) {
            out.feedbackRows = [];
            snap.forEach(function (s) {
              out.feedbackRows.push(mapAppFeedbackDoc(s.id, s.data()));
            });
            out.feedbackRows.sort(function (a, b) {
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            push();
          },
          function (err) {
            if (typeof onError === 'function') onError(err);
          }
        );

        return function () {
          clearTimeout(notifyTimer);
          u1();
          u2();
          if (chatUnsub) chatUnsub();
          u3();
          u4();
        };
      },
      /** @deprecated Use subscribeLiveUpdates */
      subscribeUsers: function (onData, onError) {
        var ref = collection(db, out.userCollection || uCol);
        return onSnapshot(
          ref,
          function (snap) {
            var nextUsers = [];
            snap.forEach(function (s) {
              var m = mapUserDoc(s.id, s.data());
              if (m) nextUsers.push(m);
            });
            enrichUsersDialectLabels(nextUsers, out.dialects);
            if (typeof onData === 'function') {
              onData({
                users: nextUsers,
                analytics: computeAnalytics(nextUsers, out.chats),
              });
            }
          },
          function (err) {
            if (typeof onError === 'function') onError(err);
          }
        );
      },
    };
  } catch (e) {
    out.error = e;
    console.error('SalinTayo Firestore bootstrap:', e);
  }
  return out;
}
