(() => {
  'use strict';

  const { LOG_PREFIX, RECORD_TASK } = globalThis.RunwayHelperEarnings;
  const origin = 'https://caption-verify-ext.ext.runwayml.com';
  let writes = Promise.resolve();

  async function record({ account, total, at, highlighted, activeMs = 0 }) {
    const key = `${LOG_PREFIX}${encodeURIComponent(account)}:${Math.floor(total / 512)}`;
    const batch = (await chrome.storage.local.get(key))[key] || {};
    // The account and Runway's completion number identify a credit across tabs and retries.
    if (Object.hasOwn(batch, total)) return;
    batch[total] = activeMs ? [at, highlighted, activeMs] : [at, highlighted];
    await chrome.storage.local.set({ [key]: batch });
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== RECORD_TASK || sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 || !sender.tab || sender.origin !== origin) return false;

    const { account, total, at, highlighted, activeMs = 0 } = message;
    if (typeof account !== 'string' || !account || account.length > 256 ||
      !Number.isSafeInteger(total) || total <= 0 ||
      !Number.isSafeInteger(at) || at <= 0 || typeof highlighted !== 'boolean' ||
      !Number.isSafeInteger(activeMs) || activeMs < 0) return false;

    const write = writes.then(() => record(message));
    writes = write.catch(() => {});
    write.then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  });
})();
