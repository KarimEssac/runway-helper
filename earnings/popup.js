(() => {
  'use strict';

  const { SETTINGS_KEY, TIMER_MODE_KEY, usd, pad, localDate, dayRange, currentDay, summary, watch } = globalThis.RunwayHelperEarnings;
  const field = id => document.getElementById(id);
  const period = field('period');
  const day = field('day');
  const from = field('from');
  const until = field('until');
  const amount = field('amount');
  const breakdown = field('breakdown');
  const effectiveRate = field('effective-rate');
  const activeTime = field('active-time');
  const timerToggle = field('timer-toggle');
  const timerStop = field('timer-stop');
  const timerStatus = field('timer-status');
  const rateInput = field('rate');
  const goalInput = field('goal');
  const hour = field('reset-hour');
  const minute = field('reset-minute');
  const meridiem = field('reset-meridiem');
  const status = field('status');
  let data;
  let settings;
  let editing = false;
  let editingGoal = false;
  let savingTimer = false;
  let rollover;

  function localDateTime(date) {
    return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatActiveTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    if (!seconds) return '<1s';
    return [hours && `${hours}h`, minutes && `${minutes}m`, `${seconds % 60}s`].filter(Boolean).join(' ');
  }

  function renderTimerControls() {
    const { timerMode } = settings;
    timerToggle.textContent = timerMode === 'running' ? 'Pause' : timerMode === 'paused' ? 'Resume' : 'Start';
    timerToggle.disabled = savingTimer;
    timerStop.disabled = savingTimer || timerMode === 'stopped';
    timerStatus.textContent = timerMode === 'running' ? 'Timing on' : timerMode === 'paused' ? 'Paused' : 'Stopped';
  }

  async function setTimerMode(timerMode) {
    savingTimer = true;
    renderTimerControls();
    try {
      await chrome.storage.local.set({ [TIMER_MODE_KEY]: timerMode });
    } catch {
      savingTimer = false;
      renderTimerControls();
      timerStatus.textContent = 'Could not update timer.';
      return;
    }
    savingTimer = false;
    renderTimerControls();
  }

  function render() {
    if (!settings) return;
    const { rate, resetMinutes, goal } = settings;
    const now = new Date();
    const workday = currentDay(now, resetMinutes);
    const today = dayRange(workday, resetMinutes);
    if (!editingGoal) goalInput.value = goal?.day === workday ? goal.dollars : '';
    clearTimeout(rollover);
    rollover = setTimeout(render, Math.min(60_000, Math.max(1, today.end - now)));

    let range = today;
    if (period.value === 'day') range = dayRange(day.value, resetMinutes);
    if (period.value === 'range') range = { start: new Date(from.value), end: new Date(until.value) };
    if (!(range.start < range.end)) {
      amount.textContent = '—';
      breakdown.textContent = 'Choose a valid date or a range with an end after its start.';
      effectiveRate.textContent = '—';
      activeTime.textContent = '';
      return;
    }

    const { hours, highlighted, standard, timedTasks, timedHours, activeMs } = summary(data, range);
    amount.textContent = rate === null ? '—' : usd.format(hours * rate);
    breakdown.textContent = `${standard} standard · ${highlighted} highlighted${rate === null ? ' · Set your hourly rate' : ''}`;
    effectiveRate.textContent = rate !== null && activeMs > 0 ? `${usd.format(timedHours * rate / (activeMs / 3_600_000))}/hr` : '—';
    activeTime.textContent = timedTasks
      ? `${formatActiveTime(activeMs)} active · ${timedTasks} timed ${timedTasks === 1 ? 'task' : 'tasks'}`
      : 'No timed tasks in this period';
  }

  function changePeriod() {
    field('day-fields').hidden = period.value !== 'day';
    field('range-fields').hidden = period.value !== 'range';
    if (settings) {
      const today = currentDay(new Date(), settings.resetMinutes);
      if (period.value === 'day' && !day.value) day.value = today;
      if (period.value === 'range') {
        const range = dayRange(today, settings.resetMinutes);
        if (!from.value) from.value = localDateTime(range.start);
        if (!until.value) until.value = localDateTime(range.end);
      }
    }
    render();
  }

  watch((newData, newSettings) => {
    const initial = !settings;
    const changed = initial || settings.rate !== newSettings.rate || settings.resetMinutes !== newSettings.resetMinutes;
    const timerChanged = initial || settings.timerMode !== newSettings.timerMode;
    data = newData;
    settings = newSettings;
    if (timerChanged) renderTimerControls();
    if (changed && !editing) {
      const resetHour = Math.floor(settings.resetMinutes / 60);
      rateInput.value = settings.rate ?? '';
      hour.value = resetHour % 12 || 12;
      minute.value = pad(settings.resetMinutes % 60);
      meridiem.value = resetHour >= 12 ? 'PM' : 'AM';
    }
    field('preferences').disabled = false;
    if (initial) changePeriod();
    else render();
  }, () => {
    amount.textContent = '—';
    breakdown.textContent = 'Earnings storage is unavailable.';
  });

  timerToggle.addEventListener('click', () => void setTimerMode(settings.timerMode === 'running' ? 'paused' : 'running'));
  timerStop.addEventListener('click', () => void setTimerMode('stopped'));
  period.addEventListener('change', changePeriod);
  for (const input of [day, from, until]) input.addEventListener('input', render);
  field('settings').addEventListener('input', () => {
    editing = true;
    status.textContent = '';
  });
  goalInput.addEventListener('input', () => { editingGoal = true; });
  minute.addEventListener('change', () => {
    if (minute.value && minute.validity.valid) minute.value = pad(minute.valueAsNumber);
  });
  field('settings').addEventListener('submit', async event => {
    event.preventDefault();
    const resetHour = hour.valueAsNumber % 12 + (meridiem.value === 'PM' ? 12 : 0);
    const rate = rateInput.value === '' ? null : rateInput.valueAsNumber;
    const resetMinutes = resetHour * 60 + minute.valueAsNumber;
    let goal = settings.goal;
    if (editingGoal) {
      goal = goalInput.value === '' ? null : {
        day: currentDay(new Date(), resetMinutes),
        dollars: goalInput.valueAsNumber
      };
    }
    const save = field('save');
    save.disabled = true;
    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: { rate, resetMinutes, goal } });
      editing = false;
      editingGoal = false;
      status.textContent = 'Settings saved.';
    } catch {
      status.textContent = 'Settings could not be saved. Try again.';
    } finally {
      save.disabled = false;
    }
  });
})();
