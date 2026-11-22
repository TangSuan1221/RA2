import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const list=JSON.parse(document.querySelector('#data').textContent);
const $=q=>document.querySelector(q), base=new URL('.',location.href),loader=new GLTFLoader();
const groups=$('#groups'),search=$('#search'),items=$('#items'),stage=$('#stage');
for(const name of new Set(list.map(x=>x.group)))groups.add(new Option(name,name));
let renderer,camera,scene,controls,model,token=0,selected;
function setup(){
 if(renderer)return;
 renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.toneMapping=T.ACESFilmicToneMapping;stage.appendChild(renderer.domElement);
 scene=new T.Scene();scene.background=new T.Color(0xc2c5c0);
 const env=new RoomEnvironment(),pm=new T.PMREMGenerator(renderer);scene.environment=pm.fromScene(env,.04).texture;env.dispose();pm.dispose();
 const key=new T.DirectionalLight(0xfff2dc,2.0);key.position.set(3,5,4);scene.add(key);
 scene.add(new T.HemisphereLight(0xffffff,0x909893,1.5));
 camera=new T.PerspectiveCamera(34,1,.001,1000);controls=new OrbitControls(camera,renderer.domElement);
 controls.addEventListener('change',()=>renderer.render(scene,camera));
 new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.render(scene,camera)}).observe(stage);
}
function dispose(obj){if(!obj)return;const unique=new Set();obj.traverse(n=>{if(n.isMesh){unique.add(n.geometry);for(const m of [n.material].flat()){unique.add(m);if(m.map)unique.add(m.map)}}});for(const item of unique){item.dispose();if(item.isTexture)item.source.data?.close?.()}obj.removeFromParent()}
async function show(asset,bytes){
 selected=asset;const ticket=++token;$('#name').textContent=asset.label;$('#meta').textContent=asset.group+' · '+asset.id+' · '+asset.measured.join(' × ')+' m';
 $('#drawing').src=asset.view;$('#download').href=asset.model;$('#download').download=asset.id+'.glb';
 drawList();
 if(!bytes&&location.protocol==='file:'){$('#status').textContent='选择本地 GLB 可旋转查看';return}
 try{setup();let gltf=bytes?await loader.parseAsync(bytes,''):await loader.loadAsync(new URL(asset.model,base).href);
 if(ticket!==token){dispose(gltf.scene);return}
 renderer.toneMappingExposure=['watch-desk','pump-test-bench','hose-cart','south-shutter','cart-loaded','cart-empty','shutter-open','shutter-half'].includes(asset.id)?.78:1;
 dispose(model);model=gltf.scene;scene.add(model);const box=new T.Box3().setFromObject(model,true),size=box.getSize(new T.Vector3()),mid=box.getCenter(new T.Vector3());
 const radius=size.length()/2,aspect=stage.clientWidth/stage.clientHeight;
 const dist=radius/Math.sin(T.MathUtils.degToRad(17))*Math.max(1,1/aspect)*1.04;
 camera.position.copy(mid).add(new T.Vector3(1,.59,1.4).normalize().multiplyScalar(dist));controls.target.copy(mid);camera.near=Math.max(.0001,dist/300);camera.far=dist*18;camera.updateProjectionMatrix();controls.update();
 renderer.render(scene,camera);$('#status').textContent='';
 }catch(e){$('#status').textContent='模型读取失败 · '+e.message;throw e}
}
function drawList(){let filtered=list.filter(a=>(!groups.value||a.group===groups.value)&&(a.id+a.label).toLowerCase().includes(search.value.trim().toLowerCase()));
 $('#count').textContent=filtered.length+' / '+list.length;items.replaceChildren(...filtered.map(a=>{const b=document.createElement('button');b.textContent=a.label;b.title=a.id;b.className=a===selected?'selected':'';b.onclick=()=>show(a);return b}))}
groups.onchange=drawList;search.oninput=drawList;$('#local').onchange=async e=>{const f=e.target.files[0];if(!f)return;const a=list.find(x=>x.id===f.name.replace(/\.glb$/i,''));if(a)await show(a,await f.arrayBuffer());else $('#status').textContent='请选择本资产库中的 GLB 文件'};
const first=list.find(a=>a.id===location.hash.slice(1))||list[0];show(first);
