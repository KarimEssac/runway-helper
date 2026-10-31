// Runs in the extension's isolated world, before content.js.
globalThis.RunwayHelperPlayerControls = (() => {
  let activePlayer = null;
  const icon = path => `<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  const playIcon = icon('M6 3l10 7-10 7z');
  const pauseIcon = icon('M7 4v12M13 4v12');
  const soundIcon = icon('M3 8h3l4-4v12l-4-4H3zM14 6q5 4 0 8');
  const muteIcon = icon('M3 8h3l4-4v12l-4-4H3zM14 7l4 6M18 7l-4 6');
  const expandIcon = icon('M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4');
  const collapseIcon = icon('M7 3v4H3M17 7h-4V3M13 17v-4h4M3 13h4v4');
  const time = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    return `${hours ? `${hours}:` : ''}${hours ? String(Math.floor(whole / 60) % 60).padStart(2, '0') : Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };
  const css = `
    :host { position: absolute; display: block; height: 72px; z-index: 11;
      color-scheme: dark; container-type: inline-size; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .hud { height: 72px; padding: 5px 8px 8px; background: #101820;
      border: 1px solid #394451; border-radius: 0 0 8px 8px;
      color: #f4f7fc; font: 12px/1.2 system-ui, sans-serif; }
    :host([expanded]) .hud { border-radius: 0; }
    .seek { display: block; width: 100%; height: 20px; margin: 0 0 5px; }
    .row { display: flex; align-items: center; gap: 6px; height: 28px; }
    button { width: 28px; height: 28px; padding: 0; flex: none; display: grid;
      place-items: center; border: 1px solid #435467; border-radius: 5px;
      background: #1d3044; color: #fff; cursor: pointer; }
    button:hover { background: #2c4d70; }
    input { accent-color: #419aff; cursor: pointer; }
    :is(input,button):focus-visible { outline: 2px solid #83c1ff; outline-offset: 2px; }
    output { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 11px; }
    .spacer { flex: 1; }
    .volume { width: 70px; min-width: 0; margin: 0; }
    @container (max-width: 360px) { .volume { display: none; } }
    .notice { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  `;

  function overrideStyles(element, values) {
    const saved = [];
    for (const [name, value] of Object.entries(values)) {
      saved.push([name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
      element.style.setProperty(name, value, 'important');
    }
    return () => {
      for (const [name, value, priority] of saved) {
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      }
    };
  }

  class SmoothTaskTimeline {
    constructor(video) {
      this.video = video;
      this.root = video.closest('main') || document.body;
      this.binding = null;
      this.observer = new MutationObserver(() => this.refresh());
      this.observer.observe(this.root, { childList: true, subtree: true });
      this.refresh();
    }

    refresh() {
      const current = this.binding;
      if (this.video.isConnected && current && current.timeline.isConnected &&
        current.host.parentElement === current.timeline &&
        current.fill.parentElement === current.timeline && current.head.parentElement === current.timeline) {
        this.draw();
        return;
      }
      this.clear();
      if (!this.video.isConnected) return;
      const timeline = this.root.querySelector('[role="group"][aria-label^="clip timeline"]');
      if (!timeline) return;
      // Match the inspected task's progress elements, leaving its highlighted band intact.
      const children = Array.from(timeline.children);
      const fill = children.find(node => node.style.position === 'absolute' &&
        node.style.top === '12px' && node.style.height === '6px' && node.style.opacity === '0.6');
      const head = children.find(node => node.style.position === 'absolute' &&
        node.style.pointerEvents === 'none' && node.style.width === '3px' && node.style.top === '7px');
      if (!fill || !head) return;
      const host = document.createElement('runway-helper-task-timeline');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host { pointer-events: none !important; } div { pointer-events: none; }';
      const progress = document.createElement('div');
      const thumb = document.createElement('div');
      progress.style.cssText = fill.style.cssText;
      thumb.style.cssText = head.style.cssText;
      const hidden = [fill, head].map(node => ({
        node, value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility')
      }));
      this.binding = { timeline, fill, head, host, progress, thumb, hidden };
      for (const node of [fill, head]) node.style.setProperty('visibility', 'hidden', 'important');
      shadow.append(style, progress, thumb);
      timeline.append(host);
      this.draw();
    }

    draw() {
      if (!this.binding) return;
      const duration = this.video.duration;
      const fraction = Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(1, this.video.currentTime / duration)) : 0;
      this.binding.progress.style.width = `${fraction * 100}%`;
      this.binding.thumb.style.left = `${fraction * 100}%`;
    }

    clear() {
      if (!this.binding) return;
      const previous = this.binding;
      this.binding = null;
      for (const { node, value, priority } of previous.hidden) {
        if (node.style.getPropertyValue('visibility') !== 'hidden' || node.style.getPropertyPriority('visibility') !== 'important') continue;
        if (value) node.style.setProperty('visibility', value, priority);
        else node.style.removeProperty('visibility');
      }
      previous.host.remove();
    }

    destroy() {
      this.observer.disconnect();
      this.clear();
    }
  }

  return class PlayerControls {
    constructor(video, wrapper, onLayout) {
      this.video = video;
      this.wrapper = wrapper;
      this.onLayout = onLayout;
      this.expanded = false;
      this.hudHidden = false;
      this.originalControls = video.controls;
      this.restoreExpanded = [];
      this.progressFrame = null;
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      this.host = document.createElement('runway-helper-controls');
      const shadow = this.host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>${css}</style><div class="hud" role="group" aria-label="Video controls">
        <input class="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Video position">
        <div class="row">
          <button class="play" type="button" aria-label="Play" title="Play">${playIcon}</button>
          <output aria-label="Playback time">0:00 / 0:00</output><span class="spacer"></span>
          <button class="mute" type="button" aria-label="Unmute" title="Unmute">${muteIcon}</button>
          <input class="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
          <button class="expand" type="button" aria-label="Expand video" title="Expand video">${expandIcon}</button>
        </div><span class="notice" role="status"></span></div>`;
      this.play = shadow.querySelector('.play');
      this.seek = shadow.querySelector('.seek');
      this.clock = shadow.querySelector('output');
      this.mute = shadow.querySelector('.mute');
      this.volume = shadow.querySelector('.volume');
      this.expandButton = shadow.querySelector('.expand');
      this.notice = shadow.querySelector('.notice');
      this.taskTimeline = new SmoothTaskTimeline(video);
      const sync = () => this.sync();
      for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'ended', 'volumechange', 'seeking', 'seeked']) {
        video.addEventListener(event, sync, options);
      }
      const animateProgress = () => {
        this.stopProgressAnimation();
        this.syncProgress();
        if (!video.paused && !video.ended && !document.hidden) this.startProgressAnimation();
      };
      video.addEventListener('play', animateProgress, options);
      video.addEventListener('playing', animateProgress, options);
      video.addEventListener('pause', animateProgress, options);
      video.addEventListener('ended', animateProgress, options);
      document.addEventListener('visibilitychange', animateProgress, options);
      video.addEventListener('loadstart', () => {
        this.stopProgressAnimation();
        this.hudHidden = false;
        this.updatePresentation();
        this.sync();
      }, options);
      video.addEventListener('emptied', () => {
        this.stopProgressAnimation();
        this.syncProgress();
      }, options);
      this.play.addEventListener('click', () => {
        this.togglePlayback();
      }, options);
      const isVideoSurface = event => {
        if (event.button !== 0) return false;
        if (event.target === video) return true;
        if (!this.expanded) return false;
        // Include the expanded background, but leave controls independently clickable.
        return !event.composedPath().some(node => node instanceof Element && (
          node === this.host || node.matches('button, input, select, textarea, a, [contenteditable]:not([contenteditable="false"]), runway-helper-speed, runway-helper-guides')
        ));
      };
      wrapper.addEventListener('click', event => {
        if (!isVideoSurface(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.togglePlayback();
      }, { capture: true, signal: this.events.signal });
      wrapper.addEventListener('dblclick', event => {
        if (!isVideoSurface(event)) return;
        // Keep double clicks from triggering the page's expansion handlers.
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, signal: this.events.signal });
      this.seek.addEventListener('input', () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          try { video.currentTime = Math.min(video.duration, Number(this.seek.value)); }
          catch { this.notice.textContent = 'This position is not available yet.'; }
          this.sync();
        }
      }, options);
      this.mute.addEventListener('click', () => { video.muted = !video.muted; }, options);
      this.volume.addEventListener('input', () => {
        video.volume = Number(this.volume.value);
        video.muted = video.volume === 0;
      }, options);
      this.expandButton.addEventListener('click', () => this.setExpanded(!this.expanded), options);
      // Player controls must not trigger annotation hotkeys or click-to-replay handlers.
      for (const event of ['click', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
        this.host.addEventListener(event, e => e.stopPropagation(), options);
      }
      const shortcut = event => {
        if (!this.expanded) return;
        const target = event.composedPath()[0];
        if (target instanceof Element && (target.closest('textarea, select, [contenteditable]:not([contenteditable="false"])') ||
          target.matches('input:not([type="range"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'))) return;
        const hideHud = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'KeyS';
        const exit = event.key === 'Escape';
        if (!hideHud && !exit) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === 'keyup' || event.repeat) return;
        if (exit) this.setExpanded(false);
        else {
          this.hudHidden = !this.hudHidden;
          this.updatePresentation();
          if (this.hudHidden) this.video.focus({ preventScroll: true });
        }
      };
      window.addEventListener('keydown', shortcut, { capture: true, signal: this.events.signal });
      window.addEventListener('keyup', shortcut, { capture: true, signal: this.events.signal });
      this.controlsObserver = new MutationObserver(() => {
        if (video.controls) video.controls = false;
      });
      this.controlsObserver.observe(video, { attributes: true, attributeFilter: ['controls'] });
      video.controls = false;
      this.previousMarginBottom = wrapper.style.marginBottom;
      this.marginBottom = `${(parseFloat(getComputedStyle(wrapper).marginBottom) || 0) + 72}px`;
      wrapper.style.marginBottom = this.marginBottom;
      wrapper.append(this.host);
      this.sync();
      this.startProgressAnimation();
    }

    togglePlayback() {
      if (this.video.paused || this.video.ended) {
        this.video.play().catch(error => {
          if (error?.name === 'AbortError') return;
          this.notice.textContent = 'Playback could not start. Try Play again.';
          this.sync();
        });
      } else this.video.pause();
    }

    syncProgress() {
      const { video } = this;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      this.seek.disabled = duration === 0;
      this.seek.max = String(duration || 1);
      this.seek.value = String(Math.min(duration, video.currentTime || 0));
      const current = time(video.currentTime);
      const total = time(duration);
      const clock = `${current} / ${total}`;
      if (this.clock.value !== clock) {
        this.clock.value = clock;
        this.seek.setAttribute('aria-valuetext', `${current} of ${total}`);
      }
      this.taskTimeline.draw();
    }

    startProgressAnimation() {
      if (this.progressFrame !== null || this.video.paused || this.video.ended || document.hidden) return;
      this.progressFrame = requestAnimationFrame(() => {
        this.progressFrame = null;
        if (this.events.signal.aborted || !this.video.isConnected) return;
        this.syncProgress();
        this.startProgressAnimation();
      });
    }

    stopProgressAnimation() {
      if (this.progressFrame !== null) cancelAnimationFrame(this.progressFrame);
      this.progressFrame = null;
    }

    sync() {
      const { video } = this;
      this.syncProgress();
      const paused = video.paused || video.ended;
      if (this.play.dataset.paused !== String(paused)) {
        this.play.innerHTML = paused ? playIcon : pauseIcon;
        this.play.dataset.paused = String(paused);
      }
      this.play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
      this.play.title = paused ? 'Play' : 'Pause';
      const muted = video.muted || video.volume === 0;
      if (this.mute.dataset.muted !== String(muted)) {
        this.mute.innerHTML = muted ? muteIcon : soundIcon;
        this.mute.dataset.muted = String(muted);
      }
      this.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      this.mute.title = muted ? 'Unmute' : 'Mute';
      this.volume.value = String(video.muted ? 0 : video.volume);
    }

    setExpanded(expanded) {
      if (expanded === this.expanded) return;
      if (expanded) {
        if (activePlayer) activePlayer.setExpanded(false);
        activePlayer = this;
        this.expanded = true;
        this.hudHidden = false;
        this.restoreExpanded = [
          overrideStyles(this.wrapper, { position: 'fixed', top: '0', right: '0', bottom: '0', left: '0',
            width: '100vw', height: '100vh', 'max-width': 'none', 'max-height': 'none',
            'margin-top': '0', 'margin-right': '0', 'margin-bottom': '0', 'margin-left': '0',
            'padding-top': '0', 'padding-right': '0', 'padding-bottom': '0', 'padding-left': '0',
            'z-index': '2147483646', 'background-color': '#000', display: 'block' }),
          overrideStyles(this.video, { position: 'absolute', left: '0', top: '0', width: '100%',
            height: 'calc(100% - 72px)', 'max-width': 'none', 'max-height': 'none',
            'margin-top': '0', 'margin-right': '0', 'margin-bottom': '0', 'margin-left': '0',
            'object-fit': 'contain', 'background-color': '#000', 'border-radius': '0' }),
          overrideStyles(document.documentElement, { overflow: 'hidden' }),
          overrideStyles(document.body, { overflow: 'hidden' })
        ];
      } else {
        this.expanded = false;
        this.hudHidden = false;
        for (const restore of this.restoreExpanded.reverse()) restore();
        this.restoreExpanded = [];
        if (activePlayer === this) activePlayer = null;
      }
      this.host.toggleAttribute('expanded', this.expanded);
      this.expandButton.innerHTML = this.expanded ? collapseIcon : expandIcon;
      this.expandButton.setAttribute('aria-label', this.expanded ? 'Exit expanded view' : 'Expand video');
      this.expandButton.title = this.expanded ? 'Exit expanded view (Esc); hide controls (Shift+S)' : 'Expand video';
      this.updatePresentation();
      this.expandButton.focus({ preventScroll: true });
    }

    updatePresentation() {
      if (this.expanded) this.video.style.setProperty('height', this.hudHidden ? '100%' : 'calc(100% - 72px)', 'important');
      this.host.hidden = this.expanded && this.hudHidden;
      this.position();
      this.onLayout();
    }

    position() {
      if (this.expanded) {
        this.host.style.left = '0px';
        this.host.style.top = `${this.wrapper.clientHeight - 72}px`;
        this.host.style.width = `${this.wrapper.clientWidth}px`;
      } else {
        const v = this.video.getBoundingClientRect();
        const w = this.wrapper.getBoundingClientRect();
        this.host.style.left = `${v.left - w.left - this.wrapper.clientLeft}px`;
        this.host.style.top = `${v.bottom - w.top - this.wrapper.clientTop}px`;
        this.host.style.width = `${v.width}px`;
        this.host.hidden = !!document.fullscreenElement || v.width === 0 || v.height === 0;
      }
    }

    destroy() {
      this.setExpanded(false);
      this.events.abort();
      this.stopProgressAnimation();
      this.taskTimeline.destroy();
      this.controlsObserver.disconnect();
      this.host.remove();
      this.video.controls = this.originalControls;
      if (this.wrapper.style.marginBottom === this.marginBottom) this.wrapper.style.marginBottom = this.previousMarginBottom;
    }
  };
})();
