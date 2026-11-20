import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],defaultViewport:{width:1280,height:800}});
const results=[];
try{
 for(const mode of ['rejected','missing','normal']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(mode!=='normal')await page.evaluateOnNewDocument(mode=>{Element.prototype.requestPointerLock=mode==='missing'?undefined:function(){return Promise.reject(new DOMException('Blocked by browser','SecurityError'));};},mode);
  await page.goto('http://127.0.0.1:5173/combat.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.combatLab?.ready,{timeout:60000});
  await page.click('#play');await page.waitForFunction(()=>document.querySelector('#start').classList.contains('hidden')&&combatLab.world.step>5);
  await page.keyboard.down('w');await new Promise(r=>setTimeout(r,350));await page.keyboard.up('w');
  const entered=await page.evaluate(()=>({step:combatLab.world.step,paused:combatLab.loop.paused,hint:document.querySelector('#control-hint').textContent,locked:!!document.pointerLockElement}));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#start').classList.contains('hidden')&&combatLab.loop.paused);
  const pausedAt=await page.evaluate(()=>combatLab.world.step);await new Promise(r=>setTimeout(r,100));const stopped=await page.evaluate(step=>combatLab.world.step===step,pausedAt);
  results.push({mode,entered,escapePauses:stopped,errors});await page.close();
 }
 await fs.writeFile('combat-framework/evidence/start-button.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>r.entered.paused||!r.escapePauses||r.errors.length))process.exitCode=1;
}finally{await browser.close();}
