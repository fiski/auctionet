const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZmMDdlOTg4ZWRmMTRiZGNhMzkzMDVlZWQ4Nzg4NWM2IiwiaCI6Im11cm11cjY0In0=";
const PAPA_COORDS = { lat: 57.665572, lng: 11.864981 };

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("🛰️ Message received in background.js:", message);

  if (message.type === "fetchItemPage") {
    handleFetchItemPage(message, sendResponse);
    return true; // Indikerar att svaret sker asynkront
  }
});

async function handleFetchItemPage(message, sendResponse) {
  const itemUrl = message.url;
  console.log("🌍 Hämtar föremålssida:", itemUrl);

  try {
    const res = await fetch(itemUrl);
    const html = await res.text();

    // Extrahera adressen från HTML med regex
    const match = html.match(/<dt>\s*Adress\s*<\/dt>\s*<dd>\s*<p>(.*?)<\/p>\s*<\/dd>/s);
    if (!match || !match[1]) {
      console.warn("⚠️ Ingen adress hittad");
      sendResponse({ address: null, distance: null, papaDistance: null });
      return;
    }

    const address = match[1].replace(/<br\s*\/?>/gi, ", ").replace(/\s+/g, " ").trim();
    console.log("📫 Extraherad adress:", address);

    const coords = await getCoordinates(address);
    if (!coords) {
      sendResponse({ address, distance: null, papaDistance: null });
      return;
    }

    const [distance, papaDistance] = await Promise.all([
      getDistance(message.userLocation, coords),
      getDistance(PAPA_COORDS, coords)
    ]);

    sendResponse({ address, distance, papaDistance });
  } catch (err) {
    console.error("❌ Fel vid hantering:", err);
    sendResponse({ address: null, distance: null, papaDistance: null });
  }
}

// 🔁 Retry-fetch med exponential backoff
async function safeFetch(url, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i < retries) {
        console.warn(`🔁 Retry (${i + 1}) efter fel: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      } else {
        console.error("❌ Fetch misslyckades efter retries:", err);
        return null;
      }
    }
  }
}

async function getCoordinates(address) {
  const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}`;
  const data = await safeFetch(geocodeUrl);
  if (!data || !data.features || data.features.length === 0) {
    console.error("❌ Fel vid geokodning:", address);
    return null;
  }
  const [lng, lat] = data.features[0].geometry.coordinates;
  return { lat, lng };
}

async function getDistance(from, to) {
  if (!from || !to) return null;

  const routeUrl = "https://api.openrouteservice.org/v2/directions/driving-car";
  const body = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat]
    ]
  };

  const res = await safeFetch(routeUrl, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res || !res.routes || res.routes.length === 0) {
    console.error("❌ Fel vid distanshämtning");
    return null;
  }

  const meters = res.routes[0].summary.distance;
  return Math.round(meters / 1000);
}
