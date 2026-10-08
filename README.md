# AR Move — Fitness & Wellness Tracker

A personal fitness and wellness app with a home workout planner, guided sessions, progress charts, and offline support. Built with HTML, CSS, vanilla JavaScript, and an optional Python launcher. No accounts, API keys, remote fonts, paid services, or package installation are needed to run it.

## Run locally

On Windows, double-click `start.cmd`. It uses the bundled Python runtime on this machine when available, or an installed Python 3. Alternatively, run `python project.py`. The launcher opens the dashboard on this computer. Keep its terminal open and stop it with Ctrl+C when finished.

Open `http://127.0.0.1:8000` after launching. The app is self-contained; its branding and icon are in `assets/`. The launcher serves only this project folder. Keep the same host and port to access the same browser records. If port 8000 is busy, close the other server or use `python project.py --port 8001`. Use `--no-browser` to run without automatically opening a browser.

For static hosting, upload this folder with `index.html`, `dashboard.html`, both JavaScript and CSS files, `sw.js`, `manifest.webmanifest`, and `assets/`. Use HTTPS for phone motion and offline support. No build step is needed.

## Features

- **Overview:** daily walking metrics, a weekly chart, movement milestones, workout goal progress, and quick actions.
- **Tracker:** phone acceleration estimates, manual walking entries, estimated distance and calories, and deletable walking logs. Deleting a log subtracts its contribution from today's totals.
- **Sports:** eight illustrated exercises, search and category filters, favorites, and up to 50 custom exercises. Custom exercises use timer/manual entry and can be removed without deleting completed records.
- **Planner:** three editable example routines, add/remove exercises, and accessible move-up/move-down controls.
- **Guided sessions:** follow the plan through configurable work/rest intervals and rounds. Pause, resume, skip intervals, finish early, and review the completed time before saving. Rest and uncompleted intervals are excluded. Guided sessions use timers; reps are entered manually.
- **Individual workouts:** timer, manual entry, optional hand-motion estimates for the two supported arm movements, manual +/- rep buttons, sets, notes, editable completed records, and delete controls. Workouts stay separate from walking steps and calories.
- **Wellness:** water entries with undo, mood and a personal note, and optional manual health readings. You can save just sleep or any subset of the available readings.
- **Progress:** 7/30-day charts for steps and workout minutes, daily numbers in an accessible table, a movement streak, and personal water/workout targets. Missing dates are labeled as missing records.
- **Data:** JSON backup/export and validated restore, daily CSV download, 30 previous days, and recovery of unsaved individual workout entries.
- **Interface:** warm light/dark themes, desktop sidebar, phone bottom navigation, keyboard tabs, reduced-motion support, and local offline caching.

## Using Sports mode

1. Open Sports and choose an exercise. Use **+ Plan** to keep it in your routine.
2. Choose a tracking method. Timer and manual entry work without motion permission. Experimental motion is available only for the two supported arm movements.
3. Start the workout. Pause whenever needed; Resume continues the same entry. The page must remain visible.
4. Review the values. Reps means the total across all sets, not reps per set. For a timed stretch, leave reps at zero and enter minutes.
5. Save the completed workout to today's log. Switching exercises or clearing an unsaved entry asks before discarding it.

Motion counting measures acceleration peaks, not verified repetitions. It cannot recognize an exercise or check form. Keep the phone secure during gentle arm movements; place it aside for exercises requiring free hands. Correct estimates before saving. Unsupported or denied sensors can use timer or manual entry instead. Walking, individual workouts, and guided sessions cannot run simultaneously. The movement illustrations are simple visual cues; written instructions remain the primary reference.

## Phone access and data

The Python launcher listens on this computer's loopback address; it is not a phone-accessible hosting service. To use motion sensors on a phone, serve the files from an HTTPS site and open that site on the phone. Motion support and permission requirements depend on the device and browser. Desktop browsers can use manual entry and timers.

Completed records and the workout plan are stored in this browser's local storage. On a new local calendar day, the old day is archived and today's counters/check-ins reset. Up to 30 previous days are kept. Plans, custom exercises, favorites, theme, and settings survive daily resets. Clearing browser data, changing browsers, or changing the site's address or port can make previous records unavailable. Export records from Progress to keep an external copy; exports contain personal wellness entries, so store them appropriately. Restore validates the backup before asking to replace existing data. Older exports from this app are supported when their records are valid.

An individual workout draft is saved on edits and periodically, then recovered as a paused entry after reloading on the same day. Leaving the page warns about unsaved work. Guided sessions stay in memory until reviewed/saved; refresh warns before losing them. Hiding the page stops walking tracking and pauses Sports/guided timers. On a daily rollover, completed guided work time is saved to the previous day with zero reps, and the session ends. Saving failures display a banner so records can be exported before closing. Use one active tab to avoid conflicting local edits.

After a successful first load over HTTPS or localhost, a service worker caches the app for offline use. An Install button appears only when the browser makes installation available. Offline caching does not enable background motion tracking. If hosting files are updated, reload while online to fetch current assets.

## Project files

- `dashboard.html`: accessible page structure and forms.
- `styles.css`: responsive layouts, sports cards, and animations.
- `experience.css`: visual design, themes, charts, and phone navigation.
- `app.js`: tracking, workouts, local storage, history, and export.
- `features.js`: guided sessions, habits, charts, drafts, and validated data restore.
- `sw.js` / `manifest.webmanifest`: offline page caching and install metadata.
- `project.py`: optional standard-library local server.

## Verification

Browser integration checks are in `tests/browser.cjs` and `tests/enhancements.cjs`. They require Node.js, Playwright, and a Chromium browser only for development/testing. Start the local server first. Both suites default to `http://127.0.0.1:8000/dashboard.html`. Set `APP_URL` to use another address and `CHROME_PATH` if the browser is elsewhere.

The suites cover simulated motion, permission failures, counting correction, timers, pause/resume, history, storage failure, corrupted-record recovery, custom exercise escaping, draft recovery, work/rest accounting, JSON/CSV exports, restore validation, light/dark responsive layouts, and offline reload. If saved records are unreadable, the app retains the original text in a recovery copy and offers a download while opening a fresh day. Simulated events verify logic; real-device sensor accuracy still requires walking and exercise trials on supported phones.

These are personal tracking estimates, not smartwatch measurements or medical diagnoses.
