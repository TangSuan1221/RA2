import puppeteer from 'puppeteer-core';import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],defaultViewport:{width:1280,height:800}});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/combat.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>combatLab?.ready,{timeout:60000});
const result=await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),lab=combatLab,w=lab.world,a=w.player,results=[];w.update();document.querySelector('#start').classList.add('hidden');for(const e of w.enemies)lab.actors.get(e.id).group.visible=false;
for(const scenario of [{name:'back-wall',pos:[0,.005,-16.65],aim:false},{name:'corner',pos:[-16.65,.005,-16.65],aim:false},{name:'aim-corner',pos:[-16.65,.005,-16.65],aim:true},{name:'side-wall',pos:[-6.65,.005,9],yaw:Math.PI/2,aim:false}]){
 a.pos=[...scenario.pos];a.prev=[...a.pos];for(let i=0;i<90;i++)lab.rig.update(a,{yaw:scenario.yaw||0,pitch:-.08,aim:scenario.aim},w.obstacles);
 const view=lab.rig.interpolate(1),camera=lab.camera;camera.position.fromArray(view.position);camera.lookAt(...view.look);camera.fov=view.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 const chest=new T.Vector3(a.pos[0],a.pos[1]+1.15,a.pos[2]).project(camera),distance=camera.position.distanceTo(new T.Vector3(...lab.rig.current.pivot));results.push({name:scenario.name,distance,chestNDC:chest.toArray(),visible:Math.abs(chest.x)<.95&&Math.abs(chest.y)<.95&&chest.z>-1&&chest.z<1,recoveryYaw:lab.rig.recoveryYaw});
}
return results;});await new Promise(r=>setTimeout(r,100));await page.screenshot({path:'combat-framework/evidence/camera-wall-recovery.png'});await fs.writeFile('combat-framework/evidence/camera-wall-recovery.json',JSON.stringify({results:result,errors},null,2));console.log(JSON.stringify({results:result,errors}));if(errors.length||result.some(r=>!r.visible||r.distance<1.2))process.exitCode=1;
}finally{await browser.close();}
