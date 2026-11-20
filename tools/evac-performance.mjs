import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist'],defaultViewport:{width:1600,height:900}});
const rows=[];
try {
  const page=await browser.newPage();
  let errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('pageerror',e=>errors.push(e.message));
  for (const key of ['home','underground','rail','power','corridor','overview']) {
    errors=[];
    await page.goto('http://127.0.0.1:5190/?scene=evac&review='+key,{waitUntil:'networkidle2'});
    await page.waitForFunction(()=>window.demoMetrics?.environmentReady);
    const results = await page.evaluate(async()=>{
      const canvas=document.querySelector('#game canvas');
      const gl=canvas.getContext('webgl2');
      const driver=gl.getExtension('WEBGL_debug_renderer_info');
      const intervals=[];
      let previous=await new Promise(requestAnimationFrame);
      for(let i=0;i<100;i++){
        const now=await new Promise(requestAnimationFrame);
        if(i>=10)intervals.push(now-previous);
        previous=now;
      }
      intervals.sort((a,b)=>a-b);
      return {drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpu:driver?gl.getParameter(driver.UNMASKED_RENDERER_WEBGL):null,median:intervals[45],p95:intervals[85],...window.demoMetrics};
    });
    rows.push({key,...results,errors});
    console.log(key,results.p95,errors.length);
  }
} finally {
  await browser.close();
  await fs.writeFile('shots/evac/performance.json',JSON.stringify(rows,null,2));
}
