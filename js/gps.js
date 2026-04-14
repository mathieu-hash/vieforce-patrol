// GPS Wrapper — geolocation utilities

function getCurrentPosition(options) {
  var opts = options || {};
  return new Promise(function (resolve) {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      function () {
        resolve(null);
      },
      {
        timeout: opts.timeout || 10000,
        enableHighAccuracy: opts.enableHighAccuracy !== undefined ? opts.enableHighAccuracy : true,
        maximumAge: opts.maximumAge || 0
      }
    );
  });
}

function formatCoords(lat, lng) {
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

function getGoogleMapsLink(lat, lng) {
  return 'https://www.google.com/maps?q=' + lat + ',' + lng;
}
