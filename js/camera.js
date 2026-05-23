// Camera Module — photo capture, compression, upload

function capturePhoto() {
  return new Promise(function (resolve, reject) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      compressImage(file).then(resolve).catch(reject);
    };

    // Handle cancel
    input.oncancel = function () {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

function compressImage(file, maxWidth, maxHeight, quality) {
  maxWidth = maxWidth || 640;
  maxHeight = maxHeight || 480;
  quality = quality || 0.5;

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;

        // Scale down to fit within maxWidth x maxHeight box
        var scale = Math.min(maxWidth / w, maxHeight / h, 1);
        w = Math.round(w * scale);
        h = Math.round(h * scale);

        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          function (blob) {
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = function () {
        reject(new Error('Failed to load image'));
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

function isWifiOrGoodConnection() {
  try {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return true;
    if (conn.saveData) return false;
    var t = conn.effectiveType || '';
    if (t === '4g' || t === '5g') return true;
    if (conn.type === 'wifi' || conn.type === 'ethernet') return true;
    return false;
  } catch (e) {
    return true;
  }
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('Failed to read photo')); };
    reader.readAsDataURL(blob);
  });
}

var _cellularPhotoHintShown = false;
function _maybeWarnCellularUpload() {
  if (_cellularPhotoHintShown || typeof isWifiOrGoodConnection !== 'function') return;
  if (isWifiOrGoodConnection()) return;
  _cellularPhotoHintShown = true;
  var toast = document.createElement('div');
  toast.className = 'data-usage-toast';
  toast.textContent = '\uD83D\uDCF1 Gumagamit ng mobile data ang litrato — mas mabuting WiFi';
  document.body.appendChild(toast);
  setTimeout(function () { toast.classList.add('visible'); }, 50);
  setTimeout(function () {
    toast.classList.remove('visible');
    setTimeout(function () { toast.remove(); }, 400);
  }, 5000);
}

// Build deterministic Storage path for a row's photo.
// Format: {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg
// Stability matters: retries land on the SAME path (upsert) instead of orphaning
// previous blobs with Date.now()-based paths. Audit D O5 / H-03 (April 2026).
function buildPhotoPath(tsr_id, row_id, isoDate) {
  var tsr = tsr_id || 'unknown';
  var rid = row_id || 'unknown';
  var day = isoDate || new Date().toISOString().slice(0, 10);
  return tsr + '/' + day + '/' + rid + '.jpg';
}

// uploadPhoto — new contract (Audit D O5 / 2026-04 H-03):
//   uploadPhoto({ row_id, blob, tsr_id, table, isoDate }) → photo_url (string)
//
// Flow is INSERT-first now (see js/offline.js), so callers ALWAYS know the
// row_id when they upload. This lets us:
//   1. Use a deterministic Storage path → retries overwrite, no orphans.
//   2. PATCH the row's photo_url after a successful upload.
//
// Steps inside this function:
//   a. Upload blob to {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg with upsert:true.
//   b. Resolve public URL.
//   c. PATCH `{table}.photo_url = <url>` WHERE id = row_id.
//   d. Return the URL (or throw on failure of upload OR patch — caller's retry
//      classifier decides next move).
//
// Backward compat: the OLD signature uploadPhoto(blob, path) had a single
// caller — js/offline.js — which is migrated in this same change. There are
// no external callers (verified via grep).
async function uploadPhoto(opts) {
  if (!opts || typeof opts !== 'object' || opts instanceof Blob) {
    throw new Error('uploadPhoto: new signature requires { row_id, blob, tsr_id, table } (Audit D O5)');
  }
  var blob = opts.blob;
  var row_id = opts.row_id;
  var tsr_id = opts.tsr_id;
  var table = opts.table; // 'stores' | 'visits' | 'farms'
  if (!blob) throw new Error('uploadPhoto: blob is required');
  if (!row_id) throw new Error('uploadPhoto: row_id is required (insert-then-upload flow)');
  if (!table) throw new Error('uploadPhoto: table is required for photo_url patch');

  if (blob.size > 81920) {
    console.warn('[camera] Photo exceeds 80KB target:', Math.round(blob.size / 1024) + 'KB');
  }
  _maybeWarnCellularUpload();

  var path = buildPhotoPath(tsr_id, row_id, opts.isoDate);

  // upsert:true so retries to the SAME deterministic path overwrite the prior
  // blob rather than creating a sibling orphan.
  var uploadRes = await supabaseClient.storage
    .from('patrol-photos')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (uploadRes.error) {
    throw new Error('Upload failed: ' + uploadRes.error.message);
  }

  var urlRes = supabaseClient.storage
    .from('patrol-photos')
    .getPublicUrl(path);
  var photo_url = urlRes.data && urlRes.data.publicUrl;
  if (!photo_url) throw new Error('Upload succeeded but getPublicUrl returned no URL');

  // Step c — PATCH the row. If this throws, caller still has the deterministic
  // path; next retry re-patches without re-uploading.
  var patchRes = await supabaseClient
    .from(table)
    .update({ photo_url: photo_url })
    .eq('id', row_id);
  if (patchRes.error) {
    throw new Error('Photo uploaded but row patch failed: ' + patchRes.error.message);
  }

  _showDataUsage(blob.size);
  return photo_url;
}

// Patch helper used by the sync loop when the photo is already uploaded (the
// upload step succeeded on a prior attempt) and only the row-patch step needs
// to be retried. Separated so retries do NOT re-upload.
async function patchPhotoUrl(table, row_id, photo_url) {
  if (!table) throw new Error('patchPhotoUrl: table is required');
  if (!row_id) throw new Error('patchPhotoUrl: row_id is required');
  if (!photo_url) throw new Error('patchPhotoUrl: photo_url is required');
  var res = await supabaseClient
    .from(table)
    .update({ photo_url: photo_url })
    .eq('id', row_id);
  if (res.error) throw new Error('patchPhotoUrl: ' + res.error.message);
  return photo_url;
}

// Data usage indicator — shown once per session to reassure TSRs
var _dataUsageShown = false;
function _showDataUsage(bytes) {
  if (_dataUsageShown) return;
  _dataUsageShown = true;
  var kb = Math.round(bytes / 1024);
  var toast = document.createElement('div');
  toast.className = 'data-usage-toast';
  toast.textContent = '\uD83D\uDCF7 Ginamit: ' + kb + 'KB lang para sa litrato';
  document.body.appendChild(toast);
  setTimeout(function () { toast.classList.add('visible'); }, 50);
  setTimeout(function () {
    toast.classList.remove('visible');
    setTimeout(function () { toast.remove(); }, 400);
  }, 4000);
}
