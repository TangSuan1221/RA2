import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist'],defaultViewport:{width:1080,height:608,deviceScaleFactor:1}});
const dir='shots/evac/inspection/southern';
const jobs=[
 ['17a','radio'],['17b','radio-gate'],['17c','radio-roof'],
 ['18a','power&power=off'],['18b','power&power=on'],
 ['19a','shops'],...[2,3,4,5,6].map((i)=>['19'+String.fromCharCode(96+i),'store-'+i]),
 ['20','tunnel'],['21','corridor']
];
const results=[];
try{
 await mkdir(dir,{recursive:true});
 const selected=process.argv[2]?jobs.filter(([id])=>id.startsWith(process.argv[2])):jobs;
 const page=await browser.newPage(); let errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const [id,key] of selected){
  for(let tries=0;tries<3;tries++)try{
   errors=[];await page.goto('http://127.0.0.1:5188/?scene=evac&review='+key,{waitUntil:'networkidle2',timeout:60000});
   await page.waitForFunction(()=>window.demoMetrics?.environmentReady,{timeout:60000});
   if(errors.length)throw new Error(key+' render failed: '+errors.join('\n'));
   await page.screenshot({path:dir+'/'+id+'.jpg',quality:90});
   results.push({id,key,...await page.evaluate(()=>window.demoMetrics),errors});console.log(id,errors);break;
  }catch(e){if(tries===2)throw e;}
 }
 await writeFile(dir+'/run'+(process.argv[2]||'')+'.json',JSON.stringify(results,null,2));
}finally{await browser.close()}
