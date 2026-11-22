import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--no-sandbox']
});
try {
  const page=await browser.newPage();
  await page.setViewport({width:960,height:640});
  await page.goto(process.env.STATION_URL || 'http://127.0.0.1:5188/station.html?art=1');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const read=()=>page.$eval('#position',el=>el.textContent.match(/-?\d+\.\d+/g).map(Number));
  const dispatch=(type,init)=>page.evaluate(({type,init})=>{
    document.activeElement.dispatchEvent(new KeyboardEvent(type,{bubbles:true,cancelable:true,...init}));
  },{type,init});
  const stopped=async()=>{
    await wait(140);
    const before=await read();await wait(300);assert.deepEqual(await read(),before);
    assert.equal(await page.$eval('#motion-status',el=>el.textContent),'Idle_Loop');
  };
  page.on('pageerror',e=>console.error(e.message));
  await page.waitForFunction(()=>document.body.dataset.artReady==='true'&&document.querySelector('#motion-status').textContent==='Idle_Loop',{timeout:90000});
  await page.evaluate(()=>new Promise(resolve=>{let n=0;function tick(){if(++n===12)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
  // A preview host can forward a key while the game canvas has no focus.
  await page.evaluate(()=>document.activeElement.blur());
  const idle=await read();await dispatch('keydown',{key:'w',code:'KeyW'});
  await wait(300);assert.deepEqual(await read(),idle,'unfocused input should not move');await stopped();
  await page.click('canvas');
  for(const [key,axis,sign] of [['d',0,1],['a',0,-1],['w',1,-1],['s',1,1]]){
    const start=await read();await page.keyboard.down(key);await wait(230);await page.keyboard.up(key);
    assert.ok(((await read())[axis]-start[axis])*sign>.15,key+' should move from '+start+'; current position '+await read());await stopped();
  }
  const start=await read();
  await dispatch('keydown',{key:'D'});await wait(210);
  assert.ok((await read())[0]>start[0]+.15,'host key-only event should move');
  await dispatch('keyup',{key:'d',code:'KeyD'});await stopped();
  await page.keyboard.down('d');await wait(180);
  await page.keyboard.press('Escape');await stopped();
  await dispatch('keydown',{key:'d',code:'KeyD',repeat:true});await stopped();
  await page.keyboard.up('d');
  await dispatch('keydown',{key:'a',code:'KeyA'});await wait(200);
  await page.focus('#map');await stopped();
  await page.click('canvas');
  await dispatch('keydown',{key:'d',code:'KeyD'});await wait(2200);await stopped();
  await dispatch('keyup',{key:'d',code:'KeyD'});
  await dispatch('keydown',{key:'a',code:'KeyA'});
  for(let i=0;i<8;i++){await wait(300);await dispatch('keydown',{key:'a',code:'KeyA',repeat:true});}
  const mid=await read();await wait(200);assert.ok((await read())[0]<mid[0]-.15,'held key should keep moving');
  await dispatch('keyup',{key:'a'});await stopped();
  // Lose W-up, then keep receiving repeats from a different physical key.
  await dispatch('keydown',{key:'w',code:'KeyW'});
  await dispatch('keydown',{key:'Shift',code:'ShiftLeft',shiftKey:true});
  const shiftPulse=()=>dispatch('keydown',{key:'Shift',code:'ShiftLeft',shiftKey:true,repeat:true});
  for(let i=0;i<7;i++){await wait(200);await shiftPulse();}
  const settled=await read();
  for(let i=0;i<5;i++){await wait(200);await shiftPulse();}
  assert.deepEqual(await read(),settled,'Shift renewed an orphaned W');
  await dispatch('keyup',{key:'Shift',code:'ShiftLeft'});await stopped();
  console.log('PASS movement in four directions, release, normalized input, Escape, focus, lost release and sustained repeat');
}finally{await browser.close()}
