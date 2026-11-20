import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
const [url,out='shots/continuation/exteriors/diagnostic.jpg']=process.argv.slice(2);
console.log('launch');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:90000,args:['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-angle=d3d11','--ignore-gpu-blocklist'],defaultViewport:{width:1600,height:900}});
console.log('browser',browser.process().pid);
const page=await browser.newPage();const logs=[];
await page.evaluateOnNewDocument(()=>{
 const NativeWebSocket=window.WebSocket;
 window.WebSocket=class {
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url,protocol){if(protocol!=='vite-hmr')return new NativeWebSocket(url,protocol);this.readyState=0;this.url=url;}
  addEventListener(){}removeEventListener(){}send(){}close(){}
 };
});
page.on('console',m=>{if(m.type()==='error'||m.type()==='warn'){logs.push(m.text());console.log(m.type(),m.text().slice(0,250));}});
page.on('pageerror',e=>{logs.push(e.message);console.log('error',e.message);});
await mkdir('shots/continuation/exteriors',{recursive:true});
try {
 await page.goto(url+'&ui=0',{waitUntil:'domcontentloaded',timeout:60000});console.log('DOM');
 for(let i=0;i<120;i++){
  await new Promise(r=>setTimeout(r,2000));
  const state=await page.evaluate(()=>({ready:window.__ready,error:window.__error,phase:window.__phase,loading:document.querySelector('#loading')?.textContent,stats:window.__stats,app:!!window.__app}));
  console.log(JSON.stringify(state));
  if(state.ready||state.error){await page.screenshot({path:out});await writeFile(out+'.json',JSON.stringify({state,logs},null,2));break;}
 }
}finally{await browser.close();}
