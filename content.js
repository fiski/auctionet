let userLocation = null;
let debugEnabled = true;

function logDebug(msg) {
  if (!debugEnabled) return;
  console.log('[Auctionet DEBUG]', msg);

  let debugPanel = document.querySelector('#auctionet-debug');
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.id = 'auctionet-debug';
    debugPanel.style = 'position: fixed; bottom: 10px; left: 10px; background: #fff; border: 1px solid #ccc; padding: 10px; font-size: 12px; max-width: 300px; z-index: 9999; box-shadow: 0 0 5px rgba(0,0,0,0.2);';
    document.body.appendChild(debugPanel);
  }

  const line = document.createElement('div');
  line.textContent = msg;
  debugPanel.appendChild(line);
}

// Steg 1: Hämta användarens plats
navigator.geolocation.getCurrentPosition(
  (position) => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    logDebug('📍 Användarens plats hämtad');
    observeItems();
  },
  (error) => {
    logDebug('❌ Kunde inte hämta plats: ' + error.message);
  }
);

// Steg 2: Vänta på innehåll och observera förändringar
function observeItems() {
  const container = document.querySelector('[data-controller="search-results"]'); // justerad container
  if (!container) {
    logDebug('🏗 Väntar på innehållscontainer...');
    setTimeout(observeItems, 1000);
    return;
  }

  logDebug('📦 Container hittad, observer startad');

  const observer = new MutationObserver(() => {
    addDistanceToItems();
  });

  observer.observe(container, { childList: true, subtree: true });
  addDistanceToItems(); // kör en gång direkt också
}

// Steg 3: Lägg till avståndsinformation
function addDistanceToItems() {
  if (!userLocation) return;

  const items = document.querySelectorAll('article.item'); // OBS: kontrollera att denna klass stämmer
  logDebug(`🔍 Hittade ${items.length} objekt`);

  items.forEach(async (item, index) => {
    const amountDiv = item.querySelector('.item-thumb__amount');
    if (!amountDiv) {
      logDebug(`⚠️ [${index}] Ingen prisruta hittad`);
      return;
    }

    if (item.querySelector('.distance-info')) return;

    const link = item.querySelector('a[href*="/sv/"]');
    if (!link) {
      logDebug(`⚠️ [${index}] Inget giltigt länk hittad`);
      return;
    }

    const itemUrl = link.href;
    logDebug(`🌐 [${index}] Hämtar adress från: ${itemUrl}`);

    try {
      const address = await getItemAddress(itemUrl);
      if (address) {
        logDebug(`📦 [${index}] Adress hittad: ${address}`);
        const distance = await calculateDistance(userLocation, address);
        logDebug(`🚗 [${index}] Distans: ${distance} km`);

        const distanceDiv = document.createElement('div');
        distanceDiv.className = 'distance-info';
        distanceDiv.innerHTML = `📍 ${distance} km`;
        amountDiv.parentNode.insertBefore(distanceDiv, amountDiv.nextSibling);
      } else {
        logDebug(`❓ [${index}] Ingen adress hittades`);
      }
    } catch (error) {
      logDebug(`💥 [${index}] Fel: ${error.message}`);
    }
  });
}

// Steg 4: Hämta adress från background.js
function getItemAddress(itemUrl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'fetchItemPage', url: itemUrl }, (response) => {
      if (chrome.runtime.lastError) {
        logDebug('🛑 Meddelandefel: ' + chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response.address);
    });
  });
}

// Steg 5: Räkna ut distans via OpenRouteService
async function calculateDistance(from, address) {
  try {
    const apiKey = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZmMDdlOTg4ZWRmMTRiZGNhMzkzMDVlZWQ4Nzg4NWM2IiwiaCI6Im11cm11cjY0In0=';

    const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.features || geocodeData.features.length === 0) {
      logDebug('⚠️ Geokodning misslyckades');
      return 'Okänd';
    }

    const to = {
      lng: geocodeData.features[0].geometry.coordinates[0],
      lat: geocodeData.features[0].geometry.coordinates[1]
    };

    const routeUrl = 'https://api.openrouteservice.org/v2/directions/driving-car';
    const routeResponse = await fetch(routeUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coordinates: [[from.lng, from.lat], [to.lng, to.lat]]
      })
    });

    const routeData = await routeResponse.json();
    const distanceKm = Math.round(routeData.routes[0].summary.distance / 1000);
    return distanceKm;
  } catch (error) {
    logDebug('❌ Distansfel: ' + error.message);
    return 'Okänd';
  }
}
