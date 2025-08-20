let userLocation = null;

const defaultRanges = {
  greenMax: 100,
  orangeMax: 250
};

async function getDistanceRanges() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['distanceRanges'], (result) => {
      const ranges = result.distanceRanges || defaultRanges;
      console.log("📏 Hämtade avståndsintervall:", ranges);
      resolve(ranges);
    });
  });
}

function getDistanceCategory(distance, ranges) {
  if (distance == null) return '';
  if (distance <= ranges.greenMax) return 'green';
  if (distance <= ranges.orangeMax) return 'orange';
  return 'red';
}

window.getUserLocation = function() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("🚫 Geolocation stöds inte av webbläsaren");
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log("📍 Användarens plats hämtad:", userLocation);
        chrome.storage.sync.set({ manualLocation: null }, () => {
          console.log("🗑️ Raderade manuell plats vid lyckad geolocation");
        });
        resolve(userLocation);
      },
      (err) => {
        console.warn("🚫 Platsåtkomst nekad eller misslyckades:", err.message);
        chrome.storage.sync.get(['manualLocation'], (result) => {
          if (result.manualLocation && result.manualLocation.lat && result.manualLocation.lng) {
            userLocation = result.manualLocation;
            console.log("📍 Använder manuell plats:", userLocation);
            resolve(userLocation);
          } else {
            resolve(null);
          }
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
};

window.startProcessingItems = async function() {
  const ranges = await getDistanceRanges();
  const items = document.querySelectorAll("article.item-thumb");
  console.log(`🧩 Hittade ${items.length} objekt`);

  const styleSheet = Array.from(document.styleSheets).find(sheet =>
    sheet.href && sheet.href.includes('styles.css')
  );
  if (!styleSheet) {
    console.warn("⚠️ styles.css hittades inte i document.styleSheets");
  } else {
    console.log("✅ styles.css laddad korrekt");
    const rules = Array.from(styleSheet.cssRules).map(rule => rule.selectorText);
    console.log("📜 CSS-regler:", rules);
  }

  if (items.length === 0) {
    console.warn("⚠️ Inga objekt hittades på sidan");
    return;
  }

  items.forEach((item, index) => {
    const amountDiv = item.querySelector(".item-thumb__amount");
    if (!amountDiv) {
      console.warn(`⚠️ [${index}] Ingen .item-thumb__amount hittades`);
      return;
    }

    if (item.querySelector(".distance-info")) {
      console.log(`ℹ️ [${index}] Avståndsinfo redan tillagd`);
      return;
    }

    const link = item.querySelector("a[href*='/sv/']");
    if (!link) {
      console.warn(`⚠️ [${index}] Ingen länk hittades`);
      return;
    }

    const itemUrl = link.href;

    const distanceDiv = document.createElement("div");
    distanceDiv.className = "distance-info";
    distanceDiv.innerHTML = `⏳ Avstånd: beräknas...`;
    amountDiv.insertAdjacentElement("afterend", distanceDiv);

    chrome.runtime.sendMessage(
      { type: "fetchItemPage", url: itemUrl, userLocation },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("❌ Bakgrundssvar misslyckades:", chrome.runtime.lastError.message);
          distanceDiv.innerHTML = `⚠️ Fel vid hämtning`;
          return;
        }

        if (!response || !response.address) {
          console.warn(`❓ [${index}] Ingen adress hittad, returnerad adress: ${response ? response.address : 'null'}`);
          distanceDiv.innerHTML = `❓ Adress saknas (hittad: ${response ? response.address : 'ingen'})`;
          return;
        }

        console.log(`📦 [${index}] Adress: ${response.address}`);
        console.log(`📏 Avstånd från användare: ${response.distanceFromUser}`);

        const userDist = response.distanceFromUser != null
          ? `${response.distanceFromUser} km (fågelvägen)`
          : `okänt - ange plats i inställningar`;

        const userCategory = getDistanceCategory(response.distanceFromUser, ranges);
        console.log(`🎨 Kategori - Användare: ${userCategory}`);

        distanceDiv.className = `distance-info ${userCategory || ''}`;
        console.log(`🖌️ Applicerar klass på distanceDiv: ${distanceDiv.className}`);

        distanceDiv.innerHTML = `📍 Avstånd: ${userDist}`;
        distanceDiv.title = `Adress: ${response.address}`;

        const computedStyle = window.getComputedStyle(distanceDiv);
        console.log(`🔍 Computed style för distanceDiv [${index}]: background-color=${computedStyle.backgroundColor}, color=${computedStyle.color}`);
      }
    );
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateRanges" || message.type === "updateLocation") {
    console.log(`🔄 Mottog ${message.type}-meddelande, kör startProcessingItems`);
    window.startProcessingItems();
  } else if (message.type === "retryGeolocation") {
    console.log("🔄 Försöker hämta geolocation igen");
    window.getUserLocation().then(() => window.startProcessingItems());
  }
});

async function init() {
  await window.getUserLocation();
  window.startProcessingItems();
}

init();