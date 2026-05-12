// ==== Time Palette — Background Service Worker ====

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize default storage for fresh installs
    chrome.storage.local.set({
      tp_api_base: 'https://rsm-design-os.onrender.com',
    });
  } else if (details.reason === 'update') {
    // Migrate old localhost URLs to the Render domain
    chrome.storage.local.get('tp_api_base', (result) => {
      const current = result.tp_api_base || '';
      if (current.includes('localhost')) {
        chrome.storage.local.set({
          tp_api_base: 'https://rsm-design-os.onrender.com',
        });
        // Clear old session since it won't work with the new domain
        chrome.storage.local.remove('tp_session');
      }
    });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_AUTH') {
    chrome.storage.local.get('tp_session', (result) => {
      const session = result.tp_session;
      sendResponse({ loggedIn: !!(session && session.sid), user: session?.user || null });
    });
    return true; // async response
  }
});
