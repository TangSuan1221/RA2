import {compareReferences} from './compare-references.mjs';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),dest=join(root,'public/assets/station-kit');
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const server=await createServer({root,configFile:false,server:{port:0,host:'127.0.0.1'},logLevel:'error'});
let browser;
try{
 await server.listen();const addr=server.httpServer.address();const url='http://127.0.0.1:'+addr.port;
 browser=await puppeteer.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
 const page=await browser.newPage();await page.setViewport({width:1180,height:810});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/assets/station-kit/index.html',{waitUntil:'networkidle0'});
 const audit=await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js'),{GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
 const items=JSON.parse(document.querySelector('#data').textContent),loader=new GLTFLoader(),report=[];
 for(const a of items){let g=await loader.loadAsync(a.model),box=new T.Box3().setFromObject(g.scene,true),size=box.getSize(new T.Vector3()).toArray();
 const delta=Math.max(...size.map((s,i)=>Math.abs(s-a.measured[i])));if(delta>.004||Math.abs(box.min.y)>.004||size.some(s=>!(s>0)))throw Error(a.id+' bounds '+JSON.stringify({size,delta,bottom:box.min.y}));
 let parts=0;const unique=new Set();g.scene.traverse(n=>{if(n.isMesh){parts++;unique.add(n.geometry);unique.add(n.material);unique.add(n.material.map)}});
 if(parts!==a.parts)throw Error(a.id+' parts');for(const x of unique){x?.dispose();if(x?.isTexture)x.source.data?.close?.()}
 report.push({id:a.id,parts,measured:size.map(v=>+v.toFixed(4))});}return report;
 });
 const hero=['watch-desk','pump-test-bench','hose-cart','south-shutter'],shots=[];
 for(const id of hero){await page.goto(url+'/assets/station-kit/index.html#'+id);await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#stage canvas')&&document.querySelector('#status').textContent==='');
 const stage=await page.$('#stage');const box=await stage.boundingBox(),w=Math.min(box.width,box.height*1.4);shots.push({id,png:await page.screenshot({encoding:'base64',clip:{x:box.x+(box.width-w)/2,y:box.y,width:w,height:box.height}})});}
 await page.setViewport({width:1100,height:840});await page.setContent('<style>*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:1fr 1fr;background:#e8e7df;font:16px system-ui;color:#23352e}figure{margin:0;border:1px solid #d9d9cf}img{width:100%;height:372px;object-fit:contain;background:#c2c5c0}figcaption{padding:9px 20px}</style>'+shots.map((v,i)=>'<figure><img src="data:image/png;base64,'+v.png+'"><figcaption>'+['值班台','双表试泵台','水带推车','南卷门'][i]+'</figcaption></figure>').join(''));await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:join(dest,'hero-render.jpg'),type:'jpeg',quality:90});if(errors.length)throw Error(errors.join('\n'));
 await compareReferences(page,url,dest);
 console.log('Verified '+audit.length+' independent GLTFLoader imports and bounds; four WebGL screenshots.');
} finally{await browser?.close();await server.close()}
