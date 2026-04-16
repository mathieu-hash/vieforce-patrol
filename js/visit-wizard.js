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

async function openVisitWizard(storeId, storeName) {
  // Reset state
  _visitData = {
    storeId: storeId, storeName: storeName || '', storePhone: '',
    visit_type: 'regular', outcome: null,
    order_taken: false, order_amount: 0,
    merch_score: 0, merch_items: {},
    competitor_notes: '',
    photo: null, photo_url: null,
    notes: '',
    lat: null, lng: null
  };

  // Set header
  document.getElementById('visit-wiz-title').textContent = storeName || 'Visit';

  // Reset outcome chips
  var chips = document.querySelectorAll('#visit-outcome-grid .outcome-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('selected');

  // Hide details panel until outcome selected
  document.getElementById('visit-details-panel').style.display = 'none';
  var orderPanel = document.getElementById('visit-order-panel');
  if (orderPanel) orderPanel.style.display = 'none';
  document.getElementById('visit-order-amount').value = '';

  // Reset merch
  var merchChecks = document.querySelectorAll('#visit-merch-list .merch-check-item');
  for (var j = 0; j < merchChecks.length; j++) {
    merchChecks[j].classList.remove('checked');
    var dot = merchChecks[j].querySelector('.merch-check');
    if (dot) dot.textContent = '';
  }
  _visitData.merch_items = {};

  // Reset photo + notes
  document.getElementById('visit-photo-preview').style.display = 'none';
  var photoBtn = document.getElementById('visit-photo-btn');
  if (photoBtn) { photoBtn.classList.remove('has-photo'); photoBtn.innerHTML = '&#128247; ' + T.takePhoto; }
  _visitData.photo = null;
  document.getElementById('visit-extra-notes').value = '';
  document.getElementById('visit-submit-error').style.display = 'none';
  var submitBtn = document.getElementById('btn-visit-submit');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = T.submitVisit; submitBtn.className = 'big-button'; }

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
        if (store.owner_name) parts.push('\ud83d\udc64 ' + _esc(store.owner_name) + (store.phone ? ' \u00b7 ' + _esc(store.phone) : ''));
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

  nav('page-visit-wizard');
}

// Outcome chip selection — the core 2-tap UX
function selectOutcome(outcome) {
  _visitData.outcome = outcome;

  // Highlight selected chip
  var chips = document.querySelectorAll('#visit-outcome-grid .outcome-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.remove('selected');
    if (chips[i].getAttribute('data-outcome') === outcome) {
      chips[i].classList.add('selected');
    }
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
  document.getElementById('visit-details-panel').style.display = 'block';

  // Show/hide order amount field
  var orderPanel = document.getElementById('visit-order-panel');
  if (orderPanel) {
    orderPanel.style.display = (outcome === 'order') ? 'block' : 'none';
  }

  // For "comeback" — auto-set a note
  if (outcome === 'comeback') {
    var notesEl = document.getElementById('visit-extra-notes');
    if (notesEl && !notesEl.value) {
      notesEl.value = T.willReturn;
    }
  }

  // Scroll to details panel
  document.getElementById('visit-details-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function visitBack() {
  nav('page-store-detail');
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

  el.classList.toggle('checked');
  var isChecked = el.classList.contains('checked');
  var dot = el.querySelector('.merch-check');
  if (dot) dot.textContent = isChecked ? '\u2713' : '';

  _visitData.merch_items[item] = isChecked;
  _updateMerchScore();
}

function _updateMerchScore() {
  var count = 0;
  for (var key in _visitData.merch_items) {
    if (_visitData.merch_items[key]) count++;
  }
  _visitData.merch_score = count;
}

async function captureVisitPhoto() {
  var btn = document.getElementById('visit-photo-btn');
  if (btn) btn.innerHTML = '&#128247; Kumukuha...';
  try {
    var blob = await capturePhoto();
    if (blob) {
      _visitData.photo = blob;
      var url = URL.createObjectURL(blob);
      document.getElementById('visit-photo-img').src = url;
      document.getElementById('visit-photo-preview').style.display = 'block';
      if (btn) {
        btn.classList.add('has-photo');
        btn.innerHTML = '\u2713 ' + T.photoTaken + ' (' + Math.round(blob.size / 1024) + ' KB)';
      }
    } else {
      if (btn) btn.innerHTML = '&#128247; ' + T.takePhoto;
    }
  } catch (err) {
    if (btn) btn.innerHTML = '&#128247; ' + T.takePhoto;
  }
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
    // 1. Get GPS
    var gps = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    if (gps) {
      _visitData.lat = gps.lat;
      _visitData.lng = gps.lng;
    }

    // 2. Convert photo Blob to base64 for IndexedDB persistence
    var photoBase64 = null;
    if (_visitData.photo) {
      try {
        photoBase64 = await _blobToBase64(_visitData.photo);
      } catch (e) { /* photo conversion failed — continue without */ }
    }

    // 3. Upload photo if online (try now, retry during sync if offline)
    if (_visitData.photo && navigator.onLine) {
      var session = getSession();
      var photoPath = (session ? session.id : 'unknown') + '/' +
        new Date().toISOString().slice(0, 10) + '/' + Date.now() + '_visit.jpg';
      try {
        _visitData.photo_url = await uploadPhoto(_visitData.photo, photoPath);
        photoBase64 = null; // Uploaded successfully — no need to store base64
      } catch (e) {
        // Upload failed — base64 will be stored for later upload during sync
      }
    }

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
      offline_id: (session ? session.id : 'anon') + '_' + Date.now(),
      visited_at: new Date().toISOString()
    };

    // 4. RULE 1: ALWAYS write to IndexedDB FIRST, then sync to server
    await queueVisit(visitPayload);

    // Immediately show success — data is safe in IndexedDB
    submitBtn.textContent = '\u2713 ' + T.submitOk;
    submitBtn.className = 'big-button success';

    // Update sync bar immediately
    if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();

    // 5. Attempt server sync in background (non-blocking)
    if (navigator.onLine) {
      // Fire-and-forget sync — don't block the UI
      syncPending().then(function () {
        if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
        // Update store's last_visit_at after sync succeeds
        try {
          updateStore(_visitData.storeId, { last_visit_at: visitPayload.visited_at });
        } catch (e) { /* non-critical */ }
      }).catch(function () {
        // Sync failed — no problem, data is safe in IndexedDB, will retry later
        if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
      });
    }

    // 6. Navigate back after brief delay
    setTimeout(function () {
      nav('page-store-detail');
      if (_visitData.storeId && typeof openStoreDetail === 'function') {
        openStoreDetail(_visitData.storeId);
      }
    }, 1200);

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
