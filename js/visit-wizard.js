// Visit Wizard Module — 4-step visit recording wizard

var _visitStep = 1;
var _visitData = {
  storeId: null, storeName: '',
  visit_type: 'regular',
  order_taken: false, order_amount: 0,
  merch_score: 0, merch_items: {},
  competitor_notes: '',
  photo: null, photo_url: null,
  notes: '',
  lat: null, lng: null
};

var _visitMerchLabels = ['Signage', 'Price Board', 'Flyers', 'Standee', 'Price Talkers'];

function openVisitWizard(storeId, storeName) {
  // Reset state
  _visitStep = 1;
  _visitData = {
    storeId: storeId, storeName: storeName || '',
    visit_type: 'regular',
    order_taken: false, order_amount: 0,
    merch_score: 0, merch_items: {},
    competitor_notes: '',
    photo: null, photo_url: null,
    notes: '',
    lat: null, lng: null
  };

  // Set header
  document.getElementById('visit-wiz-title').textContent = 'Visit: ' + (storeName || 'Store');

  // Reset step 1 chips
  var typeChips = document.querySelectorAll('#visit-type-chips .chip');
  for (var i = 0; i < typeChips.length; i++) {
    typeChips[i].classList.remove('selected');
    if (typeChips[i].getAttribute('data-value') === 'regular') {
      typeChips[i].classList.add('selected');
    }
  }

  // Reset step 2
  document.getElementById('visit-order-taken').checked = false;
  document.getElementById('visit-order-amount').value = '';
  _toggleOrderAmountField();

  // Reset step 3 merch items
  var merchChecks = document.querySelectorAll('#visit-merch-list .merch-check-item');
  for (var j = 0; j < merchChecks.length; j++) {
    merchChecks[j].classList.remove('checked');
    var dot = merchChecks[j].querySelector('.merch-check');
    if (dot) dot.textContent = '';
  }
  _visitData.merch_items = {};
  document.getElementById('visit-competitor-notes').value = '';
  document.getElementById('visit-photo-preview').style.display = 'none';
  document.getElementById('visit-photo-status').textContent = 'No photo captured yet';
  _visitData.photo = null;

  // Reset step 4
  document.getElementById('visit-extra-notes').value = '';
  document.getElementById('visit-submit-error').style.display = 'none';
  document.getElementById('visit-submit-error').textContent = '';
  document.getElementById('btn-visit-submit').disabled = false;
  document.getElementById('btn-visit-submit').textContent = 'Record Visit';

  showVisitStep(1);
  nav('page-visit-wizard');
}

function showVisitStep(step) {
  _visitStep = step;
  for (var i = 1; i <= 4; i++) {
    document.getElementById('visit-step' + i).style.display = (i === step) ? 'block' : 'none';
    var stepDot = document.getElementById('visit-wiz-step-' + i);
    stepDot.className = 'wizard-step';
    if (i < step) stepDot.classList.add('done');
    else if (i === step) stepDot.classList.add('current');
  }

  // Build summary when entering step 4
  if (step === 4) {
    _buildVisitSummary();
  }
}

function visitNext() {
  if (_visitStep === 1) {
    // Collect visit type
    var sel = document.querySelector('#visit-type-chips .chip.selected');
    _visitData.visit_type = sel ? sel.getAttribute('data-value') : 'regular';

    // If not order, skip step 2
    if (_visitData.visit_type !== 'order') {
      _visitData.order_taken = false;
      _visitData.order_amount = 0;
      showVisitStep(3);
    } else {
      showVisitStep(2);
    }
  } else if (_visitStep === 2) {
    // Collect order data
    _visitData.order_taken = document.getElementById('visit-order-taken').checked;
    var rawAmount = parseFloat(document.getElementById('visit-order-amount').value) || 0;
    _visitData.order_amount = Math.max(0, Math.min(9999999999, rawAmount));
    showVisitStep(3);
  } else if (_visitStep === 3) {
    // Collect merch data
    _visitData.competitor_notes = document.getElementById('visit-competitor-notes').value.trim();
    _updateMerchScore();
    showVisitStep(4);
  }
}

function visitBack() {
  if (_visitStep === 4) {
    showVisitStep(3);
  } else if (_visitStep === 3) {
    // If not order type, go back to step 1 (skip step 2)
    if (_visitData.visit_type !== 'order') {
      showVisitStep(1);
    } else {
      showVisitStep(2);
    }
  } else if (_visitStep === 2) {
    showVisitStep(1);
  } else {
    // Step 1 — go back to store detail
    nav('page-store-detail');
  }
}

function selectVisitType(chipEl) {
  var chips = document.querySelectorAll('#visit-type-chips .chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('selected');
  chipEl.classList.add('selected');
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

function _toggleOrderAmountField() {
  var cb = document.getElementById('visit-order-taken');
  var amtField = document.getElementById('visit-order-amount-group');
  if (amtField) {
    amtField.style.display = cb.checked ? 'block' : 'none';
  }
}

async function captureVisitPhoto() {
  document.getElementById('visit-photo-status').textContent = 'Opening camera...';
  try {
    var blob = await capturePhoto();
    if (blob) {
      _visitData.photo = blob;
      var url = URL.createObjectURL(blob);
      document.getElementById('visit-photo-img').src = url;
      document.getElementById('visit-photo-preview').style.display = 'block';
      document.getElementById('visit-photo-status').textContent =
        'Photo captured (' + Math.round(blob.size / 1024) + ' KB)';
    } else {
      document.getElementById('visit-photo-status').textContent = 'Photo capture cancelled';
    }
  } catch (err) {
    document.getElementById('visit-photo-status').textContent = 'Error: ' + err.message;
  }
}

function _buildVisitSummary() {
  var html = '';

  // Store name
  html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
  html += '<span style="color:#888">Store</span><b>' + _esc(_visitData.storeName) + '</b>';
  html += '</div>';

  // Visit type
  var typeLabel = (_visitData.visit_type || 'regular').charAt(0).toUpperCase() + (_visitData.visit_type || 'regular').slice(1);
  html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
  html += '<span style="color:#888">Visit Type</span><b>' + typeLabel + '</b>';
  html += '</div>';

  // Order details (if applicable)
  if (_visitData.visit_type === 'order') {
    html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
    html += '<span style="color:#888">Order Taken</span><b>' + (_visitData.order_taken ? 'Yes' : 'No') + '</b>';
    html += '</div>';
    if (_visitData.order_taken && _visitData.order_amount > 0) {
      html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
      html += '<span style="color:#888">Order Amount</span><b>\u20b1 ' + parseFloat(_visitData.order_amount).toLocaleString() + '</b>';
      html += '</div>';
    }
  }

  // Merch score
  html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
  html += '<span style="color:#888">Merch Score</span><b>' + _visitData.merch_score + '/5</b>';
  html += '</div>';

  // GPS status
  html += '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px">';
  html += '<span style="color:#888">GPS</span><b id="visit-summary-gps">Will capture on submit</b>';
  html += '</div>';

  // Photo status
  html += '<div style="padding:8px 0;display:flex;justify-content:space-between;font-size:13px">';
  html += '<span style="color:#888">Photo</span><b>' + (_visitData.photo ? '\u2713 Captured' : 'None') + '</b>';
  html += '</div>';

  document.getElementById('visit-summary-card').innerHTML = html;
}

async function submitVisit() {
  var errorEl = document.getElementById('visit-submit-error');
  var submitBtn = document.getElementById('btn-visit-submit');
  errorEl.style.display = 'none';

  // Collect final notes
  _visitData.notes = document.getElementById('visit-extra-notes').value.trim();
  _visitData.competitor_notes = document.getElementById('visit-competitor-notes').value.trim();

  // Validate input lengths
  if (_visitData.notes.length > 1000) {
    errorEl.textContent = 'Notes must be under 1000 characters.';
    errorEl.style.display = 'block';
    return;
  }
  if (_visitData.competitor_notes.length > 1000) {
    errorEl.textContent = 'Competitor notes must be under 1000 characters.';
    errorEl.style.display = 'block';
    return;
  }
  if (_visitData.order_taken && _visitData.order_amount < 0) {
    errorEl.textContent = 'Order amount cannot be negative.';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    // 1. Get GPS
    var gps = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    if (gps) {
      _visitData.lat = gps.lat;
      _visitData.lng = gps.lng;
    }

    // 2. Upload photo if captured
    if (_visitData.photo) {
      var session = getSession();
      var photoPath = (session ? session.id : 'unknown') + '/' +
        new Date().toISOString().slice(0, 10) + '/' + Date.now() + '_visit.jpg';
      _visitData.photo_url = await uploadPhoto(_visitData.photo, photoPath);
    }

    // 3. Build visit payload
    var session = getSession();
    var visitPayload = {
      store_id: _visitData.storeId,
      tsr_id: session ? session.id : null,
      visit_type: ['mapping','regular','order','merch','farm'].indexOf(_visitData.visit_type) !== -1 ? _visitData.visit_type : 'regular',
      lat: _visitData.lat,
      lng: _visitData.lng,
      photo_url: _visitData.photo_url || null,
      notes: (_visitData.notes ? _visitData.notes : '') +
        (_visitData.competitor_notes ? '\n[Competitor] ' + _visitData.competitor_notes : ''),
      order_taken: _visitData.order_taken,
      order_amount: _visitData.order_amount,
      merch_score: _visitData.merch_score,
      offline_id: (session ? session.id : 'anon') + '_' + Date.now(),
      visited_at: new Date().toISOString()
    };

    // 4. Save — online or offline
    if (navigator.onLine) {
      await createVisit(visitPayload);

      // Update store's last_visit_at
      try {
        await updateStore(_visitData.storeId, { last_visit_at: visitPayload.visited_at });
      } catch (e) {
        // Non-critical — don't block success
      }

      submitBtn.textContent = '\u2713 Visit Recorded!';
      submitBtn.style.background = 'var(--green)';
    } else {
      await queueVisit(visitPayload);
      submitBtn.textContent = '\u2713 Queued for Sync';
      submitBtn.style.background = 'var(--orange)';
    }

    // 5. Navigate back after brief delay
    setTimeout(function () {
      submitBtn.style.background = '';
      nav('page-store-detail');
      // Refresh store detail
      if (_visitData.storeId && typeof openStoreDetail === 'function') {
        openStoreDetail(_visitData.storeId);
      }
    }, 1200);

  } catch (err) {
    errorEl.textContent = 'Failed to save visit: ' + err.message;
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Visit';
  }
}
