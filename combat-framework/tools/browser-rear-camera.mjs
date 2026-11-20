import puppeteer from 'puppeteer-core';import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],defaultViewport:{width:1280,height:800}});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluateOnNewDocument(()=>{Element.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('blocked','SecurityError'));};});await page.goto('http://127.0.0.1:5173/combat.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>combatLab?.ready,{timeout:60000});await page.click('#play');await page.evaluate(()=>{for(const e of combatLab.world.enemies)e.hp=0;});
const results=[];
for(const fixture of ['open','corner']){
 await page.evaluate(f=>{const a=combatLab.world.player;a.pos=f==='corner'?[-16.65,.005,-16.65]:[0,.005,0];a.prev=[...a.pos];a.vel=[0,0,0];a.hp=100;},fixture);
 await page.mouse.move(640,400);await page.mouse.down({button:'right'});
 for(const x of [900,400,1000,300,640]){await page.mouse.move(x,400,{steps:12});await new Promise(r=>setTimeout(r,160));results.push(await page.evaluate(fixture=>{const a=combatLab.world.player,c=combatLab.rig.current,d=c.position.map((v,i)=>v-c.pivot[i]);return {fixture,yaw:a.yaw,rearDot:d[0]*Math.sin(a.yaw)+d[2]*Math.cos(a.yaw),viewYaw:Math.atan2(c.direction[0],c.direction[2]),fading:c.recovering};},fixture));}
 await page.mouse.up({button:'right'});
}
await new Promise(r=>setTimeout(r,250));console.log('RENDER',JSON.stringify(await page.evaluate(()=>({player:combatLab.world.player.pos,camera:combatLab.camera.position.toArray(),rig:combatLab.rig.current,meshes:combatLab.scene.children.filter(o=>o.geometry?.type==='BoxGeometry').map(o=>({pos:o.position.toArray(),opacity:o.material.opacity,transparent:o.material.transparent}))}))));await page.screenshot({path:'combat-framework/evidence/rear-camera-turn.png'});const pass=errors.length===0&&results.every(r=>r.rearDot<-1.2&&Math.abs(Math.atan2(Math.sin(r.viewYaw-r.yaw),Math.cos(r.viewYaw-r.yaw)))<1e-8);await fs.writeFile('combat-framework/evidence/rear-camera-turn.json',JSON.stringify({pass,results,errors},null,2));console.log(JSON.stringify({pass,results,errors}));if(!pass)process.exitCode=1;
}finally{await browser.close();}
