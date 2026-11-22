/* Local coordinates are fractions of the design envelope. All primitives have named parts. */
export const designs = [];
export const palette = {
  iron:'#586266', steel:'#a5a9a7', red:'#953d32', olive:'#68684d', rubber:'#35383a',
  oak:'#aa7646', cloth:'#b7a98a', white:'#e4dfd1', blue:'#526778', brass:'#ae9051',
  glass:'#94babb', tile:'#cac9bb', brick:'#966a54', gray:'#99968c', amber:'#dfad44',
  black:'#282e30', paper:'#e1d7b9', green:'#748576', skin:'#aa8168'
};
let parts;
export function design(id,label,group,size,recipe,host='floor'){
  parts=[];recipe();designs.push({id,label,group,size,host,parts});
}
export function part(name,shape,mat,x,y,z,w,h,d,angle=0){
  parts.push({name,shape,mat,x,y,z,w,h,d,angle});
}
export function b(n,m,x,y,z,w,h,d,a=0){part(n,'box',m,x,y,z,w,h,d,a)}
export function c(n,m,x,y,z,w,h,d,axis='y'){part(n,'cyl'+axis,m,x,y,z,w,h,d)}
export function e(n,m,x,y,z,w,h,d){part(n,'oval',m,x,y,z,w,h,d)}
export function ring(n,m,x,y,z,w,h,d,axis='z'){part(n,'ring'+axis,m,x,y,z,w,h,d)}
const sides=[-.43,.43];
export function legs(top=1,mat='iron'){
 for(const x of sides)for(const z of sides)b('leg',mat,x,top/2,z,.055,top,.065);
}
export function shelves(n=4,m='steel'){
 legs();for(let i=0;i<n;i++)b('shelf',m,0,.05+.9*i/(n-1),0,1,.04,1);
}
export function cabinet(m='olive',n=3){
 b('case',m,0,.5,0,1,1,.92);
 for(let i=0;i<n;i++){let y=(i+.5)/n;b('front',m,0,y,.474,.96,.94/n,.045);b('pull','steel',0,y+.12/n,.515,.24,.035,.05);}
}
function wheels(){for(const x of [-.445,.445])for(const z of [-.33,.33]){
 c('wheel','rubber',x,.145,z,.11,.29,.29,'x');c('hub','steel',x*1.11,.145,z,.025,.135,.135,'x');
}}
design('watch-desk','前厅值班台','任务',[1.8,1.22,.82],()=>{
 b('counter','oak',0,.635,0,1,.038,1);
 for(const x of [-.345,.345]){
 b('pedestal','olive',x,.33,0,.29,.57,.92);
 for(let i=0;i<3;i++){let y=.155+i*.18;b('drawer','olive',x,y,.469,.27,.169,.025);b('pull','steel',x,y,.492,.093,.016,.041);}
 for(const z of sides)c('foot','iron',x,.025,z,.038,.05,.065);}
 b('back','olive',0,.35,-.39,.41,.48,.05);
 b('radio','black',-.25,.72,-.11,.235,.13,.32);b('dial-window','amber',-.27,.74,.055,.11,.022,.01);
 for(let i=0;i<3;i++)c('dial','iron',-.32+i*.063,.695,.06,.025,.031,.025,'z');
 c('antenna','black',-.15,.884,-.23,.007,.232,.013);
 b('clipboard','oak',.285,.663,.055,.18,.013,.37);b('log','paper',.285,.673,.06,.16,.006,.32);
 b('clip','steel',.285,.68,-.08,.08,.009,.035);
});
function pump(x,scale,metal){
 const p=(n,m,dx,y,z,w,h,d,axis)=>c(n,m,x+dx*scale,y,z,w*scale,h,d,axis);
 p('volute',metal,0,.685,0,.28,.26,.4,'z');p('inlet','steel',0,.685,.23,.12,.12,.09,'z');
 p('bore','black',0,.685,.28,.086,.088,.012,'z');p('outlet',metal,0,.81,0,.10,.11,.12);
 for(const dx of [-.10,.10])b('foot',metal,x+dx*scale,.555,0,.055,.06,.31);
 for(let i=0;i<8;i++){let t=i*Math.PI/4;p('bolt','steel',.115*Math.cos(t),.685+.106*Math.sin(t),.209,.02,.021,.018,'z');}
}
design('pump-test-bench','双表试泵台','任务',[1.8,1.80,.80],()=>{
 legs(.49);b('worktop','steel',0,.49,0,1,.02,1);b('brace','iron',0,.14,-.43,.87,.035,.06);
 pump(-.185,.93,'red');pump(.185,.85,'olive');
 for(const x of [-.32,.32]){c('stem','brass',x,.685,-.34,.026,.36,.045);
 c('gauge-rim','iron',x,.917,-.33,.158,.158,.14,'z');c('face','paper',x,.917,-.25,.144,.144,.025,'z');
 for(let i=0;i<11;i++){let t=(i*24-120)*Math.PI/180;b('tick','black',x+.061*Math.sin(t),.917+.061*Math.cos(t),-.23,.004,.012,.008,-t);}
 b('needle','red',x,.928,-.218,.006,.072,.012,.62);}
});
design('hose-cart','制动水带推车','任务',[.8,1.18,1.2],()=>{
 wheels();b('bed','iron',0,.26,0,.84,.07,.87);
 for(const x of [-.38,.38]){
 c('end-plate','red',x,.51,0,.045,.64,.64,'x');b('handle-post','steel',x,.64,-.36,.048,.67,.045);
 for(const z of [-.22,.22])c('fastener','brass',x*1.08,.43,z,.018,.032,.03,'x');}
 c('grip','rubber',0,.98,-.36,.80,.042,.044,'x');
 for(let i=0;i<9;i++)c('woven-hose','cloth',-.31+i*.077,.51,0,.073,.61,.61,'x');
 b('brake','amber',.37,.22,.39,.17,.037,.16);
});
design('south-shutter','南卷门与固定手链','任务',[5.14,4.92,.5],()=>{
 for(const x of [-2.485/5.14,2.485/5.14])b('fixed-rail','red',x,.46,0,.17/5.14,.92,.58);
 b('hood','red',0,4.71/4.92,0,1,.42/4.92,1);
 for(let i=0;i<50;i++)c('leaf-slat','steel',0,(i+.5)*.09/4.92,0,4.8/5.14,.09/4.92,.17,'x');
 b('bottom-seal','rubber',0,.004,.04,4.8/5.14,.008,.22);
 for(let i=0;i<60;i++)ring('fixed-chain','iron',.485,.25+i*.0109,.43,.012,.016,.037,i%2?'x':'z');
},'opening');
