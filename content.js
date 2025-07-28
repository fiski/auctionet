let userLocation = null;

// Get user's location
navigator.geolocation.getCurrentPosition(
  (position) => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    addDistanceToItems();
  },
  (error) => {
    console.log('Location access denied');
  }
);

function addDistanceToItems() {
  if (!userLocation) return;

  const items = document.querySelectorAll('.item-thumb');
  
  items.forEach(async (item) => {
    const amountDiv = item.querySelector('.item-thumb__amount');
    if (!amountDiv) return;

    // Check if distance already added
    if (item.querySelector('.distance-info')) return;

    const link = item.querySelector('a[href*="/sv/"]');
    if (!link) return;

    const itemUrl = link.href;
    
    try {
      const address = await getItemAddress(itemUrl);
      if (address) {
        const distance = await calculateDistance(userLocation, address);
        
        // Create distance element
        const distanceDiv = document.createElement('div');
        distanceDiv.className = 'distance-info';
        distanceDiv.innerHTML = `📍 ${distance} km`;
        
        // Insert after amount div
        amountDiv.parentNode.insertBefore(distanceDiv, amountDiv.nextSibling);
      }
    } catch (error) {
      console.log('Error getting distance for item:', error);
    }
  });
}

async function getItemAddress(itemUrl) {
  try {
    const response = await fetch(itemUrl);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const addressElements = doc.querySelectorAll('dt');
    for (let dt of addressElements) {
      if (dt.textContent.trim() === 'Adress') {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          return dd.textContent.trim();
        }
      }
    }
    return null;
  } catch (error) {
    console.log('Error fetching item page:', error);
    return null;
  }
}

async function calculateDistance(from, address) {
  try {
    // First geocode the address
    const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZmMDdlOTg4ZWRmMTRiZGNhMzkzMDVlZWQ4Nzg4NWM2IiwiaCI6Im11cm11cjY0In0==&text=${encodeURIComponent(address)}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();
    
    if (!geocodeData.features || geocodeData.features.length === 0) {
      return 'Unknown';
    }
    
    const to = {
      lng: geocodeData.features[0].geometry.coordinates[0],
      lat: geocodeData.features[0].geometry.coordinates[1]
    };
    
    // Calculate driving distance
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
    console.log('Error calculating distance:', error);
    return 'Unknown';
  }
