/**
 * SalinTayo Admin — Capstone analytics dashboard (Growth · Usage · Quality)
 * Requires Chart.js (loaded from index.html).
 */
(function (global) {
  'use strict';

  var chartInstances = {};
  var lastModel = null;
  var hubBound = false;
  var MODAL_PREFIX = 'dash-m-';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function todayYmd() {
    var x = new Date();
    var m = String(x.getMonth() + 1);
    var day = String(x.getDate());
    return x.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  function lastNDaysLabels(n) {
    var labels = [];
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d);
      x.setDate(d.getDate() - i);
      labels.push(
        x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      );
    }
    return labels;
  }

  function lastNDaysYmd(n) {
    var keys = [];
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d);
      x.setDate(d.getDate() - i);
      var m = String(x.getMonth() + 1);
      var day = String(x.getDate());
      keys.push(x.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day));
    }
    return keys;
  }

  function monthStartYmd() {
    var x = new Date();
    var m = String(x.getMonth() + 1);
    return x.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-01';
  }

  function parseIsoDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function ymdFromDate(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  /**
   * Count how often each app feature has been used (from Firestore-backed fields).
   */
  function computeFeatureUsage(users, chats, analytics, bugReports, feedbackRows) {
    var chatSessions = chats.length;
    var textMessages = analytics.totalMessages != null ? analytics.totalMessages : 0;
    if (!textMessages) {
      chats.forEach(function (c) {
        textMessages += c.messageCount || 0;
      });
    }
    var voiceTotal = analytics.voiceMessagesTotal != null ? analytics.voiceMessagesTotal : 0;
    var imageTotal = analytics.imagesSentTotal != null ? analytics.imagesSentTotal : 0;
    if (!voiceTotal || !imageTotal) {
      chats.forEach(function (c) {
        voiceTotal += c.voiceMessages || 0;
        imageTotal += c.imagesSent || 0;
      });
    }

    var chatUserIds = {};
    chats.forEach(function (c) {
      if (c.userId) chatUserIds[c.userId] = true;
    });
    var chatUsers = Object.keys(chatUserIds).length;

    var learnDays = 0;
    var learnUsers = 0;
    users.forEach(function (u) {
      if (u.learnActivityDates && u.learnActivityDates.length) {
        learnDays += u.learnActivityDates.length;
        learnUsers++;
      }
    });

    var streakUsers = 0;
    users.forEach(function (u) {
      if (typeof u.streak === 'number' && u.streak > 0) streakUsers++;
    });

    var voiceUserSet = {};
    var imageUserSet = {};
    chats.forEach(function (c) {
      if ((c.voiceMessages || 0) > 0 && c.userId) voiceUserSet[c.userId] = true;
      if ((c.imagesSent || 0) > 0 && c.userId) imageUserSet[c.userId] = true;
    });
    var voiceUsers = Object.keys(voiceUserSet).length;
    var imageUsers = Object.keys(imageUserSet).length;

    var feedbackCount = feedbackRows.length;
    var feedbackUsers = feedbackRows.filter(function (f) {
      return f.userId;
    }).length;
    var uniqueFb = {};
    feedbackRows.forEach(function (f) {
      if (f.userId) uniqueFb[f.userId] = true;
    });
    feedbackUsers = Object.keys(uniqueFb).length || feedbackCount;

    var bugCount = bugReports.length;
    var bugUsers = {};
    bugReports.forEach(function (b) {
      if (b.userId) bugUsers[b.userId] = true;
    });
    var bugUserCount = Object.keys(bugUsers).length || bugCount;

    var items = [
      {
        id: 'chat',
        label: 'AI Chat & Translation',
        icon: '💬',
        count: textMessages,
        users: chatUsers || (textMessages > 0 ? users.length : 0),
        hint: chatSessions + ' session' + (chatSessions === 1 ? '' : 's') + ' · text messages',
      },
      {
        id: 'voice',
        label: 'Voice Input',
        icon: '🎤',
        count: voiceTotal,
        users: voiceUsers,
        hint: 'Voice messages (Whisper transcription)',
      },
      {
        id: 'image',
        label: 'Image Sharing',
        icon: '🖼️',
        count: imageTotal,
        users: imageUsers,
        hint: 'Images sent in chat',
      },
      {
        id: 'learn',
        label: 'Learn & Quiz',
        icon: '📚',
        count: learnDays,
        users: learnUsers,
        hint: 'Login / learn activity days (users.loginActivityDates)',
      },
      {
        id: 'streak',
        label: 'Streak Tracking',
        icon: '🔥',
        count: streakUsers,
        users: streakUsers,
        hint: 'Users with streakCount from app profile',
      },
      {
        id: 'feedback',
        label: 'Ratings & Feedback',
        icon: '⭐',
        count: feedbackCount,
        users: feedbackUsers,
        hint: 'App store-style ratings submitted',
      },
      {
        id: 'help',
        label: 'Help & Bug Reports',
        icon: '🐛',
        count: bugCount,
        users: bugUserCount,
        hint: 'Help center bug reports',
      },
    ];

    items.sort(function (a, b) {
      return b.count - a.count;
    });

    return {
      topFeature: items[0] ? items[0].label : '—',
      items: items,
    };
  }

  /** Demo dataset for capstone presentation when Firestore is empty. */
  function demoAnalyticsModel() {
    var days = lastNDaysYmd(14);
    var reg = [2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 5];
    var trans = [45, 52, 48, 61, 55, 72, 68, 80, 75, 88, 92, 85, 98, 105];
    var dialects = [
      { label: 'Cebuano', count: 342 },
      { label: 'Filipino', count: 298 },
      { label: 'Ilocano', count: 156 },
      { label: 'Hiligaynon', count: 124 },
      { label: 'Waray', count: 87 },
    ];
    var hours = [2, 1, 0, 0, 1, 3, 8, 15, 22, 28, 35, 42, 48, 52, 45, 38, 32, 28, 24, 18, 12, 8, 5, 3];
    return {
      source: 'demo',
      growth: {
        totalUsers: 128,
        newUsersThisMonth: 24,
        totalTranslations: 1847,
        dailyActiveUsers: 36,
      },
      series: {
        labels: lastNDaysLabels(14),
        registrations: reg,
        translations: trans,
      },
      usage: {
        topDialect: 'Cebuano',
        topPair: 'English → Cebuano',
        topSearchedWord: 'Kumusta',
        peakHour: '2 PM',
        dialects: dialects,
        pairs: [
          { label: 'English → Cebuano', count: 412 },
          { label: 'English → Filipino', count: 356 },
          { label: 'Filipino → Cebuano', count: 198 },
          { label: 'English → Ilocano', count: 145 },
          { label: 'Cebuano → Filipino', count: 112 },
        ],
        words: [
          { label: 'Kumusta', count: 89 },
          { label: 'Salamat', count: 76 },
          { label: 'Maayong buntag', count: 64 },
          { label: 'Palihug', count: 52 },
          { label: 'Salamat kaayo', count: 41 },
        ],
        peakHours: hours,
      },
      features: {
        topFeature: 'AI Chat & Translation',
        items: [
          { id: 'chat', label: 'AI Chat & Translation', icon: '💬', count: 1847, users: 96, hint: 'Text translation requests' },
          { id: 'voice', label: 'Voice Input', icon: '🎤', count: 412, users: 58, hint: 'Voice messages sent' },
          { id: 'image', label: 'Image Sharing', icon: '🖼️', count: 186, users: 34, hint: 'Images in chat' },
          { id: 'learn', label: 'Learn & Quiz', icon: '📚', count: 892, users: 71, hint: 'Learning activity days' },
          { id: 'streak', label: 'Streak Tracking', icon: '🔥', count: 54, users: 54, hint: 'Users with active streak' },
          { id: 'feedback', label: 'Ratings & Feedback', icon: '⭐', count: 48, users: 48, hint: 'In-app submissions' },
          { id: 'help', label: 'Help & Bug Reports', icon: '🐛', count: 12, users: 11, hint: 'Help center reports' },
        ],
      },
      quality: {
        successful: 1720,
        failed: 127,
        avgRating: 4.3,
        ratingCount: 48,
        reportedIncorrect: 15,
      },
      reports: [
        { type: 'translation', text: 'Incorrect Cebuano translation for "good evening"', meta: '2 hours ago' },
        { type: 'feedback', text: '★★★★☆ — Very helpful for learning Bisaya phrases', meta: '5 hours ago' },
        { type: 'bug', text: 'Voice input not working on Android 13', meta: 'Yesterday' },
        { type: 'feedback', text: '★★★★★ — Love the dialect options!', meta: '2 days ago' },
      ],
    };
  }

  /**
   * Build analytics from live Firestore-backed app state.
   * @param {{ users?: object[], chats?: object[], analytics?: object, bugReports?: object[], feedbackRows?: object[] }} input
   */
  function buildAnalyticsModel(input) {
    input = input || {};
    var users = input.users || [];
    var chats = input.chats || [];
    var analytics = input.analytics || {};
    var bugReports = input.bugReports || [];
    var feedbackRows = input.feedbackRows || [];

    var hasLive = users.length > 0 || chats.length > 0 || bugReports.length > 0 || feedbackRows.length > 0;

    if (!hasLive) {
      return demoAnalyticsModel();
    }

    var monthStart = monthStartYmd();
    var newUsersThisMonth = 0;
    users.forEach(function (u) {
      var created = u.createdAt ? parseIsoDate(u.createdAt) : null;
      if (created && ymdFromDate(created) >= monthStart) newUsersThisMonth++;
      else if (!created && u.learnActivityDates && u.learnActivityDates.length) {
        var first = u.learnActivityDates.slice().sort()[0];
        if (first >= monthStart) newUsersThisMonth++;
      }
    });

    var totalTranslations = analytics.totalMessages != null ? analytics.totalMessages : 0;
    if (!totalTranslations) {
      chats.forEach(function (c) {
        totalTranslations += c.messageCount || 0;
      });
    }

    var dayKeys = lastNDaysYmd(14);
    var regByDay = {};
    var transByDay = {};
    dayKeys.forEach(function (k) {
      regByDay[k] = 0;
      transByDay[k] = 0;
    });

    users.forEach(function (u) {
      var created = u.createdAt ? parseIsoDate(u.createdAt) : null;
      var key = created ? ymdFromDate(created) : null;
      if (!key && u.learnActivityDates && u.learnActivityDates.length) {
        key = u.learnActivityDates.slice().sort()[0];
      }
      if (key && regByDay[key] != null) regByDay[key]++;
    });

    chats.forEach(function (c) {
      var d = parseIsoDate(c.lastAt);
      if (!d) return;
      var key = ymdFromDate(d);
      if (transByDay[key] != null) {
        transByDay[key] += c.messageCount || 1;
      }
    });

    var dialectMap = {};
    if (analytics.dialectCounts) {
      Object.keys(analytics.dialectCounts).forEach(function (k) {
        dialectMap[k] = analytics.dialectCounts[k];
      });
    } else {
      users.forEach(function (u) {
        var k = u.dialectLabel || u.dialect || 'Unknown';
        dialectMap[k] = (dialectMap[k] || 0) + 1;
      });
      chats.forEach(function (c) {
        var k = c.dialectLabel || 'Chat';
        dialectMap[k] = (dialectMap[k] || 0) + (c.messageCount || 1);
      });
    }

    var dialects = Object.keys(dialectMap)
      .map(function (k) {
        return { label: k, count: dialectMap[k] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 8);

    var pairMap = {};
    chats.forEach(function (c) {
      var target = c.dialectLabel && c.dialectLabel !== '—' ? c.dialectLabel : 'Dialect';
      var pair = 'English → ' + target;
      pairMap[pair] = (pairMap[pair] || 0) + (c.messageCount || 1);
    });
    var pairs = Object.keys(pairMap)
      .map(function (k) {
        return { label: k, count: pairMap[k] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 5);

    var wordMap = {};
    chats.forEach(function (c) {
      if (c.lastMessage && c.lastMessage.length < 40) {
        wordMap[c.lastMessage] = (wordMap[c.lastMessage] || 0) + 1;
      }
    });
    var words = Object.keys(wordMap)
      .map(function (k) {
        return { label: k, count: wordMap[k] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 5);

    var hourCounts = new Array(24).fill(0);
    chats.forEach(function (c) {
      var d = parseIsoDate(c.lastAt);
      if (d) hourCounts[d.getHours()] += c.messageCount || 1;
    });
    users.forEach(function (u) {
      var d = parseIsoDate(u.lastActive);
      if (d) hourCounts[d.getHours()]++;
    });

    var hasPeakActivity = hourCounts.some(function (n) {
      return n > 0;
    });
    var peakHourIdx = 0;
    hourCounts.forEach(function (n, i) {
      if (n > hourCounts[peakHourIdx]) peakHourIdx = i;
    });
    var peakHourLabel = '—';
    if (hasPeakActivity) {
      peakHourLabel =
        peakHourIdx === 0
          ? '12 AM'
          : peakHourIdx < 12
            ? peakHourIdx + ' AM'
            : peakHourIdx === 12
              ? '12 PM'
              : peakHourIdx - 12 + ' PM';
    }

    var ratingSum = 0;
    var ratingN = 0;
    feedbackRows.forEach(function (f) {
      if (typeof f.rating === 'number') {
        ratingSum += f.rating;
        ratingN++;
      }
    });
    var avgRating = ratingN ? Math.round((ratingSum / ratingN) * 10) / 10 : null;

    var failedCount = 0;
    bugReports.forEach(function (b) {
      var desc = (b.description || '').toLowerCase();
      if (desc.indexOf('translat') >= 0 || desc.indexOf('incorrect') >= 0 || (b.bugType || '').toLowerCase().indexOf('translat') >= 0) {
        failedCount++;
      }
    });
    var successful = Math.max(0, totalTranslations - failedCount);

    var reports = [];
    bugReports.slice(0, 3).forEach(function (b) {
      reports.push({
        type: 'bug',
        text: (b.bugType ? b.bugType + ': ' : '') + (b.description || 'Bug report'),
        meta: b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—',
      });
    });
    feedbackRows.slice(0, 3).forEach(function (f) {
      var stars = typeof f.rating === 'number' ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '';
      reports.push({
        type: 'feedback',
        text: (stars ? stars + ' — ' : '') + (f.comment || 'Feedback'),
        meta: f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—',
      });
    });
    reports = reports.slice(0, 5);

    var features = computeFeatureUsage(users, chats, analytics, bugReports, feedbackRows);

    return {
      source: analytics.source === 'firestore' ? 'firestore' : 'live',
      growth: {
        totalUsers: analytics.totalUsers != null ? analytics.totalUsers : users.length,
        newUsersThisMonth: newUsersThisMonth,
        totalTranslations: totalTranslations,
        dailyActiveUsers: analytics.activeToday != null ? analytics.activeToday : 0,
      },
      series: {
        labels: lastNDaysLabels(14),
        registrations: dayKeys.map(function (k) {
          return regByDay[k];
        }),
        translations: dayKeys.map(function (k) {
          return transByDay[k];
        }),
      },
      usage: {
        topDialect: dialects[0] ? dialects[0].label : '—',
        topPair: pairs[0] ? pairs[0].label : '—',
        topSearchedWord: words[0] ? words[0].label : '—',
        peakHour: peakHourLabel,
        dialects: dialects,
        pairs: pairs,
        words: words,
        peakHours: hourCounts,
      },
      features: features,
      quality: {
        successful: successful,
        failed: failedCount,
        avgRating: avgRating,
        ratingCount: ratingN,
        reportedIncorrect: failedCount,
      },
      reports: reports,
    };
  }

  function destroyCharts() {
    Object.keys(chartInstances).forEach(function (key) {
      if (chartInstances[key]) {
        chartInstances[key].destroy();
        chartInstances[key] = null;
      }
    });
  }

  function renderKpiCard(label, value, hint, icon) {
    return (
      '<div class="stat-card">' +
      '<span class="stat-card__label">' +
      (icon ? icon + ' ' : '') +
      escapeHtml(label) +
      '</span>' +
      '<div class="stat-card__value-row"><span class="stat-card__value">' +
      escapeHtml(String(value)) +
      '</span></div>' +
      (hint ? '<span class="stat-card__hint">' + escapeHtml(hint) + '</span>' : '') +
      '</div>'
    );
  }

  function showChartEmpty(canvasId, message) {
    var canvas = $(canvasId);
    if (!canvas || !canvas.parentElement) return;
    canvas.parentElement.innerHTML =
      '<p class="dash-empty-inline">' + escapeHtml(message || 'No data yet') + '</p>';
  }

  function renderRankList(hostId, items, emptyMsg) {
    var host = $(hostId);
    if (!host) return;
    if (!items || !items.length) {
      host.innerHTML = '<p class="dash-empty-inline">' + escapeHtml(emptyMsg || 'No data yet') + '</p>';
      return;
    }
    host.innerHTML = items
      .map(function (item, i) {
        return (
          '<li><span class="dash-rank-list__num">' +
          (i + 1) +
          '</span><span class="dash-rank-list__label">' +
          escapeHtml(item.label) +
          '</span><span class="dash-rank-list__value">' +
          item.count +
          '</span></li>'
        );
      })
      .join('');
  }

  function renderPeakHeatmap(hours, hostId) {
    var host = $(hostId || 'dash-peak-hours');
    if (!host) return;
    var max = Math.max.apply(null, hours.concat([0]));
    if (max === 0) {
      host.innerHTML =
        '<p class="dash-empty-inline">No usage timestamps yet — activity appears after learners use chat or sign in.</p>';
      return;
    }
    var cells = hours
      .map(function (n, i) {
        var intensity = n / max;
        var r = Math.round(29 + (29 - 29) * intensity);
        var g = Math.round(110 + (110 - 110) * intensity);
        var b = Math.round(247 * intensity + 241 * (1 - intensity));
        if (intensity > 0.5) {
          r = 29;
          g = 110;
          b = 247;
        } else if (intensity > 0.2) {
          r = 147;
          g = 197;
          b = 253;
        } else {
          r = 241;
          g = 245;
          b = 249;
        }
        var alpha = 0.35 + intensity * 0.65;
        return (
          '<div class="dash-heatmap__cell" style="background:rgba(' +
          r +
          ',' +
          g +
          ',' +
          b +
          ',' +
          alpha +
          ')" title="' +
          i +
          ':00 — ' +
          n +
          ' requests"></div>'
        );
      })
      .join('');
    var labels = hours
      .map(function (_, i) {
        return i % 3 === 0 ? '<span class="dash-heatmap__label">' + i + '</span>' : '<span class="dash-heatmap__label"></span>';
      })
      .join('');
    host.innerHTML = cells + '<div class="dash-heatmap__labels">' + labels + '</div>';
  }

  function renderReports(reports, hostId, emptyMsg) {
    var host = $(hostId || 'dash-recent-reports');
    if (!host) return;
    if (!reports.length) {
      host.innerHTML =
        '<p class="dash-empty-inline">' +
        escapeHtml(emptyMsg || 'No bug reports or feedback yet — submit from the app Help Center.') +
        '</p>';
      return;
    }
    host.innerHTML = reports
      .map(function (r) {
        return (
          '<div class="dash-report-row">' +
          '<span class="dash-report-row__type dash-report-row__type--' +
          escapeHtml(r.type) +
          '">' +
          escapeHtml(r.type) +
          '</span>' +
          '<span class="dash-report-row__text">' +
          escapeHtml(r.text) +
          '</span>' +
          '<span class="dash-report-row__meta">' +
          escapeHtml(r.meta) +
          '</span></div>'
        );
      })
      .join('');
  }

  function renderSatisfaction(avgRating, count, prefix) {
    prefix = prefix || 'dash-';
    var scoreEl = $(prefix + 'satisfaction-score');
    var starsEl = $(prefix + 'satisfaction-stars');
    var fillEl = $(prefix + 'satisfaction-fill');
    var hintEl = $(prefix + 'satisfaction-hint');
    if (!scoreEl) return;

    var rating = avgRating != null ? avgRating : 0;
    scoreEl.textContent = rating ? rating.toFixed(1) : '—';
    if (starsEl) {
      var full = Math.round(rating);
      starsEl.textContent = rating ? '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full)) : '☆☆☆☆☆';
    }
    if (fillEl) {
      fillEl.style.width = rating ? Math.round((rating / 5) * 100) + '%' : '0%';
    }
    if (hintEl) {
      hintEl.textContent = count
        ? 'Based on ' + count + ' in-app rating' + (count === 1 ? '' : 's')
        : 'No in-app ratings submitted yet';
    }
  }

  function renderFeatureUsage(features, hostId) {
    var cardsHost = $(hostId || 'dash-feature-cards');
    if (!cardsHost || !features || !features.items) return;

    cardsHost.innerHTML = features.items
      .map(function (f) {
        var userHint =
          f.users != null && f.users !== f.count
            ? f.users + ' user' + (f.users === 1 ? '' : 's')
            : '';
        return (
          '<div class="dash-feature-card">' +
          '<div class="dash-feature-card__icon" aria-hidden="true">' +
          escapeHtml(f.icon) +
          '</div>' +
          '<div class="dash-feature-card__body">' +
          '<span class="dash-feature-card__label">' +
          escapeHtml(f.label) +
          '</span>' +
          '<span class="dash-feature-card__count">' +
          escapeHtml(String(f.count)) +
          '</span>' +
          '<span class="dash-feature-card__hint">' +
          escapeHtml(f.hint) +
          (userHint ? ' · ' + escapeHtml(userHint) : '') +
          '</span></div></div>'
        );
      })
      .join('');
  }

  function growthModalHtml() {
    var p = MODAL_PREFIX;
    return (
      '<div class="dash-modal-stack">' +
      '<div class="stats-grid dash-kpi-grid" id="' +
      p +
      'growth-kpis"></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">User &amp; translation growth</h3>' +
      '<p class="dash-chart-caption">Registrations (line) and daily translation requests (area) — last 14 days</p>' +
      '<div class="dash-chart-wrap dash-chart-wrap--tall"><canvas id="' +
      p +
      'growth-chart"></canvas></div>' +
      '</div></div></div>'
    );
  }

  function usageModalHtml() {
    var p = MODAL_PREFIX;
    return (
      '<div class="dash-modal-stack">' +
      '<div class="stats-grid dash-kpi-grid dash-kpi-grid--compact" id="' +
      p +
      'usage-kpis"></div>' +
      '<div class="dash-grid-2">' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Most translated dialects</h3>' +
      '<div class="dash-chart-wrap"><canvas id="' +
      p +
      'dialect-bar-chart"></canvas></div>' +
      '</div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Translation distribution by dialect</h3>' +
      '<div class="dash-chart-wrap dash-chart-wrap--donut"><canvas id="' +
      p +
      'dialect-donut-chart"></canvas></div>' +
      '</div></div></div>' +
      '<div class="dash-grid-2">' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Top searched words</h3>' +
      '<ol class="dash-rank-list" id="' +
      p +
      'top-words"></ol></div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Top translation pairs</h3>' +
      '<ol class="dash-rank-list" id="' +
      p +
      'top-pairs"></ol></div></div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Peak usage hours</h3>' +
      '<p class="dash-chart-caption">When learners translate most often (local time)</p>' +
      '<div class="dash-heatmap" id="' +
      p +
      'peak-hours"></div></div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">App feature usage</h3>' +
      '<p class="dash-chart-caption">How often each SalinTayo feature has been used</p>' +
      '<div class="dash-feature-grid" id="' +
      p +
      'feature-cards"></div>' +
      '<div class="dash-chart-wrap dash-chart-wrap--feature"><canvas id="' +
      p +
      'feature-bar-chart"></canvas></div>' +
      '</div></div></div>'
    );
  }

  function qualityModalHtml() {
    var p = MODAL_PREFIX;
    return (
      '<div class="dash-modal-stack">' +
      '<div class="stats-grid dash-kpi-grid dash-kpi-grid--compact" id="' +
      p +
      'quality-kpis"></div>' +
      '<div class="dash-grid-2">' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Success vs. failed translations</h3>' +
      '<div class="dash-chart-wrap dash-chart-wrap--donut"><canvas id="' +
      p +
      'quality-donut-chart"></canvas></div>' +
      '</div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Average user satisfaction</h3>' +
      '<div class="dash-satisfaction">' +
      '<div class="dash-satisfaction__score" id="' +
      p +
      'satisfaction-score">—</div>' +
      '<div class="dash-satisfaction__stars" id="' +
      p +
      'satisfaction-stars"></div>' +
      '<div class="dash-satisfaction__bar"><div class="dash-satisfaction__fill" id="' +
      p +
      'satisfaction-fill"></div></div>' +
      '<p class="dash-satisfaction__hint" id="' +
      p +
      'satisfaction-hint">Based on in-app ratings</p>' +
      '</div></div></div></div>' +
      '<div class="panel panel--section"><div class="panel__body">' +
      '<h3 class="panel__title">Recent reports &amp; feedback</h3>' +
      '<div class="dash-reports-list" id="' +
      p +
      'recent-reports"></div></div></div></div>'
    );
  }

  function renderHub(model) {
    var host = $('dash-hub-grid');
    if (!host) return;

    var cards = [
      {
        id: 'growth',
        badge: 'Growth',
        badgeClass: 'growth',
        title: 'Growth Analytics',
        desc: 'User adoption, registrations, and translation volume over time.',
        previews: [
          { label: 'Total users', value: model.growth.totalUsers },
          { label: 'New this month', value: model.growth.newUsersThisMonth },
          { label: 'Translations', value: model.growth.totalTranslations },
          { label: 'Active today', value: model.growth.dailyActiveUsers },
        ],
      },
      {
        id: 'usage',
        badge: 'Usage',
        badgeClass: 'usage',
        title: 'Usage Analytics',
        desc: 'Dialects, translation pairs, peak hours, and app feature counts.',
        previews: [
          { label: 'Top dialect', value: model.usage.topDialect },
          { label: 'Top pair', value: model.usage.topPair },
          { label: 'Top feature', value: model.features ? model.features.topFeature : '—' },
          { label: 'Peak hour', value: model.usage.peakHour },
        ],
      },
      {
        id: 'quality',
        badge: 'Quality',
        badgeClass: 'quality',
        title: 'Quality Analytics',
        desc: 'Translation success rate, user ratings, and reported issues.',
        previews: [
          { label: 'Successful', value: model.quality.successful },
          { label: 'Failed', value: model.quality.failed },
          {
            label: 'Avg rating',
            value: model.quality.avgRating != null ? model.quality.avgRating + ' / 5' : '—',
          },
          { label: 'Reported', value: model.quality.reportedIncorrect },
        ],
      },
    ];

    host.innerHTML = cards
      .map(function (c) {
        var previewHtml = c.previews
          .map(function (p) {
            return (
              '<li><span class="dash-hub-card__stat-label">' +
              escapeHtml(p.label) +
              '</span><span class="dash-hub-card__stat-value">' +
              escapeHtml(String(p.value)) +
              '</span></li>'
            );
          })
          .join('');
        return (
          '<button type="button" class="dash-hub-card dash-hub-card--' +
          c.badgeClass +
          '" data-dash-category="' +
          c.id +
          '" role="listitem">' +
          '<span class="dash-hub-card__badge dash-category__badge dash-category__badge--' +
          c.badgeClass +
          '">' +
          escapeHtml(c.badge) +
          '</span>' +
          '<h3 class="dash-hub-card__title">' +
          escapeHtml(c.title) +
          '</h3>' +
          '<p class="dash-hub-card__desc">' +
          escapeHtml(c.desc) +
          '</p>' +
          '<ul class="dash-hub-card__preview">' +
          previewHtml +
          '</ul>' +
          '<span class="dash-hub-card__action">View analytics →</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function renderCategoryContent(category, model) {
    var p = MODAL_PREFIX;
    if (category === 'growth') {
      var gHost = $(p + 'growth-kpis');
      if (gHost) {
        gHost.innerHTML =
          renderKpiCard('Total users', model.growth.totalUsers, 'Registered learners', '👥') +
          renderKpiCard('New this month', model.growth.newUsersThisMonth, 'Sign-ups since ' + monthStartYmd().slice(0, 7), '🆕') +
          renderKpiCard('Total translations', model.growth.totalTranslations, 'Chat / translation requests', '🔄') +
          renderKpiCard('Daily active users', model.growth.dailyActiveUsers, 'Active today (' + todayYmd() + ')', '📈');
      }
    } else if (category === 'usage') {
      var uHost = $(p + 'usage-kpis');
      if (uHost) {
        uHost.innerHTML =
          renderKpiCard('Top dialect', model.usage.topDialect, 'Most translated', '🌐') +
          renderKpiCard('Top pair', model.usage.topPair, 'Most requested route', '🔁') +
          renderKpiCard('Top search', model.usage.topSearchedWord, 'Most looked-up word', '🔍') +
          renderKpiCard('Peak hour', model.usage.peakHour, 'Busiest time of day', '⏰');
      }
      renderRankList(p + 'top-words', model.usage.words, 'No chat phrases yet — appears when learners send short messages in AI chat.');
      renderRankList(p + 'top-pairs', model.usage.pairs, 'No chat sessions yet — use AI chat in the SalinTayo app to sync chatSessions.');
      renderPeakHeatmap(model.usage.peakHours, p + 'peak-hours');
      renderFeatureUsage(model.features, p + 'feature-cards');
    } else if (category === 'quality') {
      var qHost = $(p + 'quality-kpis');
      if (qHost) {
        qHost.innerHTML =
          renderKpiCard('Successful', model.quality.successful, 'Completed translations', '✅') +
          renderKpiCard('Failed / flagged', model.quality.failed, 'Errors & pending review', '❌') +
          renderKpiCard('Avg rating', model.quality.avgRating != null ? model.quality.avgRating + ' / 5' : '—', 'User satisfaction', '⭐') +
          renderKpiCard('Reported issues', model.quality.reportedIncorrect, 'Incorrect translations', '🚩');
      }
      renderSatisfaction(model.quality.avgRating, model.quality.ratingCount, p);
      renderReports(model.reports, p + 'recent-reports');
    }
  }

  function openCategoryModal(category, model) {
    var templates = {
      growth: growthModalHtml,
      usage: usageModalHtml,
      quality: qualityModalHtml,
    };
    var titles = {
      growth: 'Growth Analytics',
      usage: 'Usage Analytics',
      quality: 'Quality Analytics',
    };
    if (!templates[category]) return;

    destroyCharts();
    var body = $('dash-modal-body');
    var overlay = $('dash-modal-overlay');
    var titleEl = $('dash-modal-title');
    if (!body || !overlay) return;

    if (titleEl) titleEl.textContent = titles[category];
    body.innerHTML = templates[category]();
    renderCategoryContent(category, model);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dash-modal-open');

    requestAnimationFrame(function () {
      renderCharts(model, category);
    });
  }

  function closeCategoryModal() {
    destroyCharts();
    var overlay = $('dash-modal-overlay');
    var body = $('dash-modal-body');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (body) body.innerHTML = '';
    document.body.classList.remove('dash-modal-open');
  }

  function bindDashboardModal() {
    var grid = $('dash-hub-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var card = e.target.closest('[data-dash-category]');
        if (!card || !lastModel) return;
        openCategoryModal(card.getAttribute('data-dash-category'), lastModel);
      });
    }

    var closeBtn = $('dash-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeCategoryModal);

    var overlay = $('dash-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeCategoryModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
        closeCategoryModal();
      }
    });
  }

  function updateDataSource(model) {
    var src = $('dash-data-source');
    if (!src) return;
    if (model.source === 'demo') {
      src.textContent =
        'Demo data — no Firestore records yet. Sign in with Firebase admin, deploy firestore.rules, and use the SalinTayo app (chat, Help Center feedback/bugs) to populate live analytics.';
    } else {
      src.textContent =
        'Live Firestore data from salintayo-app (users, chatSessions, appFeedback, bugReports). Empty charts mean no activity yet — not sample data. Success/failed counts use real flagged bugs only.';
    }
  }

  function renderCharts(model, category) {
    if (typeof global.Chart === 'undefined') {
      console.warn('Chart.js not loaded — dashboard charts skipped.');
      return;
    }

    destroyCharts();

    var Chart = global.Chart;
    var fontFamily = "'Poppins', sans-serif";
    Chart.defaults.font.family = fontFamily;
    Chart.defaults.color = '#64748b';

    var p = MODAL_PREFIX;
    var palette = ['#1d6ef7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

    if (category === 'growth') {
      var growthCtx = $(p + 'growth-chart');
      if (growthCtx) {
        chartInstances.growth = new Chart(growthCtx, {
        type: 'line',
        data: {
          labels: model.series.labels,
          datasets: [
            {
              label: 'New users',
              data: model.series.registrations,
              borderColor: '#1d6ef7',
              backgroundColor: 'transparent',
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 3,
              yAxisID: 'y',
            },
            {
              label: 'Translations',
              data: model.series.translations,
              borderColor: '#7c3aed',
              backgroundColor: 'rgba(124, 58, 237, 0.12)',
              fill: true,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 0,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          },
          scales: {
            y: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Users' },
              grid: { color: '#f1f5f9' },
              ticks: { stepSize: 1 },
            },
            y1: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Translations' },
              grid: { drawOnChartArea: false },
            },
            x: { grid: { display: false } },
          },
        },
      });
      }
    }

    if (category === 'usage') {
      if (!model.usage.dialects.length) {
        showChartEmpty(p + 'dialect-bar-chart', 'No dialect usage yet — learners appear after chat sync or profile languageCode is set.');
        showChartEmpty(p + 'dialect-donut-chart', 'No dialect distribution yet.');
      } else {
      var dialectLabels = model.usage.dialects.map(function (d) {
        return d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label;
      });
      var dialectCounts = model.usage.dialects.map(function (d) {
        return d.count;
      });

      var barCtx = $(p + 'dialect-bar-chart');
      if (barCtx) {
        chartInstances.bar = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: dialectLabels,
          datasets: [
            {
              label: 'Translations',
              data: dialectCounts,
              backgroundColor: palette.slice(0, dialectCounts.length),
              borderRadius: 6,
              borderSkipped: false,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#f1f5f9' }, beginAtZero: true },
            y: { grid: { display: false } },
          },
        },
      });
      }

      var donutCtx = $(p + 'dialect-donut-chart');
      if (donutCtx) {
        chartInstances.donut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: dialectLabels,
          datasets: [
            {
              data: dialectCounts,
              backgroundColor: palette.slice(0, dialectCounts.length),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } },
          },
        },
      });
      }
      }

      if (model.features && model.features.items && model.features.items.length) {
        var featLabels = model.features.items.map(function (f) {
          var lbl = f.label;
          return lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl;
        });
        var featCounts = model.features.items.map(function (f) {
          return f.count;
        });
        var featColors = ['#1d6ef7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'];
        var featCtx = $(p + 'feature-bar-chart');
        if (featCtx) {
          chartInstances.features = new Chart(featCtx, {
          type: 'bar',
          data: {
            labels: featLabels,
            datasets: [
              {
                label: 'Usage count',
                data: featCounts,
                backgroundColor: featColors.slice(0, featCounts.length),
                borderRadius: 6,
                borderSkipped: false,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  afterLabel: function (ctx) {
                    var item = model.features.items[ctx.dataIndex];
                    if (item && item.users != null) {
                      return item.users + ' unique user' + (item.users === 1 ? '' : 's');
                    }
                    return '';
                  },
                },
              },
            },
            scales: {
              x: { grid: { color: '#f1f5f9' }, beginAtZero: true },
              y: { grid: { display: false } },
            },
          },
        });
        }
      }
    }

    if (category === 'quality') {
      if (model.quality.successful === 0 && model.quality.failed === 0) {
        showChartEmpty(
          p + 'quality-donut-chart',
          'No flagged translation failures yet — counts only increase from bug reports.'
        );
      } else {
      var qCtx = $(p + 'quality-donut-chart');
      if (qCtx) {
        chartInstances.quality = new Chart(qCtx, {
          type: 'doughnut',
          data: {
            labels: ['Successful', 'Failed / flagged'],
            datasets: [
              {
                data: [model.quality.successful, model.quality.failed],
                backgroundColor: ['#22c55e', '#ef4444'],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
              legend: { position: 'bottom' },
            },
          },
        });
      }
      }
    }
  }

  /**
   * @param {{ users?: object[], chats?: object[], analytics?: object, bugReports?: object[], feedbackRows?: object[] }} input
   */
  function render(input) {
    var overlay = $('dash-modal-overlay');
    if (overlay && overlay.classList.contains('is-open')) {
      closeCategoryModal();
    }
    lastModel = buildAnalyticsModel(input);
    renderHub(lastModel);
    updateDataSource(lastModel);
    if (!hubBound) {
      hubBound = true;
      bindDashboardModal();
    }
    return lastModel;
  }

  global.SalintayoDashboardAnalytics = {
    render: render,
    buildModel: buildAnalyticsModel,
    destroyCharts: destroyCharts,
    closeModal: closeCategoryModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
