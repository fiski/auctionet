chrome.runtime.onInstalled.addListener(() => {
    console.log('Auctionet Distance Calculator installed');
  });
  
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'fetchItemPage') {
      try {
        const response = await fetch(message.url);
        const html = await response.text();
        
        // DOMParser fungerar inte i background service workers – vi använder istället regex som workaround
        const match = html.match(/<dt[^>]*>\s*Adress\s*<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/i);
        const address = match ? match[1].trim() : null;
  
        sendResponse({ address });
      } catch (e) {
        console.error('Background fetch failed:', e);
        sendResponse({ address: null });
      }
  
      return true; // Viktigt! Behåller meddelandekanalen öppen för async-respons
    }
  });
  