// DSM Coaching Moments Module — Sprint B-DSM
// Auto-generates 1:1 coaching cards per TSR based on scorecard signals.
// Consumes the agg output from calculateDsmScorecard() and (optional) audit flags map.
//
// Card types:
//   urgent    — idle 3+ days OR -50% conversion vs LM OR has critical audit flag
//   positive  — top rank in team for any primary metric this week
//   push      — scorecard flat (mid-range stars, no growth)
//
// Ordering priority: urgent → positive → push.
// Caps at 4 cards total to avoid overwhelming the panel.

(function () {
  var MAX_CARDS = 4;

  function _dcEsc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _initials(name) {
    if (!name) return '?';
    var parts = String(name).split(/\s+/);
    return ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  function _card(type, label, name, issue, suggestion, avBg) {
    var avStyle = avBg ? ('background:' + avBg) : '';
    return '<div class="coaching-card ' + type + '">' +
      '<div class="coaching-top">' +
        '<div class="coaching-av" style="' + avStyle + '">' + _dcEsc(_initials(name)) + '</div>' +
        '<div>' +
          '<div class="coaching-for">' + _dcEsc(label) + '</div>' +
          '<div class="coaching-name">' + _dcEsc(name) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="coaching-issue">' + _dcEsc(issue) + '</div>' +
      '<div class="coaching-suggestion">' + suggestion + '</div>' +
    '</div>';
  }

  // Given an agg (from calculateDsmScorecard) and optional auditFlagsByTsr { tsr_id: [{severity,type,text}] }
  // returns an HTML string for the coaching panel.
  function generateCoachingCards(agg, auditFlagsByTsr) {
    if (!agg || !agg.tsr_scorecards || agg.tsr_scorecards.length === 0) {
      return '<div class="coaching-empty">Walang coaching moments — add TSRs to your team para mag-generate.</div>';
    }
    auditFlagsByTsr = auditFlagsByTsr || {};
    var tsrs = agg.tsr_scorecards;
    var cards = [];

    // Find team leaders for positive reinforcement
    var topOverall = null, topConversion = null, topNewStores = null;
    tsrs.forEach(function (t) {
      if (!topOverall || t.overall > topOverall.overall) topOverall = t;
      if (!topConversion || t.conversion.converted > topConversion.conversion.converted) topConversion = t;
      if (!topNewStores || t.prospection.new_stores > topNewStores.prospection.new_stores) topNewStores = t;
    });

    tsrs.forEach(function (t) {
      var name = t.tsr_name;
      var flags = auditFlagsByTsr[t.tsr_id] || [];
      var hasCritical = flags.some(function (f) { return f.severity === 'critical'; });
      var grad = (typeof getGradient === 'function') ? getGradient(t.tsr_id) : '';

      // URGENT: pipeline empty / conversion collapse / critical audit
      if (hasCritical) {
        var auditFlag = flags.filter(function (f) { return f.severity === 'critical'; })[0];
        cards.push({
          priority: 1,
          html: _card(
            'urgent',
            '1:1 this week',
            name,
            (auditFlag && auditFlag.text) || 'Critical audit flag detected — review visits this week.',
            '\ud83d\udcac Suggested topic: "GPS verification + visit discipline"',
            grad
          )
        });
      } else if (t.conversion.converted === 0 && t.prospection.prospects_count >= 2) {
        cards.push({
          priority: 1,
          html: _card(
            'urgent',
            '1:1 this week',
            name,
            t.prospection.prospects_count + ' prospects, 0 conversions MTD. Pipeline stalled.',
            '\ud83d\udcac Suggested topic: "Pipeline health — why prospects aren\'t closing"',
            grad
          )
        });
      } else if (t.overall < 2) {
        cards.push({
          priority: 1,
          html: _card(
            'urgent',
            '1:1 this week',
            name,
            'Overall scorecard ' + t.overall + '\u2605. Below team average — needs intervention.',
            '\ud83d\udcac Suggested topic: "Territory coverage strategy"',
            grad
          )
        });
      }
      // POSITIVE: top-1 for a primary metric
      else if (topConversion && topConversion.tsr_id === t.tsr_id && t.conversion.converted >= 2) {
        cards.push({
          priority: 2,
          html: _card(
            'positive',
            'Positive reinforcement',
            name,
            t.conversion.converted + ' conversions this month — team best.',
            '\ud83c\udf1f Ask to share playbook with team',
            'linear-gradient(135deg,#31A24C,#16A34A)'
          )
        });
      } else if (topOverall && topOverall.tsr_id === t.tsr_id && t.overall >= 4) {
        cards.push({
          priority: 2,
          html: _card(
            'positive',
            'Positive reinforcement',
            name,
            'Team-best scorecard (' + t.overall + '\u2605). Retention ' + t.retention.visited_pct + '%, growth ' + (t.growth.growth_pct >= 0 ? '+' : '') + t.growth.growth_pct + '%.',
            '\ud83c\udf1f Ask to record playbook video for team',
            'linear-gradient(135deg,#31A24C,#16A34A)'
          )
        });
      } else if (topNewStores && topNewStores.tsr_id === t.tsr_id && t.prospection.new_stores >= 3) {
        cards.push({
          priority: 2,
          html: _card(
            'positive',
            'Positive reinforcement',
            name,
            t.prospection.new_stores + ' bagong tindahan this month — top prospector.',
            '\ud83c\udf1f Share prospecting routes with team',
            'linear-gradient(135deg,#31A24C,#16A34A)'
          )
        });
      }
      // NEEDS PUSH: mid-range scorecard, flat growth
      else if (t.overall >= 2 && t.overall < 3.5 && Math.abs(t.growth.growth_pct) < 3) {
        // Pick the weakest stage to focus coaching
        var stages = [
          { key: 'prospection', stars: t.prospection.stars, topic: 'prospecting routes + new-store cadence' },
          { key: 'conversion',  stars: t.conversion.stars,  topic: 'trial tactics + closing technique' },
          { key: 'retention',   stars: t.retention.stars,   topic: 'visit cadence + route optimization' },
          { key: 'growth',      stars: t.growth.stars,      topic: 'upsell techniques + product knowledge refresh' }
        ];
        stages.sort(function (a, b) { return a.stars - b.stars; });
        var weakest = stages[0];
        cards.push({
          priority: 3,
          html: _card(
            'push',
            'Needs push',
            name,
            'Scorecard flat at ' + t.overall + '\u2605. Growth ' + (t.growth.growth_pct >= 0 ? '+' : '') + t.growth.growth_pct + '% — momentum stalled.',
            '\ud83d\udcdd Discuss: ' + weakest.topic,
            'linear-gradient(135deg,#F59E0B,#EA580C)'
          )
        });
      }
    });

    cards.sort(function (a, b) { return a.priority - b.priority; });
    cards = cards.slice(0, MAX_CARDS);

    if (cards.length === 0) {
      return '<div class="coaching-empty">\u2728 Walang urgent coaching moments. Lahat ng TSR on-track.</div>';
    }

    var html = '';
    for (var i = 0; i < cards.length; i++) html += cards[i].html;
    return html;
  }

  window.generateCoachingCards = generateCoachingCards;
})();
