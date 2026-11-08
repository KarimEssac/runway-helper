(() => {
  'use strict';

  const { LOG_PREFIX, RECORD_TASK, TIMER_KEY, CONTROL_TIMER, INITIAL_TIMER, timerElapsed, timerSessionStart } =
    globalThis.RunwayHelperEarnings;
  const origin = 'https://caption-verify-ext.ext.runwayml.com';
  let writes = Promise.resolve();

  async function record({ account, total, at, highlighted }) {
    const key = `${LOG_PREFIX}${encodeURIComponent(account)}:${Math.floor(total / 512)}`;
    const batch = (await chrome.storage.local.get(key))[key] || {};
    // The account and Runway's completion number identify a credit across tabs and retries.
    if (Object.hasOwn(batch, total)) return;
    batch[total] = [at, highlighted];
    await chrome.storage.local.set({ [key]: batch });
  }

  async function controlTimer(action) {
    const timer = (await chrome.storage.local.get(TIMER_KEY))[TIMER_KEY] ?? INITIAL_TIMER;
    const now = Date.now();
    const sessionStartedAt = timerSessionStart(timer);
    let next;
    switch (action) {
      case 'start': {
        if (timer.mode === 'running') return;
        const resuming = timer.mode === 'paused';
        const elapsedMs = resuming ? timer.elapsedMs : 0;
        const sessionStart = resuming ? sessionStartedAt : now;
        next = { mode: 'running', elapsedMs, startedAt: now, sessionStartedAt: sessionStart };
        break;
      }
      case 'pause':
        if (timer.mode !== 'running') return;
        next = { mode: 'paused', elapsedMs: timerElapsed(timer, now), startedAt: null, sessionStartedAt };
        break;
      case 'stop':
        if (timer.mode === 'stopped') return;
        next = { mode: 'stopped', elapsedMs: timerElapsed(timer, now), startedAt: null,
          sessionStartedAt, stoppedAt: now };
        break;
      case 'reset': {
        const startedAt = timer.mode === 'running' ? now : null;
        next = { mode: timer.mode, elapsedMs: 0, startedAt, sessionStartedAt: startedAt };
        break;
      }
      default:
        throw new Error('Unknown timer action');
    }
    await chrome.storage.local.set({ [TIMER_KEY]: next });
  }

  function queueWrite(operation, reply) {
    const write = writes.then(operation);
    writes = write.catch(() => {});
    write.then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    const fromRunway = sender.frameId === 0 && sender.tab && sender.origin === origin;
    if (message?.type === CONTROL_TIMER) {
      if (!fromRunway && sender.url !== chrome.runtime.getURL('earnings/popup.html')) return false;
      return queueWrite(() => controlTimer(message.action), reply);
    }
    if (message?.type !== RECORD_TASK || !fromRunway) return false;

    const { account, total, at, highlighted } = message;
    if (typeof account !== 'string' || !account || account.length > 256 ||
      !Number.isSafeInteger(total) || total <= 0 ||
      !Number.isSafeInteger(at) || at <= 0 || typeof highlighted !== 'boolean') return false;

    return queueWrite(() => record(message), reply);
  });
})();
