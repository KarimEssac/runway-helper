(() => {
  'use strict';

  const {
    SETTINGS_KEY, usd, pad, localDate, dayRange, currentDay, summary, halfMonthRanges,
    timerElapsed, timerSessionStart, bindTimer, watch
  } = globalThis.RunwayHelperEarnings;
  const field = id => document.getElementById(id);
  const period = field('period');
  const day = field('day');
  const preset = field('range-preset');
  const from = field('from');
  const until = field('until');
  const amount = field('amount');
  const breakdown = field('breakdown');
  const effectiveRate = field('effective-rate');
  const sessionDetail = field('session-earnings');
  const renderTimer = bindTimer(field('timer'), renderEffectiveRate);
  const rateInput = field('rate');
  const goalInput = field('goal');
  const hour = field('reset-hour');
  const minute = field('reset-minute');
  const meridiem = field('reset-meridiem');
  const status = field('status');
  let data;
  let settings;
  let ranges;
  let sessionEarnings = null;
  let editing = false;
  let editingGoal = false;
  let rollover;

  function localDateTime(date) {
    return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function applyPreset() {
    const range = ranges.get(preset.value);
    if (!range) return;
    from.value = localDateTime(range.start);
    until.value = localDateTime(range.end);
  }

  function refreshPresets() {
    const selected = preset.value;
    const options = halfMonthRanges(data, settings.resetMinutes);
    ranges = new Map(options.map(range => [range.id, range]));
    field('preset-field').hidden = options.length === 0;
    preset.replaceChildren(new Option('Enter dates manually', ''),
      ...options.map(range => new Option(range.label, range.id)));
    if (ranges.has(selected)) {
      preset.value = selected;
      applyPreset();
    }
  }

  function renderEffectiveRate(elapsed) {
    const value = sessionEarnings !== null && elapsed >= 1000
      ? `${usd.format(sessionEarnings / (elapsed / 3_600_000))}/hr`
      : '—';
    if (effectiveRate.textContent !== value) effectiveRate.textContent = value;
  }

  function renderSession() {
    const { timer, rate } = settings;
    const start = timerSessionStart(timer);
    const elapsed = timerElapsed(timer);
    sessionEarnings = null;
    if (start === null) {
      sessionDetail.textContent = elapsed > 0
        ? 'Reset the stopwatch to measure a new session.'
        : 'Start the stopwatch to measure a session.';
    } else if (rate === null) {
      sessionDetail.textContent = 'Set your hourly rate to see session earnings.';
    } else {
      const { hours } = summary(data, { start, end: timer.stoppedAt ?? Infinity });
      sessionEarnings = hours * rate;
      sessionDetail.textContent = `${usd.format(sessionEarnings)} earned this stopwatch session`;
    }
    renderEffectiveRate(elapsed);
    renderTimer(timer);
  }

  function render() {
    if (!settings) return;
    const { rate, resetMinutes, goal } = settings;
    const now = new Date();
    const workday = currentDay(now, resetMinutes);
    const today = dayRange(workday, resetMinutes);
    if (!editingGoal) goalInput.value = goal ?? '';
    clearTimeout(rollover);
    rollover = setTimeout(render, Math.min(60_000, Math.max(1, today.end - now)));

    let range = today;
    if (period.value === 'day') range = dayRange(day.value, resetMinutes);
    if (period.value === 'range') range = { start: new Date(from.value), end: new Date(until.value) };
    if (!(range.start < range.end)) {
      amount.textContent = '—';
      breakdown.textContent = 'Choose a valid date or a range with an end after its start.';
      return;
    }

    const { hours, highlighted, standard } = summary(data, range);
    amount.textContent = rate === null ? '—' : usd.format(hours * rate);
    breakdown.textContent = `${standard} standard · ${highlighted} highlighted${rate === null ? ' · Set your hourly rate' : ''}`;
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
    data = newData;
    settings = newSettings;
    refreshPresets();
    renderSession();
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

  period.addEventListener('change', changePeriod);
  day.addEventListener('input', render);
  preset.addEventListener('change', () => {
    applyPreset();
    render();
  });
  for (const input of [from, until]) {
    input.addEventListener('input', () => {
      preset.value = '';
      render();
    });
  }
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
    const goal = goalInput.value === '' ? null : goalInput.valueAsNumber;
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
