import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const p=await b.newPage();
 await p.goto('http://127.0.0.1:5188/?scene=evac',{waitUntil:'networkidle2'});
 const report=await p.evaluate(async()=>{
  const n=await import('/src/demo/network.js'),w=await import('/src/demo/world.js');
  // Use the application's Three package from Vite's dependency resolver.
  const r=await fetch('/src/demo/world.js'),source=await r.text();
  const path=source.match(/import \* as T from "([^"]+)"/)?.[1]||source.match(/import \* as T from '([^']+)'/)?.[1];
  const T=await import(path),scene=new T.Scene();w.world(scene);const artwork=await import('/src/demo/environment.js');await artwork.buildEnvironment(scene,n.layout);scene.updateMatrixWorld(true);
  const ray=new T.Raycaster(),rail=n.edges.find(e=>e.state==='rail'),checks=[];
  const ground=n.edges.filter(e=>e!==rail&&n.open(e,'步行'));
  for(const direction of [1,-1]){
   let y=0,peak=0,maxStep=0,clearanceMiss=0,visits=0,underpasses=0;
   for(let j=0;j<=1000;j++){
    const f=direction===1?j/1000:1-j/1000,x=rail.A[0]+f*(rail.B[0]-rail.A[0]),z=rail.A[1]+f*(rail.B[1]-rail.A[1]);
    const h=n.heightAt(x,z,'步行',y);
    maxStep=Math.max(maxStep,Math.abs(y-h));peak=Math.max(peak,h);y=h;
    if(j%20===0){
     ray.set(new T.Vector3(x,h+1,z),new T.Vector3(0,-1,0));ray.far=1.02;
     if(!ray.intersectObjects(scene.children,true).some(hit=>Math.abs(hit.point.y-h)<.18))clearanceMiss++;
     visits++;
    }
    if(h>2&&ground.some(e=>n.offset(x,z,e).d<n.roadWidth(e)*.5)) {
     if(n.heightAt(x,z,'步行',0)!==0)throw Error('Ground crossing changed level');
     underpasses++;
    }
   }
   const start=direction===1?rail.A:rail.B,target=direction===1?rail.b:rail.a,path=n.route(...start,target,'步行',0);
   if(!path.length||Math.abs(y)>.001||peak<10.7||maxStep>.60||clearanceMiss)throw Error(JSON.stringify({path,y,peak,maxStep,clearanceMiss,underpasses}));
   checks.push({direction,peak,finish:y,maxStep,menuRouteWaypoints:path.length,meshSamples:visits,missingMesh:clearanceMiss,groundCrossingSamples:underpasses});
  }
  const tunnel=n.edges.find(e=>e.state==='tunnel'&&e.a.includes('/tunnel/')&&e.b.includes('/tunnel/'));const tunnelMid=[(tunnel.A[0]+tunnel.B[0])/2,(tunnel.A[1]+tunnel.B[1])/2];const tunnelY=n.heightAt(...tunnelMid,'步行',0),carY=n.heightAt((rail.A[0]+rail.B[0])/2,(rail.A[1]+rail.B[1])/2,'轿车');if(carY!==0||tunnelY!==0)throw Error('Incorrect ground elevation');const pioneer='430,1330',oldWays=n.edges.filter(e=>e.a===pioneer||e.b===pioneer),lowered=[];
 for(const e of oldWays){
  for(const sign of [1,-1]){
   let y=0,minimum=0,miss=0,step=0;
   for(let j=0;j<=1000;j++){
    const f=sign>0?j/1000:1-j/1000,x=e.A[0]+f*(e.B[0]-e.A[0]),z=e.A[1]+f*(e.B[1]-e.A[1]),h=n.heightAt(x,z,'步行',y);
    if(j)step=Math.max(step,Math.abs(y-h));y=h;minimum=Math.min(minimum,h);
    if(j%10===0&&h<-.1){
     ray.set(new T.Vector3(x,h+.45,z),new T.Vector3(0,-1,0));ray.far=.59;
     if(!ray.intersectObjects(scene.children,true).some(hit=>Math.abs(hit.point.y-h)<.12))miss++;
    }
   }
   if(minimum> -3.64||step>.60||miss)throw Error(JSON.stringify({edge:e.a+' - '+e.b,minimum,step,miss}));
   lowered.push({from:sign>0?e.a:e.b,to:sign>0?e.b:e.a,minimum,maxStep:step,missingMesh:miss});
  }
 }
 const steps=[];
 for(const [x,z0,z1] of [[426.3,1353.05,1338.24],[432.3,1286.52,1303.4],[436.75,1310.41,1298.29]]){
  for(const direction of [1,-1]){
   let prior,first,maxJump=0,missing=0,last;
   for(let j=0;j<=120;j++){
    const frac=direction===1?j/120:1-j/120,z=z0+(z1-z0)*frac,h=n.heightAt(x,z,'步行',prior);
    if(j)maxJump=Math.max(maxJump,Math.abs(h-prior));else first=h;
    prior=h;last=h;
    if(j%4===0){ray.set(new T.Vector3(x,h+.32,z),new T.Vector3(0,-1,0));ray.far=.54;
     if(!ray.intersectObjects(scene.children,true).some(hit=>Math.abs(hit.point.y-h)<.14))missing++;}
   }
   if(missing||maxJump>.61||Math.abs(first-last)<2.5)throw Error(JSON.stringify({x,direction,first,last,maxJump,missing}));
   steps.push({x,direction,first,last,maxJump,missingMesh:missing});
  }
 }
 return {length:rail.length,tunnelY,carY,checks,pioneer:lowered,stairs:steps};
 });
 await fs.writeFile('shots/evac/rail-traversal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close()}



