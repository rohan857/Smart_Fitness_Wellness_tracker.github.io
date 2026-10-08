const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ acceptDownloads:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const base = process.env.APP_URL || 'http://127.0.0.1:8000/dashboard.html';
  const open = tab => page.locator(`[data-tab="${tab}"]`).click();
  const fill = (selector,value) => page.locator(selector).fill(String(value));
  const click = selector => page.locator(selector).click();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('arCubeMovementTrackerV2')));
  try {
    await page.goto(base); await page.waitForSelector('.splash',{state:'hidden'}); await page.waitForSelector('#week-chart .chart-column');
    assert.equal(await page.locator('#activity').isVisible(),true);
    assert.equal(await page.locator('#week-chart .chart-column').count(),7);
    await click('#theme-toggle'); await page.reload(); await page.waitForSelector('.splash.is-hidden');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark'); await click('#theme-toggle');
    await open('wellness'); await click('[data-water="250"]'); await click('[data-water="500"]');
    assert.equal(await page.locator('#water-total').textContent(),'750'); await click('#water-undo');
    assert.equal(await page.locator('#water-total').textContent(),'250');
    await click('[data-mood="great"]'); await fill('#mood-note','A good walk.'); await click('#save-mood');
    await fill('#wellness-form [name="sleep"]',7.5); await page.getByRole('button',{name:'Save wellness readings'}).click();
    assert.equal((await saved()).wellness.sleep,'7.5'); assert.equal((await saved()).wellness.heartRate,'—');
    await open('tracker'); await fill('#manual-walk-form [name="steps"]',1200); await fill('#manual-walk-form [name="minutes"]',12);
    await page.getByRole('button',{name:'Add walking entry'}).click();
    assert.equal((await saved()).steps,1200); assert.equal((await saved()).sessions[0].source,'manual');
    await open('sports'); await fill('#exercise-search','wall'); assert.equal(await page.locator('.exercise-card').count(),1);
    await click('.favorite-button'); await fill('#exercise-search',''); await page.locator('#workout-filter').selectOption('favorites');
    assert.equal(await page.locator('.exercise-card').count(),1); await page.locator('#workout-filter').selectOption('all');
    await click('#custom-exercise-open'); await fill('#custom-exercise-form [name="name"]','My <stretch>');
    await fill('#custom-exercise-form [name="instructions"]','Sit comfortably.\nMove at your own pace.');
    await page.getByRole('button',{name:'Create & add to plan'}).click(); assert.equal((await saved()).customExercises.length,1);
    await page.locator('#workout-filter').selectOption('custom');
    assert.equal(await page.locator('.exercise-card h4').textContent(),'My <stretch>'); assert.equal(await page.locator('.exercise-card stretch').count(),0);
    await click('.choose-exercise'); await page.locator('#workout-method').selectOption('manual');
    await click('#rep-plus'); await click('#rep-plus'); await click('#rep-minus'); await fill('#workout-minute-input',2); await fill('#workout-note','Draft recovery check');
    await page.waitForTimeout(1600); await page.reload(); await page.waitForSelector('.splash.is-hidden');
    assert.equal(await page.locator('#draft-restored').isVisible(),true); assert.equal(await page.locator('#workout-note').inputValue(),'Draft recovery check');
    assert.equal(await page.locator('#workout-rep-input').inputValue(),'1');
    await page.getByRole('button',{name:'Save completed workout'}).click(); assert.equal((await saved()).workouts.length,1);
    await page.getByRole('button',{name:'Edit My <stretch>',exact:true}).click(); await fill('#workout-edit-form [name="reps"]',8);
    await page.getByRole('button',{name:'Save changes',exact:true}).click(); assert.equal((await saved()).workouts[0].reps,8);
    await page.getByRole('button',{name:'Delete My <stretch>',exact:true}).click(); assert.equal((await saved()).workouts.length,0);
    // Advance the circuit clock deterministically. Paused time and rests are excluded.
    await click('[data-preset="strength"]'); assert.equal((await saved()).plan.length,3);
    await page.getByRole('button',{name:'Move Chair sit-to-stands down',exact:true}).click(); assert.equal((await saved()).plan[0],'wall-pushups');
    await fill('#circuit-work',10); await fill('#circuit-rest',5); await fill('#circuit-rounds',2); await click('#circuit-start');
    await page.evaluate(()=>{ circuit.lastTick-=3000; tickCircuit(); }); await click('#circuit-pause');
    const paused=await page.evaluate(()=>[...circuit.records.values()].reduce((sum,item)=>sum+item.ms,0));
    await page.evaluate(()=>{ circuit.lastTick-=30000; tickCircuit(); });
    assert.equal(await page.evaluate(()=>[...circuit.records.values()].reduce((sum,item)=>sum+item.ms,0)),paused);
    await click('#circuit-pause');
    await page.evaluate(()=>{ while(circuit && !document.getElementById('circuit-review-dialog').open) { circuit.lastTick-=20000; tickCircuit(); } });
    assert.equal(await page.locator('#circuit-review-dialog').isVisible(),true); assert.equal(await page.locator('.circuit-review-row').count(),3);
    await page.locator('.circuit-review-row').first().locator('[name="reps"]').fill('10');
    await page.getByRole('button',{name:'Save session workouts'}).click();
    let data=await saved(); assert.equal(data.workouts.length,3); assert.equal(data.workouts.every(item=>item.source==='circuit' && item.sets===2),true);
    assert.equal(data.workouts.every(item=>Math.abs(item.minutes-1/3)<.01),true); assert.equal(data.steps,1200);
    await open('today'); await page.locator('#progress-range').selectOption('30'); assert.equal(await page.locator('#trend-chart .chart-column').count(),30);
    await click('[data-chart-metric="minutes"]'); assert.match(await page.locator('#trend-chart').getAttribute('aria-label'),/Workout minutes/);
    await fill('#preferences-form [name="workoutGoal"]',15); await fill('#preferences-form [name="waterGoal"]',1500);
    await page.getByRole('button',{name:'Save personal targets'}).click();
    const downloadPromise=page.waitForEvent('download'); await click('#export-data'); const download=await downloadPromise; const backup=fs.readFileSync(await download.path());
    const backupData=JSON.parse(backup); assert.equal(backupData.customExercises.length,1); assert.equal(backupData.today.habits.water[0],250);
    const csvPromise=page.waitForEvent('download'); await click('#export-csv'); const csv=await csvPromise; assert.match(fs.readFileSync(await csv.path(),'utf8'),/water_ml/);
    const original=JSON.stringify(await saved());
    await page.locator('#import-data').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"app":"AR Move","today":{}}')});
    await page.waitForFunction(()=>document.getElementById('import-message').textContent.includes('invalid'));
    assert.equal(JSON.stringify(await saved()),original);
    await click('#reset-day'); assert.equal((await saved()).habits.water.length,0);
    await page.locator('#import-data').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
    await page.waitForFunction(()=>document.getElementById('import-message').textContent.includes('successfully'));
    data=await saved(); assert.equal(data.steps,1200); assert.equal(data.workouts.length,3); assert.equal(data.preferences.waterGoal,1500); assert.equal(data.habits.mood,'great');
    await open('sports');
    await page.getByRole('button',{name:'Edit Wall push-ups',exact:true}).click();
    await fill('#workout-edit-form [name="reps"]',12); await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal((await saved()).workouts.find(item=>item.exerciseId==='wall-pushups').reps,12);
    await page.getByRole('button',{name:'Remove custom exercise My <stretch>',exact:true}).click();
    assert.equal((await saved()).customExercises.length,0);
    await open('today'); await page.locator('#import-data').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
    await page.waitForFunction(()=>state.customExercises.length===1);
    await page.getByRole('button',{name:'Delete walking entry of 1200 steps',exact:true}).click();
    assert.equal((await saved()).steps,0); assert.equal((await saved()).activeSeconds,0);
    await page.locator('#import-data').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
    await page.waitForFunction(()=>state.steps===1200);
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>setTheme(theme),theme);
      for(const width of [320,390,760,1000,1440]) {
        await page.setViewportSize({width,height:900});
        for(const tab of ['activity','tracker','sports','wellness','today']) { await open(tab); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${width}px ${tab}`); }
      }
    }
    const qa=process.env.QA_DIR || require('node:os').tmpdir();
    await page.evaluate(()=>{setTheme('light');document.getElementById('toast').hidden=true;}); await open('activity'); await page.waitForTimeout(250); await page.screenshot({path:path.join(qa,'ar-move-v3-overview.png'),fullPage:true});
    await open('sports'); await page.waitForTimeout(250); await page.screenshot({path:path.join(qa,'ar-move-v3-sports.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844}); await open('activity'); await page.waitForTimeout(250); await page.screenshot({path:path.join(qa,'ar-move-v3-phone.png'),fullPage:true});
    await page.evaluate(()=>navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.splash.is-hidden');
    await context.setOffline(true); await page.reload(); await page.waitForSelector('.splash.is-hidden');
    assert.equal(await page.locator('.tab').count(),5); await open('sports'); assert.equal(await page.locator('.exercise-card').count(),9); assert.equal(await page.locator('#workout-count').textContent(),'3');
    await context.setOffline(false);
    for (const raw of ['{broken JSON', JSON.stringify({date:'2026-10-08',steps:20,activeSeconds:0,sessions:null,settings:null})]) {
      const recoveryContext=await browser.newContext();
      await recoveryContext.addInitScript(raw=>localStorage.setItem('arCubeMovementTrackerV2',raw),raw);
      const recoveryPage=await recoveryContext.newPage();
      recoveryPage.on('pageerror',error=>errors.push(error.message));
      await recoveryPage.goto(base); await recoveryPage.waitForSelector('.splash',{state:'hidden'});
      assert.equal(await recoveryPage.locator('#recovery-warning').isVisible(),true);
      assert.equal(await recoveryPage.evaluate(()=>localStorage.getItem('arCubeMovementTrackerV2Recovery')),raw);
      assert.equal(await recoveryPage.locator('#week-chart .chart-column').count(),7);
      const recoveryDownloadPromise=recoveryPage.waitForEvent('download'); await recoveryPage.locator('#download-recovery').click();
      const recoveryDownload=await recoveryDownloadPromise;
      assert.equal(fs.readFileSync(await recoveryDownload.path(),'utf8'),raw);
      await recoveryContext.close();
    }
    const legacyContext=await browser.newContext();
    await legacyContext.addInitScript(()=>{
      const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const today=new Date(), yesterday=new Date(); yesterday.setDate(yesterday.getDate()-1);
      localStorage.setItem('arCubeMovementTrackerV2',JSON.stringify({date:key(today),steps:100,activeSeconds:10,settings:{stride:75},history:[{date:key(yesterday),steps:200,activeSeconds:20}]}));
    });
    const legacyPage=await legacyContext.newPage(); legacyPage.on('pageerror',error=>errors.push(error.message));
    await legacyPage.goto(base); await legacyPage.waitForSelector('.splash',{state:'hidden'});
    assert.equal(await legacyPage.locator('#week-chart .chart-column').count(),7);
    assert.equal(await legacyPage.locator('#recovery-warning').isVisible(),false);
    assert.equal(await legacyPage.evaluate(()=>state.history[0].workouts.length),0);
    assert.equal(await legacyPage.evaluate(()=>state.history[0].settings.weight),70);
    await legacyContext.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: themes, check-ins, partial wellness, manual walking, search/favorites, custom exercise escaping, draft recovery, edit/delete, ordering, guided intervals/pauses, charts, goals, CSV, validated restore, 50 layout checks, offline reload.');
  } catch(error) { if(errors.length) console.error('Browser errors:',errors); throw error; }
  finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
