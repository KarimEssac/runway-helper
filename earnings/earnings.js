globalThis.RunwayHelperEarnings = (() => {
  'use strict';

  const SETTINGS_KEY = 'earningsSettings';
  const TIMER_KEY = 'earningsTimer';
  const LOG_PREFIX = 'earningsLog:';
  const RECORD_TASK = 'runway-helper:earnings:record';
  const CONTROL_TIMER = 'runway-helper:earnings:timer';
  const INITIAL_TIMER = { mode: 'stopped', elapsedMs: 0, startedAt: null };
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const pad = value => String(value).padStart(2, '0');

  function localDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dayRange(day, resetMinutes) {
    const [year, month, date] = day.split('-').map(Number);
    const hour = Math.floor(resetMinutes / 60);
    const minute = resetMinutes % 60;
    return {
      start: new Date(year, month - 1, date, hour, minute),
      end: new Date(year, month - 1, date + 1, hour, minute)
    };
  }

  function currentDay(now, resetMinutes) {
    const today = localDate(now);
    if (now >= dayRange(today, resetMinutes).start) return today;
    return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  }

  function* loggedTasks(data) {
    for (const [key, batch] of Object.entries(data)) {
      if (key.startsWith(LOG_PREFIX)) yield* Object.values(batch);
    }
  }

  function summary(data, { start, end }) {
    let highlighted = 0;
    let standard = 0;
    const from = +start;
    const until = +end;
    for (const [at, hasHighlight] of loggedTasks(data)) {
      if (at >= from && at < until) {
        if (hasHighlight) highlighted++;
        else standard++;
      }
    }
    return { highlighted, standard, hours: (standard + 2 * highlighted) / 360 };
  }

  function halfMonthRanges(data, resetMinutes) {
    const starts = new Set();
    for (const [at] of loggedTasks(data)) {
      const workday = currentDay(new Date(at), resetMinutes);
      const firstHalf = Number(workday.slice(-2)) <= 15;
      starts.add(`${workday.slice(0, -2)}${firstHalf ? '01' : '16'}`);
    }

    return [...starts].sort().reverse().map(id => {
      const [year, month, first] = id.split('-').map(Number);
      const last = first === 1 ? 15 : new Date(year, month, 0).getDate();
      const start = dayRange(id, resetMinutes).start;
      const end = dayRange(`${year}-${pad(month)}-${last}`, resetMinutes).end;
      const monthLabel = start.toLocaleString('en', { month: 'short' });
      return { id, start, end, label: `${monthLabel} ${first}–${last}, ${year}` };
    });
  }

  function timerElapsed(timer, now = Date.now()) {
    return timer.elapsedMs + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt));
  }

  function timerSessionStart(timer) {
    // An older timer has a known session start only if it has no earlier elapsed segments.
    return timer.sessionStartedAt ?? (timer.elapsedMs === 0 ? timer.startedAt : null);
  }

  function bindTimer(controls, onTick) {
    const display = controls.querySelector('[role="timer"]');
    const toggle = controls.querySelector('[data-action="toggle"]');
    const stop = controls.querySelector('[data-action="stop"]');
    const reset = controls.querySelector('[data-action="reset"]');
    const label = toggle.querySelector('.timer-label');
    const error = controls.querySelector('.timer-error');
    let timer;
    let saving = false;
    let tick;

    function renderTime() {
      clearTimeout(tick);
      const elapsed = timerElapsed(timer);
      const seconds = Math.floor(elapsed / 1000);
      display.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map(pad).join(':');
      onTick?.(elapsed);
      if (timer.mode === 'running') tick = setTimeout(renderTime, 1000 - elapsed % 1000);
    }

    function renderControls() {
      const running = timer.mode === 'running';
      const action = running ? 'Pause' : timer.mode === 'paused' ? 'Resume' : 'Start';
      if (label) label.textContent = action;
      toggle.title = `${action} timer`;
      toggle.setAttribute('aria-label', toggle.title);
      toggle.toggleAttribute('data-running', running);
      toggle.disabled = false;
      stop.disabled = timer.mode === 'stopped';
      reset.disabled = !running && timer.elapsedMs === 0;
    }

    async function control(action) {
      if (!timer || saving) return;
      saving = true;
      error.textContent = '';
      try {
        const reply = await chrome.runtime.sendMessage({ type: CONTROL_TIMER, action });
        if (!reply?.ok) throw new Error('Timer update failed');
      } catch {
        error.textContent = 'Could not update timer.';
      } finally {
        saving = false;
      }
    }

    toggle.addEventListener('click', () => void control(timer?.mode === 'running' ? 'pause' : 'start'));
    stop.addEventListener('click', () => void control('stop'));
    reset.addEventListener('click', () => void control('reset'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && timer?.mode === 'running') renderTime();
    });
    return nextTimer => {
      if (timer === nextTimer) return;
      timer = nextTimer;
      renderTime();
      renderControls();
    };
  }

  function watch(onChange, onError) {
    const data = {};
    const changedDuringLoad = new Set();
    let loaded = false;
    const isEarningsKey = key => key === SETTINGS_KEY || key === TIMER_KEY || key.startsWith(LOG_PREFIX);
    function update() {
      const { rate = null, resetMinutes = 0, goal = null } = data[SETTINGS_KEY] || {};
      // Goals saved by older versions also include the workday they were set.
      const dollars = typeof goal === 'number' ? goal : goal?.dollars;
      const timer = data[TIMER_KEY] ?? INITIAL_TIMER;
      onChange(data, { rate, resetMinutes, goal: dollars > 0 ? dollars : null, timer });
    }
    chrome.storage.local.onChanged.addListener(changes => {
      let relevant = false;
      for (const [key, change] of Object.entries(changes)) {
        if (!isEarningsKey(key)) continue;
        if (!loaded) changedDuringLoad.add(key);
        if (change.newValue === undefined) delete data[key];
        else data[key] = change.newValue;
        relevant = true;
      }
      if (loaded && relevant) update();
    });
    chrome.storage.local.get(null).then(initial => {
      for (const [key, value] of Object.entries(initial)) {
        if (isEarningsKey(key) && !changedDuringLoad.has(key)) {
          data[key] = value;
        }
      }
      loaded = true;
      changedDuringLoad.clear();
      update();
    }).catch(onError);
  }

  return {
    SETTINGS_KEY, TIMER_KEY, LOG_PREFIX, RECORD_TASK, CONTROL_TIMER, INITIAL_TIMER,
    usd, pad, localDate, dayRange, currentDay, summary, halfMonthRanges, timerElapsed, timerSessionStart, bindTimer, watch
  };
})();
