import {designs,design,b,c,e,ring} from './designs.mjs';
function copy(asset,filter=()=>true,move=(p)=>p){return asset.parts.filter(filter).map(p=>move({...p}))}
function clone(from,id,label,transform){const a=designs.find(p=>p.id===from);const next={...a,id,label,parts:copy(a)};transform(next);designs.push(next)}
clone('south-shutter','shutter-half','南卷门半开 1.25 m',a=>{a.parts=a.parts.filter(p=>p.name!=='leaf-slat'||p.y*a.size[1]>=1.25);for(const p of a.parts)if(p.name==='bottom-seal')p.y=(1.25+p.h*a.size[1]/2)/a.size[1];
 const slats=a.parts.filter(p=>p.name==='leaf-slat');const pitch=(4.5-1.25)/slats.length;slats.forEach((p,i)=>{p.h=pitch/a.size[1];p.y=(1.25+(i+.5)*pitch)/a.size[1]});});
clone('south-shutter','shutter-open','南卷门全开 4.50 m',a=>{a.parts=a.parts.filter(p=>p.name!=='leaf-slat'&&p.name!=='bottom-seal')});
clone('hose-cart','cart-empty','空载推车',a=>{a.parts=a.parts.filter(p=>p.name!=='woven-hose')});
function attach(target,source,size,position,prefix){
 for(const p of source.parts){let v={...p,name:prefix+p.name};for(let i=0;i<3;i++){
 let k=['x','y','z'][i],s=['w','h','d'][i];v[k]=(p[k]*size[i]+position[i])/target.size[i];v[s]=p[s]*size[i]/target.size[i];}
 target.parts.push(v);}
}
clone('cart-empty','cart-loaded','装泵推车 1.50 m',a=>{
 const base=designs.find(d=>d.id==='pump-a');
 a.parts.push({name:'load-platform',shape:'box',mat:'iron',x:0,y:.81,z:0,w:.80,h:.039,d:.75,angle:0});
 for(const x of [-.38,.38])for(const z of [-.28,.28])a.parts.push({name:'rack-leg',shape:'box',mat:'iron',x,y:.53,z,w:.044,h:.56,d:.037,angle:0});
 attach(a,base,[.56,.52,.45],[0,.98,0],'cargo-');for(const p of a.parts){p.y*=1.18/1.50;p.h*=1.18/1.50}a.size=[.8,1.50,1.2];
});
for(const [id,label,equipment] of [['locker-ready','满装出勤柜',['helmet','coat','boots']],['locker-used','取走装备的柜',['boots']],['locker-personal','私人物品柜',['uniform','mug']]]){
 clone('turnout-locker',id,label,a=>{for(const item of equipment){let s=designs.find(d=>d.id===item);let y={helmet:1.60,coat:.70,boots:.07,uniform:.42,mug:1.60}[item];
 attach(a,s,item==='coat'?[.48,.73,.24]:s.size,[0,y,.02],item+'-')}});
}
design('shower-rail-set','淋浴帘与吊环','卫浴',[1,1.88,.072],()=>{c('rod','steel',0,.993,0,1,.014,.37,'x');for(let i=0;i<10;i++){ring('loop','white',-.45+i*.1,.969,0,.04,.052,.14);b('pleat','white',-.45+i*.1,.476,Math.sin(i)*.14,.103,.94,.25)}},'wall');

for(const id of ['engine','ambulance']){
 const a=designs.find(d=>d.id===id);
 const cab=designs.find(d=>d.id==='waiting-chair');
 for(const x of [-.61,.61])attach(a,cab,[.50,.92,.52],[x,.90,a.size[2]*.32],'cab-');
 for(const [name,m,x,y,z,w,h,d] of [['dashboard','black',0,.59,.455,.85,.09,.058],['partition','iron',0,.63,.213,.88,.42,.012],['rear-windscreen','glass',0,.66,-.476,.52,.15,.013],['plate','paper',0,.31,.508,.12,.05,.005]]){
 a.parts.push({name,mat:m,shape:'box',x,y,z,w,h,d,angle:0})}
 if(id==='engine'){for(let i=0;i<5;i++)a.parts.push({name:'pump-control',mat:'paper',shape:'cylx',x:.513,y:.63,z:-.36+i*.021,w:.014,h:.034,d:.014,angle:0})}
}
for(const id of ['engine','ambulance']){
 const a=designs.find(d=>d.id===id),cab=a.parts.find(p=>p.name==='cab');cab.y=.445;cab.h=.41;
 for(const [name,mat,x,y,z,w,h,d] of [['cab-roof',id==='engine'?'red':'white',0,.86,.338,.95,.04,.30],['pillar','iron',-.448,.743,.477,.035,.22,.016],['pillar','iron',.448,.743,.477,.035,.22,.016]]){
 a.parts.push({name,mat,shape:'box',x,y,z,w,h,d,angle:0})}
}
function decorate(id,recipe){
 const target=designs.find(d=>d.id===id);
 design('assembly-details','assembly details',target.group,target.size,recipe);
 target.parts.push(...designs.pop().parts);
}
decorate('watch-desk',()=>{
 for(const x of [-.46,-.24,.24,.46])for(const y of [.109,.53])c('pedestal-rivet','steel',x,y,.478,.007,.009,.009,'z');
 for(const x of [-.345,.345])for(const y of [.21,.39,.57]){
 b('nameplate-frame','steel',x,y,.49,.082,.033,.012);b('card','paper',x,y,.50,.068,.023,.009);}
 b('center-drawer','olive',0,.582,.30,.39,.063,.26);b('center-pull','steel',0,.576,.45,.10,.014,.024);
 e('hand-mic','black',-.417,.70,.12,.052,.081,.083);
 for(let i=0;i<6;i++)b('mic-grille','iron',-.417,.68+i*.008,.16,.029,.002,.009);
 for(let i=0;i<16;i++)ring('coiled-mic-lead','rubber',-.416+i*.008,.662,.15+.037*Math.sin(i*Math.PI/15),.012,.011,.033,'x');
 for(let i=0;i<9;i++)b('radio-vent','iron',-.333+i*.013,.788,-.10,.005,.003,.15);
 for(let i=0;i<8;i++)b('log-lines','gray',.285,.677,.0+i*.025,.124,.001,.002);
});
decorate('pump-test-bench',()=>{
 for(const x of [-.32,.32]){
 c('valve-body','brass',x,.57,0,.12,.063,.15,'x');c('spindle','brass',x,.606,.08,.019,.073,.046);
 ring('handwheel','red',x,.65,.08,.105,.016,.22,'y');b('valve-spoke','red',x,.65,.08,.083,.009,.023);
 c('gauge-connection','brass',x,.599,-.16,.028,.034,.39,'z');
 for(const z of [-.43,.43]){b('foot-pad','steel',Math.sign(x)*.43,.018,z,.093,.032,.12);c('anchor','iron',Math.sign(x)*.43,.038,z,.025,.016,.048);}
 }
 for(const x of [-.43,.43])b('end-brace','iron',x,.14,0,.048,.037,.88);
 for(const x of [-.185,.185]){
 c('rear-motor','iron',x,.68,-.21,.23,.19,.36,'z');
 for(let i=0;i<6;i++)c('motor-fin','iron',x,.68,-.37+i*.048,.24,.205,.024,'z');
 b('pump-tag','paper',x,.57,.21,.11,.047,.012);
 }
 b('test-manifold','brass',0,.56,-.32,.66,.027,.06);
});
for(const id of ['hose-cart','cart-empty','cart-loaded']){
 decorate(id,()=>{const s=id==='cart-loaded'?1.18/1.5:1;
 for(const z of [-.33,.33]){c('axle','iron',0,.145*s,z,.91,.05*s,.05,'x');
 for(const x of [-.31,.31])b('axle-hanger','iron',x,.215*s,z,.066,.16*s,.073);}
 for(const x of [-.445,.445])for(const z of [-.33,.33]){c('tire-sidewall','rubber',x*1.09,.145*s,z,.023,.278*s,.265,'x');c('hub-cap','steel',x*1.12,.145*s,z,.018,.125*s,.125,'x');}
 for(const x of [-.39,.39]){c('spool-hub','iron',x,.51*s,0,.09,.135*s,.13,'x');b('axle-upright','red',x,.39*s,0,.048,.28*s,.11);}
 if(id==='hose-cart'){c('outlet-coupling','steel',.26,.46*s,.294,.111,.088*s,.077,'z');c('hose-lumen','black',.26,.46*s,.338,.074,.063*s,.012,'z');}
 });
}
for(const id of ['south-shutter','shutter-half','shutter-open'])decorate(id,()=>{
 for(const x of [-.482,.482]){b('foot-flange','red',x,.005,.025,.045,.01,.86);
 for(const y of [.04,.35,.69,.94])c('anchor','iron',x,y,.32,.008,.009,.075,'z');}
 b('chain-bracket','iron',.481,.93,.404,.027,.028,.31);e('chain-weight','iron',.485,.244,.43,.015,.025,.078);
});
const mounts={
 'reception-window':'opening','steel-door':'opening','wood-door':'opening','jamb':'opening','observation':'opening',
 'bath-drain':'floor','heater':'floor','intact-wall':'floor','faucet':'counter','sink':'counter','curtain-ring':'ceiling'
};
for(const asset of designs)if(mounts[asset.id])asset.host=mounts[asset.id];
