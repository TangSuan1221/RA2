import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],defaultViewport:{width:1280,height:800}});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/combat.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.combatLab?.ready,{timeout:60000});
  await page.evaluate(()=>{combatLab.world.enemies.forEach(e=>e.hp=0);combatLab.startTest();combatLab.input.push('prone');combatLab.keys.add('KeyW');});
  await new Promise(r=>setTimeout(r,3300));await page.screenshot({path:'combat-framework/evidence/prone.png'});
  const prone=await page.evaluate(()=>{const w=combatLab.world;return {clip:w.player.clip,head:w.bonePosition(w.player,'Head'),pos:w.player.pos,height:w.player.height};});
  await page.evaluate(()=>{const p=combatLab.world.player;combatLab.keys.clear();p.posture='stand';p.height=1.78;p.heightTransition=null;p.pos=[0,0,6.6];p.vel=[0,0,0];p.yaw=0;combatLab.input.push('execute');});
  await new Promise(r=>setTimeout(r,450));await page.screenshot({path:'combat-framework/evidence/vault.png'});
  const vault=await page.evaluate(()=>({clip:combatLab.world.player.clip,state:combatLab.world.player.state,pos:combatLab.world.player.pos}));
  await new Promise(r=>setTimeout(r,1200));const end=await page.evaluate(()=>({state:combatLab.world.player.state,pos:combatLab.world.player.pos}));
  const report={fixture:'Enemy combat disabled only for isolated visual traversal check',prone,vault,end,errors};await fs.writeFile('combat-framework/evidence/traversal-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(errors.length||!prone.clip.startsWith('Prone_Crawl')||vault.clip!=='Safety_Vault'||end.pos[2]<7.5)process.exitCode=1;
}finally{await browser.close();}
