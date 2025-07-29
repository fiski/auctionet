let userLocation = null;

navigator.geolocation.getCurrentPosition(
  (position) => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    console.log("📍 Användarens plats:", userLocation);
    processItems();
  },
  (error) => {
    console.warn("🚫 Kunde inte hämta plats:", error.message);
    processItems(); // Kör ändå
  }
);

function processItems() {
  const items = document.querySelectorAll("article.item-thumb");
  console.log(`🔎 Hittade ${items.length} föremål`);

  items.forEach((item, index) => {
    const amountDiv = item.querySelector(".item-thumb__amount");
    if (!amountDiv) return;

    // Undvik dubletter
    if (item.querySelector(".distance-info")) return;

    const link = item.querySelector("a[href*='/sv/']");
    if (!link) return;

    const itemUrl = link.href;

    // Skapa och visa placeholder direkt
    const infoBox = document.createElement("div");
    infoBox.className = "distance-info";
    infoBox.innerHTML = `
      <div>📍 Avstånd: 🔄 Beräknas...</div>
      <div>👨‍👦 Avstånd från pappa: 🔄 Beräknas...</div>
    `;
    amountDiv.insertAdjacentElement("afterend", infoBox);

    // Skicka till background.js
    chrome.runtime.sendMessage(
      {
        type: "fetchItemPage",
        url: itemUrl,
        userLocation
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`❓ [${index}] Fel:`, chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.address) {
          console.warn(`❓ [${index}] Ingen adress hittad`);
          return;
        }

        console.log(`📦 [${index}] Adress: ${response.address}`);

        const { distance, papaDistance } = response;
        infoBox.innerHTML = `
          <div>📍 Avstånd: ${distance !== null ? distance + " km" : "Okänt"}</div>
          <div>👨‍👦 Avstånd från pappa: ${papaDistance !== null ? papaDistance + " km" : "Okänt"}</div>
        `;
      }
    );
  });
}
