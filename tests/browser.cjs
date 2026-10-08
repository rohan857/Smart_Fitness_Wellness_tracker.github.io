// Run with Playwright available on NODE_PATH. No real sensor access is needed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const base = process.env.APP_URL || 'http://127.0.0.1:8000/dashboard.html';
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('arCubeMovementTrackerV2')));
  const open = async tab => page.locator(`[data-tab="${tab}"]`).click();
  const choose = async name => page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Choose workout' }).click();
  try {
    await page.goto(base + '?tab=sports');
    await page.waitForSelector('.splash.is-hidden');
    assert.equal(await page.locator('.exercise-card').count(), 8);
    await page.locator('#workout-filter').selectOption('motion');
    assert.equal(await page.locator('.exercise-card').count(), 2);
    await page.locator('#workout-filter').selectOption('all');
    await page.getByRole('button', { name: 'Add Wall push-ups to plan', exact: true }).click();
    await choose('Wall push-ups');
    assert.equal(await page.locator('#workout-method option[value="motion"]').evaluate(option => option.disabled), true);
    await page.locator('#workout-method').selectOption('manual');
    await page.locator('#workout-rep-input').fill('24');
    await page.locator('#workout-set-input').fill('3');
    await page.locator('#workout-minute-input').fill('4.5');
    await page.locator('#workout-note').fill('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Save completed workout' }).click();
    let data = await saved();
    assert.equal(data.workouts[0].reps, 24);
    assert.equal(data.workouts[0].sets, 3);
    assert.equal(data.workouts[0].source, 'manual');
    assert.equal(data.steps, 0);
    assert.equal(await page.locator('#completed-workouts img').count(), 0);
    await page.reload();
    await page.waitForSelector('.splash.is-hidden');
    assert.equal(await page.locator('#workout-plan li').count(), 1);
    assert.equal(await page.locator('#completed-workouts li').count(), 1);

    // Exercise a real timer, pause, manual correction, and saved totals.
    await choose('Shoulder rolls');
    await page.getByRole('button', { name: 'Start workout', exact: true }).click();
    await page.waitForTimeout(3300);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.equal(await page.locator('#workout-clock').textContent(), '00:03');
    await page.locator('#workout-minute-input').fill('1.2');
    await page.getByRole('button', { name: 'Save completed workout' }).click();
    data = await saved();
    assert.equal(data.workouts[0].minutes, 1.2);
    assert.equal(data.workouts[0].source, 'timer');

    // Simulated acceleration validates count isolation, hysteresis, and review.
    await choose('Standing arm curls');
    await page.evaluate(() => {
      window.DeviceMotionEvent = class { static requestPermission() { return Promise.resolve('granted'); } };
    });
    await page.getByRole('button', { name: 'Start workout', exact: true }).click();
    const motion = value => page.evaluate(value => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x: value, y: 0, z: 0 } });
      window.dispatchEvent(event);
    }, value);
    await page.waitForTimeout(700);
    await motion(3);
    await motion(3);
    assert.equal(await page.locator('#workout-live-reps').textContent(), '1');
    await motion(0);
    await page.waitForTimeout(700);
    await motion(3);
    assert.equal(await page.locator('#workout-live-reps').textContent(), '2');
    await open('tracker');
    await page.locator('#start-tracking').click();
    assert.match(await page.locator('#tracker-message').textContent(), /Pause your Sports/);
    await open('sports');
    await page.locator('#workout-pause').click();
    await page.locator('#workout-rep-input').fill('3');
    await page.locator('#workout-rep-input').dispatchEvent('change');
    await page.locator('#workout-start').click();
    await page.waitForTimeout(700);
    await motion(3);
    await page.locator('#workout-pause').click();
    assert.equal(await page.locator('#workout-rep-input').inputValue(), '4');
    await page.getByRole('button', { name: 'Save completed workout' }).click();
    data = await saved();
    assert.equal(data.workouts[0].source, 'motion');
    assert.equal(data.workouts[0].reps, 4);
    assert.equal(data.steps, 0);

    // Existing walking updates must not overwrite an in-progress settings edit.
    await open('tracker');
    await page.locator('#start-tracking').click();
    await page.locator('[name="weight"]').fill('83');
    await page.waitForTimeout(400);
    await motion(3);
    assert.equal(await page.locator('[name="weight"]').inputValue(), '83');
    await page.locator('#stop-tracking').click();
    assert.equal((await saved()).steps, 1);

    // Denied sensors leave timer/manual paths usable.
    await open('sports');
    await choose('Gentle front raises');
    await page.evaluate(() => { DeviceMotionEvent.requestPermission = async () => 'denied'; });
    await page.locator('#workout-start').click();
    await page.waitForFunction(() => document.getElementById('workout-message').textContent.includes('denied'));
    assert.equal(await page.locator('#workout-method').isEnabled(), true);
    await page.locator('#workout-method').selectOption('timer');
    await page.locator('#workout-start').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.match(await page.locator('#workout-message').textContent(), /page was hidden/);
    assert.equal(await page.locator('#workout-pause').isDisabled(), true);
    await page.locator('#workout-discard').click();
    await page.evaluate(() => { delete document.hidden; });

    // Persist an old day, then exercise startup migration and reset retention.
    await page.evaluate(() => {
      const old = JSON.parse(localStorage.getItem('arCubeMovementTrackerV2'));
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      old.date = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      state.date = old.date;
      localStorage.setItem('arCubeMovementTrackerV2', JSON.stringify(old));
    });
    await page.reload();
    await page.waitForSelector('.splash.is-hidden');
    data = await saved();
    assert.equal(data.steps, 0);
    assert.equal(data.workouts.length, 0);
    assert.equal(data.history[0].workouts.length, 3);
    assert.equal(data.plan.length, 1);
    await open('today');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-data').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.history[0].workouts.length, 3);
    await page.locator('#reset-day').click();
    data = await saved();
    assert.equal(data.history.length, 1);
    assert.equal(data.plan.length, 1);

    // Verify all tabs at common phone widths, and save one visual for review.
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ['activity', 'tracker', 'sports', 'wellness', 'today']) {
        await open(tab);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px on ${tab}`);
      }
    }
    await open('sports');
    await choose('Standing arm curls');
    const screenshotDir = process.env.QA_DIR || require('node:os').tmpdir();
    await page.screenshot({ path: path.join(screenshotDir, 'ar-move-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotDir, 'ar-move-phone.png'), fullPage: true });

    // A late permission grant after hiding must not start an invisible workout.
    await page.evaluate(() => {
      DeviceMotionEvent.requestPermission = () => new Promise(resolve => { window.resolveMotionPermission = resolve; });
    });
    await page.locator('#workout-start').click();
    await page.waitForFunction(() => typeof window.resolveMotionPermission === 'function');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.resolveMotionPermission('granted');
    });
    assert.equal(await page.locator('#workout-pause').isDisabled(), true);
    await page.evaluate(() => { delete document.hidden; });

    // Null events must not masquerade as working motion sensors.
    await page.evaluate(() => { DeviceMotionEvent.requestPermission = async () => 'granted'; });
    await page.locator('#workout-start').click();
    await page.evaluate(() => window.dispatchEvent(new Event('devicemotion')));
    await page.waitForFunction(() => document.getElementById('workout-message').textContent.includes('No usable motion'), { timeout: 6000 });
    assert.equal(await page.locator('#workout-pause').isDisabled(), true);
    await page.locator('#workout-discard').click();

    // Storage failures should show a recoverable warning without blocking the app.
    const blockedContext = await browser.newContext();
    await blockedContext.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
    const blockedPage = await blockedContext.newPage();
    blockedPage.on('pageerror', error => errors.push(error.message));
    await blockedPage.goto(base + '?tab=sports');
    await blockedPage.waitForSelector('.splash.is-hidden');
    assert.equal(await blockedPage.locator('#storage-warning').isVisible(), true);
    assert.equal(await blockedPage.locator('.exercise-card').count(), 8);
    await blockedContext.close();
    assert.deepEqual(errors, []);
    console.log('PASS: workout logging, plan persistence, timer, motion estimates, correction/resume, sensor denial, null sensors, permission races, page hiding, storage failure, settings edits, history, export, reset, and 20 responsive tab checks.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
