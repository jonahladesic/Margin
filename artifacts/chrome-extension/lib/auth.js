// ==== Time Palette — Auth Management ====
// Handles session token storage and login flow for the Margin backend.
(function (ns) {
  const STORAGE_KEYS = ns.apiClient.STORAGE_KEYS;

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => resolve(result || {}));
      } catch (_) { resolve({}); }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (_) { resolve(); }
    });
  }

  ns.auth = {
    // Check if we have a stored session
    isLoggedIn: async function () {
      const result = await storageGet(STORAGE_KEYS.SESSION);
      return !!(result[STORAGE_KEYS.SESSION] && result[STORAGE_KEYS.SESSION].sid);
    },

    // Get stored user info
    getUser: async function () {
      const result = await storageGet(STORAGE_KEYS.SESSION);
      const session = result[STORAGE_KEYS.SESSION];
      return session ? session.user : null;
    },

    // Get stored session token
    getToken: async function () {
      const result = await storageGet(STORAGE_KEYS.SESSION);
      const session = result[STORAGE_KEYS.SESSION];
      return session ? session.sid : null;
    },

    // Store a session token + user after login
    storeToken: async function (sid, user) {
      await storageSet({ [STORAGE_KEYS.SESSION]: { sid, user } });
    },

    // Clear stored session (logout)
    logout: async function () {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.remove([STORAGE_KEYS.SESSION], () => resolve());
        } catch (_) { resolve(); }
      });
    },

    // Open the Margin login page for the user to authenticate
    openLoginPage: async function () {
      const result = await storageGet(STORAGE_KEYS.API_BASE);
      const base = result[STORAGE_KEYS.API_BASE] || 'https://rsm-design-os.onrender.com';
      // Open the login page — after sign-in completes, user returns to the app
      // Then they click "Connect Extension" which calls /auth/extension-token
      chrome.tabs.create({ url: base + '/login' });
    },

    // Attempt to grab the extension token from the backend
    // (call this after user has logged in via the web)
    fetchExtensionToken: async function () {
      try {
        const result = await storageGet(STORAGE_KEYS.API_BASE);
        const base = result[STORAGE_KEYS.API_BASE] || 'https://rsm-design-os.onrender.com';
        const res = await fetch(base + '/api/auth/extension-token', {
          credentials: 'include',
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.sid && data.user) {
          await ns.auth.storeToken(data.sid, data.user);
          return data;
        }
        return null;
      } catch (err) {
        console.warn('[TimePalette] fetchExtensionToken failed:', err);
        return null;
      }
    },

    // Set the API base URL
    setApiBase: async function (url) {
      // Strip trailing slash
      const cleaned = (url || '').replace(/\/+$/, '');
      await storageSet({ [STORAGE_KEYS.API_BASE]: cleaned });
    },

    // Get the current API base URL
    getApiBase: async function () {
      const result = await storageGet(STORAGE_KEYS.API_BASE);
      return result[STORAGE_KEYS.API_BASE] || 'https://rsm-design-os.onrender.com';
    },
  };
})(window.__gcalPT);
