// ==== Time Palette — Background Service Worker ====

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize default storage — no longer need tp_projects/tp_assignments
    // since those come from the backend. Just set defaults for the API config.
    chrome.storage.local.set({
      tp_api_base: 'https://margin.rsmdesign.com',
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
