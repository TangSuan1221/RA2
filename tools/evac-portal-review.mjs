import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const p=await browser.newPage();await p.goto('http://127.0.0.1:5188/?scene=evac',{waitUntil:'networkidle2'});
 const result=await p.evaluate(async()=>{
  const src=await (await fetch('/src/demo/south-district.js')).text();
  const modulePath=src.match(/import \* as T from "([^"]+)"/)?.[1];
  const T=await import(modulePath);
  const {southDistrict}=await import('/src/demo/south-district.js'),scene=new T.Scene(),mat=new T.MeshBasicMaterial({side:T.DoubleSide});
  const meshes=[];
  function addGeo(geo,m,x,y,z,rx=0,ry=0,rz=0){
   if(x<759||x>782||z<1288||z>1357||m==='gutterWater'||m==='water'){geo.dispose();return}
   const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.updateMatrixWorld();meshes.push(mesh);
  }
  const box=(x,y,z,w,h,d,m,rx=0,ry=0,rz=0)=>addGeo(new T.BoxGeometry(w,h,d),m,x,y,z,rx,ry,rz);
  southDistrict({box,addGeo,beam(){},cylinder(){},prop(){},tree(){},sign(){},canGrow:()=>false,tile:()=>scene,owned:new Set(),buildings:[],texture:()=>new T.Texture(),materials:{}});
  const ray=new T.Raycaster(),origin=new T.Vector3(),up=new T.Vector3(0,1,0),blocked=[];
  let headroom=Infinity,samples=0;
  for(let z=1292;z<=1345;z+=.25){
   const x=760+Math.min(18,(z-1280)*.60);
   for(const lateral of [-1.8,-.9,0,.9,1.8]){
    const scale=z<1310?Math.hypot(1,.6):1;
    origin.set(x+lateral/scale,.27,z-(z<1310?.6*lateral/scale:0));
    ray.set(origin,up);ray.far=8;
    const h=ray.intersectObjects(meshes,false)[0];samples++;
    if(h){headroom=Math.min(headroom,h.point.y);if(h.point.y<3.06)blocked.push([x,z,lateral,h.point.y]);}
   }
  }
  return {samples,vehicleWidth:3.6,testHeight:3.06,minUndersideY:headroom,blocked};
 });
 console.log(JSON.stringify(result).slice(0,1000));await fs.writeFile('shots/evac/inspection/southern/20-clearance.json',JSON.stringify(result,null,2));
 if(result.blocked.length)process.exitCode=1;
}finally{await browser.close()}
