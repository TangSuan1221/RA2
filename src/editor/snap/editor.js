import {sets} from './catalog.js';
import {context} from './context.js';
import {config,resolvePolicy} from './config.js';
import {snap} from './solver.js';
import bundled from '../../world/placements/saved.json';
const $=id=>document.getElementById(id),canvas=document.querySelector('canvas'),pen=canvas.getContext('2d');
const scene=new URLSearchParams(location.search).get('scene')||'lab',set=sets[scene]??sets.lab;
$('scene').value=scene;$('scene').onchange=e=>location.search='?scene='+e.target.value;
$('back').href=scene==='world'?'/?scene=evac':scene==='station'?'/station.html':'/review.html';
let data=bundled,revision=null;
try{const r=await fetch('/api/placements');const v=await r.json();data=v.data;revision=v.revision}catch{}
const objects=set.objects.map(o=>({...structuredClone(o),...data[scene]?.[o.id]}));
const drafts=new Map();let selected=objects[0],step=1,grid=true,chunks=false,drag=false;
for(const o of objects)$('object').add(new Option(o.name,o.id));
for(const k of ['x','y','z','yaw']){
 const label=document.createElement('label');label.textContent=k.toUpperCase()+(k==='yaw'?' ° ':' m ');
 const input=document.createElement('input');input.type='number';input.step='any';input.id=k;label.append(input);$('fields').append(label);
 input.onchange=()=>preview();
}
function effective(o){return drafts.get(o.id)?.object??o}
function options(o){const p=resolvePolicy(o);$('profile').value=p.profile;$('angle').value=p.angleStep??'';$('offset').value=p.yOffset;$('off').checked=p.allowOffGrid}
function select(o){
 selected=o;$('object').value=o.id;const v=effective(o);options(v);
 for(const k of ['x','y','z','yaw'])$(k).value=v.transform[k];
 status();draw();
}
$('object').onchange=e=>select(objects.find(o=>o.id===e.target.value));
function status(){
 const d=drafts.get(selected.id);
 $('status').textContent='步长 '+config.stepsMeters[step]+' m · '+(d?d.res.kind+(d.res.anchorId?' / '+d.res.anchorId:''):'已载入原位')+'\n'+(d?.res.issues.map(i=>i.code+' · '+i.message).join('\n')??'');
}
function evaluate(obj,t,keys={}){
 const policy=resolvePolicy(obj);
 return snap({object:obj,current:t,pointer:t,policy,layer:'ped',step:config.stepsMeters[step],ctrl:keys.ctrlKey,shift:keys.shiftKey,alt:keys.altKey},context(set,objects.map(effective),obj));
}
function draft(o,obj,res){
 obj.transform=res.transform;
 drafts.set(o.id,{object:obj,res,checked:res.valid});
}
function preview(keys={}){
 const obj={...selected,profile:$('profile').value,policyOverride:{angleStep:$('angle').value===''?null:+$('angle').value,allowOffGrid:$('off').checked,yOffset:+$('offset').value}};
 const t=Object.fromEntries(['x','y','z','yaw'].map(k=>[k,+$(k).value]));
 const res=evaluate(obj,t,keys);draft(selected,obj,res);select(selected);changes();
}
$('profile').onchange=()=>{options({...selected,profile:$('profile').value,policyOverride:{}});preview()};
for(const id of ['angle','offset','off'])$(id).onchange=()=>preview();
function changes(){
 const list=$('changes');list.replaceChildren();
 for(const [id,d] of drafts){
  const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.disabled=!d.res.valid;check.checked=d.checked;
  check.onchange=()=>{d.checked=check.checked;changes()};
  const base=objects.find(o=>o.id===id).transform;
  const diff=['x','y','z','yaw'].filter(k=>base[k]!==d.object.transform[k]).map(k=>k+' '+base[k]+' → '+Number(d.object.transform[k].toFixed(4)));
  const current=objects.find(o=>o.id===id);
  if(!diff.length&&!d.res.issues.length&&current.profile===d.object.profile&&JSON.stringify(current.policyOverride)===JSON.stringify(d.object.policyOverride)){d.checked=false;continue}
  label.append(check,d.object.name+' '+(diff.join('，')||'坐标相同')+(d.res.issues.length?' · '+d.res.issues.map(i=>i.code).join(', '):''));list.append(label);
 }
 $('save').disabled=!revision||![...drafts.values()].some(d=>d.checked&&d.res.valid);
}
$('migrate').onclick=()=>{for(const o of objects){if(drafts.has(o.id))continue;const obj=structuredClone(o);draft(o,obj,evaluate(obj,obj.transform))}select(selected);changes()};
$('save').onclick=async()=>{
 const changes=[...drafts.values()].filter(d=>d.checked&&d.res.valid).map(d=>d.object);
 try{const r=await fetch('/api/placements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene,base:revision,changes})});const v=await r.json();if(!r.ok)throw Error(v.error);location.reload()}catch(e){$('status').textContent=e.message}
};
function view(){
 const [a,b,c,d]=set.bounds,scale=Math.min(canvas.clientWidth/(b-a+2),canvas.clientHeight/(d-c+2));
 return {scale,x:canvas.clientWidth/2-(a+b)/2*scale,z:canvas.clientHeight/2-(c+d)/2*scale};
}
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio;canvas.width=w*dpr;canvas.height=h*dpr;
 const {scale,x,z}=view();pen.setTransform(dpr*scale,0,0,dpr*scale,dpr*x,dpr*z);
 const [a,b,c,d]=set.bounds;
 for(const [l,r,n,s,y] of set.supports){pen.fillStyle=y>0?'#3c5050':'#304042';pen.fillRect(l,n,r-l,s-n)}
 for(const spacing of [config.stepsMeters[step],4]){
  if(spacing===4?!chunks:!grid)continue;
  pen.strokeStyle=spacing===4?'#bca577':'#506062';pen.lineWidth=1/scale;pen.beginPath();
  for(let i=Math.ceil(a/spacing)*spacing;i<=b;i+=spacing){pen.moveTo(i,c);pen.lineTo(i,d)}
  for(let i=Math.ceil(c/spacing)*spacing;i<=d;i+=spacing){pen.moveTo(a,i);pen.lineTo(b,i)}pen.stroke();
 }
 for(const [, ,ax,,az] of set.anchors){pen.strokeStyle='#75cffa';pen.lineWidth=2/scale;pen.strokeRect(ax-.33,az-.33,.66,.66)}
 for(const o of objects){const obj=effective(o),r=drafts.get(o.id)?.res,t=obj.transform;
  pen.save();pen.translate(t.x,t.z);pen.rotate(-t.yaw*Math.PI/180);pen.fillStyle=r?(r.valid?r.issues.length?'#f0bf60':'#67c68a':'#e87366'):'#adbeb4';pen.fillRect(-o.footprint.w/2,-o.footprint.d/2,o.footprint.w,o.footprint.d);
  if(o===selected){pen.strokeStyle='#fff';pen.lineWidth=2/scale;pen.strokeRect(-o.footprint.w/2,-o.footprint.d/2,o.footprint.w,o.footprint.d)}pen.restore();
  pen.font=12/scale+'px sans-serif';pen.fillStyle='#fff';if(objects.length<20||o===selected||!o.id.startsWith('wall/'))pen.fillText(o.name,t.x+.25,t.z-.28);
 }
}
function coords(e){const r=canvas.getBoundingClientRect(),v=view();return {x:(e.clientX-r.left-v.x)/v.scale,z:(e.clientY-r.top-v.z)/v.scale}}
canvas.onpointerdown=e=>{const p=coords(e);let nearest=null,dist=Infinity;for(const o of objects){const t=effective(o).transform,d=Math.hypot(t.x-p.x,t.z-p.z);if(d<Math.max(.8,o.footprint.w/2)&&d<dist){dist=d;nearest=o}}if(nearest)select(nearest);drag=true;canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(drag){const p=coords(e);$('x').value=p.x;$('z').value=p.z;preview(e)}};
canvas.onpointerup=canvas.onpointercancel=()=>drag=false;
window.onkeydown=e=>{if(['INPUT','SELECT'].includes(document.activeElement.tagName))return;
 if(e.code==='KeyG')grid=!grid;if(e.code==='KeyC')chunks=!chunks;
 if(e.key==='['||e.key===']')step=Math.max(0,Math.min(3,step+(e.key===']'?1:-1)));
 if(['KeyQ','KeyE'].includes(e.code)){$('yaw').value=+$('yaw').value+(e.code==='KeyE'?1:-1)*($('profile').value==='structural'?90:5);preview(e)}
 if(e.code==='KeyF')preview(e);status();draw();
};
new ResizeObserver(draw).observe(canvas);select(selected);changes();
