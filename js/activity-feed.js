/**
 * VieForce Elite Phase 2 — Activity Feed (mock data showcase).
 * TODO Phase 5: replace MOCK_FEED with API call + persistence for reactions/comments.
 */
(function () {
  'use strict';

  var MOCK_FEED = [
    {
      type: 'achievement',
      user: { name: 'Jefrey Gatchalian', initials: 'JG', role: 'DSM Cebu South' },
      time: '2h',
      body:
        '🎉 Hit 100 bags milestone for Sao Feeds Trading! 11,725 bags MTD — that\'s +28% vs last month.',
      achievement: {
        title: 'First 10K Unlocked',
        subtitle: 'Sao Feeds Trading · 11,725 bags',
        icon: '🏅',
      },
      reactions: { '👍': 5, '❤️': 4, '🔥': 6 },
      youReacted: '👍',
      comments: 3,
    },
    {
      type: 'visit',
      user: { name: 'Edfrey Buenaventura', initials: 'EB', role: 'RSM' },
      time: '5h',
      pills: [
        { kind: 'success', text: '✓ Visit complete' },
        { kind: 'default', text: 'Cavalier Agrivet' },
        { kind: 'orange', text: '3rd visit this month' },
      ],
      body:
        'Discussed Q2 expansion. Owner committed to <strong>2,000 bags VIEPro Premium</strong> for May.',
      bagCounter: { value: 9986, sub: 'bags this month · ▲ +18% vs LM' },
      reactions: { '👍': 5, '🔥': 3 },
      comments: 2,
    },
    {
      type: 'standard',
      user: { name: 'Mathieu Guillaume', initials: 'MG', role: 'CEO', verified: true, pinned: true },
      time: '8h',
      body:
        'Team — we crossed <strong>338,164 bags MTD</strong>, our best April since 2024. Push hard. Let\'s hit 400K. 🎯',
      reactions: { '👍': 12, '❤️': 10, '🔥': 10 },
      comments: 9,
    },
  ];

  var MOCK_STORIES = [
    { kind: 'create' },
    { kind: 'win-fire', user: 'JG', emoji: '🔥', label: 'Jefrey<br>3 visits today' },
    { kind: 'win-trophy', user: 'EB', emoji: '🏆', label: 'Edfrey<br>+12% MTD' },
    { kind: 'win-target', user: 'CC', emoji: '🎯', label: 'Carminda<br>50% target' },
    { kind: 'win-rocket', user: 'KJ', emoji: '🚀', label: 'Kurt<br>New POS' },
  ];

  /** idx → { userLiked: boolean } overrides mock youReacted when set */
  var _feedReactionState = {};

  function _esc(s) {
    if (s == null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _feedGreeting(name) {
    var hour = new Date().getHours();
    var greet = 'Magandang araw';
    if (hour < 12) greet = 'Magandang umaga';
    else if (hour < 18) greet = 'Magandang hapon';
    else greet = 'Magandang gabi';
    var firstName = (name || '').split(/\s+/)[0] || '';
    return greet + (firstName ? ', ' + firstName : '') + '!';
  }

  function _toast(msg) {
    var t = document.createElement('div');
    t.className = 'feed-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      try {
        t.remove();
      } catch (e) {}
    }, 2400);
  }

  function showFeedToast(msg) {
    _toast(msg);
  }

  function openVisitFlow() {
    if (typeof window.nav === 'function') {
      window.nav('page-stores');
      return;
    }
    _toast('Buksan ang Tindahan para magbisita.');
  }
  window.openVisitFlow = openVisitFlow;

  function _composerPhotoStub() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    inp.addEventListener('change', function () {
      _toast('Photo upload — Phase 5');
    });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () {
      try {
        inp.remove();
      } catch (e) {}
    }, 5000);
  }

  function _openComposerStub() {
    _toast('Composer — darating sa Phase 5');
  }

  function _effectiveLiked(post, idx) {
    var st = _feedReactionState[idx];
    if (st && typeof st.userLiked === 'boolean') return st.userLiked;
    return post.youReacted === '👍';
  }

  function _reactionsWithThumb(post, idx) {
    var reactions = {};
    for (var rk in post.reactions) {
      if (Object.prototype.hasOwnProperty.call(post.reactions, rk)) {
        reactions[rk] = post.reactions[rk];
      }
    }
    var baseThumb = reactions['👍'] || 0;
    var mockLiked = post.youReacted === '👍';
    var eff = _effectiveLiked(post, idx);
    var delta = 0;
    if (eff && !mockLiked) delta = 1;
    if (!eff && mockLiked) delta = -1;
    reactions['👍'] = baseThumb + delta;
    return reactions;
  }

  function _renderStoriesMount(mount) {
    var row = mount.querySelector('[data-feed-stories]');
    if (!row) return;
    var html = '';
    for (var i = 0; i < MOCK_STORIES.length; i++) {
      var st = MOCK_STORIES[i];
      if (st.kind === 'create') {
        html +=
          '<div class="story" role="button" tabindex="0" data-story-create="1">' +
          '<div class="story-ring-wrap"><div class="story-ring create-ring">' +
          '<div class="story-inner story-create-inner"><span class="story-create-plus">+</span></div>' +
          '</div></div>' +
          '<span class="story-label">Share<br>win</span>' +
          '</div>';
      } else {
        html +=
          '<div class="story" role="button">' +
          '<div class="story-ring-wrap"><div class="story-ring">' +
          '<div class="story-inner"><span class="story-emoji">' +
          _esc(st.emoji) +
          '</span></div></div></div>' +
          '<span class="story-label">' +
          String(st.label || '').replace(/<br>/g, '<br>') +
          '</span></div>';
      }
    }
    row.innerHTML = html;
    var createBtn = row.querySelector('[data-story-create]');
    if (createBtn) createBtn.addEventListener('click', _openComposerStub);
  }

  function _roleShowsKpiStrip(roleLc) {
    return ['rsm', 'exec', 'ceo', 'director', 'evp'].indexOf(roleLc) !== -1;
  }

  function _renderKpiStrip(el, session) {
    if (!el) return;
    var rl = String((session && session.role) || '').toLowerCase();
    if (!_roleShowsKpiStrip(rl)) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'grid';
    el.innerHTML =
      '<div class="kpi"><div class="kpi-val heading-display">338,164</div><div class="kpi-lbl">MTD bags</div></div>' +
      '<div class="kpi"><div class="kpi-val heading-display">42</div><div class="kpi-lbl">Active reps</div></div>' +
      '<div class="kpi"><div class="kpi-val heading-display">94%</div><div class="kpi-lbl">Of target</div></div>';
  }

  function _renderShortcuts(el) {
    if (!el) return;
    el.innerHTML =
      '<button type="button" class="shortcut" data-shortcut="overdue">' +
      '<span class="shortcut-icon">🚨</span><span class="shortcut-main"><span class="shortcut-title">3 Overdue</span>' +
      '<span class="shortcut-sub">Stores</span></span></button>' +
      '<button type="button" class="shortcut" data-shortcut="prospects">' +
      '<span class="shortcut-icon">✨</span><span class="shortcut-main"><span class="shortcut-title">3 New prospects</span>' +
      '<span class="shortcut-sub">Soon</span></span></button>' +
      '<button type="button" class="shortcut" data-shortcut="ar">' +
      '<span class="shortcut-icon">⏰</span><span class="shortcut-main"><span class="shortcut-title">2 AR at risk</span>' +
      '<span class="shortcut-sub">AR tab</span></span></button>' +
      '<button type="button" class="shortcut" data-shortcut="leader">' +
      '<span class="shortcut-icon">🏆</span><span class="shortcut-main"><span class="shortcut-title">Leaderboard</span>' +
      '<span class="shortcut-sub">Phase 4</span></span></button>';

    el.querySelectorAll('.shortcut').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-shortcut');
        if (k === 'overdue') {
          if (typeof window.nav === 'function') window.nav('page-stores');
          _toast('Stores — filter by overdue sa Phase 3');
        } else if (k === 'prospects') {
          _toast('Prospects view — Phase 4');
        } else if (k === 'ar') {
          if (typeof window.nav === 'function') window.nav('pg-ar');
        } else if (k === 'leader') {
          _toast('Leaderboard — Phase 4');
        }
      });
    });
  }

  function _totalReactions(r) {
    var n = 0;
    for (var k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k)) n += parseInt(r[k], 10) || 0;
    }
    return n;
  }

  function _renderPost(post, idx) {
    var reactions = _reactionsWithThumb(post, idx);
    var liked = _effectiveLiked(post, idx);
    var cls = 'post';
    if (post.type === 'achievement') cls += ' achievement';
    if (post.type === 'visit') cls += ' visit';
    if (post.user && post.user.pinned) cls += ' pinned-post';

    var bodyHtml = post.body || '';

    var html =
      '<article class="' +
      cls +
      '" data-post-idx="' +
      idx +
      '">' +
      '<div class="post-head">' +
      '<div class="post-avatar">' +
      _esc(post.user && post.user.initials) +
      '</div>' +
      '<div class="post-author">' +
      '<div class="post-author-name">' +
      _esc(post.user && post.user.name) +
      (post.user && post.user.verified
        ? '<span class="verified-badge" title="Verified">\u2713</span>'
        : '') +
      '</div>' +
      '<div class="post-author-meta">' +
      _esc(post.user && post.user.role) +
      ' · ' +
      _esc(post.time) +
      '</div>' +
      '</div>' +
      '<button type="button" class="post-action" aria-label="More">\u22ee</button>' +
      '</div>';

    if (post.type === 'visit' && post.pills) {
      html += '<div class="visit-meta-row">';
      for (var pi = 0; pi < post.pills.length; pi++) {
        var p = post.pills[pi];
        var pk = 'visit-meta-pill ' + (p.kind === 'success' ? 'success' : p.kind === 'orange' ? 'orange' : '');
        html += '<span class="' + pk + '">' + _esc(p.text) + '</span>';
      }
      html += '</div>';
    }

    html += '<div class="post-body">' + bodyHtml + '</div>';

    if (post.type === 'achievement' && post.achievement) {
      html +=
        '<div class="achievement-banner">' +
        '<span class="achievement-icon">' +
        _esc(post.achievement.icon) +
        '</span>' +
        '<div><div class="achievement-title">' +
        _esc(post.achievement.title) +
        '</div>' +
        '<div class="achievement-sub">' +
        _esc(post.achievement.subtitle) +
        '</div></div></div>';
    }

    if (post.type === 'visit' && post.bagCounter) {
      html +=
        '<div class="visit-bag-counter">' +
        '<div class="visit-bag-value heading-display">' +
        _fmt(post.bagCounter.value) +
        '</div>' +
        '<div class="visit-bag-label">' +
        _esc(post.bagCounter.sub) +
        '</div></div>';
    }

    var stackEmojis = [];
    for (var ek in reactions) {
      if (reactions[ek] > 0) stackEmojis.push(ek);
    }
    var stackHtml = '';
    for (var si = 0; si < Math.min(stackEmojis.length, 3); si++) {
      stackHtml += '<span class="reaction-emoji">' + stackEmojis[si] + '</span>';
    }

    html +=
      '<div class="post-stats">' +
      '<div class="reactions-row">' +
      '<div class="reaction-stack">' +
      stackHtml +
      '</div>' +
      '<span class="reaction-count-label">' +
      _totalReactions(reactions) +
      ' reactions</span>' +
      '</div>' +
      '<span class="comment-count">' +
      (post.comments || 0) +
      ' comments</span>' +
      '</div>';

    html +=
      '<div class="post-actions">' +
      '<button type="button" class="post-action-btn' +
      (liked ? ' active' : '') +
      '" data-feed-like="' +
      idx +
      '">👍 Like</button>' +
      '<button type="button" class="post-action-btn" data-feed-comment="' +
      idx +
      '">💬 Comment</button>' +
      '<button type="button" class="post-action-btn" data-feed-share="' +
      idx +
      '">🔁 Share</button>' +
      '</div>' +
      '</article>';

    return html;
  }

  function _fmt(n) {
    return (parseInt(n, 10) || 0).toLocaleString('en-US');
  }

  function _refreshPosts(mount) {
    var postsEl = mount.querySelector('[data-feed-posts]');
    if (!postsEl) return;
    var html = '';
    for (var i = 0; i < MOCK_FEED.length; i++) {
      html += _renderPost(MOCK_FEED[i], i);
    }
    postsEl.innerHTML = html;
  }

  function _bindPostsDelegated(mount) {
    var postsRoot = mount.querySelector('[data-feed-posts]');
    if (!postsRoot || postsRoot.getAttribute('data-feed-delegated') === '1') return;
    postsRoot.setAttribute('data-feed-delegated', '1');
    postsRoot.addEventListener('click', function (ev) {
      var tgt = ev.target;
      if (!tgt || !tgt.closest) return;
      var likeBtn = tgt.closest('[data-feed-like]');
      if (likeBtn) {
        var idx = parseInt(likeBtn.getAttribute('data-feed-like'), 10);
        if (!isFinite(idx)) return;
        var post = MOCK_FEED[idx];
        var cur = _effectiveLiked(post, idx);
        _feedReactionState[idx] = { userLiked: !cur };
        _refreshPosts(mount);
        return;
      }
      if (tgt.closest('[data-feed-comment]')) {
        _toast('Comments — Phase 5');
        return;
      }
      if (tgt.closest('[data-feed-share]')) {
        _toast('Share — Phase 5');
      }
    });
  }

  function initActivityFeed(slot) {
    var mount = document.getElementById('feed-mount-' + slot);
    if (!mount) return Promise.resolve();

    var session = typeof window.getSession === 'function' ? window.getSession() : null;
    var name = session && session.name ? session.name : 'Patrol';
    var greetLine = _feedGreeting(name);
    var composerHint = greetLine.replace(/!$/, '') + ' — share a win or visit…';

    mount.innerHTML =
      '<div class="feed-feed-mock-banner">Demo feed (mock data) — Phase 5 wires real posts</div>' +
      '<div class="stories" data-feed-stories></div>' +
      '<div class="composer">' +
      '<div class="composer-row">' +
      '<div class="avatar" data-composer-avatar></div>' +
      '<div class="composer-input" data-composer-input></div>' +
      '</div>' +
      '<div class="composer-actions">' +
      '<button type="button" data-feed-visit><span class="icon-tile" style="color:var(--danger,#e0413f)">📍</span> Visit</button>' +
      '<button type="button" data-feed-photo><span class="icon-tile" style="color:var(--success,#00b847)">📸</span> Photo</button>' +
      '<button type="button" data-feed-prospect><span class="icon-tile" style="color:var(--brand-gold-2,#fa9e1b)">🎯</span> Prospect</button>' +
      '</div></div>' +
      '<div class="shortcuts" data-feed-shortcuts></div>' +
      '<div class="kpi-strip" data-feed-kpi></div>' +
      '<div data-feed-posts></div>';

    var av = mount.querySelector('[data-composer-avatar]');
    if (av) {
      var initials = '?';
      if (session && session.name) {
        var parts = String(session.name).split(/\s+/).filter(Boolean);
        initials = ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
      }
      av.textContent = initials;
    }
    var ci = mount.querySelector('[data-composer-input]');
    if (ci) {
      ci.textContent = composerHint;
      ci.addEventListener('click', _openComposerStub);
    }

    var vBtn = mount.querySelector('[data-feed-visit]');
    if (vBtn) vBtn.addEventListener('click', openVisitFlow);
    var phBtn = mount.querySelector('[data-feed-photo]');
    if (phBtn) phBtn.addEventListener('click', _composerPhotoStub);
    var prBtn = mount.querySelector('[data-feed-prospect]');
    if (prBtn) prBtn.addEventListener('click', function () {
      _toast('Prospects — Phase 5');
    });

    _renderStoriesMount(mount);
    _renderShortcuts(mount.querySelector('[data-feed-shortcuts]'));
    _renderKpiStrip(mount.querySelector('[data-feed-kpi]'), session);

    _refreshPosts(mount);
    _bindPostsDelegated(mount);

    return Promise.resolve();
  }

  window.initActivityFeed = initActivityFeed;
  window.showFeedToast = showFeedToast;
})();
