(() => {
  'use strict';
  // Speed belongs to each clip; guides remain enabled until page refresh.
  const marker = 'data-runway-helper';
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, '');

  const guidesEnabled = { vertical: false, horizontal: false };
  let scheduled = false;
  const players = new Map();
  const format = rate => `${Number(rate.toFixed(2))}×`;

  const styles = `
    :host { position: absolute; display: block; width: 44px; z-index: 10;
      color-scheme: dark; pointer-events: auto; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .rail { width: 44px; height: 100%; display: flex; flex-direction: column;
      align-items: center; gap: 8px; padding: 9px 5px; border: 1px solid #394451;
      border-radius: 12px; background: #101820ed; color: #f4f7fc;
      font: 12px/1.2 system-ui, sans-serif; box-shadow: 0 2px 8px #0005; }
    output { font-weight: 700; font-variant-numeric: tabular-nums; }
    .slider { flex: 1; min-height: 20px; display: flex; justify-content: center; }
    input { writing-mode: vertical-lr; direction: rtl; width: 26px; height: 100%;
      margin: 0; accent-color: #419aff; cursor: pointer; }
    button { border: 1px solid #435467; border-radius: 5px; background: #1d3044;
      color: #fff; padding: 4px; font: inherit; cursor: pointer; }
    button:hover { background: #2c4d70; }
    :is(input,button):focus-visible { outline: 2px solid #83c1ff; outline-offset: 2px; }
    .limit { color: #b7c5d6; font-size: 10px; }
  `;

  const guideStyles = `
    :host { position: absolute; display: block; z-index: 9; pointer-events: none;
      color-scheme: dark; }
    :host([hidden]), .vertical[hidden], .horizontal[hidden] { display: none !important; }
    .lines { position: absolute; inset: 0; pointer-events: none; }
    .vertical, .horizontal { position: absolute; background: #ffffffe6;
      box-shadow: 0 0 1px 1px #0008; }
    .vertical { left: 50%; top: 0; width: 1px; height: 100%; transform: translateX(-50%); }
    .horizontal { top: 50%; left: 0; height: 1px; width: 100%; transform: translateY(-50%); }
    .toggles { position: absolute; top: -34px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 4px; }
    button {
      display: grid; place-items: center; box-sizing: border-box;
      width: 28px; height: 26px; padding: 0; border: 1px solid #546476;
      border-radius: 6px; background: #101820ed; color: #f4f7fc;
      font: 22px/1 system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
    button:hover { background: #2c4d70; }
    button[aria-pressed="true"] { background: #1264b8; border-color: #83c1ff; }
    button:focus-visible { outline: 2px solid #83c1ff; outline-offset: 2px; }
  `;

  function requestUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reconcile();
      for (const player of players.values()) player.position();
    });
  }

  function attach(video) {
    const wrapper = video.parentElement;
    if (!wrapper) return;
    const previousPosition = wrapper.style.position;
    const addedPosition = getComputedStyle(wrapper).position === 'static';
    if (addedPosition) wrapper.style.position = 'relative';
    // Reserve a row above the player without shifting its existing overlays.
    const previousMarginTop = wrapper.style.marginTop;
    const guideMarginTop = `${(parseFloat(getComputedStyle(wrapper).marginTop) || 0) + 34}px`;
    wrapper.style.marginTop = guideMarginTop;
    const host = document.createElement('runway-helper-speed');
    host.setAttribute('aria-label', 'Runway Helper playback speed');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${styles}</style>
      <div class="rail"><output aria-live="polite">1×</output>
      <span class="limit" aria-hidden="true">2×</span>
      <div class="slider"><input type="range" min="0.25" max="2" step="0.25" value="1"
        aria-label="Playback speed" aria-orientation="vertical" aria-valuetext="1×"></div>
      <span class="limit" aria-hidden="true">0.25×</span>
      <button type="button" title="Reset playback speed to 1×" aria-label="Reset playback speed to 1×">1×</button></div>`;
    const slider = shadow.querySelector('input');
    const output = shadow.querySelector('output');
    const reset = shadow.querySelector('button');
    const guidesHost = document.createElement('runway-helper-guides');
    const guidesShadow = guidesHost.attachShadow({ mode: 'open' });
    guidesShadow.innerHTML = `<style>${guideStyles}</style>
      <div class="lines" aria-hidden="true"><div class="vertical" hidden></div><div class="horizontal" hidden></div></div>
      <div class="toggles" role="group" aria-label="Center guides">
        <button type="button" data-axis="vertical" aria-label="Vertical center line" aria-pressed="false" title="Show vertical center line"><svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v12"/></svg></button>
        <button type="button" data-axis="horizontal" aria-label="Horizontal center line" aria-pressed="false" title="Show horizontal center line"><svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 8h12"/></svg></button>
      </div>`;
    const guideLines = {
      vertical: guidesShadow.querySelector('.vertical'),
      horizontal: guidesShadow.querySelector('.horizontal')
    };
    const guideToggles = Array.from(guidesShadow.querySelectorAll('button'));

    function renderGuides() {
      for (const toggle of guideToggles) {
        const axis = toggle.dataset.axis;
        guideLines[axis].hidden = !guidesEnabled[axis];
        toggle.setAttribute('aria-pressed', String(guidesEnabled[axis]));
        toggle.title = `${guidesEnabled[axis] ? 'Hide' : 'Show'} ${axis} center line`;
      }
    }
    function onToggleGuides(event) {
      event.stopPropagation();
      const axis = event.currentTarget.dataset.axis;
      guidesEnabled[axis] = !guidesEnabled[axis];
      for (const player of players.values()) player.renderGuides();
    }
    // Keep the page's annotation shortcuts from handling button activation keys.
    function onGuideKey(event) { event.stopPropagation(); }
    let loading = video.readyState === 0;
    let selectedSpeed = 1;
    let applying = false;
    let lastApplied = null;

    function display() {
      output.value = format(video.playbackRate);
      slider.value = String(video.playbackRate);
      slider.setAttribute('aria-valuetext', format(video.playbackRate));
    }
    function apply() {
      applying = true;
      lastApplied = selectedSpeed;
      video.defaultPlaybackRate = selectedSpeed;
      video.playbackRate = selectedSpeed;
      applying = false;
      display();
    }
    function choose(rate) {
      selectedSpeed = rate;
      apply();
    }
    function onInput() { choose(Number(slider.value)); }
    function onReset() { choose(1); }
    function onLoad() {
      loading = true;
      selectedSpeed = 1;
      apply();
    }
    function onReady() { loading = false; apply(); requestUpdate(); }
    function onRate() {
      display();
      // Ignore rate events during loading; each new clip must start at 1×.
      if (!loading && !applying && video.readyState > 0 && video.playbackRate !== lastApplied) {
        const rate = video.playbackRate;
        if (rate >= 0.25 && rate <= 2) selectedSpeed = rate;
        lastApplied = rate;
      }
    }
    function position() {
      const r = video.getBoundingClientRect();
      const p = wrapper.getBoundingClientRect();
      const invisible = !!document.fullscreenElement || r.width === 0 || r.height === 0 ||
        r.bottom <= 0 || r.top >= innerHeight || getComputedStyle(video).visibility === 'hidden';
      host.hidden = invisible || r.height < 150;
      guidesHost.hidden = invisible;
      guidesHost.style.left = `${r.left - p.left - wrapper.clientLeft}px`;
      guidesHost.style.top = `${r.top - p.top - wrapper.clientTop}px`;
      guidesHost.style.width = `${r.width}px`;
      guidesHost.style.height = `${r.height}px`;
      const height = Math.min(280, r.height - 64);
      // Fall back to the inside edge on small windows; reserve native controls below.
      const outside = r.right + 8 + 44 <= document.documentElement.clientWidth - 8;
      host.style.left = `${r.right - p.left - wrapper.clientLeft + (outside ? 8 : -52)}px`;
      host.style.top = `${r.top - p.top - wrapper.clientTop + (r.height - 48 - height) / 2}px`;
      host.style.height = `${height}px`;
    }
    const resize = new ResizeObserver(requestUpdate);
    resize.observe(video);
    resize.observe(wrapper);
    slider.addEventListener('input', onInput);
    reset.addEventListener('click', onReset);
    for (const toggle of guideToggles) {
      toggle.addEventListener('click', onToggleGuides);
      toggle.addEventListener('keydown', onGuideKey);
      toggle.addEventListener('keyup', onGuideKey);
    }
    video.addEventListener('loadstart', onLoad);
    video.addEventListener('emptied', onLoad);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('ratechange', onRate);
    wrapper.append(host, guidesHost);
    const player = { video, wrapper, host, guidesHost, apply, position, renderGuides, destroy() {
      resize.disconnect();
      slider.removeEventListener('input', onInput);
      reset.removeEventListener('click', onReset);
      for (const toggle of guideToggles) {
        toggle.removeEventListener('click', onToggleGuides);
        toggle.removeEventListener('keydown', onGuideKey);
        toggle.removeEventListener('keyup', onGuideKey);
      }
      video.removeEventListener('loadstart', onLoad);
      video.removeEventListener('emptied', onLoad);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('ratechange', onRate);
      host.remove();
      guidesHost.remove();
      if (addedPosition && wrapper.style.position === 'relative') wrapper.style.position = previousPosition;
      if (wrapper.style.marginTop === guideMarginTop) wrapper.style.marginTop = previousMarginTop;
    } };
    players.set(video, player);
    apply();
    renderGuides();
    position();
  }

  function reconcile() {
    for (const [video, player] of players) {
      if (!video.isConnected || video.parentElement !== player.wrapper || !player.host.isConnected || !player.guidesHost.isConnected) {
        player.destroy();
        players.delete(video);
      }
    }
    for (const video of document.querySelectorAll('video')) {
      if (!players.has(video)) attach(video);
    }
  }
  const observer = new MutationObserver(requestUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', requestUpdate);
  document.addEventListener('scroll', requestUpdate, true);
  document.addEventListener('fullscreenchange', requestUpdate);
  reconcile();
})();
