const defaultRanges = {
  greenMax: 100,
  orangeMax: 250
};

const cities = {
  "Göteborg": { lat: 57.7, lng: 11.9 },
  "Stockholm": { lat: 59.3293, lng: 18.0686 },
  "Malmö": { lat: 55.6050, lng: 13.0038 },
  "Uppsala": { lat: 59.8586, lng: 17.6389 },
  "Umeå": { lat: 63.8258, lng: 20.2630 },
  "Lund": { lat: 55.7047, lng: 13.1910 },
  "Kalmar": { lat: 56.6634, lng: 16.3568 },
  "Halmstad": { lat: 56.6745, lng: 12.8578 },
  "Sundsvall": { lat: 62.3908, lng: 17.3069 }
};

async function updateCurrentLocation() {
  const currentLocation = document.getElementById('currentLocation');
  const errorMessage = document.getElementById('errorMessage');
  const confirmationMessage = document.getElementById('confirmationMessage');
  const citySelect = document.getElementById('citySelect');
  currentLocation.textContent = 'Hämtar plats...';
  errorMessage.style.display = 'none';
  confirmationMessage.style.display = 'none';

  return new Promise((resolve) => {
    chrome.storage.sync.get(['manualLocation'], (result) => {
      console.log('🔍 Hämtar manuell plats...');
      console.log('📍 Hittade manuell plats:', result.manualLocation);
      if (result.manualLocation && !isNaN(result.manualLocation.lat) && !isNaN(result.manualLocation.lng)) {
        const lat = result.manualLocation.lat;
        const lng = result.manualLocation.lng;
        currentLocation.textContent = `Latitud: ${lat.toFixed(4)}, Longitud: ${lng.toFixed(4)} (manuell)`;
        // Update dropdown to reflect manual location
        citySelect.value = '';
        for (const opt of citySelect.options) {
          if (!opt.value) continue;
          const [oLat, oLng] = opt.value.split(',').map(Number);
          if (Math.abs(oLat - lat) < 0.0001 && Math.abs(oLng - lng) < 0.0001) {
            citySelect.value = opt.value;
            console.log(`🏙️ Matchade stad: ${opt.text} (${opt.value})`);
            break;
          }
        }
        console.log(`✅ Dropdown-värde efter updateCurrentLocation: ${citySelect.value}`);
        resolve(result.manualLocation);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(4);
            const lng = pos.coords.longitude.toFixed(4);
            console.log('📍 Geolocation lyckades:', { lat, lng });
            currentLocation.textContent = `Latitud: ${lat}, Longitud: ${lng} (via geolocation)`;
            chrome.storage.sync.set({ manualLocation: null }, () => {
              console.log('🗑️ Raderade manuell plats vid lyckad geolocation');
            });
            citySelect.value = '';
            console.log('✅ Dropdown nollställd till: Välj en stad...');
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          (err) => {
            console.warn('🚫 Geolocation misslyckades:', err.message);
            currentLocation.textContent = 'Ingen plats vald';
            errorMessage.textContent = 'Kunde inte hämta plats. Ange en manuell plats eller försök igen.';
            errorMessage.style.display = 'block';
            citySelect.value = '';
            console.log('✅ Dropdown nollställd till: Välj en stad...');
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000
          }
        );
      } else {
        console.warn('🚫 Geolocation stöds inte av webbläsaren');
        currentLocation.textContent = 'Ingen plats vald';
        errorMessage.textContent = 'Geolocation stöds inte. Ange en manuell plats.';
        errorMessage.style.display = 'block';
        citySelect.value = '';
        console.log('✅ Dropdown nollställd till: Välj en stad...');
        resolve(null);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['distanceRanges', 'manualLocation'], (result) => {
    const ranges = result.distanceRanges || defaultRanges;
    document.getElementById('greenMax').value = ranges.greenMax;
    document.getElementById('orangeMax').value = ranges.orangeMax;

    const manualLocation = result.manualLocation || { lat: '', lng: '' };
    document.getElementById('manualLat').value = manualLocation.lat || '';
    document.getElementById('manualLng').value = manualLocation.lng || '';

    // Set dropdown to matching city if manual location matches
    const citySelect = document.getElementById('citySelect');
    citySelect.value = '';
    if (manualLocation.lat) {
      for (const opt of citySelect.options) {
        if (!opt.value) continue;
        const [oLat, oLng] = opt.value.split(',').map(Number);
        if (Math.abs(oLat - manualLocation.lat) < 0.0001 && Math.abs(oLng - manualLocation.lng) < 0.0001) {
          citySelect.value = opt.value;
          console.log(`🔄 Hittade matchande stad för manuell plats: ${opt.text} (${opt.value})`);
          break;
        }
      }
    }
    console.log(`📄 Popup laddad, dropdown-värde: ${citySelect.value || 'Välj en stad...'}`);
    console.log(`✅ Dropdown-värde vid laddning: ${citySelect.value}`);
    // Verify available options
    const options = Array.from(citySelect.options).map(opt => ({ value: opt.value, text: opt.text }));
    console.log('🔍 Tillgängliga dropdown-värden:', options);

    updateCurrentLocation();
  });

  document.getElementById('citySelect').addEventListener('change', selectCity);
  document.getElementById('saveButton').addEventListener('click', saveSettings);
  document.getElementById('resetButton').addEventListener('click', resetSettings);
  document.getElementById('saveManualButton').addEventListener('click', saveManualLocation);
  document.getElementById('fetchGeoButton').addEventListener('click', fetchGeolocation);
});

function selectCity() {
  const select = document.getElementById('citySelect');
  const [lat, lng] = select.value.split(',').map(Number);
  if (!isNaN(lat) && !isNaN(lng)) {
    document.getElementById('manualLat').value = lat;
    document.getElementById('manualLng').value = lng;
    console.log('🏙️ Stad vald:', { lat, lng });
    saveManualLocation();
  } else {
    document.getElementById('manualLat').value = '';
    document.getElementById('manualLng').value = '';
    console.log('🏙️ Ingen stad vald');
  }
}

function saveSettings() {
  const greenMax = parseInt(document.getElementById('greenMax').value);
  const orangeMax = parseInt(document.getElementById('orangeMax').value);
  const confirmationMessage = document.getElementById('confirmationMessage');
  const errorMessage = document.getElementById('errorMessage');
  confirmationMessage.style.display = 'none';
  errorMessage.style.display = 'none';

  if (isNaN(greenMax) || isNaN(orangeMax) || greenMax < 0 || orangeMax <= greenMax) {
    console.warn('🚫 Ogiltiga avståndsvärden:', { greenMax, orangeMax });
    alert('Ogiltiga värden! Grön max måste vara >= 0 och mindre än Orange max.');
    errorMessage.textContent = 'Ogiltiga avståndsvärden.';
    errorMessage.style.display = 'block';
    return;
  }

  chrome.storage.sync.set({ distanceRanges: { greenMax, orangeMax } }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid sparande av avståndsintervall:', chrome.runtime.lastError.message);
      errorMessage.textContent = 'Kunde inte spara inställningar. Försök igen.';
      errorMessage.style.display = 'block';
    } else {
      console.log('💾 Avståndsintervall sparade:', { greenMax, orangeMax });
      confirmationMessage.textContent = 'Inställningar sparade!';
      confirmationMessage.style.display = 'block';
      chrome.runtime.sendMessage({ type: 'updateRanges' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Fel vid skickande av updateRanges:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ updateRanges skickat');
        }
      });
      setTimeout(() => {
        confirmationMessage.style.display = 'none';
        window.close();
      }, 2000);
    }
  });
}

function resetSettings() {
  const confirmationMessage = document.getElementById('confirmationMessage');
  const errorMessage = document.getElementById('errorMessage');
  confirmationMessage.style.display = 'none';
  errorMessage.style.display = 'none';

  chrome.storage.sync.set({ distanceRanges: defaultRanges }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid återställning av avståndsintervall:', chrome.runtime.lastError.message);
      errorMessage.textContent = 'Kunde inte återställa inställningar. Försök igen.';
      errorMessage.style.display = 'block';
    } else {
      console.log('💾 Återställde till default:', defaultRanges);
      document.getElementById('greenMax').value = defaultRanges.greenMax;
      document.getElementById('orangeMax').value = defaultRanges.orangeMax;
      confirmationMessage.textContent = 'Inställningar återställda!';
      confirmationMessage.style.display = 'block';
      chrome.runtime.sendMessage({ type: 'updateRanges' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Fel vid skickande av updateRanges:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ updateRanges skickat');
        }
      });
      setTimeout(() => {
        confirmationMessage.style.display = 'none';
        window.close();
      }, 2000);
    }
  });
}

function saveManualLocation() {
  const lat = parseFloat(document.getElementById('manualLat').value);
  const lng = parseFloat(document.getElementById('manualLng').value);
  const confirmationMessage = document.getElementById('confirmationMessage');
  const errorMessage = document.getElementById('errorMessage');
  const citySelect = document.getElementById('citySelect');
  confirmationMessage.style.display = 'none';
  errorMessage.style.display = 'none';

  console.log('📍 Försöker spara manuell plats:', { lat, lng });

  if (isNaN(lat) || isNaN(lng)) {
    console.warn('🚫 Ogiltiga koordinater: lat eller lng är inte numeriska');
    alert('Ogiltiga koordinater! Ange giltiga värden för latitud och longitud.');
    errorMessage.textContent = 'Ogiltiga koordinater. Ange numeriska värden.';
    errorMessage.style.display = 'block';
    return;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn('🚫 Koordinater utanför tillåtet intervall:', { lat, lng });
    alert('Ogiltiga koordinater! Latitud måste vara mellan -90 och 90, longitud mellan -180 och 180.');
    errorMessage.textContent = 'Koordinater utanför tillåtet intervall.';
    errorMessage.style.display = 'block';
    return;
  }

  chrome.storage.sync.set({ manualLocation: { lat, lng } }, () => {
    if (chrome.runtime.lastError) {
      console.error('❌ Fel vid sparande av manuell plats:', chrome.runtime.lastError.message);
      errorMessage.textContent = 'Kunde inte spara plats. Försök igen.';
      errorMessage.style.display = 'block';
    } else {
      console.log('💾 Manuell plats sparad:', { lat, lng });
      confirmationMessage.textContent = 'Manuell plats sparad! Ladda om sidan för att visa det nya avståndet.';
      confirmationMessage.style.display = 'block';
      // Update dropdown to reflect saved manual location
      citySelect.value = '';
      for (const opt of citySelect.options) {
        if (!opt.value) continue;
        const [oLat, oLng] = opt.value.split(',').map(Number);
        if (Math.abs(oLat - lat) < 0.0001 && Math.abs(oLng - lng) < 0.0001) {
          citySelect.value = opt.value;
          console.log(`🏙️ Matchade stad vid spara: ${opt.text} (${opt.value})`);
          break;
        }
      }
      console.log(`✅ Dropdown-värde efter spara: ${citySelect.value}`);
      updateCurrentLocation();
      chrome.runtime.sendMessage({ type: 'updateLocation' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Fel vid skickande av updateLocation:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ updateLocation skickat');
        }
      });
      setTimeout(() => {
        confirmationMessage.style.display = 'none';
        window.close();
      }, 2000);
    }
  });
}

async function fetchGeolocation() {
  const confirmationMessage = document.getElementById('confirmationMessage');
  const errorMessage = document.getElementById('errorMessage');
  confirmationMessage.style.display = 'none';
  errorMessage.style.display = 'none';

  // Clear manualLocation
  await new Promise((resolve) => {
    chrome.storage.sync.set({ manualLocation: null }, () => {
      if (chrome.runtime.lastError) {
        console.error('❌ Fel vid rensning av manuell plats:', chrome.runtime.lastError.message);
        errorMessage.textContent = 'Kunde inte rensa manuell plats. Försök igen.';
        errorMessage.style.display = 'block';
        console.log('ℹ️ Felmeddelande satt till permanent visning, popupen förblir öppen');
        resolve(false);
      } else {
        console.log('🗑️ Manuell plats rensad');
        resolve(true);
      }
    });
  });

  // Try geolocation
  if (navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      });
      console.log('📍 Geolocation lyckades i fetchGeolocation:', position.coords);
      await updateCurrentLocation();
      chrome.runtime.sendMessage({ type: 'fetchGeolocation' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Fel vid skickande av fetchGeolocation:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ fetchGeolocation skickat');
        }
      });
      confirmationMessage.textContent = 'Plats hämtad! Ladda om sidan för att visa det nya avståndet.';
      confirmationMessage.style.display = 'block';
      console.log('ℹ️ Bekräftelsemeddelande satt till permanent visning, popupen förblir öppen');
    } catch (err) {
      console.warn('🚫 Geolocation misslyckades i fetchGeolocation:', err.message);
      errorMessage.textContent = 'Kunde inte hämta plats. Försök igen eller ange en manuell plats.';
      errorMessage.style.display = 'block';
      console.log('ℹ️ Felmeddelande satt till permanent visning, popupen förblir öppen');
      await updateCurrentLocation();
    }
  } else {
    console.warn('🚫 Geolocation stöds inte av webbläsaren');
    errorMessage.textContent = 'Geolocation stöds inte. Ange en manuell plats.';
    errorMessage.style.display = 'block';
    console.log('ℹ️ Felmeddelande satt till permanent visning, popupen förblir öppen');
    await updateCurrentLocation();
  }
}