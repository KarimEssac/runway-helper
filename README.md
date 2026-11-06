# Runway Helper

Chrome Manifest V3 extension for https://caption-verify-ext.ext.runwayml.com/ only.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Clone or download this repository. Click **Load unpacked** and select its folder.
3. Refresh the Runway tab. The speed bar appears beside its video.

Drag the slider or use arrow keys while it is focused to select 0.25×–2× in 0.25× steps. Click **1×** to reset. Each new clip starts at 1×, including when Runway changes the video without refreshing the page. Replaying or seeking within the same loaded clip keeps the chosen speed.

The speed bar moves inside the video edge when space is limited. Video controls and guides work locally. Image search opens Google Images directly in a reusable browser window.

Use the two small buttons centered above the video to toggle the center guides independently: **│** for the vertical line and **─** for the horizontal line. Both reset to disabled on every video change, including source changes without a page refresh. The lines let clicks pass through to the video and stay centered as it resizes.

## Earnings

Click the Chrome toolbar icon, enter your hourly rate in USD, choose a daily reset time in AM or PM, and click **Save settings**. The reset defaults to midnight in your computer’s local time. The popup opens to the current workday. Select **Another day** to see the workday that started on that date, or **Custom time range** to set a start and end on your local clock. The bottom-right counter on Caption Verify always shows the current workday.

One paid hour equals 360 tasks with no highlighted area or 180 with a highlighted area. The extension starts tracking after you reload it and refresh Runway. It records a task when you use **Confirm** and Runway’s completed-task total goes up, including when Runway reuses the video for another claim. Task history and settings stay in local extension storage. Changing your rate or reset time recalculates the display using the saved task history.

Set **Today's goal** in the toolbar popup to show a progress ring on the bottom-right counter. The ring fills from gray to green and turns gold above 100%. The goal applies until the next daily reset. Leave the field blank to hide the ring.

**Effective hourly rate** divides earnings from timed tasks by the time spent on those tasks in the selected period. Timing starts when a claim appears in the focused Runway tab and pauses when you switch tabs or apps. Only confirmed tasks count. Older earnings still appear in the total, and the effective rate uses tasks timed after this update.

Use **Pause** and **Resume** in the toolbar popup to keep the current task's elapsed time. **Stop** clears the current task's timer. Use **Start** to begin timing again. The timer setting applies across Runway tabs and persists when you reopen Chrome.

## Unobstructed playback and expanded view

Play/pause, playback time, seeking, mute, volume, and Expand are in a dedicated strip **below** the video. Hovering over the picture no longer shows Chrome's native control overlay. On narrow players, the volume slider moves beside the seek bar.

Click **Expand video** to fill the browser's page area. This uses an in-page expanded layout, so it does not invoke Chrome's fullscreen API or its exit-fullscreen notice. The browser toolbar remains visible. Chrome's own notice cannot be suppressed in native fullscreen.

Every left-click on the video picture toggles play/pause immediately, including rapid repeated clicks in the same position. Use the **Expand video** and **Exit expanded view** buttons to change the viewing mode; **Esc** also exits expanded view. An early page-level handler routes every video click to playback and blocks the separate double-click expansion event. The controls below the video keep their usual actions. After upgrading, reload the extension and fully refresh the Runway tab to install this handler.

On tasks with a highlighted clip timeline, its playhead and progress fill move smoothly with the actual playback position. The highlighted area and the site's existing click/drag seeking behavior are preserved. The extension's playback slider is also updated every animation frame while playing. Animation stops when paused or the page is hidden and resumes when playback is visible again.

- **Shift+S** toggles the bottom HUD in expanded view. Hiding it also frees that space for the picture. Press it again to restore the controls.
- **Esc** or **Exit expanded view** returns to the normal layout.
- The speed bar and center guides are available in normal view. The selected playback speed is maintained while expanding and collapsing the same clip.
- Loading a new clip restores the bottom HUD and resets speed and both guides as usual. If the video element is replaced while expanded, the expanded layout closes cleanly.

After editing the extension, click **Reload** on its card in `chrome://extensions`, then refresh Runway.

## Google Images search (Shift+D)

Select words in the Runway text and press **Shift+D**. Google Images opens in a separate popup browser window centered over Runway. There are no API keys, subscriptions, or extension-imposed search quotas. Google can still apply its usual CAPTCHA and traffic limits.

Each new search reuses the existing search window and brings it forward, preserving any size or position you adjusted. If the window is minimized, it is restored; if closed, the next search creates a new one. Normal and incognito windows are kept separate. Close the window with its **×** button or **Alt+F4** on Windows to return to labeling. The results are a real Google Images page, rather than an embedded page rectangle.

Reload the extension and refresh Runway to apply the update. No configuration is required. The retired API settings page, API permission, request counter, and key-based search have been removed. Previously saved API keys and counters are deleted from local extension storage when the new worker starts.

Only selected text is included in the Google search URL. The extension sends no surrounding page text, video, or annotation answers. Google handles the search as ordinary browser navigation, using your normal browser session and Google privacy/history preferences. For image search, the storage permission lets the extension remember the managed window and tab IDs for the current browser session and clean up retired settings. The extension saves no search history.

All image-search implementation files are in `image-search/`.

## Development checks

The `tests/` folder is kept locally and excluded from this repository. The old local fixtures predate the custom playback controls and are not maintained for the current version.
