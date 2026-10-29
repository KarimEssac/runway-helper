(() => {
  'use strict';
  const marker = 'data-runway-helper-image-search';
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, '');
  let handledShortcut = false;
  let opening = false;
  let notice, noticeHost, noticeTimer;

  function selectedWords(event) {
    const target = event.composedPath()[0];
    if (target instanceof HTMLInputElement && target.type === 'password') return '';
    if ((target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email'].includes(target.type))) && target.selectionStart != null) {
      return target.value.slice(target.selectionStart, target.selectionEnd).replace(/\s+/g, ' ').trim();
    }
    return (window.getSelection()?.toString() || '').replace(/\s+/g, ' ').trim();
  }

  function showError(message) {
    if (!noticeHost) {
      noticeHost = document.createElement('runway-helper-search-notice');
      const shadow = noticeHost.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `:host { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
        max-width: min(420px, calc(100vw - 40px)); padding: 12px 16px; border: 1px solid #546476;
        border-radius: 8px; background: #101820; color: #fff; font: 14px/1.4 system-ui, sans-serif;
        box-shadow: 0 4px 20px #0006; pointer-events: none; }
        :host([hidden]) { display: none !important; }`;
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      shadow.append(style, notice);
      (document.body || document.documentElement).append(noticeHost);
    }
    notice.textContent = message;
    noticeHost.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { noticeHost.hidden = true; }, 6500);
  }

  window.addEventListener('keydown', event => {
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.code !== 'KeyD') return;
    if (event.repeat) {
      if (handledShortcut) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    const query = selectedWords(event);
    if (!query) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handledShortcut = true;
    if (query.length > 300) { showError('Select up to 300 characters for Google Images search.'); return; }
    if (opening) return;
    opening = true;
    if (noticeHost) noticeHost.hidden = true;
    Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'runway-helper:images:open', query })).then(response => {
      if (!response?.ok) showError(response?.message || 'Google Images could not be opened.');
    }).catch(() => {
      showError('Reload the extension and refresh Runway to use image search.');
    }).finally(() => { opening = false; });
  }, true);

  window.addEventListener('keyup', event => {
    if (handledShortcut && event.code === 'KeyD') {
      handledShortcut = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('blur', () => { handledShortcut = false; });
})();
