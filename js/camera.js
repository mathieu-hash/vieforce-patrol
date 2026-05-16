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

async function uploadPhoto(blob, path) {
  if (blob && blob.size > 81920) {
    console.warn('[camera] Photo exceeds 80KB target:', Math.round(blob.size / 1024) + 'KB');
  }
  _maybeWarnCellularUpload();
  var { data, error } = await supabaseClient.storage
    .from('patrol-photos')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw new Error('Upload failed: ' + error.message);
  }

  var { data: urlData } = supabaseClient.storage
    .from('patrol-photos')
    .getPublicUrl(path);

  // Show data usage indicator (once per session)
  _showDataUsage(blob.size);

  return urlData.publicUrl;
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
