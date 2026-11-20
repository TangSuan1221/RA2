import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import {reviewShots} from '../src/demo/review-shots.js';

const destination='shots/evac/inspection';
const ids=['01','06','07','08','09','13','14','15','16','17','18','19','20','21'];
await fs.mkdir(destination,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist'],defaultViewport:{width:1200,height:675,deviceScaleFactor:1}});
const rows=[];const assets=new Set();
try {
 const page=await browser.newPage();
 let errors=[];page.on('request',request=>{const path=new URL(request.url()).pathname;if(/^\/assets\/(hdri|textures|models|evac-art)\//.test(path))assets.add(path)});page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('pageerror',error=>errors.push(String(error)));
 for(const [i,key] of Object.keys(reviewShots).entries()){
  if(process.argv[2]&&process.argv[2]!==key)continue;
  errors=[];
  await page.goto((process.env.EVAC_REVIEW_URL||'http://127.0.0.1:5190')+'/?scene=evac&review='+key,{waitUntil:'networkidle2',timeout:60000});
  await page.waitForFunction(()=>window.demoMetrics?.environmentReady,{timeout:60000});
  await page.addStyleTag({content:'#panel,aside,footer{display:none!important}'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(errors.length)throw new Error(key+' render failed: '+errors.join('\n'));
  await page.screenshot({path:destination+'/'+ids[i]+'-'+key+'.jpg',quality:92});
  rows.push({id:ids[i],key,errors:[...errors],metrics:await page.evaluate(()=>window.demoMetrics)});
  console.log(ids[i],key);
 }
} finally {await browser.close();}
if(!process.argv[2])await fs.writeFile(destination+'/asset-paths.json',JSON.stringify([...assets].sort(),null,2));
let result=rows;
if(process.argv[2]){
 const saved=JSON.parse(await fs.readFile(destination+'/metrics.json','utf-8'));
 result=[...saved.filter(old=>!rows.some(row=>old.key===row.key)),...rows].sort((a,b)=>a.id.localeCompare(b.id));
}
await fs.writeFile(destination+'/metrics.json',JSON.stringify(result,null,2));


