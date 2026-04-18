// DSM End-of-Month Forecast Module — Sprint B-DSM
// Simple linear projection of team MTD volume to end of month.
// Consumes the agg output from calculateDsmScorecard().

(function () {
  var DEFAULT_TARGET_MT = 450; // Used when no explicit target is present on session/config
  var AVG_CONV_MT = 3;         // Rough MT per new conversion (used for "close gap with N more conversions")

  function _fNum(n, digits) {
    digits = (digits == null) ? 0 : digits;
    var x = parseFloat(n) || 0;
    return x.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // Compute EOM projection from agg.total_mt and the current calendar position.
  function computeForecast(agg, opts) {
    opts = opts || {};
    var now = new Date();
    var daysElapsed = now.getDate(); // 1-31
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var currentVolume = (agg && typeof agg.total_mt === 'number') ? agg.total_mt : 0;

    var projectedEom = daysElapsed > 0
      ? currentVolume * (daysInMonth / daysElapsed)
      : currentVolume;

    var target = opts.target || DEFAULT_TARGET_MT;
    var gap = target - projectedEom; // >0 = shortfall, <0 = exceeding

    // Coverage bar fill % (against target)
    var fillPct = target > 0 ? Math.max(0, Math.min(100, (currentVolume / target) * 100)) : 0;

    // Gap-closers
    var conversionsNeeded = gap > 0 ? Math.max(1, Math.ceil(gap / AVG_CONV_MT)) : 0;
    var lostCustomers = (agg && typeof agg.total_churned === 'number') ? agg.total_churned : 0;

    return {
      daysElapsed: daysElapsed,
      daysInMonth: daysInMonth,
      currentVolume: currentVolume,
      projectedEom: projectedEom,
      target: target,
      gap: gap,
      fillPct: fillPct,
      conversionsNeeded: conversionsNeeded,
      lostCustomers: lostCustomers
    };
  }

  function renderForecastCard(agg, opts) {
    var f = computeForecast(agg, opts);
    var gapAbs = Math.abs(f.gap);
    var isShort = f.gap > 0.5;
    var isExceeding = f.gap < -0.5;

    var projLine = isShort
      ? '<b>Projected: ' + _fNum(f.projectedEom, 0) + ' MT</b> \u2014 short ' + _fNum(gapAbs, 0) + ' MT'
      : isExceeding
        ? '<b>Projected: ' + _fNum(f.projectedEom, 0) + ' MT</b> \u2014 EXCEEDING target by ' + _fNum(gapAbs, 0) + ' MT'
        : '<b>Projected: ' + _fNum(f.projectedEom, 0) + ' MT</b> \u2014 on track to hit ' + _fNum(f.target, 0) + ' MT';

    var optionsHtml = '';
    if (isShort) {
      optionsHtml =
        '<div class="forecast-option">Close gap with ' + f.conversionsNeeded + ' more conversions (easier)</div>' +
        '<div class="forecast-option">OR 15% uplift top-10 accounts</div>';
      if (f.lostCustomers > 0) {
        optionsHtml += '<div class="forecast-option">OR reactivate ' + f.lostCustomers + ' lost customers</div>';
      }
    } else if (isExceeding) {
      optionsHtml =
        '<div class="forecast-option">Lock in gain \u2014 protect top-5 accounts</div>' +
        '<div class="forecast-option">Reinvest momentum into prospect pipeline</div>';
    } else {
      optionsHtml =
        '<div class="forecast-option">Stay the course \u2014 target within reach</div>';
    }

    var projCls = isExceeding ? 'forecast-projection exceeding' : 'forecast-projection';
    var barFill = Math.min(100, f.fillPct);

    return '<div class="forecast-card">' +
      '<div class="forecast-title">\ud83d\udcc8 End-of-month forecast</div>' +
      '<div class="forecast-bar">' +
        '<div class="forecast-fill" style="width:' + barFill.toFixed(1) + '%"></div>' +
        '<div class="forecast-target" style="left:100%"></div>' +
      '</div>' +
      '<div class="forecast-labels">' +
        '<span>0 MT</span>' +
        '<span>' + _fNum(f.currentVolume, 0) + ' MT today</span>' +
        '<span>' + _fNum(f.target, 0) + ' MT target</span>' +
      '</div>' +
      '<div class="' + projCls + '">' +
        '<div>' + projLine + '</div>' +
        optionsHtml +
      '</div>' +
      '<div style="margin-top:10px;font-size:11px;color:var(--text-secondary);text-align:right">' +
        'Day ' + f.daysElapsed + ' of ' + f.daysInMonth +
      '</div>' +
    '</div>';
  }

  window.computeDsmForecast = computeForecast;
  window.renderDsmForecastCard = renderForecastCard;
})();
