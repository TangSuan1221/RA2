import puppeteer from 'puppeteer-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('docs/fire-station-mechanics/structure');
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.setViewport({width:1080,height:660});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.status()+' '+r.url());});
 await page.goto((process.env.STATION_URL || 'http://127.0.0.1:5188/station.html')+'?art=1&shot=front',{timeout:120000});
 await page.waitForSelector('body[data-art-ready=true]',{timeout:120000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.calls>0);
 const stats={};
 const views=['front','corner','rooftop','garage','workshop','quarters','foyer','passage','transom'];
 for(const shot of views){
  await page.evaluate(s=>{location.hash=s},shot);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))); 
  await page.screenshot({path:path.join(out,shot+'.jpg'),quality:92});
  stats[shot]=await page.$eval('canvas',c=>({...c.dataset}));
  stats[shot].renderer=await page.$eval('canvas',c=>{const gl=c.getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';});
  const timings=await page.evaluate(async()=>{
    const ticks=[];
    for(let i=0;i<61;i++)ticks.push(await new Promise(requestAnimationFrame));
    return ticks.slice(1).map((v,i)=>v-ticks[i]).sort((a,b)=>a-b);
  });
  stats[shot].frameMedianMs=+timings[29].toFixed(2);stats[shot].frameP95Ms=+timings[56].toFixed(2);
  console.log(shot,stats[shot]);
 }
 const sheet=await browser.newPage();
 const images=await Promise.all(views.map(async v=>'data:image/jpeg;base64,'+(await readFile(path.join(out,v+'.jpg'))).toString('base64')));
 await sheet.setViewport({width:1440,height:882});
 await sheet.setContent('<style>*{margin:0}body{display:grid;grid-template-columns:repeat(3,480px);background:#161616}img{width:480px;height:294px}</style>'+images.map(i=>'<img src="'+i+'">').join(''));
 await sheet.evaluate(()=>Promise.all(Array.from(document.images,i=>i.decode())));
 await sheet.screenshot({path:path.join(out,'overview.jpg'),quality:93});
 if(errors.filter(e=>!e.includes('favicon')&&!e.includes('404 (Not Found)')).length)throw Error(errors.join(' | ').slice(0,5000));
 await writeFile(path.join(out,'render-stats.json'),JSON.stringify(stats,null,2));
} finally {await browser.close()}
