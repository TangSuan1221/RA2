import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.CAMERA_OUTPUT || 'docs/fire-station-mechanics/structure/camera');
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.setViewport({width:1470,height:700});
  await page.evaluateOnNewDocument(()=>{
    // Observe the actual game render through Three's inspector hook. The script
    // only reads the main framebuffer, camera and deformed character geometry.
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:scene})=>{
      if(!scene.isScene)return;
      scene.onAfterRender=(renderer,renderScene,camera)=>{
        if(renderer.getRenderTarget() || !window.requestedFrame || window.frameResult)return;
        const {state,below,above}=window.requestedFrame;
        const z=Number(document.querySelector('#position')?.textContent.match(/Z ([-.\d]+)/)?.[1]);
        if(!(z<=below && z>=above) || document.querySelector('#motion-status').textContent!==state)return;
        const vertices=[];
        scene.traverseVisible(mesh=>{
          if(!mesh.isSkinnedMesh)return;
          const v=mesh.position.clone();
          for(let i=0;i<mesh.geometry.attributes.position.count;i++){
            mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).project(camera);
            if(v.z < -1 || v.z > 1)continue;
            vertices.push([(1+v.x)/2,(1-v.y)/2]);
          }
        });
        if(!vertices.length)return;
        const top=vertices.reduce((y,p)=>Math.min(y,p[1]),Infinity);
        const bottom=vertices.reduce((y,p)=>Math.max(y,p[1]),-Infinity);
        const crown=vertices.filter(p=>p[1]<=top+.04).map(p=>p[0]);
        const metrics={headX:(Math.min(...crown)+Math.max(...crown))/2,topY:top,bottomY:bottom,
          visibleWidth:vertices.filter(p=>p[1]>=0&&p[1]<=1).reduce((a,p)=>[Math.min(a[0],p[0]),Math.max(a[1],p[0])],[1,0]),state,z};
        window.frameResult={data:renderer.domElement.toDataURL('image/jpeg',.95),metrics};
      };
    });
  });
  await page.goto(process.env.STATION_URL || 'http://127.0.0.1:5188/station.html?art=1',{timeout:120000});
  await page.waitForFunction(()=>document.body.dataset.artReady==='true'&&document.querySelector('#motion-status')?.textContent==='Idle_Loop',{timeout:120000});
  await page.click('canvas');
  const frames=[];
  async function capture(name,state,below,above){
    await page.evaluate(params=>{window.frameResult=null;window.requestedFrame=params;},{state,below,above});
    await page.waitForFunction(()=>!!window.frameResult,{timeout:30000});
    const frame=await page.evaluate(()=>{window.requestedFrame=null;const r=window.frameResult;window.frameResult=null;return r;});
    await writeFile(path.join(out,name+'.jpg'),Buffer.from(frame.data.split(',')[1],'base64'));
    console.log(name,frame.metrics);frames.push({name,...frame}); 
  }
  // Move along the south entrance axis. Repeat keydown as a physical held key
  // would, including while Chromium is transferring the preceding screenshot.
  async function hold(key,fn){
    await page.keyboard.down(key);
    const repeat=setInterval(()=>page.keyboard.down(key).catch(()=>{}),250);
    try {await fn();} finally {clearInterval(repeat);await page.keyboard.up(key);}
  }
  await capture('idle','Idle_Loop',100,-100);
  await hold('w',async()=>{
    await capture('walk','Walk_Loop',11.1,9.2);
    await capture('doorway','Walk_Loop',8.2,6.9);
  });
  const sheet=await browser.newPage();
  await sheet.setViewport({width:1470,height:266});
  await sheet.setContent('<style>*{margin:0}body{display:flex;color:#eee;background:#182024;font:15px system-ui}figure{width:490px}img{width:490px;height:auto;display:block}figcaption{padding:5px 9px}</style>'+frames.map((f,i)=>'<figure><img src="'+f.data+'"><figcaption>'+['站立','步行','进门'][i]+'</figcaption></figure>').join(''));
  await sheet.evaluate(()=>Promise.all(Array.from(document.images,i=>i.decode())));
  await sheet.screenshot({path:path.join(out,'overview.jpg'),quality:95});
  await writeFile(path.join(out,'measurements.json'),JSON.stringify(frames.map(({name,metrics})=>({name,...metrics})),null,2));
} finally {await browser.close();}
