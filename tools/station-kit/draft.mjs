import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {designs,palette} from './designs.mjs';
import './catalog.mjs';
import './specials.mjs';
import './details.mjs';
import './variants.mjs';
export const out=resolve(import.meta.dirname,'../../public/assets/station-kit');
const views=['front','right','top'];
const plane={front:['x','y','w','h'],right:['z','y','d','h'],top:['x','z','w','d']};
const scale={x:0,y:1,z:2,w:0,h:1,d:2};
const round=v=>Math.round(v*1e7)/1e7;
function sheet(plan){
 const cells=views.map((view,i)=>{
  const [ax,ay]=plane[view], sorted=[...plan.parts].sort((a,b)=>{const depth=p=>view==='front'?p.top[1]:view==='right'?p.front[0]:p.front[1];return depth(a)-depth(b)});
  const boxes=sorted.map(p=>{const [x,y,w,h]=p[view];const sin=Math.abs(Math.sin(p.angle)),cos=Math.abs(Math.cos(p.angle));
   return {x,y,w:view==='front'?w*cos+h*sin:view==='top'?w*cos+p.front[3]*sin:w,h:view==='front'?h*cos+w*sin:view==='right'?h*cos+p.front[2]*sin:h}});
  const loX=Math.min(...boxes.map(v=>v.x-v.w/2)),hiX=Math.max(...boxes.map(v=>v.x+v.w/2));
  const loY=Math.min(...boxes.map(v=>v.y-v.h/2)),hiY=Math.max(...boxes.map(v=>v.y+v.h/2));
  const factor=Math.min(235/Math.max(...views.flatMap(k=>plan.parts.map(p=>p[k][2]))),230/(hiX-loX),158/(hiY-loY),158/Math.max(...plan.size));
  const shapes=sorted.map(p=>{const [x,y,w,h]=p[view],cx=128+(view==='right'?-1:1)*(x-(loX+hiX)/2)*factor,cy=102+(view==='top'?1:-1)*(y-(loY+hiY)/2)*factor;
   const axis={front:'z',right:'x',top:'y'}[view],circular=p.shape==='oval'||p.shape.endsWith(axis);
   const style='fill="'+(p.material==='glass'?'#aec8ca':palette[p.material])+'" stroke="#292f32" stroke-width=".55"';
   if(circular)return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+w*factor/2+'" ry="'+h*factor/2+'" '+style+'/>'+(p.shape.startsWith('ring')?'<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+w*factor*.34+'" ry="'+h*factor*.34+'" fill="#e8e7e1"/>':'');
   return '<rect x="'+(cx-w*factor/2)+'" y="'+(cy-h*factor/2)+'" width="'+w*factor+'" height="'+h*factor+'" transform="rotate('+(-p.angle*180/Math.PI*(view==='front'?1:0))+' '+cx+' '+cy+')" '+style+'/>';
  }).join('');
  return '<g transform="translate('+i*256+' 0)"><path d="M0 0V218" stroke="#c0c3bd"/>'+shapes+'<text x="128" y="206" text-anchor="middle">'+['正视','右视','俯视'][i]+' · '+ax.toUpperCase()+ay.toUpperCase()+'</text></g>';
 }).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="258" viewBox="0 0 768 258"><rect width="768" height="258" fill="#e8e7e1"/><g font-family="sans-serif" font-size="13" fill="#263132">'+cells+'<text x="16" y="244">'+plan.label+'  /  '+plan.id+'  ·  '+plan.size.join(' × ')+' m</text></g></svg>';
}
export function draft(){
 const ids=new Set(),plans=[];
 for(const sub of ['views','models'])mkdirSync(join(out,sub),{recursive:true});
 for(const {parts,...asset} of designs){
  if(ids.has(asset.id))throw Error('duplicate '+asset.id);ids.add(asset.id);
  const plan={...asset,parts:parts.map(p=>{
   const result={part:p.name,shape:p.shape,material:p.mat,angle:p.angle};
   for(const view of views)result[view]=plane[view].map(key=>round(p[key]*asset.size[scale[key]]));
   return result;
  })};plans.push(plan);
  writeFileSync(join(out,'views',asset.id+'.svg'),sheet(plan));
 }
 writeFileSync(join(out,'projections.json'),JSON.stringify(plans));return plans;
}


