import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Render the exported GLBs with orthographic cameras on the same frames as the source plate.
export async function compareReferences(page,url,dest){
 await page.goto(url+'/assets/station-kit/index.html',{waitUntil:'networkidle0'});
 const result=await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');
 const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
 const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setClearColor(0x888888,0);renderer.toneMapping=T.NoToneMapping;
 const pm=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pm.fromScene(room,.04);
 const scene=new T.Scene();scene.environment=env.texture;scene.environmentIntensity=.6;
 scene.add(new T.HemisphereLight(0xffffff,0xeeeeee,1.6));
 const key=new T.DirectionalLight(0xffffff,1.15);key.position.set(-2,4,4);scene.add(key);
 const src=new Image();src.src='concept.png';await src.decode();
 const plate=document.createElement('canvas');plate.width=1086;plate.height=1448;
 const ctx=plate.getContext('2d');ctx.drawImage(src,0,0);
 const output=document.createElement('canvas');output.width=1280;output.height=1140;
 const paint=output.getContext('2d');paint.fillStyle='#eeece5';paint.fillRect(0,0,1280,1140);
 const config=[
 ['watch-desk','值班台',[[13,13,393,336],[456,13,632,337],[699,68,1068,295]]],
 ['pump-test-bench','试泵台',[[25,371,378,713],[445,371,645,713],[703,444,1064,638]]],
 ['hose-cart','水带推车',[[40,739,360,1069],[425,740,665,1065],[746,738,1020,1028]]],
 ['south-shutter','南卷门',[[30,1098,371,1435],[515,1098,589,1435],[712,1243,1063,1315]]]
 ];
 const metrics=[],sheets={};
 for(let row=0;row<config.length;row++){
 const [id,title,boxes]=config[row];const g=(await new GLTFLoader().loadAsync('models/'+id+'.glb')).scene;
 scene.add(g);const bounds=new T.Box3().setFromObject(g,true),size=bounds.getSize(new T.Vector3()),mid=bounds.getCenter(new T.Vector3());
 const strip=document.createElement('canvas');strip.width=960;strip.height=260;const st=strip.getContext('2d');st.fillStyle='#e8e7e1';st.fillRect(0,0,960,260);
 for(let v=0;v<3;v++){
 const [x,y,r,b]=boxes[v],w=r-x,h=b-y;const wide=[size.x,size.z,size.x][v],high=[size.y,size.y,size.z][v];
 const cam=new T.OrthographicCamera(-wide/2,wide/2,high/2,-high/2,.001,100);
 if(v===2)cam.up.set(0,0,-1);
 cam.position.copy(mid).add([new T.Vector3(0,0,12),new T.Vector3(12,0,0),new T.Vector3(0,12,0)][v]);cam.lookAt(mid);
 renderer.setSize(w,h);renderer.render(scene,cam);
 const ref=ctx.getImageData(x,y,w,h);const probe=document.createElement('canvas');probe.width=w;probe.height=h;const pc=probe.getContext('2d');pc.drawImage(renderer.domElement,0,0);
 const model=pc.getImageData(0,0,w,h).data;
 // The reference background is a neutral gray gradient. Classify its connected exterior only.
 const bg=new Uint8Array(w*h),queue=[];function visit(i){if(i<0||i>=bg.length||bg[i])return;const j=i*4,R=ref.data[j],G=ref.data[j+1],B=ref.data[j+2];if(Math.max(R,G,B)-Math.min(R,G,B)<12&&G>=105&&G<=171){bg[i]=1;queue.push(i)}}
 for(let i=0;i<w;i++){visit(i);visit((h-1)*w+i)}for(let i=0;i<h;i++){visit(i*w);visit(i*w+w-1)}
 for(let j=0;j<queue.length;j++){const i=queue[j];if(i%w)visit(i-1);if(i%w<w-1)visit(i+1);visit(i-w);visit(i+w)}
 let both=0,either=0;for(let i=0;i<bg.length;i++){const a=!bg[i],b=model[i*4+3]>127;if(a||b)either++;if(a&&b)both++;}
 metrics.push({id,view:['front','side','top'][v],framedMaskIoU:+(both/either).toFixed(3)});
 const name=['正面','侧面','顶面'][v],scale=Math.min(197/w,212/h),ww=w*scale,hh=h*scale;
 for(let k=0;k<2;k++){let dx=12+(v*2+k)*211+(198-ww)/2,dy=row*285+44+(212-hh)/2;
 paint.fillStyle='#898989';paint.fillRect(dx,dy,ww,hh);if(k===0)paint.drawImage(src,x,y,w,h,dx,dy,ww,hh);else paint.drawImage(renderer.domElement,dx,dy,ww,hh);
 paint.font='14px sans-serif';paint.fillStyle='#294038';paint.fillText(name+' · '+(k?'GLB':'原图'),12+(v*2+k)*211,row*285+275);}
 const sf=Math.min(294/w,219/h);st.drawImage(renderer.domElement,320*v+(320-w*sf)/2,(230-h*sf)/2,w*sf,h*sf);
 st.fillStyle='#26372e';st.font='15px sans-serif';st.fillText(name,320*v+143,251);
 }
 paint.font='bold 18px sans-serif';paint.fillText(title,12,row*285+25);
 sheets[id]=strip.toDataURL('image/png').split(',')[1];scene.remove(g);
 }
 for(const id of ['cart-empty','cart-loaded','shutter-half','shutter-open']){
  const model=(await new GLTFLoader().loadAsync('models/'+id+'.glb')).scene;scene.add(model);
  const box=new T.Box3().setFromObject(model,true),mid=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=260;const context=canvas.getContext('2d');context.fillStyle='#e8e7e1';context.fillRect(0,0,960,260);
  for(let v=0;v<3;v++){
   const w=[size.x,size.z,size.x][v],h=[size.y,size.y,size.z][v],height=Math.max(h,w/1.4)*1.08;
   const cam=new T.OrthographicCamera(-height*.7,height*.7,height*.5,-height*.5,.001,100);
   if(v===2)cam.up.set(0,0,-1);cam.position.copy(mid).add([new T.Vector3(0,0,12),new T.Vector3(12,0,0),new T.Vector3(0,12,0)][v]);cam.lookAt(mid);
   renderer.setSize(308,220);renderer.render(scene,cam);context.drawImage(renderer.domElement,320*v+6,3);
   context.fillStyle='#26372e';context.font='15px sans-serif';context.fillText(['正面','侧面','顶面'][v],320*v+143,251);
  }
  sheets[id]=canvas.toDataURL('image/png').split(',')[1];scene.remove(model);
 }
 return {metrics,sheets,comparison:output.toDataURL('image/jpeg',.94).split(',')[1]};
 });
 writeFileSync(join(dest,'reference-comparison.jpg'),Buffer.from(result.comparison,'base64'));
 for(const [id,data] of Object.entries(result.sheets))writeFileSync(join(dest,'views',id+'.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="260"><image width="960" height="260" href="data:image/png;base64,'+data+'"/></svg>');
 writeFileSync(join(dest,'reference-check.json'),JSON.stringify(result.metrics,null,2));
}
