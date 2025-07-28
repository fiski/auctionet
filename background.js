chrome.runtime.onInstalled.addListener(() => {
    console.log('Auctionet Distance Calculator installerat');
  });
  
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'fetchItemPage') {
      try {
        const response = await fetch(message.url);
        const html = await response.text();
  
        // Plocka ut adressblock (p + br-taggar) ur <dd> för "Adress"
        const match = html.match(/<dt>\s*Adress\s*<\/dt>\s*<dd>\s*<p>([\s\S]*?)<\/p>/i);
        if (!match) {
          sendResponse({ address: null });
          return;
        }
  
        // Rensa HTML till text
        const raw = match[1]
          .replace(/<br\s*\/?>/gi, '\n')   // ersätt <br> med radbrytning
          .replace(/<\/?[^>]+(>|$)/g, '') // ta bort övriga taggar
          .trim();
  
        sendResponse({ address: raw });
      } catch (e) {
        console.error('Fel vid hämtning av objektsida:', e);
        sendResponse({ address: null });
      }
  
      return true; // Håll kanalen öppen för async-svar
    }
  });
  