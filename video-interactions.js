// Register before Runway's scripts so its capture handlers cannot expand on double click.
(() => {
  'use strict';
  if (globalThis.runwayHelperDoubleClickGuard) return;
  globalThis.runwayHelperDoubleClickGuard = true;
  const clickHandlers = new WeakMap();
  globalThis.runwayHelperVideoClickHandlers = clickHandlers;

  // Handle every click, regardless of its click count, before Runway's handlers.
  window.addEventListener('click', event => {
    if (event.button !== 0) return;
    for (const node of event.composedPath()) {
      const handler = clickHandlers.get(node);
      if (!handler || !handler.accepts(event)) continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      handler.toggle();
      return;
    }
  }, { capture: true, passive: false });

  function isVideoSurface(event) {
    const path = event.composedPath();
    // Keep the extension's buttons, sliders, and links independently usable.
    if (path.some(node => node instanceof Element && node.matches(
      'button, input, select, textarea, a, [contenteditable]:not([contenteditable="false"]), runway-helper-controls, runway-helper-speed, runway-helper-guides'
    ))) return false;
    return path.some(node => node instanceof HTMLVideoElement ||
      (node instanceof Element && node.hasAttribute('data-runway-helper-player')));
  }

  window.addEventListener('dblclick', event => {
    if (event.button !== 0 || !isVideoSurface(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });

  // Suppress the page's multi-click mouse handlers without cancelling click events.
  for (const type of ['mousedown', 'mouseup']) {
    window.addEventListener(type, event => {
      if (event.button === 0 && event.detail > 1 && isVideoSurface(event)) event.stopImmediatePropagation();
    }, { capture: true });
  }
})();
