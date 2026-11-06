globalThis.RunwayHelperEarnings = (() => {
  'use strict';

  const SETTINGS_KEY = 'earningsSettings';
  const TIMER_MODE_KEY = 'earningsTimerMode';
  const LOG_PREFIX = 'earningsLog:';
  const RECORD_TASK = 'runway-helper:earnings:record';
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

  function summary(data, { start, end }) {
    let highlighted = 0;
    let standard = 0;
    let timedTasks = 0;
    let timedCredits = 0;
    let activeMs = 0;
    const from = +start;
    const until = +end;
    for (const [key, batch] of Object.entries(data)) {
      if (!key.startsWith(LOG_PREFIX)) continue;
      for (const [at, hasHighlight, duration] of Object.values(batch)) {
        if (at >= from && at < until) {
          if (hasHighlight) highlighted++;
          else standard++;
          if (duration > 0) {
            activeMs += duration;
            timedTasks++;
            timedCredits += hasHighlight ? 2 : 1;
          }
        }
      }
    }
    return { highlighted, standard, hours: (standard + 2 * highlighted) / 360,
      timedTasks, timedHours: timedCredits / 360, activeMs };
  }

  function watch(onChange, onError) {
    const data = {};
    const changedDuringLoad = new Set();
    let loaded = false;
    const isEarningsKey = key => key === SETTINGS_KEY || key === TIMER_MODE_KEY || key.startsWith(LOG_PREFIX);
    function update() {
      const { rate = null, resetMinutes = 0, goal = null } = data[SETTINGS_KEY] || {};
      const timerMode = data[TIMER_MODE_KEY] ?? 'running';
      onChange(data, { rate, resetMinutes, goal, timerMode });
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

  return { SETTINGS_KEY, TIMER_MODE_KEY, LOG_PREFIX, RECORD_TASK, usd, pad, localDate, dayRange, currentDay, summary, watch };
})();
