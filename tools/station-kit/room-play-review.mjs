import puppeteer from 'puppeteer-core';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.setViewport({width:420,height:300});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.STATION_URL||'http://127.0.0.1:5186/station.html';await page.setRequestInterception(true);
 page.on('request',async req=>{if(req.url().includes('/src/demo/station-greybox.js')&&req.resourceType()==='script'){
 const res=await fetch(req.url());await req.respond({status:res.status,contentType:'application/javascript',body:(await res.text())+'\nwindow.roomProbe={solids,blocked,nextHeight,nearby,p,keys};'});}else await req.continue()});
 await page.goto(url+'?play=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('body[data-art-ready=true]',{timeout:180000});await page.click('canvas');
 const result=await page.evaluate(async()=>{
 const canvas=document.querySelector('canvas'),prompt=document.querySelector('#prompt'),goal=document.querySelector('#goal'),q=window.roomProbe;
 const coord=()=>[q.p.x,q.p.z];
 function press(code,up=false){canvas.dispatchEvent(new KeyboardEvent(up?'keyup':'keydown',{key:code.slice(-1).toLowerCase(),code,bubbles:true}))}
 async function walk(code,done){for(let n=0;n<1100&&!done(coord());n++){press(code);await new Promise(requestAnimationFrame)}press(code,true);if(!done(coord()))throw Error('走位受阻 '+coord()+' 当前焦点 '+document.activeElement.tagName+' nextHeight '+q.nextHeight(q.p,q.p.x,q.p.z-.11)+' blocker '+q.solids.filter(m=>m.visible&&!q.blocked(q.p.x,0,q.p.z-.11,.32,.32,1.78,m)).map(m=>m.name).slice(0,5))}
 press('KeyN');await new Promise(requestAnimationFrame);let nav=prompt.textContent;
 let gateCheck=[9,8.8,8.6,8.4,8.2].map(z=>[z,q.blocked(14,0,z)]);console.log(gateCheck);
 await walk('KeyW',p=>p[1]<5.9);await walk('KeyD',p=>p[0]>17.4);
 canvas.dispatchEvent(new PointerEvent('pointermove',{buttons:1,movementX:262,bubbles:true}));
 await new Promise(requestAnimationFrame);press('KeyE');await new Promise(requestAnimationFrame);
 let order=goal.textContent;press('KeyR');await new Promise(requestAnimationFrame);
 return {pos:coord(),nav,order,ray:prompt.textContent,loaded:document.body.dataset.roomItems,gateCheck};
 });console.log(result,errors);assert.ok(result.order.includes('维修间'));assert.ok(result.nav.includes('路径'));assert.ok(result.ray.includes('命中')||result.ray.includes('射线'));assert.equal(errors.length,0);
}finally{await browser.close()}
