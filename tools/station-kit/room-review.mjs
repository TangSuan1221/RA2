import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'public/assets/station-rooms'),layout=JSON.parse(readFileSync(resolve(root,'src/world/placements/station-rooms.json')));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setViewport({width:820,height:480});const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'){console.error(m.text());errors.push(m.text())}});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.status()+' '+r.url())});
 const url=process.env.STATION_URL||'http://127.0.0.1:5186/station.html';
 await page.goto(url+'?art=1&shot=room-workshop',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForSelector('body[data-art-ready=true]',{timeout:180000});
 const count=await page.evaluate(()=>+document.body.dataset.roomItems);if(count!==layout.objects.length)throw Error('未加载所有放置件 '+count);
 const shots=[];
 for(const r of layout.rooms){
  await page.evaluate(id=>{location.hash='room-'+id},r.id);
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done)))));
  let data=await page.screenshot({type:'jpeg',quality:86});writeFileSync(resolve(out,r.id+'.jpg'),data);
  shots.push({title:r.title,data:Buffer.from(data).toString('base64')});
 }
 const sheet=await browser.newPage();await sheet.setViewport({width:1200,height:1115});
 await sheet.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#233329;color:#f4f1e5;font:16px system-ui}main{display:grid;grid-template-columns:repeat(3,400px)}figure{margin:0;position:relative}img{width:400px;height:221px;display:block;object-fit:cover}figcaption{position:absolute;bottom:7px;left:8px;background:#15241dde;padding:3px 9px}</style><main>'+shots.map(s=>'<figure><img src="data:image/jpeg;base64,'+s.data+'"><figcaption>'+s.title+'</figcaption></figure>').join('')+'</main>');
 await sheet.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await sheet.screenshot({path:resolve(out,'interiors.jpg'),type:'jpeg',quality:91});
 console.log('放置件',count,'房间截图',shots.length,'错误',errors);
 if(errors.filter(s=>!s.includes('favicon')&&!s.includes('404 (Not Found)')).length)throw Error(errors.join('\n'));
}finally{await browser.close()}
