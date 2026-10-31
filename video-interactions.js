// Register before Runway's scripts so its capture handlers cannot expand on double click.
(() => {
  'use strict';
  if (globalThis.runwayHelperDoubleClickGuard) return;
  globalThis.runwayHelperDoubleClickGuard = true;

  function isVideoSurface(event) {
    const path = event.composedPath();
    // Keep the extension's buttons, sliders, and links independently usable.
    if (path.some(node => node instanceof Element && node.matches(
      'button, input, select, textarea, a, [contenteditable]:not([contenteditable="false"]), runway-helper-controls, runway-helper-speed, runway-helper-guides'
    ))) return false;
    return path.some(node => node instanceof HTMLVideoElement ||
      (node instanceof Element && node.hasAttribute('data-runway-helper-player')));
  }

  const blockDoubleClick = event => {
    if (event.button !== 0 || (event.type !== 'dblclick' && event.detail < 2) || !isVideoSurface(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) {
    window.addEventListener(type, blockDoubleClick, { capture: true, passive: false });
  }
})();
