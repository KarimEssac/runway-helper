(() => {
  'use strict';

  const { RECORD_TASK, usd, dayRange, currentDay, summary, watch } = globalThis.RunwayHelperEarnings;
  // Once enabled, Runway includes the chosen answer in the Confirm label.
  const confirmLabel = /^Confirm(?:\s+“[^”]+”)?\s*⏎?$/;
  const timeline = '[role="group"][aria-label^="clip timeline"]';
  let pending;
  let expiry;
  let timing;
  let timerMode;
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

  function updateTiming(button = findConfirm()) {
    if (timerMode === 'stopped') {
      timing = null;
      return;
    }
    const task = location.pathname === '/' && button?.closest('main');
    const claim = task && task.querySelector('h3')?.textContent.trim();
    if (!claim) {
      timing = null;
      return;
    }
    const video = task.querySelector('video');
    const source = video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || '';
    if (!timing || timing.claim !== claim || timing.source !== source) {
      timing = { claim, source, elapsed: 0, started: null, finished: false };
    }
    const now = performance.now();
    if (timerMode === 'running' && !timing.finished && !document.hidden && document.hasFocus()) {
      timing.started ??= now;
    } else if (timing.started !== null) {
      timing.elapsed += now - timing.started;
      timing.started = null;
    }
  }

  const observer = new MutationObserver(() => {
    if (pending) settle(runQueueTotal());
    updateTiming();
  });
  observer.observe(document, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['src'] });
  window.addEventListener('focus', () => updateTiming());
  window.addEventListener('blur', () => updateTiming());
  document.addEventListener('visibilitychange', () => updateTiming());
  updateTiming();

  function clearPending() {
    pending = null;
    clearTimeout(expiry);
  }

  async function record(task) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if ((await chrome.runtime.sendMessage({ type: RECORD_TASK, ...task }))?.ok) return;
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
    const { at, highlighted, activeMs, taskTiming } = pending;
    if (taskTiming) taskTiming.finished = true;
    clearPending();
    void record({ ...counter, at, highlighted, activeMs });
  }

  function capture(button) {
    if (location.pathname !== '/' || !button || button.disabled ||
      !confirmLabel.test(button.textContent.trim())) return;
    const task = button.closest('main');
    if (!task?.querySelector('h3')) return;
    const counter = runQueueTotal();
    if (!counter) return;
    settle(counter);
    updateTiming(button);
    const activeMs = timing && !timing.finished ? Math.round(timing.elapsed +
      (timing.started === null ? 0 : performance.now() - timing.started)) : 0;
    // Snapshot the outgoing claim's marker before Runway reuses its player for the next claim.
    const band = task.querySelector(`${timeline}[aria-label*="highlighted band"]`);
    pending = { ...counter, at: Date.now(), highlighted: Boolean(band), activeMs, taskTiming: timing };
    clearTimeout(expiry);
    expiry = setTimeout(clearPending, 60_000);
  }

  window.addEventListener('click', event => {
    if (event.isTrusted && event.target instanceof Element) capture(event.target.closest('button'));
  }, true);
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || event.key !== 'Enter' || event.repeat || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    capture(findConfirm());
  }, true);

  function mount() {
    if (location.pathname !== '/') return;
    const host = document.createElement('runway-helper-earnings');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host { position: fixed; right: 16px; bottom: 16px; z-index: 1000;
        display: flex; align-items: center; gap: 9px;
        border: 1px solid #394451; border-radius: 10px; padding: 8px 12px; background: #101820f5;
        color: #f4f7fc; box-shadow: 0 2px 8px #0005; font: 12px/1.35 system-ui, sans-serif;
        pointer-events: none; text-align: right; }
      :host([hidden]), .goal[hidden] { display: none; }
      .total { color: #b7c5d6; }
      output { display: block; color: #93d9b4; font-size: 18px; font-weight: 700;
        font-variant-numeric: tabular-nums; }
      .goal { display: grid; place-items: center; flex: none; width: 46px; height: 46px;
        color: #f4f7fc; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .goal > * { grid-area: 1 / 1; }
      .goal svg { width: 100%; height: 100%; transform: rotate(-90deg); fill: none;
        stroke: #56616f; stroke-width: 3; }
      .goal-fill { stroke: color-mix(in oklab, #56616f, #61e4a3 var(--progress, 0%));
        stroke-dasharray: 100; stroke-dashoffset: var(--remaining, 100); }
      .goal[data-exceeded] { color: #ffd47e; }
      .goal[data-exceeded] .goal-fill { stroke: #ffc75e; filter: drop-shadow(0 0 2px #ffac46aa); }
    </style>
    <div class="goal" role="img" hidden>
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="20"></circle>
        <circle class="goal-fill" cx="23" cy="23" r="20" pathLength="100"></circle>
      </svg>
      <span aria-hidden="true"></span>
    </div>
    <div class="total"><div>Today's earnings</div><output aria-label="Today's earnings">…</output><div class="hint"></div></div>`;
    document.body.append(host);
    const amount = shadow.querySelector('output');
    const hint = shadow.querySelector('.hint');
    const ring = shadow.querySelector('.goal');
    const ringLabel = ring.querySelector('span');
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
      hint.textContent = writeFailed ? 'A task could not be saved' : rate === null ? 'Set your rate in Runway Helper' : '';
      ring.hidden = rate === null || goal?.day !== workday || !(goal.dollars > 0);
      if (!ring.hidden) {
        // Compare the cents shown in the counter so reaching the displayed goal is reflected in the ring.
        const percent = Math.round(earned * 100) * 100 / Math.round(goal.dollars * 100);
        const fill = Math.min(100, percent);
        const visiblePercent = percentFormat.format(Math.floor(percent * 10) / 10);
        ringLabel.textContent = `${visiblePercent}%`;
        ring.setAttribute('aria-label', `${visiblePercent}% of today's ${usd.format(goal.dollars)} goal`);
        ring.style.setProperty('--progress', `${fill}%`);
        ring.style.setProperty('--remaining', String(100 - fill));
        ring.toggleAttribute('data-exceeded', percent > 100);
      }
      clearTimeout(rollover);
      rollover = setTimeout(render, Math.min(60_000, Math.max(1, range.end - now)));
    };
    watch((data, settings) => {
      if (timerMode !== settings.timerMode) {
        timerMode = settings.timerMode;
        updateTiming();
      }
      state = { data, ...settings };
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
