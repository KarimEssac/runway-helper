const RUNWAY_ORIGIN = 'https://caption-verify-ext.ext.runwayml.com';
const OPEN_SEARCH = 'runway-helper:images:open';
const WINDOW_KEYS = ['imageSearchPopup', 'imageSearchPopupPrivate'];
let windowQueue = Promise.resolve();

// Keep only window IDs for this browser session. Remove the retired API settings.
const storageReady = Promise.all([
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.local.remove(['imageSearchKey', 'imageSearchUsage'])
]);

async function openSearch(query, ownerWindowId) {
  await storageReady;
  const parent = await chrome.windows.get(ownerWindowId);
  const key = parent.incognito ? WINDOW_KEYS[1] : WINDOW_KEYS[0];
  const saved = (await chrome.storage.session.get(key))[key];
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('udm', '2');
  url.searchParams.set('q', query);

  if (saved && Number.isInteger(saved.windowId)) {
    try {
      const existing = await chrome.windows.get(saved.windowId);
      // Do not redirect a tab the user has moved to a normal browser window.
      if (existing.type === 'popup' && existing.incognito === parent.incognito) {
        const tabs = await chrome.tabs.query({ windowId: existing.id });
        const tab = tabs.find(item => item.id === saved.tabId) || tabs[0];
        let tabId;
        if (tab) {
          tabId = tab.id;
          await chrome.tabs.update(tabId, { url: url.href, active: true });
        } else {
          tabId = (await chrome.tabs.create({ windowId: existing.id, url: url.href, active: true })).id;
        }
        await chrome.windows.update(existing.id, {
          focused: true,
          ...(existing.state === 'minimized' ? { state: 'normal' } : {})
        });
        await chrome.storage.session.set({ [key]: { windowId: existing.id, tabId } });
        return { ok: true };
      }
    } catch {
      // The managed window may have been closed while this request was opening.
    }
    await chrome.storage.session.remove(key);
  }

  const parentWidth = parent.width || 1280;
  const parentHeight = parent.height || 900;
  const width = Math.max(320, Math.min(800, parentWidth - 32));
  const height = Math.max(240, Math.min(600, parentHeight - 48));
  const popup = await chrome.windows.create({
    type: 'popup', url: url.href, focused: true, incognito: !!parent.incognito,
    width, height,
    left: (parent.left || 0) + Math.round((parentWidth - width) / 2),
    top: (parent.top || 0) + Math.round((parentHeight - height) / 2)
  });
  if (!popup || !Number.isInteger(popup.id)) throw new Error('Window unavailable');
  const tabId = popup.tabs?.[0]?.id;
  await chrome.storage.session.set({ [key]: { windowId: popup.id, ...(Number.isInteger(tabId) ? { tabId } : {}) } });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== OPEN_SEARCH || sender.frameId !== 0 || !sender.tab) return false;
  try { if (new URL(sender.url).origin !== RUNWAY_ORIGIN) return false; }
  catch { return false; }
  const query = typeof message.query === 'string' ? message.query.replace(/\s+/g, ' ').trim() : '';
  if (!query || query.length > 300) {
    sendResponse({ ok: false, message: 'Select between 1 and 300 characters to search.' });
    return false;
  }
  // Serialize requests from multiple Runway tabs so they share one search window.
  const task = windowQueue.then(() => openSearch(query, sender.tab.windowId));
  windowQueue = task.catch(() => {});
  task.then(sendResponse, () => sendResponse({
    ok: false,
    message: 'Google Images could not be opened. Reload the extension, refresh Runway, and try again.'
  }));
  return true;
});

chrome.windows.onRemoved.addListener(windowId => {
  const task = windowQueue.then(async () => {
    await storageReady;
    const saved = await chrome.storage.session.get(WINDOW_KEYS);
    const keys = WINDOW_KEYS.filter(key => saved[key]?.windowId === windowId);
    if (keys.length) await chrome.storage.session.remove(keys);
  });
  windowQueue = task.catch(() => {});
});
