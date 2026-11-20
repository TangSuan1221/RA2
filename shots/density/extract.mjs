import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
const server=await createServer({server:{port:5193,host:'127.0.0.1'}});await server.listen();
let source=await fs.readFile('src/demo/environment.js','utf8');
source=source.replaceAll("from './","from '/src/demo/");
source=source.replace('const loader=new T.TextureLoader();','const loader={load:()=>new T.Texture()};');
source=source.replace("function box(x,y,z,w,h,d,m='stone',rx=0,ry=0,rz=0){", "function box(x,y,z,w,h,d,m='stone',rx=0,ry=0,rz=0){ if(w>=5 && d>=5 && h>=3)window.massBoxes.push({x,y,z,w,h,d,m,rx,ry,rz});");
source=source.replace(' corridorSidewalks({',' return {footprints:buildings,infill:group.userData.infillCount};\n corridorSidewalks({');
await fs.writeFile('shots/density/extract-env.js',source);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {const page=await browser.newPage();await page.goto('http://127.0.0.1:5193/shots/density/');const result=await page.evaluate(async()=>{window.massBoxes=[];const T=await import('/node_modules/three/build/three.module.js'); const {buildEnvironment}=await import('/shots/density/extract-env.js');const {layout,edges,roadWidth}=await import('/src/demo/network.js');const result=await buildEnvironment(new T.Scene(),layout);return {boxes:window.massBoxes,footprints:result.footprints,infill:result.infill,layout,roads:edges.map(e=>({...e,width:roadWidth(e)}))};});await fs.writeFile('shots/density/massing.json',JSON.stringify(result));console.log(JSON.stringify({boxes:result.boxes.length,footprints:result.footprints.length,infill:result.infill}));}finally{await browser.close();await server.close();}
