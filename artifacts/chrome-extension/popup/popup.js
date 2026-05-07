// ==== Time Palette — Popup (Auth + Read-only Project List) ====

const STORAGE_KEYS = {
  SESSION: 'tp_session',
  API_BASE: 'tp_api_base',
};
const DEFAULT_API_BASE = 'https://margin.rsmdesign.com';

// ---- DOM refs ----
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const autoMatchBtn = document.getElementById('auto-match-btn');
const apiBaseInput = document.getElementById('api-base-input');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const connectionStatus = document.getElementById('connection-status');
const projectList = document.getElementById('project-list');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');

// ---- Init ----
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load saved API base
  const stored = await storageGet([STORAGE_KEYS.API_BASE]);
  const apiBase = stored[STORAGE_KEYS.API_BASE] || DEFAULT_API_BASE;
  apiBaseInput.value = apiBase;

  // Check auth state
  const session = await getSession();
  if (session && session.sid) {
    showMainSection(session);
    await loadProjects(apiBase, session.sid);
  } else {
    showAuthSection();
  }

  // Bind events
  signInBtn.addEventListener('click', handleSignIn);
  if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
  if (autoMatchBtn) autoMatchBtn.addEventListener('click', handleAutoMatch);
  apiBaseInput.addEventListener('change', handleApiBaseChange);
}

// ---- Auth flow ----
async function handleSignIn() {
  // Save the API base first
  const base = (apiBaseInput.value || DEFAULT_API_BASE).replace(/\/+$/, '');
  await storageSet({ [STORAGE_KEYS.API_BASE]: base });

  signInBtn.textContent = 'Checking...';
  signInBtn.disabled = true;

  // Try to grab the session cookie from the Margin domain using chrome.cookies API
  const grabbed = await tryGrabSession(base);
  if (grabbed) {
    signInBtn.textContent = 'Sign in with Google';
    signInBtn.disabled = false;
    return;
  }

  // No existing session — open the login page
  chrome.tabs.create({ url: base + '/login' });

  // Show a retry button — user will click after completing SSO
  signInBtn.textContent = 'I\'ve signed in — Connect';
  signInBtn.disabled = false;
}

// Use chrome.cookies to read the "sid" cookie from the Margin domain,
// then validate it against the API and store it for the extension to use.
async function tryGrabSession(base) {
  try {
    // Extract the domain URL for chrome.cookies
    const url = base.startsWith('http') ? base : 'https://' + base;

    const cookie = await new Promise((resolve) => {
      chrome.cookies.get({ url, name: 'sid' }, (c) => resolve(c));
    });

    if (!cookie || !cookie.value) {
      console.log('[TimePalette] No sid cookie found on', url);
      return false;
    }

    const sid = cookie.value;

    // Validate the session by calling /api/auth/user with the token
    const res = await fetch(base + '/api/auth/user', {
      headers: { 'Authorization': 'Bearer ' + sid },
    });

    if (!res.ok) {
      console.log('[TimePalette] Session cookie invalid (API returned', res.status + ')');
      return false;
    }

    const data = await res.json();
    if (!data.authenticated || !data.user) {
      console.log('[TimePalette] Session not authenticated');
      return false;
    }

    // Store the session for the extension
    await storageSet({
      [STORAGE_KEYS.SESSION]: { sid, user: data.user },
    });

    showMainSection({ sid, user: data.user });
    await loadProjects(base, sid);
    showToast('Connected!');
    return true;
  } catch (err) {
    console.error('[TimePalette] tryGrabSession error:', err);
    return false;
  }
}

async function handleSignOut() {
  await new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.SESSION], resolve);
  });
  showAuthSection();
}

function handleApiBaseChange() {
  const base = (apiBaseInput.value || DEFAULT_API_BASE).replace(/\/+$/, '');
  storageSet({ [STORAGE_KEYS.API_BASE]: base });
}

// ---- UI State ----
function showAuthSection() {
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
}

function showMainSection(session) {
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');

  const user = session.user;
  if (user) {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'User';
    userName.textContent = displayName;

    const initials = ((user.firstName || '')[0] || '') + ((user.lastName || '')[0] || '');
    userAvatar.textContent = initials.toUpperCase() || '?';
  }
}

// ---- Projects ----
async function loadProjects(apiBase, sid) {
  emptyState.classList.add('hidden');
  loadingState.classList.remove('hidden');

  // Clear old project items
  projectList.querySelectorAll('.project-item').forEach((el) => el.remove());

  try {
    const res = await fetch(apiBase + '/api/projects', {
      headers: { 'Authorization': 'Bearer ' + sid },
    });

    if (!res.ok) {
      if (res.status === 401) {
        connectionStatus.textContent = 'Session expired';
        connectionStatus.style.color = '#ef4444';
        return;
      }
      throw new Error('Failed to fetch');
    }

    const projects = await res.json();
    loadingState.classList.add('hidden');

    if (!projects || projects.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    connectionStatus.textContent = 'Connected';
    connectionStatus.style.color = '';

    // Also fetch phases for each project (for display)
    const phasesMap = {};
    for (const p of projects) {
      try {
        const phRes = await fetch(apiBase + '/api/projects/' + p.id + '/phases', {
          headers: { 'Authorization': 'Bearer ' + sid },
        });
        if (phRes.ok) phasesMap[p.id] = await phRes.json();
      } catch (_) {}
    }

    renderProjects(projects, phasesMap);
  } catch (err) {
    loadingState.classList.add('hidden');
    connectionStatus.textContent = 'Offline (cached)';
    connectionStatus.style.color = '#f59e0b';
    console.error('[TimePalette] loadProjects error:', err);

    // Try to show cached projects
    const cached = await storageGet(['tp_cache_projects']);
    const cachedProjects = cached.tp_cache_projects;
    if (cachedProjects && cachedProjects.length > 0) {
      renderProjects(cachedProjects, {});
    } else {
      emptyState.classList.remove('hidden');
    }
  }
}

function renderProjects(projects, phasesMap) {
  // Clear old items
  projectList.querySelectorAll('.project-item').forEach((el) => el.remove());
  emptyState.classList.add('hidden');

  projects.forEach((project) => {
    const item = document.createElement('div');
    item.className = 'project-item';

    const phases = phasesMap[project.id] || [];
    let phasesHtml = '';
    if (phases.length > 0) {
      const phaseNames = phases.slice(0, 4).map((ph) => escapeHtml(ph.name)).join(', ');
      const more = phases.length > 4 ? ` +${phases.length - 4} more` : '';
      phasesHtml = `<span class="project-phases">${phaseNames}${more}</span>`;
    }

    item.innerHTML = `
      <span class="project-color-dot" style="background:${safeColor(project.color)}"></span>
      <div class="project-info">
        <span class="project-name">${escapeHtml(project.name)}</span>
        ${phasesHtml}
      </div>
    `;

    projectList.appendChild(item);
  });
}

// ---- Auto-match ----
async function handleAutoMatch() {
  const session = await getSession();
  if (!session) {
    showToast('Sign in first');
    return;
  }

  autoMatchBtn.classList.add('spinning');
  autoMatchBtn.disabled = true;

  try {
    const [tab] = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    if (!tab || !tab.url || !tab.url.includes('calendar.google.com')) {
      showToast('Open Google Calendar first');
      return;
    }
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_MATCH' });
    if (res && typeof res.assigned === 'number') {
      showToast(
        res.assigned === 0
          ? 'No new matches found'
          : `Matched ${res.assigned} event${res.assigned === 1 ? '' : 's'}`
      );
    } else {
      showToast('Auto-match complete');
    }
  } catch (err) {
    console.error('[TimePalette Popup] auto-match error:', err);
    showToast('Reload Google Calendar and try again');
  } finally {
    autoMatchBtn.classList.remove('spinning');
    autoMatchBtn.disabled = false;
  }
}

// ---- Helpers ----
function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.SESSION, (result) => {
      resolve(result[STORAGE_KEYS.SESSION] || null);
    });
  });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, () => resolve());
  });
}

function safeColor(hex) {
  if (typeof hex !== 'string') return '#9ca3af';
  const s = hex.trim();
  if (/^#([0-9a-fA-F]{3}){1,2}$/.test(s)) return s;
  return '#9ca3af';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  let t = document.getElementById('tp-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'tp-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 2200);
}

function notifyContentScript(type) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('calendar.google.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: type });
    }
  });
}
