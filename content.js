// Clean up any previous instance (after extension reload + re-injection)
if (window.__auctionetObserver) {
  window.__auctionetObserver.disconnect();
  window.__auctionetObserver = null;
}
if (window.__turboLoadHandler) {
  document.removeEventListener('turbo:load', window.__turboLoadHandler);
  window.__turboLoadHandler = null;
}
const oldBar = document.getElementById('auctionet-quick-settings');
if (oldBar) oldBar.remove();

let userLocation = null;

const defaultRanges = {
  greenMax: 100,
  orangeMax: 250
};

const nonSwedenCountries = ['Danmark', 'Finland', 'Spanien', 'Storbritannien', 'Tyskland'];

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
  if (distance == null) return 'red'; // Rött för icke-svenska föremål
  if (distance <= ranges.greenMax) return 'green';
  if (distance <= ranges.orangeMax) return 'orange';
  return 'red';
}

function getCountryFromAddress(address) {
  if (!address || typeof address !== 'string' || address.trim() === '') {
    console.warn('🚫 Ogiltig adress för landsextraktion:', address);
    return null;
  }
  // Ta bort inledande/efterföljande kommatecken, extra mellanslag och andra ogiltiga tecken
  const cleanedAddress = address.trim().replace(/^,+|,+$|[^a-zA-Z0-9,\s-]/g, '');
  const parts = cleanedAddress.split(',').map(part => part.trim()).filter(part => part !== '');
  if (parts.length < 1) {
    console.warn('🚫 Adressen saknar giltiga delar för att extrahera land:', parts, 'Original:', address);
    return null;
  }
  const country = parts[parts.length - 1];
  // Validera att landet är en rimlig sträng (t.ex. inte ett postnummer eller tom)
  if (!country || country.length < 2 || /\d/.test(country)) {
    console.warn('🚫 Ogiltigt land extraherat:', country, 'Adressdelar:', parts, 'Original:', address);
    return null;
  }
  console.log('🌍 Extraherat land:', country);
  return country;
}

window.getUserLocation = function(forceGeolocation = false) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['manualLocation'], (result) => {
      if (!forceGeolocation && result.manualLocation && !isNaN(result.manualLocation.lat) && !isNaN(result.manualLocation.lng)) {
        userLocation = result.manualLocation;
        console.log("📍 Prioriterar manuell plats:", userLocation);
        resolve(userLocation);
      } else {
        console.log("🚫 Ingen giltig manuell plats eller tvingad geolocation, försöker hämta geolocation");
        if (!navigator.geolocation) {
          console.warn("🚫 Geolocation stöds inte av webbläsaren");
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            console.log("📍 Användarens plats hämtad via geolocation:", userLocation);
            chrome.storage.sync.set({ manualLocation: null }, () => {
              console.log("🗑️ Raderade manuell plats vid lyckad geolocation");
            });
            resolve(userLocation);
          },
          (err) => {
            console.warn("🚫 Geolocation misslyckades:", err.message);
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      }
    });
  });
};

window.startProcessingItems = async function() {
  const ranges = await getDistanceRanges();
  const items = document.querySelectorAll("article.item-thumb");
  console.log(`🧩 Hittade ${items.length} objekt`);

  if (items.length === 0) {
    console.warn("⚠️ Inga objekt hittades på sidan");
    return;
  }

  items.forEach((item, index) => {
    if (item.querySelector(".distance-info")) {
      console.log(`ℹ️ [${index}] Avståndsinfo redan tillagd`);
      return;
    }

    const amountDiv = item.querySelector(".item-thumb__amount");
    if (!amountDiv) {
      console.warn(`⚠️ [${index}] Ingen .item-thumb__amount hittades`);
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
          distanceDiv.innerHTML = `❓ Adress saknas`;
          distanceDiv.className = `distance-info red`;
          return;
        }

        console.log(`📦 [${index}] Adress: ${response.address}`);
        console.log(`📏 Avstånd från användare: ${response.distanceFromUser}`);

        const country = getCountryFromAddress(response.address);
        if (response.distanceFromUser != null) {
          // Föremål i Sverige, visa avstånd
          const userDist = `${response.distanceFromUser} km (fågelvägen)`;
          const userCategory = getDistanceCategory(response.distanceFromUser, ranges);
          console.log(`🎨 Kategori - Användare: ${userCategory}`);

          distanceDiv.className = `distance-info ${userCategory}`;
          console.log(`🖌️ Applicerar klass på distanceDiv: ${distanceDiv.className}`);

          distanceDiv.innerHTML = `📍 Avstånd: ${userDist}`;
          distanceDiv.title = `Adress: ${response.address}`;
        } else {
          // Föremål utanför Sverige, visa landet
          if (!country) {
            console.warn(`❓ [${index}] Kunde inte extrahera land från adress: ${response.address}`);
            distanceDiv.innerHTML = `❓ Okänd plats`;
            distanceDiv.className = `distance-info red`;
          } else {
            const isNonSweden = nonSwedenCountries.includes(country);
            distanceDiv.className = `distance-info ${isNonSweden ? 'non-sweden' : 'red'}`;
            distanceDiv.innerHTML = `📍 Plats: ${country}`;
            distanceDiv.title = `Adress: ${response.address}`;
            console.log(`✅ Visar plats: ${country}, Klass: ${distanceDiv.className}`);
          }
        }

        const computedStyle = window.getComputedStyle(distanceDiv);
        console.log(`🔍 Computed style för distanceDiv [${index}]: background-color=${computedStyle.backgroundColor}, color=${computedStyle.color}, background-image=${computedStyle.backgroundImage}`);
      }
    );
  });
};

function applyQuickSettings(settings) {
  document.body.classList.toggle('auctionet-hide-distances', !settings.showDistances);
  document.body.classList.toggle('auctionet-hide-amounts', !settings.showAmounts);
  document.body.classList.toggle('auctionet-hide-red-items', !!settings.hideRedItems);
}

function injectQuickSettings(settings) {
  if (document.getElementById('auctionet-quick-settings')) return;

  // Strategy 1: Auctionet's sort+pagination wrapper (exact class from real DOM)
  // Insert BEFORE this div, not inside it (inside has hide-in-apps class)
  const sortBar = document.querySelector('.search-page__sort-and-pagination');

  // Strategy 2: parent of item cards (reliable when items exist)
  const firstItem = document.querySelector('article.item-thumb');
  const itemsContainer = firstItem ? firstItem.parentElement : null;

  const injectionTarget = sortBar ?? itemsContainer;

  // Nothing found yet — MutationObserver will retry when items load
  if (!injectionTarget) return;

  const bar = document.createElement('div');
  bar.id = 'auctionet-quick-settings';
  bar.innerHTML = `
    <label class="auctionet-toggle-label">
      <input type="checkbox" id="toggle-distances" ${settings.showDistances ? 'checked' : ''}>
      Visa avstånd
    </label>
    <label class="auctionet-toggle-label">
      <input type="checkbox" id="toggle-amounts" ${settings.showAmounts ? 'checked' : ''}>
      Visa bud
    </label>
    <label class="auctionet-toggle-label">
      <input type="checkbox" id="toggle-hide-red" ${settings.hideRedItems ? 'checked' : ''}>
      Dölj röda avstånd
    </label>
  `;

  injectionTarget.insertAdjacentElement('beforebegin', bar);

  document.getElementById('toggle-distances').addEventListener('change', (e) => {
    document.body.classList.toggle('auctionet-hide-distances', !e.target.checked);
    chrome.storage.sync.set({ showDistances: e.target.checked });
  });

  document.getElementById('toggle-amounts').addEventListener('change', (e) => {
    document.body.classList.toggle('auctionet-hide-amounts', !e.target.checked);
    chrome.storage.sync.set({ showAmounts: e.target.checked });
  });

  document.getElementById('toggle-hide-red').addEventListener('change', (e) => {
    document.body.classList.toggle('auctionet-hide-red-items', e.target.checked);
    chrome.storage.sync.set({ hideRedItems: e.target.checked });
  });
}

function observeDOMChanges() {
  const targetNode = document.body;
  const observer = new MutationObserver((mutations) => {
    let itemsAdded = false;
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && (node.matches('article.item-thumb') || node.querySelector('article.item-thumb'))) {
            itemsAdded = true;
            console.log('🔄 Nya objekt detekterade i DOM, kör startProcessingItems');
          }
        });
      }
    });
    if (itemsAdded) {
      window.startProcessingItems();
      chrome.storage.sync.get({ showDistances: true, showAmounts: true, hideRedItems: false }, injectQuickSettings);
    }
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
  window.__auctionetObserver = observer;
  console.log('👀 MutationObserver startad för att övervaka DOM-förändringar');
}

function setupPage() {
  const oldBar = document.getElementById('auctionet-quick-settings');
  if (oldBar) oldBar.remove();

  chrome.storage.sync.get({ showDistances: true, showAmounts: true, hideRedItems: false }, (settings) => {
    applyQuickSettings(settings);
    injectQuickSettings(settings);
  });

  if (window.__auctionetObserver) {
    window.__auctionetObserver.disconnect();
    window.__auctionetObserver = null;
  }
  observeDOMChanges();

  window.startProcessingItems();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateRanges" || message.type === "updateLocation") {
    console.log(`🔄 Mottog ${message.type}-meddelande, kör startProcessingItems`);
    window.startProcessingItems();
  } else if (message.type === "fetchGeolocation") {
    console.log("🔄 Försöker hämta geolocation igen");
    window.getUserLocation(true).then(() => window.startProcessingItems());
  }
});

async function init() {
  window.__turboLoadHandler = function() {
    console.log('🚗 turbo:load fired — running setupPage()');
    setupPage();
  };
  document.addEventListener('turbo:load', window.__turboLoadHandler);

  // Direct call handles initial load (in case turbo:load already fired before injection)
  setupPage();

  // Resolve location async; re-process once available
  await window.getUserLocation();
  if (userLocation) {
    document.querySelectorAll('.distance-info').forEach(el => el.remove());
    window.startProcessingItems();
  }
}

init();