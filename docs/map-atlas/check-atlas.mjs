import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage();await page.setViewport({width:1600,height:1100});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
  await page.screenshot({path:path.join(dir,'viewer-preview.png')});
  const count=await page.$$eval('article',a=>a.length);
  await page.type('#search','港湾医疗');
  const filtered=await page.$$eval('article:not([hidden])',a=>a.map(x=>x.textContent));
  const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
  const svgFailures=[];
  for(const sheet of manifest){
    const xml=await readFile(path.join(dir,sheet.svg),'utf8');
    const valid=await page.evaluate(x=>!new DOMParser().parseFromString(x,'image/svg+xml').querySelector('parsererror'),xml);
    if(!valid)svgFailures.push(sheet.id);
  }
  const report={cards:count,searchPass:filtered.length===1&&filtered[0].includes('T1-02'),svgCount:manifest.length,svgFailures,pageErrors:errors};
  if(count!==33||!report.searchPass||svgFailures.length||errors.length)throw Error(JSON.stringify(report));
  await writeFile(path.join(dir,'viewer-check.json'),JSON.stringify(report,null,2));console.log(report);
} finally {await browser.close();}
