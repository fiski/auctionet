const defaultRanges = {
  greenMax: 100,
  orangeMax: 250
};

function updateCurrentLocation() {
  const currentLocation = document.getElementById('currentLocation');
  const errorMessage = document.getElementById('errorMessage');
  currentLocation.textContent = 'Hämtar plats...';
  errorMessage.style.display = 'none';

  if (!navigator.geolocation) {
    console.warn('🚫 Geolocation stöds inte av webbläsaren');
    chrome.storage.sync.get(['manualLocation'], (result) => {
      if (result.manualLocation && result.manualLocation.lat && result.manualLocation.lng) {
        console.log('📍 Hittade manuell plats:', result.manualLocation);
        currentLocation.textContent = `Latitud: ${result.manualLocation.lat.toFixed(4)}, Longitud: ${result.manualLocation.lng.toFixed(4)} (manuell)`;
      } else {
        console.log('❌ Ingen manuell plats sparad');
        currentLocation.textContent = 'Ingen plats vald';
        errorMessage.textContent = 'Geolocation stöds inte. Ange en manuell plats.';
        errorMessage.style.display = 'block';
      }
    });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(4);
      const lng = pos.coords.longitude.toFixed(4);
      console.log('📍 Geolocation lyckades:', { lat, lng });
      currentLocation.textContent = `Latitud: ${lat}, Longitud: ${lng} (via geolocation)`;
      chrome.storage.sync.set({ manualLocation: null }, () => {
        console.log('🗑️ Raderade manuell plats vid lyckad geolocation');
      });
    },
    (err) => {
      console.warn('🚫 Geolocation misslyckades:', err.message);
      chrome.storage.sync.get(['manualLocation'], (result) => {
        if (result.manualLocation && result.manualLocation.lat && result.manualLocation.lng) {
          console.log('📍 Hittade manuell plats:', result.manualLocation);
          currentLocation.textContent = `Latitud: ${result.manualLocation.lat.toFixed(4)}, Longitud: ${result.manualLocation.lng.toFixed(4)} (manuell)`;
        } else {
          console.log('❌ Ingen manuell plats sparad');
          currentLocation.textContent = 'Ingen plats vald';
          errorMessage.textContent = 'Kunde inte hämta plats. Ange en manuell plats eller försök igen.';
          errorMessage.style.display = 'block';
        }
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 60000
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['distanceRanges', 'manualLocation'], (result) => {
    const ranges = result.distanceRanges || defaultRanges;
    document.getElementById('greenMax').value = ranges.greenMax;
    document.getElementById('orangeMax').value = ranges.orangeMax;

    const manualLocation = result.manualLocation || { lat: '', lng: '' };
    document.getElementById('manualLat').value = manualLocation.lat || '';
    document.getElementById('manualLng').value = manualLocation.lng || '';

    console.log('📄 Popup laddad, hämtar nuvarande plats...');
    updateCurrentLocation();
  });

  document.getElementById('citySelect').addEventListener('change', selectCity);
  document.getElementById('saveButton').addEventListener('click', saveSettings);
  document.getElementById('resetButton').addEventListener('click', resetSettings);
  document.getElementById('saveManualButton').addEventListener('click', saveManualLocation);
  document.getElementById('retryButton').addEventListener('click', retryGeolocation);
});

function selectCity() {
  const select = document.getElementById('citySelect');
  const [lat, lng] = select.value.split(',').map(Number);
  if (!isNaN(lat) && !isNaN(lng)) {
    document.getElementById('manualLat').value = lat;
    document.getElementById('manualLng').value = lng;
    console.log('🏙️ Stad vald:', { lat, lng });
  } else {
    document.getElementById('manualLat').value = '';
    document.getElementById('manualLng').value = '';
    console.log('🏙️ Ingen stad vald');
  }
}

function saveSettings() {
  const greenMax = parseInt(document.getElementById('greenMax').value);
  const orangeMax = parseInt(document.getElementById('orangeMax').value);
  if (isNaN(greenMax) || isNaN(orangeMax) || greenMax < 0 || orangeMax <= greenMax) {
    alert('Ogiltiga värden! Grön max måste vara >= 0 och mindre än Orange max.');
    return;
  }
  chrome.storage.sync.set({ distanceRanges: { greenMax, orangeMax } }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid sparande av avståndsintervall:', chrome.runtime.lastError.message);
    } else {
      console.log('💾 Avståndsintervall sparade:', { greenMax, orangeMax });
    }
    chrome.runtime.sendMessage({ type: 'updateRanges' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Fel vid skickande av updateRanges:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ updateRanges skickat');
      }
    });
    window.close();
  });
}

function resetSettings() {
  chrome.storage.sync.set({ distanceRanges: defaultRanges }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid återställning av avståndsintervall:', chrome.runtime.lastError.message);
    } else {
      console.log('💾 Återställde till default:', defaultRanges);
    }
    document.getElementById('greenMax').value = defaultRanges.greenMax;
    document.getElementById('orangeMax').value = defaultRanges.orangeMax;
    chrome.runtime.sendMessage({ type: 'updateRanges' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Fel vid skickande av updateRanges:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ updateRanges skickat');
      }
    });
    window.close();
  });
}

function saveManualLocation() {
  const lat = parseFloat(document.getElementById('manualLat').value);
  const lng = parseFloat(document.getElementById('manualLng').value);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    alert('Ogiltiga koordinater! Latitud måste vara mellan -90 och 90, longitud mellan -180 och 180.');
    return;
  }
  chrome.storage.sync.set({ manualLocation: { lat, lng } }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid sparande av manuell plats:', chrome.runtime.lastError.message);
    } else {
      console.log('📍 Manuell plats sparad:', { lat, lng });
    }
    chrome.runtime.sendMessage({ type: 'updateLocation' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Fel vid skickande av updateLocation:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ updateLocation skickat');
      }
    });
    updateCurrentLocation();
    window.close();
  });
}

function retryGeolocation() {
  chrome.runtime.sendMessage({ type: 'retryGeolocation' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid skickande av retryGeolocation:', chrome.runtime.lastError.message);
    } else {
      console.log('🔄 Försöker hämta plats igen');
    }
    updateCurrentLocation();
    window.close();
  });
}