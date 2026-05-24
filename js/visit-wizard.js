// Visit Wizard Module — Messenger-pattern visit recording
// Replaces 4-step wizard with: info bubble → outcome chips → mini-form → submit

var _visitData = {
  storeId: null, storeName: '', storePhone: '',
  visit_type: 'regular', outcome: null,
  order_taken: false, order_amount: 0,
  merch_score: 0, merch_items: {},
  competitor_notes: '',
  photo: null, photo_url: null,
  notes: '',
  lat: null, lng: null
};

// R2 Track 2A (Q-P1-1): module-scoped trackers for blob URLs created via
// URL.createObjectURL(). On a 2GB Redmi A3x ~30 retained URL handles/day
// adds up to real GC pressure. Every assignment site below must revoke
// the previous URL before creating a new one, and the form open/close/
// submit paths must revoke + null these out.
var _currentPhotoBlobUrl = null;        // preview thumbnail (line ~303)
var _currentBubblePhotoBlobUrl = null;  // chat-bubble preview (line ~470)

function _revokeVisitBlobUrls() {
  if (_currentPhotoBlobUrl) {
    try { URL.revokeObjectURL(_currentPhotoBlobUrl); } catch (_e) {}
    _currentPhotoBlobUrl = null;
  }
  if (_currentBubblePhotoBlobUrl) {
    try { URL.revokeObjectURL(_currentBubblePhotoBlobUrl); } catch (_e) {}
    _currentBubblePhotoBlobUrl = null;
  }
}

async function openVisitWizard(storeId, storeName) {
  // R2 Track 2A (Q-P1-1): drop any blob URLs left over from a previous
  // open of this form (e.g. user backed out without submitting).
  _revokeVisitBlobUrls();

  // Reset state
  _visitData = {
    storeId: storeId, storeName: storeName || '', storePhone: '',
    visit_type: 'regular', outcome: null,
    order_taken: false, order_amount: 0,
    merch_score: 0, merch_items: {},
    competitor_notes: '',
    photo: null, photo_url: null,
    notes: '',
    lat: null, lng: null,
    gps_failed: false
  };

  // Set header
  document.getElementById('visit-wiz-title').textContent = storeName || 'Visit';

  // Reset outcome chips (supports both .outcome-chip and .outcome)
  var chips = document.querySelectorAll('#visit-outcome-grid .outcome-chip, #visit-outcome-grid .outcome');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('selected', 'sel-g', 'sel-b', 'sel-o');

  // Close any open exp-forms
  var expForms = document.querySelectorAll('.exp-form');
  for (var ef = 0; ef < expForms.length; ef++) expForms[ef].classList.remove('open');

  // Hide details panel until outcome selected
  var detailsPanel = document.getElementById('visit-details-panel');
  if (detailsPanel) detailsPanel.style.display = 'none';
  var orderPanel = document.getElementById('visit-order-panel');
  if (orderPanel) { orderPanel.style.display = 'none'; orderPanel.classList.remove('open'); }
  document.getElementById('visit-order-amount').value = '';

  // Reset merch
  var merchChecks = document.querySelectorAll('#visit-merch-list .merch-check-item');
  for (var j = 0; j < merchChecks.length; j++) {
    merchChecks[j].classList.remove('checked', 'on');
    var dot = merchChecks[j].querySelector('.merch-check');
    if (dot) dot.textContent = '\u2713';
  }
  _visitData.merch_items = {};

  // Reset photo + notes
  var _empty = document.getElementById('photo-hero-empty');
  var _preview = document.getElementById('photo-hero-preview');
  if (_empty) _empty.style.display = 'flex';
  if (_preview) _preview.style.display = 'none';
  _visitData.photo = null;
  document.getElementById('visit-extra-notes').value = '';
  document.getElementById('visit-submit-error').style.display = 'none';
  var submitBtn = document.getElementById('btn-visit-submit');
  if (submitBtn) { submitBtn.className = 'sub-btn'; submitBtn.style.background = ''; }
  // Dynamic label is set by _updateVisitSubmitState() based on gate state.
  _updateVisitSubmitState();

  // Populate store info bubble
  var infoBubble = document.getElementById('visit-store-info');
  if (infoBubble) {
    infoBubble.innerHTML = '<b>' + _esc(storeName) + '</b>';
    // Try to load full store data for richer info
    try {
      var store = await getStoreById(storeId);
      if (store) {
        _visitData.storePhone = store.phone || '';
        var parts = [];
        if (store.city) parts.push('\ud83d\udccd ' + _esc(store.city));
        if (store.owner_name) {
          var oc = '\ud83d\udc64 ' + _esc(store.owner_name);
          if (store.phone) oc += ' \u00b7 ' + _esc(store.phone);
          else if (store.owner_messenger && String(store.owner_messenger).trim()) {
            oc += ' \u00b7 Messenger: ' + _esc(String(store.owner_messenger).trim());
          }
          parts.push(oc);
        } else if (store.owner_messenger && String(store.owner_messenger).trim()) {
          parts.push('\ud83d\udcac Messenger: ' + _esc(String(store.owner_messenger).trim()));
        }
        if (store.bags_per_month) parts.push('\ud83d\udce6 ' + store.bags_per_month + ' ' + T.bagsMonth);
        infoBubble.innerHTML = '<b>' + _esc(store.name) + '</b>' +
          (parts.length ? '<br>' + parts.join('<br>') : '');
      }
    } catch (e) { /* keep simple info */ }
  }

  // Populate previous visit bubble
  var prevContainer = document.getElementById('visit-prev-container');
  if (prevContainer) {
    prevContainer.innerHTML = '';
    try {
      var visits = await getVisitsByStore(storeId);
      if (visits && visits.length > 0) {
        var last = visits[0];
        var vDate = formatRelativeTimeTagalog ? formatRelativeTimeTagalog(last.visited_at) : formatRelativeTime(last.visited_at);
        var vType = (last.visit_type || 'regular').charAt(0).toUpperCase() + (last.visit_type || '').slice(1);
        var prevHtml = '<div class="visit-bubble-sender">' + vDate + '</div>';
        prevHtml += '<div class="visit-bubble">';
        prevHtml += vType;
        if (last.order_taken) prevHtml += ' \u00b7 ' + T.ordered + ' \u20b1' + (parseFloat(last.order_amount) || 0).toLocaleString();
        if (last.notes) prevHtml += '<br><span style="color:var(--text-muted)">' + _esc(last.notes.substring(0, 80)) + '</span>';
        prevHtml += '</div>';
        prevContainer.innerHTML = prevHtml;
      }
    } catch (e) { /* no previous visit */ }
  }

  // Hide GPS warning + status from previous session
  var gpsWarning = document.getElementById('visit-gps-warning');
  var gpsStatus = document.getElementById('visit-gps-status');
  if (gpsWarning) gpsWarning.style.display = 'none';
  if (gpsStatus) gpsStatus.style.display = 'none';

  // Open bottom sheet instead of full-page navigation
  if (typeof openVisitSheet === 'function') {
    // Set sheet header
    var sheetAv = document.getElementById('visit-sheet-av');
    var sheetLoc = document.getElementById('visit-sheet-loc');
    if (sheetAv) {
      var ini = (storeName || '?').charAt(0).toUpperCase();
      var sec = (storeName || '').split(/\s+/)[1];
      sheetAv.textContent = ini + (sec ? sec.charAt(0).toUpperCase() : '');
    }
    if (sheetLoc) sheetLoc.textContent = '\ud83d\udccd ' + (storeName || '');
    openVisitSheet();
  } else {
    nav('page-visit-wizard');
  }

  // Pre-check GPS (non-blocking — TSR can still submit without GPS)
  _preCheckGPS();
}

async function _preCheckGPS() {
  var gpsWarning = document.getElementById('visit-gps-warning');
  var gpsStatus = document.getElementById('visit-gps-status');
  if (gpsStatus) {
    gpsStatus.style.display = 'block';
    gpsStatus.textContent = T.gpsAcquiring;
  }

  var gps = await getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    allowCached: true,
    cacheMaxAge: 10 * 60 * 1000
  });

  if (gps) {
    _visitData.lat = gps.lat;
    _visitData.lng = gps.lng;
    _visitData.gps_failed = false;
    if (gpsStatus) {
      gpsStatus.textContent = T.gpsOk + ' (' + gps.lat.toFixed(4) + ', ' + gps.lng.toFixed(4) + ')';
      gpsStatus.style.color = 'var(--status-ok)';
    }
    if (gpsWarning) gpsWarning.style.display = 'none';
  } else {
    _visitData.gps_failed = true;
    if (gpsWarning) gpsWarning.style.display = 'block';
    if (gpsStatus) gpsStatus.style.display = 'none';
  }
}

// Outcome chip selection — the core 2-tap UX
function selectOutcome(outcome) {
  _visitData.outcome = outcome;

  // Reset all outcome chips (supports both .outcome-chip and .outcome classes)
  var chips = document.querySelectorAll('#visit-outcome-grid .outcome-chip, #visit-outcome-grid .outcome');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.remove('selected', 'sel-g', 'sel-b', 'sel-o');
  }

  // Highlight selected chip
  var selMap = { 'order': 'sel-g', 'no-order': 'sel-b', 'comeback': 'sel-o' };
  for (var j = 0; j < chips.length; j++) {
    if (chips[j].getAttribute('data-outcome') === outcome) {
      chips[j].classList.add('selected');
      if (selMap[outcome]) chips[j].classList.add(selMap[outcome]);
    }
  }

  // Close all exp-forms, then open the right one
  var expForms = document.querySelectorAll('.exp-form');
  for (var ef = 0; ef < expForms.length; ef++) {
    expForms[ef].classList.remove('open');
  }

  // Set visit type based on outcome
  if (outcome === 'order') {
    _visitData.visit_type = 'order';
    _visitData.order_taken = true;
  } else if (outcome === 'no-order') {
    _visitData.visit_type = 'regular';
    _visitData.order_taken = false;
  } else if (outcome === 'comeback') {
    _visitData.visit_type = 'regular';
    _visitData.order_taken = false;
  }

  // Show details panel
  var detailsPanel = document.getElementById('visit-details-panel');
  if (detailsPanel) detailsPanel.style.display = 'block';

  // Show/hide order form (supports both old display toggle and new .exp-form.open)
  var orderPanel = document.getElementById('visit-order-panel');
  if (orderPanel) {
    if (outcome === 'order') {
      orderPanel.style.display = 'block';
      orderPanel.classList.add('open');
    } else {
      orderPanel.style.display = 'none';
      orderPanel.classList.remove('open');
    }
  }

  // For "comeback" — auto-set a note
  if (outcome === 'comeback') {
    var notesEl = document.getElementById('visit-extra-notes');
    if (notesEl && !notesEl.value) {
      notesEl.value = T.willReturn;
    }
  }

  // Enable submit only when both outcome + selfie are present
  var submitBtn = document.getElementById('btn-visit-submit');
  if (submitBtn) {
    _updateVisitSubmitState();
    submitBtn.style.transform = 'scale(1.03)';
    setTimeout(function() { submitBtn.style.transform = ''; }, 200);
  }
}

function visitBack() {
  // R2 Track 2A (Q-P1-1): user is cancelling — no bubble was created so
  // both blob URLs are safe to revoke immediately.
  _revokeVisitBlobUrls();
  if (typeof closeVisitSheet === 'function') {
    closeVisitSheet();
  } else {
    nav('page-store-detail');
  }
}

// Call store owner (phone link)
function callStoreOwner() {
  if (_visitData.storePhone) {
    window.location.href = 'tel:' + _visitData.storePhone;
  }
}

function toggleMerchItem(el) {
  var item = el.getAttribute('data-item');
  if (!item) return;

  el.classList.toggle('on');
  el.classList.toggle('checked'); // keep legacy class for any leftover references
  var isOn = el.classList.contains('on');

  _visitData.merch_items[item] = isOn;
  _updateMerchScore();
}

function _updateMerchScore() {
  var count = 0;
  for (var key in _visitData.merch_items) {
    if (_visitData.merch_items[key]) count++;
  }
  _visitData.merch_score = count;
}

function _updateVisitSubmitState() {
  var submitBtn = document.getElementById('btn-visit-submit');
  if (!submitBtn) return;
  var hasOutcome = !!_visitData.outcome;
  var hasPhoto = !!(_visitData.photo || _visitData.photo_url);
  submitBtn.disabled = !(hasOutcome && hasPhoto);
  // Dynamic CTA label tied to gate state so the TSR always sees the next step.
  if (!hasOutcome) {
    submitBtn.textContent = 'Piliin muna ang outcome';
  } else if (!hasPhoto) {
    submitBtn.textContent = (T && T.takePhoto) ? T.takePhoto : 'Kumuha ng litrato';
  } else {
    submitBtn.textContent = '📤 ' + ((T && T.submitVisit) || 'I-SUBMIT');
  }
}

async function captureVisitPhoto() {
  var empty = document.getElementById('photo-hero-empty');
  var preview = document.getElementById('photo-hero-preview');
  try {
    var blob = await capturePhoto();
    if (blob) {
      _visitData.photo = blob;
      // R2 Track 2A (Q-P1-1): revoke the previous preview URL before
      // assigning a new one. Retake-photo path used to leak every prior
      // blob handle for the lifetime of the form.
      if (_currentPhotoBlobUrl) {
        try { URL.revokeObjectURL(_currentPhotoBlobUrl); } catch (_e) {}
      }
      _currentPhotoBlobUrl = URL.createObjectURL(blob);
      var img = document.getElementById('visit-photo-img');
      if (img) img.src = _currentPhotoBlobUrl;
      if (empty) empty.style.display = 'none';
      if (preview) preview.style.display = 'flex';
      _updateVisitSubmitState();
    }
  } catch (err) { console.warn('captureVisitPhoto:', err); }
}

async function submitVisit() {
  var errorEl = document.getElementById('visit-submit-error');
  var submitBtn = document.getElementById('btn-visit-submit');
  errorEl.style.display = 'none';

  // Must select an outcome first
  if (!_visitData.outcome) {
    errorEl.textContent = T.whatHappened;
    errorEl.style.display = 'block';
    return;
  }
  if (!_visitData.photo && !_visitData.photo_url) {
    errorEl.textContent = T.photoMandatory || 'Required for this visit';
    errorEl.style.display = 'block';
    return;
  }

  // Collect final data from form
  _visitData.notes = (document.getElementById('visit-extra-notes').value || '').trim();
  var rawAmount = parseFloat(document.getElementById('visit-order-amount').value) || 0;
  _visitData.order_amount = Math.max(0, Math.min(9999999999, rawAmount));
  _updateMerchScore();

  // Validate
  if (_visitData.notes.length > 1000) {
    errorEl.textContent = T.submitFail;
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = T.syncing;

  try {
    // 1. Get GPS — try again if pre-check failed, but don't block
    if (!_visitData.lat && !_visitData.lng) {
      var gps = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        allowCached: true,
        cacheMaxAge: 10 * 60 * 1000
      });
      if (gps) {
        _visitData.lat = gps.lat;
        _visitData.lng = gps.lng;
        _visitData.gps_failed = false;
      } else {
        _visitData.gps_failed = true;
      }
    }

    // 2. Convert photo Blob to base64 for IndexedDB persistence
    var photoBase64 = null;
    if (_visitData.photo) {
      try {
        photoBase64 = await _blobToBase64(_visitData.photo);
      } catch (e) { /* photo conversion failed — continue without */ }
    }

    // 3. Photos upload only in syncPending() after queue — avoids Storage orphans if insert fails

    // 4. Build visit payload (photo_base64 persists in IndexedDB for offline upload)
    var session = getSession();
    var visitPayload = {
      store_id: _visitData.storeId,
      tsr_id: session ? session.id : null,
      visit_type: ['mapping','regular','order','merch','farm'].indexOf(_visitData.visit_type) !== -1 ? _visitData.visit_type : 'regular',
      lat: _visitData.lat,
      lng: _visitData.lng,
      photo_url: _visitData.photo_url || null,
      photo_base64: photoBase64 || null,
      notes: _visitData.notes || '',
      order_taken: _visitData.order_taken,
      order_amount: _visitData.order_amount,
      merch_score: _visitData.merch_score,
      gps_failed: _visitData.gps_failed || false,
      visited_at: new Date().toISOString()
    };

    // 4. RULE 1: ALWAYS write to IndexedDB FIRST, then sync to server
    await queueVisit(visitPayload);

    // 4b. Phase 3 — First-order celebration if this visit converts a prospect
    //     Triggers when outcome = order AND current store.store_status = 'prospect'.
    //
    //     Wave 2 (Audit D O3): route the prospect→active conversion through
    //     the offline queue. UI fires immediately (the celebration toast); the
    //     server update is durable across signal drops. Previously this used
    //     a direct updateStore() call wrapped in a silent /* non-critical */
    //     catch — the celebration moment we ship for adoption was the moment
    //     most likely to silently lose data offline.
    try {
      var storeNow = await getStoreById(_visitData.storeId);
      if (storeNow && storeNow.store_status === 'prospect' && _visitData.order_taken) {
        await queueStoreUpdate({
          store_id: _visitData.storeId,
          patch: {
            store_status: 'active',
            prospect_stage: 'converted',
            converted_at: new Date().toISOString()
          }
        });
        if (typeof showConversionCelebration === 'function') {
          showConversionCelebration(storeNow.name || (_visitData.storeName || ''));
        }
      }
    } catch (e) {
      // IDB write failed (quota etc.) — log so we can investigate.
      console.error('[visit-wizard] queueStoreUpdate (conversion) failed:', e);
    }

    submitBtn.textContent = T.syncing || 'Syncing...';

    // Update sync bar immediately
    if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();

    // 5. Attempt server sync now so the button reflects the real outcome.
    var visitSyncResult = (typeof _attemptImmediateSync === 'function')
      ? await _attemptImmediateSync('Visit')
      : { state: 'queued', message: '\u2713 ' + T.submitOk };
    if (typeof _applySaveResultToButton === 'function') {
      _applySaveResultToButton(submitBtn, visitSyncResult, '\u2713 ' + T.submitOk);
    } else {
      submitBtn.textContent = visitSyncResult.message || ('\u2713 ' + T.submitOk);
      submitBtn.className = 'big-button success';
    }

    // Update store's last_visit_at after the visit has actually synced.
    //
    // Wave 2 (Audit D O3): route the tick through the offline queue so the
    // "last visit" timestamp survives a signal drop between the visit
    // insert and this update. Idempotent on server (same timestamp written
    // twice is harmless). UI list refresh below still fires optimistically.
    if (visitSyncResult.state === 'synced') {
      try {
        await queueVisitTouch({
          store_id: _visitData.storeId,
          visited_at: visitPayload.visited_at
        });
      } catch (e) {
        console.error('[visit-wizard] queueVisitTouch failed:', e);
      }
    }

    // 6. Close sheet + append bubble to chat after brief delay
    setTimeout(function () {
      // R2 Track 2A (Q-P1-1): the preview-thumbnail blob URL is no
      // longer referenced (sheet is closing). Revoke now; the chat-
      // bubble blob URL stays alive until the next form open since
      // it's still attached to the appended <img>.
      if (_currentPhotoBlobUrl) {
        try { URL.revokeObjectURL(_currentPhotoBlobUrl); } catch (_e) {}
        _currentPhotoBlobUrl = null;
      }
      if (typeof closeVisitSheet === 'function') {
        closeVisitSheet();
      }
      // Append new visit bubble to chat thread
      var msgs = document.getElementById('detail-messages');
      if (msgs) {
        var newBubble = document.createElement('div');
        newBubble.className = 'msg-row out';
        newBubble.style.animation = 'msgPop 0.3s cubic-bezier(0.34,1.56,0.64,1)';
        var outcomeEmoji = _visitData.order_taken ? '\ud83d\uded2' : '\ud83d\udcac';
        var amountText = _visitData.order_taken ? ' \u00b7 \u20b1' + (_visitData.order_amount || 0).toLocaleString() : '';
        // R2 Track 2A (Q-P1-1): if no remote photo_url yet, mint a blob URL
        // for the chat-bubble thumbnail and track it so we can revoke it
        // on next form open / cancel. Browsers reclaim blob URLs when
        // their owning <img> is detached only after GC — explicit revoke
        // keeps memory pressure flat on 2GB Redmi A3x devices.
        var previewPhotoUrl = '';
        if (_visitData.photo_url) {
          previewPhotoUrl = _visitData.photo_url;
        } else if (_visitData.photo) {
          if (_currentBubblePhotoBlobUrl) {
            try { URL.revokeObjectURL(_currentBubblePhotoBlobUrl); } catch (_e) {}
          }
          _currentBubblePhotoBlobUrl = URL.createObjectURL(_visitData.photo);
          previewPhotoUrl = _currentBubblePhotoBlobUrl;
        }
        var timeNow = new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'});
        newBubble.innerHTML = '<div><div class="bubble out gradient">' +
          outcomeEmoji + ' ' + (T.ordered || 'Na-log') + amountText +
          (previewPhotoUrl ? '<div class="visit-bubble-photo-wrap"><img class="visit-bubble-photo" src="' + PatrolEscape.escapeAttr(previewPhotoUrl) + '" alt="Visit selfie"></div>' : '') +
          (_visitData.notes ? '<br><span style="opacity:0.85;font-size:13px">' + PatrolEscape.escapeHtml(_visitData.notes.substring(0, 80)) + '</span>' : '') +
          '</div><div class="msg-time out">' + timeNow + ' <span style="color:rgba(255,255,255,0.7)">\u2713</span></div></div>';
        msgs.appendChild(newBubble);
        msgs.scrollTop = msgs.scrollHeight;
      }
      // Refresh store list in background
      if (typeof renderStoreList === 'function') renderStoreList();
      if (typeof updateHomeKPIs === 'function') updateHomeKPIs();
    }, visitSyncResult.state === 'synced' ? 900 : 1600);

  } catch (err) {
    errorEl.textContent = T.submitFail + ' ' + err.message;
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = T.submitVisit;
    submitBtn.className = 'big-button';
  }
}

// Convert Blob to base64 data URL for IndexedDB persistence
function _blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('Failed to read blob')); };
    reader.readAsDataURL(blob);
  });
}
