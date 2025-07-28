let userLocation = null;

// Steg 1: Hämta användarens plats
navigator.geolocation.getCurrentPosition(
  (position) => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    addDistanceToItems();
  },
  (error) => {
    console.warn('Platsåtkomst nekad:', error.message);
  }
);

// Steg 2: Lägg till distansinfo till varje auktionsobjekt
function addDistanceToItems() {
  if (!userLocation) return;

  const items = document.querySelectorAll('.item-thumb');

  items.forEach(async (item) => {
    const amountDiv = item.querySelector('.item-thumb__amount');
    if (!amountDiv) return;

    // Undvik att lägga till info flera gånger
    if (item.querySelector('.distance-info')) return;

    const link = item.querySelector('a[href*="/sv/"]');
    if (!link) return;

    const itemUrl = link.href;

    try {
      const address = await getItemAddress(itemUrl);
      if (address) {
        const distance = await calculateDistance(userLocation, address);

        // Skapa visuell div med avstånd
        const distanceDiv = document.createElement('div');
        distanceDiv.className = 'distance-info';
        distanceDiv.innerHTML = `📍 ${distance} km`;

        amountDiv.parentNode.insertBefore(distanceDiv, amountDiv.nextSibling);
      }
    } catch (error) {
      console.error('Fel vid distansberäkning:', error);
    }
  });
}

// Steg 3: Hämta adressen via background-script
function getItemAddress(itemUrl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'fetchItemPage', url: itemUrl }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Meddelande till background.js misslyckades:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response.address);
    });
  });
}

// Steg 4: Använd OpenRouteService för att beräkna körsträcka
async function calculateDistance(from, address) {
  try {
    // Steg 4a: Geokoda adressen
    const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZmMDdlOTg4ZWRmMTRiZGNhMzkzMDVlZWQ4Nzg4NWM2IiwiaCI6Im11cm11cjY0In0==&text=${encodeURIComponent(address)}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.features || geocodeData.features.length === 0) {
      return 'Okänd';
    }

    const to = {
      lng: geocodeData.features[0].geometry.coordinates[0],
      lat: geocodeData.features[0].geometry.coordinates[1]
    };

    // Steg 4b: Beräkna körväg
    const routeUrl = 'https://api.openrouteservice.org/v2/directions/driving-car';
    const routeResponse = await fetch(routeUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZmMDdlOTg4ZWRmMTRiZGNhMzkzMDVlZWQ4Nzg4NWM2IiwiaCI6Im11cm11cjY0In0==',
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
    console.error('Fel vid distansberäkning:', error);
    return 'Okänd';
  }
}
