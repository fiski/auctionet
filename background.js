let auctionHouseData = {};

async function loadAuctionHouseData() {
  try {
    const res = await fetch(chrome.runtime.getURL("auktionshus_sverige.json"));
    auctionHouseData = await res.json();
    console.log("📦 Auktionshus-data laddad:", Object.keys(auctionHouseData).length, "poster");
  } catch (err) {
    console.error("❌ Kunde inte läsa JSON:", err);
  }
}

loadAuctionHouseData();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetchItemPage") {
    handleFetchItemPage(message, sendResponse);
    return true;
  } else if (message.type === "updateRanges") {
    chrome.tabs.query({ url: "https://auctionet.com/*" }, (tabs) => {
      if (tabs.length === 0) {
        console.warn("⚠️ Inga Auctionet-flikar hittades för updateRanges");
      } else {
        console.log(`📩 Hittade ${tabs.length} Auctionet-flikar för updateRanges`);
      }
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: "updateRanges" }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`⚠️ Kunde inte skicka updateRanges till flik ${tab.id}:`, chrome.runtime.lastError.message);
          } else {
            console.log(`✅ updateRanges skickat till flik ${tab.id}`);
          }
        });
      });
    });
    sendResponse({});
    return true;
  }
});

async function handleFetchItemPage(message, sendResponse) {
  const cacheKey = `cache_${message.url}`;
  await chrome.storage.local.remove(cacheKey);
  console.log(`🗑️ Rensade cache för ${message.url}`);

  try {
    const res = await fetch(message.url);
    const html = await res.text();

    const addressMatch = html.match(/<dt>\s*Adress\s*<\/dt>\s*<dd>\s*([\s\S]*?)<\/dd>/i);
    let address = null;
    if (addressMatch && addressMatch[1]) {
      address = addressMatch[1]
        .replace(/<[^>]+>/g, ", ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
      console.log("📫 Extraherad adress:", address);
    } else {
      console.warn("⚠️ Ingen adress kunde extraheras från HTML");
      sendResponse({ address: null, coords: null, distanceFromUser: null });
      return;
    }

    const houseMatch = html.match(/<dt>\s*Hus\s*<\/dt>\s*<dd>\s*<a[^>]*>(.*?)<\/a>/i);
    let houseName = houseMatch ? houseMatch[1].trim() : null;
    if (houseName) {
      console.log("🏠 Extraherat husnamn:", houseName);
    } else {
      console.warn("⚠️ Inget husnamn kunde extraheras");
    }

    let coords = null;
    let matchedKey = null;

    if (houseName && houseName.toLowerCase().includes("stadsauktion sundsvall") && auctionHouseData["Stadsauktion Sundsvall"]) {
      coords = {
        lat: auctionHouseData["Stadsauktion Sundsvall"].lat,
        lng: auctionHouseData["Stadsauktion Sundsvall"].lng,
      };
      matchedKey = "Stadsauktion Sundsvall";
      console.log(`✅ Explicit matchning för Stadsauktion Sundsvall: lat=${coords.lat}, lng=${coords.lng}`);
    } else if (houseName && auctionHouseData[houseName]) {
      coords = {
        lat: auctionHouseData[houseName].lat,
        lng: auctionHouseData[houseName].lng,
      };
      matchedKey = houseName;
      console.log(`✅ Exakt matchning för ${houseName}: lat=${coords.lat}, lng=${coords.lng}`);
    } else {
      let bestMatch = { dist: Infinity, key: null };
      const normHouse = houseName ? houseName.toLowerCase() : '';
      const normAddr = address.toLowerCase();
      for (const [key, val] of Object.entries(auctionHouseData)) {
        const keyDist = levenshteinDistance(normHouse || normAddr, key.toLowerCase());
        const addrDist = val.address ? levenshteinDistance(normAddr, val.address.toLowerCase()) : Infinity;
        const minDist = Math.min(keyDist, addrDist);
        if (minDist < bestMatch.dist && minDist < 5) {
          bestMatch = { dist: minDist, key, val };
        }
      }
      if (bestMatch.key) {
        coords = { lat: bestMatch.val.lat, lng: bestMatch.val.lng };
        matchedKey = bestMatch.key;
        console.log(`🔍 Fuzzy match hittad: ${matchedKey} med distans ${bestMatch.dist}`);
      } else {
        const normalizedAddress = address.toLowerCase().split(",")[0].trim();
        for (const [key, val] of Object.entries(auctionHouseData)) {
          if (val.address && normalizedAddress.includes(val.address.split(",")[0].toLowerCase().trim())) {
            coords = { lat: val.lat, lng: val.lng };
            matchedKey = key;
            console.log(`✅ Adressbaserad matchning för ${key}: lat=${coords.lat}, lng=${coords.lng}`);
            break;
          }
        }
      }
    }

    if (!coords || !coords.lat || !coords.lng || coords.lat === 0 || coords.lng === 0) {
      console.warn(`⚠️ Ingen giltig matchning i JSON för adress: ${address}, hus: ${houseName || 'inget'}`);
      const responseData = { address, coords: null, distanceFromUser: null };
      await chrome.storage.local.set({ [cacheKey]: responseData });
      sendResponse(responseData);
      return;
    }

    console.log(`✅ Koordinater matchade: ${matchedKey} lat=${coords.lat}, lng=${coords.lng}`);

    let distanceFromUser = null;
    if (message.userLocation) {
      distanceFromUser = getHaversineDistance(
        message.userLocation.lat,
        message.userLocation.lng,
        coords.lat,
        coords.lng
      );
    }

    const responseData = {
      address,
      coords,
      distanceFromUser,
    };

    await chrome.storage.local.set({ [cacheKey]: responseData });
    sendResponse(responseData);

  } catch (err) {
    console.error("❌ Fel vid hämtning/parsing:", err);
    sendResponse({ address: null, coords: null, distanceFromUser: null });
  }
}

function levenshteinDistance(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array.from({length: m+1}, () => Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i-1] === s2[j-1] ? dp[i-1][j-1] : Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1;
    }
  }
  return dp[m][n];
}

function getHaversineDistance(lat1, lng1, lat2, lng2) {
  try {
    console.log(`🛰️ Beräknar Haversine-avstånd: (${lat1},${lng1}) → (${lat2},${lng2})`);

    const R = 6371;
    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance);
  } catch (err) {
    console.error("❌ Fel vid Haversine-beräkning:", err);
    return null;
  }
}