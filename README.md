# Runway Helper

Chrome Manifest V3 extension for https://caption-verify-ext.ext.runwayml.com/ only.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Clone or download this repository. Click **Load unpacked** and select its folder.
3. Refresh the Runway tab. The speed bar appears beside its video.

Drag the slider or use arrow keys while it is focused to select 0.25×–2× in 0.25× steps. Click **1×** to reset. Speed carries across clips until page refresh. Clicking the Chrome toolbar icon does nothing; there is no popup.

The bar moves inside the video edge when space is limited. Native fullscreen retains the speed; exit fullscreen to access the custom bar again. No persistent storage, network requests, or extra extension API permissions are used.

After editing the extension, click **Reload** on its card in `chrome://extensions`, then refresh Runway.

## Development checks

Run `node --check content.js` to check JavaScript syntax.

The `tests/` folder is kept locally and excluded from this repository. If you have the local fixtures, run `node --test tests/manifest.test.cjs`. For browser lifecycle tests, run `python -m http.server 8765 --bind 127.0.0.1` from this folder and open `http://127.0.0.1:8765/tests/fixture.html`. The fixture includes the DOM script directly; the installed extension never injects into localhost.
