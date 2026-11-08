(() => {
  'use strict';

  const { RECORD_TASK, usd, dayRange, currentDay, summary, bindTimer, watch } = globalThis.RunwayHelperEarnings;
  // Once enabled, Runway includes the chosen answer in the Confirm label.
  const confirmLabel = /^Confirm(?:\s+“[^”]+”)?\s*⏎?$/;
  const timeline = '[role="group"][aria-label^="clip timeline"]';
  let pending;
  let expiry;
  let writeFailed = false;
  let render = () => {};

  function runQueueTotal() {
    for (const label of document.querySelectorAll('header span')) {
      const match = label.textContent.trim().match(/^(.+?)\s*·\s*today\s+[\d,]+(?:\s*\(limit\s+[\d,]+\))?\s*·\s*total\s+([\d,]+)$/i);
      if (match) return { account: match[1], total: Number(match[2].replaceAll(',', '')) };
    }
    return null;
  }

  function findConfirm() {
    return [...document.querySelectorAll('main button')].find(button => confirmLabel.test(button.textContent.trim()));
  }

  const observer = new MutationObserver(() => {
    if (pending) settle(runQueueTotal());
  });
  observer.observe(document, { childList: true, characterData: true, subtree: true });

  function clearPending() {
    pending = null;
    clearTimeout(expiry);
  }

  async function record(task) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!chrome.runtime?.id) break;
      try {
        if ((await chrome.runtime.sendMessage({ type: RECORD_TASK, ...task }))?.ok) {
          if (writeFailed) {
            writeFailed = false;
            render();
          }
          return;
        }
      } catch {
        // The worker may have restarted before acknowledging the write.
      }
    }
    writeFailed = true;
    render();
  }

  function settle(counter) {
    if (!pending || !counter) return;
    if (counter.account !== pending.account || counter.total < pending.total) {
      clearPending();
      return;
    }
    if (counter.total === pending.total) return;
    const { at, highlighted } = pending;
    clearPending();
    void record({ ...counter, at, highlighted });
  }

  function capture(button) {
    if (location.pathname !== '/' || !button || button.disabled ||
      !confirmLabel.test(button.textContent.trim())) return;
    const task = button.closest('main');
    if (!task?.querySelector('h3')) return;
    const counter = runQueueTotal();
    if (!counter) return;
    settle(counter);
    // Snapshot the outgoing claim's marker before Runway reuses its player for the next claim.
    const band = task.querySelector(`${timeline}[aria-label*="highlighted band"]`);
    pending = { ...counter, at: Date.now(), highlighted: Boolean(band) };
    clearTimeout(expiry);
    expiry = setTimeout(clearPending, 60_000);
  }

  window.addEventListener('click', event => {
    if (event.isTrusted && event.target instanceof Element) capture(event.target.closest('button'));
  }, true);
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || event.key !== 'Enter' || event.repeat || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target?.localName === 'runway-helper-earnings') return;
    capture(findConfirm());
  }, true);

  function mount() {
    if (location.pathname !== '/') return;
    const host = document.createElement('runway-helper-earnings');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host { position: fixed; right: 16px; bottom: 16px; z-index: 1000;
        display: grid; gap: 6px;
        border: 1px solid #394451; border-radius: 10px; padding: 8px 12px; background: #101820f5;
        color: #f4f7fc; box-shadow: 0 2px 8px #0005; font: 12px/1.35 system-ui, sans-serif;
        pointer-events: none; text-align: right; }
      :host([hidden]), .goal[hidden] { display: none; }
      .summary { display: flex; align-items: center; justify-content: flex-end; gap: 10px; font-size: 13px; }
      .total { color: #b7c5d6; }
      output { display: block; color: #93d9b4; font-size: 20px; font-weight: 700;
        font-variant-numeric: tabular-nums; }
      .goal { display: grid; place-items: center; flex: none; width: 52px; height: 52px;
        color: #f4f7fc; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .goal > * { grid-area: 1 / 1; }
      .goal svg { width: 100%; height: 100%; transform: rotate(-90deg); fill: none;
        stroke: #56616f; stroke-width: 3; }
      .goal-fill { stroke: color-mix(in oklab, #56616f, #61e4a3 var(--progress, 0%));
        stroke-dasharray: 100; stroke-dashoffset: var(--remaining, 100); }
      .goal[data-exceeded] { color: #ffd47e; }
      .goal[data-exceeded] .goal-fill { stroke: #ffc75e; filter: drop-shadow(0 0 2px #ffac46aa); }
      .timer { border-top: 1px solid #394451; padding-top: 6px; }
      .timer-controls { display: flex; align-items: center; gap: 4px; }
      [role="timer"] { margin-right: auto; padding-right: 5px; font-weight: 700; font-variant-numeric: tabular-nums; }
      button { display: grid; place-items: center; width: 25px; height: 25px; padding: 0;
        border: 1px solid #506275; border-radius: 5px; background: #17232f; color: inherit; pointer-events: auto; }
      button:enabled { cursor: pointer; }
      button:hover:enabled { background: #2c5580; }
      button:focus-visible { outline: 2px solid #83c1ff; outline-offset: 1px; }
      button:disabled { opacity: .55; }
      button svg { width: 14px; height: 14px; }
      button[data-running] .play, button:not([data-running]) .pause { display: none; }
      .timer-error:not(:empty) { margin-top: 4px; color: #ffd47e; }
    </style>
    <div class="summary">
      <div class="goal" role="img" hidden>
        <svg viewBox="0 0 46 46" aria-hidden="true">
          <circle cx="23" cy="23" r="20"></circle>
          <circle class="goal-fill" cx="23" cy="23" r="20" pathLength="100"></circle>
        </svg>
        <span aria-hidden="true"></span>
      </div>
      <div class="total"><div>Today's earnings</div><output aria-label="Today's earnings">…</output><div class="hint" role="status"></div></div>
    </div>
    <div class="timer" role="group" aria-label="Stopwatch">
      <div class="timer-controls">
        <span role="timer" aria-label="Elapsed time">00:00:00</span>
        <button data-action="toggle" type="button" aria-label="Start timer" title="Start timer" disabled>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path class="play" d="M8 5v14l11-7z"></path>
            <path class="pause" d="M6 5h4v14H6zm8 0h4v14h-4z"></path>
          </svg>
        </button>
        <button data-action="stop" type="button" aria-label="Stop timer" title="Stop timer" disabled>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="1"></rect>
          </svg>
        </button>
        <button data-action="reset" type="button" aria-label="Reset timer" title="Reset timer" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11a9 9 0 1 1 2.6 7.4M3 5v6h6"></path>
          </svg>
        </button>
      </div>
      <div class="timer-error" role="status"></div>
    </div>`;
    document.body.append(host);
    for (const type of ['click', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
      host.addEventListener(type, event => event.stopPropagation());
    }
    const amount = shadow.querySelector('output');
    const hint = shadow.querySelector('.hint');
    const ring = shadow.querySelector('.goal');
    const ringLabel = ring.querySelector('span');
    const renderTimer = bindTimer(shadow.querySelector('.timer'));
    const percentFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    let state;
    let rollover;

    render = () => {
      host.hidden = location.pathname !== '/';
      if (!state) return;
      const { data, rate, resetMinutes, goal } = state;
      const now = new Date();
      const workday = currentDay(now, resetMinutes);
      const range = dayRange(workday, resetMinutes);
      const { hours } = summary(data, range);
      const earned = hours * rate;
      amount.textContent = rate === null ? '—' : usd.format(earned);
      let status = rate === null ? 'Set your rate in Runway Helper' : '';
      if (writeFailed) status = 'Runway Helper could not log a completed task';
      if (!chrome.runtime?.id) status = 'Refresh Runway to reconnect the extension';
      if (hint.textContent !== status) hint.textContent = status;
      ring.hidden = rate === null || goal === null;
      if (!ring.hidden) {
        // Compare the cents shown in the counter so reaching the displayed goal is reflected in the ring.
        const percent = Math.round(earned * 100) * 100 / Math.round(goal * 100);
        const fill = Math.min(100, percent);
        const visiblePercent = percentFormat.format(Math.floor(percent * 10) / 10);
        ringLabel.textContent = `${visiblePercent}%`;
        ring.setAttribute('aria-label', `${visiblePercent}% of today's ${usd.format(goal)} goal`);
        ring.style.setProperty('--progress', `${fill}%`);
        ring.style.setProperty('--remaining', String(100 - fill));
        ring.toggleAttribute('data-exceeded', percent > 100);
      }
      clearTimeout(rollover);
      rollover = setTimeout(render, Math.min(60_000, Math.max(1, range.end - now)));
    };
    watch((data, settings) => {
      state = { data, ...settings };
      renderTimer(settings.timer);
      render();
    }, () => {
      amount.textContent = '—';
      hint.textContent = 'Earnings unavailable';
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) render();
    });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
