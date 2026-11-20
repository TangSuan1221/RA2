import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist'],defaultViewport:{width:1600,height:900,deviceScaleFactor:1}});
try{
const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto('http://127.0.0.1:5188/?scene=evac',{waitUntil:'networkidle2'});await p.waitForSelector('#interact');await new Promise(r=>setTimeout(r,2500));
const audit=await p.evaluate(async()=>{
const {shortest,state,stops}=await import('/src/demo/network.js');let combinations=0,legs=0;const failures=[];
for(const mode of ['轿车','卡车','摩托','步行'])for(let bits=0;bits<8;bits++){Object.assign(state,{bridge:!!(bits&1),clear:!!(bits&2),tide:!!(bits&4)});combinations++;for(let i=1;i<stops.length;i++){legs++;if(!shortest(stops[i-1][0],stops[i][0],mode))failures.push({mode,bits,i})}}
Object.assign(state,{bridge:false,clear:false,tide:false});return {combinations,legs,failures}});
await p.addStyleTag({content:'#panel,aside,footer{display:none!important}'});await p.screenshot({path:'shots/evac/'+(process.argv[2]||'spawn')+'.jpg',quality:90});const frame=await p.evaluate(()=>new Promise(resolve=>{let a=[],last=performance.now();function sample(t){a.push(t-last);last=t;if(a.length<120)requestAnimationFrame(sample);else{a.shift();a.sort((x,y)=>x-y);resolve({medianFrameMs:a[59],p95FrameMs:a[113]})}}requestAnimationFrame(sample)}));
const report={audit,frame,errors,scene:await p.evaluate(()=>window.demoMetrics||null)};console.log(JSON.stringify(report));await fs.writeFile('shots/evac/'+(process.argv[2]||'spawn')+'.json',JSON.stringify(report,null,2));
}finally{await b.close()}
