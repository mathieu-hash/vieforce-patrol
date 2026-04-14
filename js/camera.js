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

function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1200;
  quality = quality || 0.75;

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }

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

async function uploadPhoto(blob, path) {
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

  return urlData.publicUrl;
}
