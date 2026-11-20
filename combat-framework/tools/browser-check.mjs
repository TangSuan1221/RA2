import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding'],defaultViewport:{width:1280,height:800}});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/combat.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.combatLab?.ready,{timeout:60000});
await page.evaluate(()=>window.combatLab.startTest());
await new Promise(r=>setTimeout(r,2500));
await fs.mkdir('combat-framework/evidence',{recursive:true});await page.screenshot({path:'combat-framework/evidence/arena.png'});
const latency=await page.evaluate(async()=>{const lab=combatLab,before=lab.world.player.pose.rotations.map(q=>Array.from(q)),start=performance.now();lab.keys.add('KeyW');return await new Promise(resolve=>{function check(){const elapsed=performance.now()-start;const changed=lab.world.player.clip!=='Idle_Loop'&&lab.world.player.pose.rotations.some((q,i)=>q.some((v,j)=>Math.abs(v-before[i][j])>.001));if(changed||elapsed>300){resolve({milliseconds:elapsed,changed,velocity:lab.world.player.vel,clip:lab.world.player.clip});return;}requestAnimationFrame(check);}requestAnimationFrame(check);});});
await new Promise(r=>setTimeout(r,1700));await page.screenshot({path:'combat-framework/evidence/movement.png'});await page.evaluate(()=>{combatLab.keys.clear();combatLab.input.push('light');});await new Promise(r=>setTimeout(r,300));await page.screenshot({path:'combat-framework/evidence/melee.png'});await fs.writeFile('combat-framework/evidence/input-latency.json',JSON.stringify(latency,null,2));console.log('INPUT LATENCY',JSON.stringify(latency));
console.log(JSON.stringify(await page.evaluate(()=>({metrics:combatLab.metrics(),actors:[...combatLab.actors].map(([id,v])=>({id,bones:v.pose.channels.size,position:v.group.position.toArray()})),state:combatLab.world.snapshot()}))).slice(0,2000));console.log('ERRORS',JSON.stringify(errors));await browser.close();if(errors.length)process.exitCode=1;

