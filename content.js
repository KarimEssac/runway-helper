(() => {
  'use strict';
  // No extension APIs or storage: a refresh always starts a new speed session.
  const marker = 'data-runway-helper';
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, '');

  let sessionSpeed = 1;
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
    let loading = video.readyState === 0;
    let applying = false;
    let lastApplied = null;

    function display() {
      output.value = format(video.playbackRate);
      slider.value = String(video.playbackRate);
      slider.setAttribute('aria-valuetext', format(video.playbackRate));
    }
    function apply() {
      applying = true;
      lastApplied = sessionSpeed;
      video.defaultPlaybackRate = sessionSpeed;
      video.playbackRate = sessionSpeed;
      applying = false;
      display();
    }
    function choose(rate) {
      sessionSpeed = rate;
      for (const player of players.values()) player.apply();
    }
    function onInput() { choose(Number(slider.value)); }
    function onReset() { choose(1); }
    function onLoad() { loading = true; }
    function onReady() { loading = false; apply(); requestUpdate(); }
    function onRate() {
      display();
      // Media loading resets playbackRate. It must not replace the user's choice.
      if (!loading && !applying && video.readyState > 0 && video.playbackRate !== lastApplied) {
        const rate = video.playbackRate;
        if (rate >= 0.25 && rate <= 2) sessionSpeed = rate;
        lastApplied = rate;
      }
    }
    function position() {
      const r = video.getBoundingClientRect();
      const p = wrapper.getBoundingClientRect();
      host.hidden = !!document.fullscreenElement || r.width === 0 || r.height < 150 ||
        r.bottom <= 0 || r.top >= innerHeight || getComputedStyle(video).visibility === 'hidden';
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
    video.addEventListener('loadstart', onLoad);
    video.addEventListener('emptied', onLoad);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('ratechange', onRate);
    wrapper.append(host);
    const player = { video, wrapper, host, apply, position, destroy() {
      resize.disconnect();
      slider.removeEventListener('input', onInput);
      reset.removeEventListener('click', onReset);
      video.removeEventListener('loadstart', onLoad);
      video.removeEventListener('emptied', onLoad);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('ratechange', onRate);
      host.remove();
      if (addedPosition && wrapper.style.position === 'relative') wrapper.style.position = previousPosition;
    } };
    players.set(video, player);
    apply();
    position();
  }

  function reconcile() {
    for (const [video, player] of players) {
      if (!video.isConnected || video.parentElement !== player.wrapper || !player.host.isConnected) {
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
