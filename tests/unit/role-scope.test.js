/**
 * Client-side PatrolScope helpers — js/role-scope.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

require('../../js/role-scope.js');

function withUser(user, fn) {
  window.PatrolSession = { user };
  fn();
  delete window.PatrolSession;
}

test('TSR cannot see bags', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeBags(), false);
  });
});

test('TSR cannot see leaderboard', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeLeaderboard(), false);
  });
});

test('TSR cannot see KPI strip', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeKpiStrip(), false);
  });
});

test('TSR cannot see stories', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeStories(), false);
  });
});

test('TSR home is page-home-tsr', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    assert.strictEqual(window.PatrolScope.homePageId(), 'page-home-tsr');
  });
});

test('DSM can see bags', () => {
  withUser({ role: 'dsm', id: '1', name: 'D' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeBags(), true);
  });
});

test('DSM cannot see KPI strip', () => {
  withUser({ role: 'dsm', id: '1', name: 'D' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeKpiStrip(), false);
  });
});

test('DSM home is page-home-dsm', () => {
  withUser({ role: 'dsm', id: '1', name: 'D' }, () => {
    assert.strictEqual(window.PatrolScope.homePageId(), 'page-home-dsm');
  });
});

test('RSM uses rich feed shell page-rsm-home', () => {
  withUser({ role: 'rsm', id: '1', name: 'R' }, () => {
    assert.strictEqual(window.PatrolScope.homePageId(), 'page-rsm-home');
  });
});

test('RSM can see KPI strip', () => {
  withUser({ role: 'rsm', id: '1', name: 'R' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeKpiStrip(), true);
  });
});

test('RSM can see stories', () => {
  withUser({ role: 'rsm', id: '1', name: 'R' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeStories(), true);
  });
});

test('Exec-tier sees rich home and gates', () => {
  withUser({ role: 'ceo', id: '1', name: 'E' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeBags(), true);
    assert.strictEqual(window.PatrolScope.canSeeLeaderboard(), true);
    assert.strictEqual(window.PatrolScope.canSeeStories(), true);
    assert.strictEqual(window.PatrolScope.homePageId(), 'page-rsm-home');
  });
});

test('TSR badge catalog has no bag-based achievements', () => {
  withUser({ role: 'tsr', id: '1', name: 'T' }, () => {
    const badges = window.PatrolScope.badgeCatalog();
    const hasBagBadge = badges.some(
      (b) =>
        String(b.name || '')
          .toLowerCase()
          .includes('10k') ||
        String(b.name || '')
          .toLowerCase()
          .includes('diamond')
    );
    assert.strictEqual(hasBagBadge, false);
  });
});

test('Champion mirrors TSR visibility gates', () => {
  withUser({ role: 'champion', id: '1', name: 'C' }, () => {
    assert.strictEqual(window.PatrolScope.canSeeLeaderboard(), false);
    assert.strictEqual(window.PatrolScope.homePageId(), 'page-home-tsr');
  });
});
