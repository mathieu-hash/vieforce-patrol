// Region / District / Territory admin (admin-org.html)

(function () {
  'use strict';

  var state = {
    regions: [],
    selectedRegionId: null,
    selectedDistrictId: null,
    filter: ''
  };

  function $(id) {
    return document.getElementById(id);
  }

  // Hybrid auth: prefer Bearer JWT (OAuth managers), fall back to x-session-id
  // (legacy PIN sessions — evp/marketing admins authenticate via PIN, so a
  // Bearer-only header 401s and the org tree never loads). Delegate to the
  // canonical authHeaders() in js/auth.js which handles both paths.
  function apiHeaders() {
    if (typeof window.authHeaders === 'function') return window.authHeaders();
    var p = (typeof window.getAuthBearer === 'function')
      ? window.getAuthBearer()
      : Promise.resolve(null);
    return p.then(function (bearer) {
      var h = { 'Content-Type': 'application/json' };
      if (bearer) h.Authorization = 'Bearer ' + bearer;
      return h;
    });
  }

  // Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
  function escapeHtml(s) {
    return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : (s == null ? '' : String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;'));
  }

  function normKey(s) {
    return String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function findByNormName(list, name, key) {
    var want = normKey(name);
    if (!want) return null;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (normKey(item[key || 'name']) === want) return item;
    }
    return null;
  }

  function ensureLegacyOption(sel, value) {
    if (!sel || !value) return;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === value) return;
    }
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value + ' (not in master — sync or pick below)';
    if (sel.options.length > 0) {
      sel.insertBefore(opt, sel.options[1] || null);
    } else {
      sel.appendChild(opt);
    }
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function' && document.getElementById('admin-toast') == null) {
      var t = document.createElement('div');
      t.id = 'admin-toast';
      t.className = 'admin-toast ' + (type === 'error' ? 'admin-toast--error' : 'admin-toast--success');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () {
        t.remove();
      }, 3200);
      return;
    }
    alert(msg);
  }

  function matchesFilter(text) {
    var q = state.filter.trim().toLowerCase();
    if (!q) return true;
    return String(text || '')
      .toLowerCase()
      .indexOf(q) !== -1;
  }

  function selectedRegion() {
    for (var i = 0; i < state.regions.length; i++) {
      if (state.regions[i].id === state.selectedRegionId) return state.regions[i];
    }
    return null;
  }

  function selectedDistrict() {
    var r = selectedRegion();
    if (!r || !r.districts) return null;
    for (var i = 0; i < r.districts.length; i++) {
      if (r.districts[i].id === state.selectedDistrictId) return r.districts[i];
    }
    return null;
  }

  function renderRegions() {
    var list = $('org-region-list');
    if (!list) return;
    var html = '';
    for (var i = 0; i < state.regions.length; i++) {
      var r = state.regions[i];
      if (!matchesFilter(r.name)) continue;
      var sel = r.id === state.selectedRegionId ? ' is-selected' : '';
      var badge =
        r.source === 'sap'
          ? '<span class="org-badge sap">SAP</span>'
          : '<span class="org-badge patrol">Patrol</span>';
      html +=
        '<li><button type="button" class="org-list-item' +
        sel +
        '" data-region-id="' +
        escapeHtml(r.id) +
        '">' +
        '<div class="org-item-title">' +
        escapeHtml(r.name) +
        badge +
        '</div>' +
        '<div class="org-item-meta">' +
        (r.districts ? r.districts.length : 0) +
        ' districts · ' +
        (r.user_count || 0) +
        ' users</div></button></li>';
    }
    list.innerHTML = html || '<li class="org-empty">No regions. Tap Sync from SAP.</li>';
    list.querySelectorAll('[data-region-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedRegionId = btn.getAttribute('data-region-id');
        var r = selectedRegion();
        state.selectedDistrictId =
          r && r.districts && r.districts[0] ? r.districts[0].id : null;
        renderAll();
      });
    });
  }

  function renderDistricts() {
    var list = $('org-district-list');
    if (!list) return;
    var r = selectedRegion();
    if (!r) {
      list.innerHTML = '<li class="org-empty">Select a region</li>';
      return;
    }
    var html = '';
    var districts = r.districts || [];
    for (var i = 0; i < districts.length; i++) {
      var d = districts[i];
      if (!matchesFilter(d.name + ' ' + (d.sap_district_label || ''))) continue;
      var sel = d.id === state.selectedDistrictId ? ' is-selected' : '';
      var sapMeta = '';
      if (d.sap_district_code != null) {
        sapMeta = 'SAP code ' + d.sap_district_code;
        if (d.sap_district_label) sapMeta += ' · ' + d.sap_district_label;
      }
      html +=
        '<li><button type="button" class="org-list-item' +
        sel +
        '" data-district-id="' +
        escapeHtml(d.id) +
        '">' +
        '<div class="org-item-title">' +
        escapeHtml(d.name) +
        '<span class="org-badge sap">SAP</span></div>' +
        '<div class="org-item-meta">' +
        escapeHtml(sapMeta || 'Patrol district') +
        ' · ' +
        (d.territories ? d.territories.length : 0) +
        ' territories · ' +
        (d.user_count || 0) +
        ' users</div></button></li>';
    }
    list.innerHTML = html || '<li class="org-empty">No districts in this region.</li>';
    list.querySelectorAll('[data-district-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedDistrictId = btn.getAttribute('data-district-id');
        renderDistricts();
        renderTerritories();
      });
    });
  }

  function renderTerritories() {
    var list = $('org-territory-list');
    if (!list) return;
    var d = selectedDistrict();
    if (!d) {
      list.innerHTML = '<li class="org-empty">Select a district</li>';
      return;
    }
    var html = '';
    var territories = d.territories || [];
    for (var i = 0; i < territories.length; i++) {
      var t = territories[i];
      if (!matchesFilter(t.name)) continue;
      html +=
        '<li class="org-list-item" style="cursor:default">' +
        '<div class="org-item-title">' +
        escapeHtml(t.name) +
        '<span class="org-badge patrol">Patrol</span></div>' +
        '<div class="org-item-meta">' +
        (t.user_count || 0) +
        ' users · ' +
        (t.is_active ? 'Active' : 'Inactive') +
        ' <button type="button" class="tbl-btn danger" style="margin-left:8px;padding:4px 8px;font-size:10px" data-del-territory="' +
        escapeHtml(t.id) +
        '">Remove</button></div></li>';
    }
    list.innerHTML = html || '<li class="org-empty">No territories yet. Add one below.</li>';
    list.querySelectorAll('[data-del-territory]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var tid = btn.getAttribute('data-del-territory');
        if (!confirm('Remove territory "' + btn.closest('li').querySelector('.org-item-title').textContent.trim() + '"?')) {
          return;
        }
        postOrg({ action: 'territory_delete', id: tid }).then(loadOrg);
      });
    });
  }

  function renderAll() {
    renderRegions();
    renderDistricts();
    renderTerritories();
  }

  function postOrg(body) {
    return apiHeaders().then(function (headers) {
      return fetch('/api/admin/org', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && (data.message || data.error)) || 'HTTP ' + res.status);
        return data;
      });
    });
  }

  function loadOrg() {
    var loading = $('org-loading');
    var errBox = $('org-error');
    var layout = $('org-layout');
    loading.classList.remove('hidden');
    if (loading) loading.setAttribute('aria-busy', 'true');
    errBox.classList.add('hidden');
    layout.classList.add('hidden');

    return apiHeaders()
      .then(function (headers) {
        return fetch('/api/admin/org', { headers: headers, cache: 'no-store' });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && (data.message || data.error)) || 'HTTP ' + res.status);
          return data;
        });
      })
      .then(function (data) {
        state.regions = (data && data.regions) || [];
        if (!state.selectedRegionId && state.regions[0]) {
          state.selectedRegionId = state.regions[0].id;
          if (state.regions[0].districts && state.regions[0].districts[0]) {
            state.selectedDistrictId = state.regions[0].districts[0].id;
          }
        }
        loading.classList.add('hidden');
        if (loading) loading.setAttribute('aria-busy', 'false');
        layout.classList.remove('hidden');
        renderAll();
        if (window.PatrolAdminOrgPicklists) {
          window.PatrolAdminOrgPicklists.setCache(state.regions);
        }
      })
      .catch(function (err) {
        console.error('[admin-org]', err);
        loading.classList.add('hidden');
        if (loading) loading.setAttribute('aria-busy', 'false');
        $('org-error-msg').textContent = err.message || String(err);
        errBox.classList.remove('hidden');
      });
  }

  function syncSap() {
    var btn = $('org-sync-sap');
    if (btn) btn.disabled = true;
    postOrg({ action: 'sync_sap' })
      .then(function (data) {
        showToast(
          'SAP sync done: ' +
            (data.regions || 0) +
            ' regions, ' +
            (data.districts || 0) +
            ' districts',
          'success'
        );
        return loadOrg();
      })
      .catch(function (err) {
        showToast(err.message || 'Sync failed', 'error');
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function addTerritory() {
    var d = selectedDistrict();
    var input = $('org-new-territory');
    if (!d || !input) return;
    var name = input.value.trim();
    if (!name) {
      showToast('Enter a territory name', 'error');
      return;
    }
    postOrg({ action: 'territory_create', district_id: d.id, name: name })
      .then(function () {
        input.value = '';
        showToast('Territory added', 'success');
        return loadOrg();
      })
      .catch(function (err) {
        showToast(err.message || 'Failed', 'error');
      });
  }

  window.initAdminOrg = function () {
    var search = $('org-search');
    if (search) {
      search.addEventListener('input', function () {
        state.filter = search.value;
        renderAll();
      });
    }
    var syncBtn = $('org-sync-sap');
    if (syncBtn) syncBtn.addEventListener('click', syncSap);
    var retry = $('org-retry');
    if (retry) retry.addEventListener('click', loadOrg);
    var addBtn = $('org-add-territory');
    if (addBtn) addBtn.addEventListener('click', addTerritory);
    loadOrg();
  };

  /** Expose picklists for admin.html user modals */
  window.PatrolAdminOrgPicklists = {
    _cache: null,
    setCache: function (regions) {
      this._cache = regions;
    },
    ensureLoaded: function () {
      var self = this;
      if (self._cache) return Promise.resolve(self._cache);
      return apiHeaders()
        .then(function (headers) {
          return fetch('/api/admin/org', { headers: headers, cache: 'no-store' });
        })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error('org load failed');
            self._cache = (data && data.regions) || [];
            return self._cache;
          });
        })
        .catch(function () {
          self._cache = [];
          return self._cache;
        });
    },
    _fillDistricts: function (regions, dSel, regionName) {
      var html = '<option value="">— Select district —</option>';
      var regionMatch = findByNormName(regions, regionName);
      var regionKey = regionMatch ? regionMatch.name : regionName;
      for (var i = 0; i < regions.length; i++) {
        var r = regions[i];
        if (r.name !== regionKey) continue;
        var dists = r.districts || [];
        for (var j = 0; j < dists.length; j++) {
          var d = dists[j];
          if (d.is_active === false) continue;
          html +=
            '<option value="' +
            escapeHtml(d.name) +
            '">' +
            escapeHtml(d.name) +
            (d.sap_district_code != null ? ' (SAP ' + d.sap_district_code + ')' : '') +
            '</option>';
        }
      }
      dSel.innerHTML = html;
    },
    _fillTerritories: function (regions, tSel, regionName, districtName) {
      if (!tSel) return;
      var html = '<option value="">— Optional —</option>';
      var regionMatch = findByNormName(regions, regionName);
      var regionKey = regionMatch ? regionMatch.name : regionName;
      var districtMatch = null;
      if (regionMatch && regionMatch.districts) {
        districtMatch = findByNormName(regionMatch.districts, districtName);
      }
      var districtKey = districtMatch ? districtMatch.name : districtName;
      for (var i = 0; i < regions.length; i++) {
        var r = regions[i];
        if (r.name !== regionKey) continue;
        var dists = r.districts || [];
        for (var j = 0; j < dists.length; j++) {
          var d = dists[j];
          if (d.name !== districtKey) continue;
          var terrs = d.territories || [];
          for (var k = 0; k < terrs.length; k++) {
            var t = terrs[k];
            if (t.is_active === false) continue;
            html += '<option value="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</option>';
          }
        }
      }
      tSel.innerHTML = html;
    },
    wireSelects: function (regionId, districtId, territoryId) {
      var self = this;
      return this.ensureLoaded().then(function (regions) {
        var rSel = document.getElementById(regionId);
        var dSel = document.getElementById(districtId);
        var tSel = document.getElementById(territoryId);
        if (!rSel || !dSel) return;

        function fillRegions() {
          var html = '<option value="">— Select region —</option>';
          for (var i = 0; i < regions.length; i++) {
            var r = regions[i];
            if (r.is_active === false) continue;
            html +=
              '<option value="' +
              escapeHtml(r.name) +
              '">' +
              escapeHtml(r.name) +
              '</option>';
          }
          rSel.innerHTML = html;
        }

        fillRegions();
        if (rSel.dataset.orgPicklistWired !== '1') {
          rSel.dataset.orgPicklistWired = '1';
          rSel.addEventListener('change', function () {
            self._fillDistricts(regions, dSel, rSel.value);
            self._fillTerritories(regions, tSel, rSel.value, dSel.value);
          });
          dSel.addEventListener('change', function () {
            self._fillTerritories(regions, tSel, rSel.value, dSel.value);
          });
        }
        self._fillDistricts(regions, dSel, rSel.value);
        self._fillTerritories(regions, tSel, rSel.value, dSel.value);
      });
    },
    applyValues: function (regionId, districtId, territoryId, region, district, territory) {
      var self = this;
      return this.wireSelects(regionId, districtId, territoryId).then(function () {
        var rSel = document.getElementById(regionId);
        var dSel = document.getElementById(districtId);
        var tSel = document.getElementById(territoryId);
        if (!rSel || !dSel) return;
        var regions = self._cache || [];
        var regionRow = region ? findByNormName(regions, region) : null;
        var regionCanon = regionRow ? regionRow.name : region;
        if (region) {
          ensureLegacyOption(rSel, regionCanon || region);
          rSel.value = regionCanon || region;
          self._fillDistricts(regions, dSel, rSel.value);
        }
        if (district) {
          var districtRow =
            regionRow && regionRow.districts ? findByNormName(regionRow.districts, district) : null;
          var districtCanon = districtRow ? districtRow.name : district;
          ensureLegacyOption(dSel, districtCanon || district);
          dSel.value = districtCanon || district;
        }
        if (tSel) {
          self._fillTerritories(regions, tSel, rSel.value, dSel.value);
          if (territory) {
            ensureLegacyOption(tSel, territory);
            tSel.value = territory;
          }
        }
      });
    }
  };
})();
