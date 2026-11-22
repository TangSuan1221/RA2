import {designs,design,b,c,e,ring} from './designs.mjs';
import {forms} from './forms.mjs';
function refine(id,recipe){const i=designs.findIndex(a=>a.id===id);if(i<0)throw Error(id);const a=designs[i];designs.splice(i,1);design(a.id,a.label,a.group,a.size,recipe,a.host)}
refine('turnout-locker',()=>{for(const x of [-.48,.48]){b('side','iron',x,.50,0,.025,1,1);for(let i=0;i<8;i++)b('rail','steel',x,.5,-.43+i*.12,.035,.96,.012)}
 for(const y of [.035,.20,.83,.985])b('shelf','iron',0,y,0,1,.023,1);c('hanger','steel',0,.76,0,.92,.014,.044,'x');b('name','paper',0,.92,-.47,.55,.061,.01);
 for(let i=0;i<12;i++)b('back-wire','steel',-.46+i*.083,.5,-.48,.009,1,.012);});
refine('knife-block',()=>{b('block','oak',0,.34,0,1,.68,1);for(const x of [-.29,0,.29]){b('blade','steel',x,.71,0,.12,.12,.08);b('grip','black',x,.86,0,.16,.28,.13)}});
refine('keyboard',()=>{b('case','black',0,.32,0,1,.64,1);for(let r=0;r<5;r++)for(let i=0;i<15;i++)b('key','iron',-.452+i*.064,.82,-.37+r*.178,.053,.36,.137)});
refine('chair-cart',()=>{forms.trolley('iron');for(let i=0;i<7;i++)b('folded-chair','gray',0,.37+i*.07,0,.72,.042,.72)});
refine('office-chair',()=>{for(let i=0;i<5;i++){let t=i*1.257;e('caster','black',.40*Math.sin(t),.05,.40*Math.cos(t),.13,.10,.13);b('spoke','iron',.20*Math.sin(t),.12,.20*Math.cos(t),.12,.06,.12)}c('gas-lift','steel',0,.27,0,.11,.4,.11);e('seat','black',0,.49,0,.91,.15,.94);e('back','black',0,.74,-.36,.83,.52,.18)});
refine('helmet',()=>forms.helmet('amber'));
refine('goggles',()=>{for(const x of [-.22,.22]){e('rim','rubber',x,.51,0,.54,.88,.45);e('lens','glass',x,.53,.2,.45,.68,.18)}b('bridge','black',0,.56,0,.16,.14,.27);ring('strap','rubber',0,.48,-.13,.98,.16,.67,'y')});
refine('face-shield',()=>{e('visor','glass',0,.48,.07,.94,.92,.58);ring('headband','blue',0,.90,0,1,.15,1,'y')});
refine('facepiece',()=>{e('mask','rubber',0,.5,0,.93,.94,.87);e('visor','glass',0,.66,.27,.79,.47,.37);c('port','iron',0,.27,.38,.32,.27,.22,'z')});
refine('extractor',()=>{ring('rim','iron',0,.5,0,1,1,.91);for(let i=0;i<5;i++){let t=i*1.257;b('blade','steel',.22*Math.cos(t),.5+.22*Math.sin(t),0,.48,.13,.18,t)}c('hub','iron',0,.5,.13,.2,.2,.4,'z')});
refine('chock',()=>{for(let i=0;i<16;i++){let h=(i+1)/16;b('wedge','rubber',0,h/2,-.47+i*.062,h*.08+.91,h,.064)}});

refine('hose-cap',()=>{c('cap','brass',0,.5,0,.93,.93,.76,'z');for(const x of [-.43,.43])b('ear','brass',x,.5,0,.14,.28,1)});
refine('bowl',()=>{for(let i=0;i<12;i++){let s=.36+.64*i/11;ring('porcelain','white',0,.06+i*.077,0,s,.11,s,'y')}});
refine('plate',()=>{c('base','white',0,.5,0,.90,.50,.90,'z');ring('lip','white',0,.51,.08,1,.86,.81,'z')});
refine('bell',()=>{c('foot','black',0,.09,0,1,.18,1);e('bell','brass',0,.44,0,.92,.72,.92);c('button','steel',0,.89,0,.23,.20,.23)});

refine('remote',()=>{b('case','black',0,.42,0,1,.82,.85);for(let r=0;r<5;r++)for(let i=0;i<3;i++)c('button',r===0?'red':'gray',-.26+i*.26,.91,-.30+r*.14,.14,.16,.09)});
refine('telephone',()=>{b('base','black',0,.30,0,.94,.6,.96);e('handset','iron',-.31,.69,0,.31,.6,.97);b('screen','green',.17,.63,-.26,.48,.07,.23);for(let r=0;r<4;r++)for(let i=0;i<3;i++)b('key','gray',.03+i*.15,.64,-.06+r*.13,.10,.09,.087)});

refine('shower-curtain',()=>{for(let i=0;i<28;i++)b('fold','white',-.48+i*.0355,.5,Math.sin(i*.72)*.28,.037,1,.22)});
refine('curtain',()=>{for(let i=0;i<24;i++)b('pleat','blue',-.478+i*.0416,.5,Math.cos(i)*.29,.044,1,.33)});
refine('exit',()=>{b('housing','white',0,.5,0,1,1,.79);b('lettering','green',0,.50,.41,.96,.90,.045)});
refine('blockwall',()=>{b('mortar','gray',0,.5,0,1,1,.9);for(let r=0;r<12;r++){const n=6;for(let k=-1;k<n;k++){const l=Math.max(0,(k+(r%2)*.5)/n),u=Math.min(1,(k+1+(r%2)*.5)/n);if(u>l)b('painted-block','tile',(l+u)/2-.5,(r+.5)/12,0,u-l-.002,1/12-.003,1)}}});
refine('tilewall',()=>{b('grout','gray',0,.50,0,1,1,.80);for(let j=0;j<12;j++)for(let i=0;i<6;i++)b('tile','tile',-.5+(i+.5)/6,(j+.5)/12,0,.163,.081,1)});

const extras=[
 ['clipboard','记录夹','任务',[.23,.018,.32],'desk',()=>{b('board','oak',0,.28,0,1,.56,1);b('log','paper',0,.65,0,.90,.17,.92);b('clip','steel',0,.83,-.39,.39,.34,.11)}],
 ['gauge','独立压力表','任务',[.14,.18,.074],'bench',()=>{c('stem','brass',0,.12,0,.19,.24,.43);c('rim','steel',0,.62,0,1,.77,.81,'z');c('dial','paper',0,.62,.43,.91,.70,.12,'z');for(let i=0;i<13;i++){let t=(i-6)*.36;b('tick','black',.37*Math.sin(t),.62+.285*Math.cos(t),.5,.015,.05,.009,-t)}b('needle','red',.046,.68,.51,.022,.31,.01,-.45)}],
 ['valve','检验阀','任务',[.18,.19,.13],'bench',()=>{c('body','brass',0,.23,0,1,.34,.59,'x');c('stem','brass',0,.61,0,.16,.54,.23);ring('wheel','red',0,.91,0,.78,.18,1,'y');b('spoke','red',0,.91,0,.69,.1,.14)}],
 ['pen','记录笔','值班行政',[.013,.015,.14],'desk',()=>c('pen','black',0,.5,0,.76,.78,1,'z')],
 ['id-card','泵架编号卡','任务',[.14,.09,.002],'wall',()=>forms.sign('paper')],
 ['rack-clip','拖把挂架','后勤',[.49,.10,.081],'wall',()=>{b('back','iron',0,.5,-.4,1,.81,.2);for(let i=0;i<4;i++)ring('holder','rubber',-.35+i*.233,.5,0,.14,.46,.85,'y')}],
 ['restraint','担架固定带','呼吸与急救',[.49,.05,.012],'cart',()=>{b('strap','blue',0,.5,0,1,.7,.4);b('buckle','steel',0,.5,.1,.11,1,.8)}],
 ['cup','床头水杯','起居与宿舍',[.081,.115,.081],'shelf',()=>{forms.can('glass');c('interior','gray',0,.99,0,.85,.017,.85)}],
 ['display-arm','显示器支架','值班行政',[.31,.38,.13],'desk',()=>{b('foot','iron',0,.04,0,.81,.08,1);c('stem','iron',-.21,.5,0,.10,.94,.23);b('arm','black',0,.82,0,.66,.09,.26);b('plate','iron',.29,.81,.07,.29,.3,.15)}],
 ['tv-mount','电视挂架','起居与宿舍',[.46,.28,.065],'wall',()=>{for(const y of [.21,.79])b('rail','iron',0,y,-.18,1,.21,.52);for(const x of [-.36,.36])b('arm','iron',x,.5,.18,.12,1,.5)}],
 ['dutylamp','维修台灯','水带与维修',[.24,.42,.21],'bench',()=>{c('foot','black',0,.035,0,.78,.07,.8);b('arm','steel',-.16,.46,0,.065,.84,.08,-.24);c('shade','olive',0,.84,0,.70,.29,.78)}],
 ['shade-rail','淋浴帘杆','卫浴',[1.01,.025,.025],'wall',()=>forms.pipe('steel')],
 ['fitness-dumbbell','哑铃','扩展',[.31,.14,.14],'shelf',()=>{c('grip','steel',0,.5,0,.85,.19,.19,'x');for(const x of [-.36,.36])c('weight','rubber',x,.5,0,.28,1,1,'x')}],
 ['firepole-guard','滑杆护栏','扩展',[1,1.05,.95],'floor',()=>{for(const x of [-.47,.47])for(const z of [-.46,.46])c('post','iron',x,.49,z,.043,.98,.045);for(const x of [-.47,.47])c('rail','steel',x,.97,0,.044,.043,.96,'z');c('rail','steel',0,.97,-.46,.97,.043,.043,'x')}],
 ['clipboard-clip','记录夹金属压片','任务',[.082,.008,.035],'desk',()=>forms.panel('steel')],
 ['test-hose','试压软管','任务',[.54,.055,.36],'bench',()=>ring('hose','rubber',0,.5,0,1,1,1,'y')],
 ['radio-cord','手咪卷线','任务',[.16,.026,.042],'desk',()=>{for(let i=0;i<17;i++)ring('turn','black',-.47+i*.058,.5,0,.071,.98,.90,'x')}],
 ['power-strip','电台电源排插','任务',[.24,.035,.072],'desk',()=>{b('body','black',0,.5,0,1,1,1);for(let i=0;i<4;i++)b('socket','gray',-.33+i*.22,1,0,.13,.03,.53)}],
 ['sleep-mattress','单人床垫','起居与宿舍',[.95,.19,1.98],'bed',()=>{b('body','white',0,.5,0,.98,.94,.99);for(const y of [.09,.91])b('welt','cloth',0,y,0,1,.045,1)}],
 ['equipment-control','充装控制表','呼吸与急救',[.42,.27,.075],'wall',()=>{forms.panel('iron');for(const x of [-.23,.23])c('gauge','white',x,.56,.38,.32,.48,.19,'z')}],
 ['scba-piping','充装柜管线','呼吸与急救',[.62,.48,.055],'wall',()=>{for(const x of [-.44,.44])c('riser','steel',x,.5,0,.04,1,.48);c('crosspipe','steel',0,.95,0,.92,.056,.52,'x')}],
 ['blanket-bed','铺床被','起居与宿舍',[.98,.07,1.47],'bed',()=>forms.folded('blue')],
 ['work-gloves-pair','工作手套一对','装备间',[.26,.035,.25],'shelf',()=>{for(const s of [-1,1]){e('palm','cloth',s*.24,.52,.03,.38,.85,.51);for(let i=0;i<4;i++)e('finger','cloth',s*(.10+i*.088),.5,-.24,.10,.7,.46-i*.032);e('thumb','cloth',s*.45,.51,.03,.10,.7,.28)}}],
];
for(const [id,label,g,size,h,recipe] of extras)design(id,label,g,size,recipe,h);
refine('wet-sign',()=>{for(const z of [-.26,.26]){b('panel','amber',0,.49,z,.94,.85,.065);b('caution','amber',0,.61,z*1.15,.75,.44,.038)}c('hinge','black',0,.94,0,.91,.045,.2,'x');for(const x of [-.36,.36])b('feet','amber',x,.06,0,.16,.12,1)});
refine('sprinkler',()=>{c('thread','brass',0,.15,0,.60,.30,.63);for(const x of [-.32,.32])b('cage','brass',x,.56,0,.12,.58,.25);e('bulb','red',0,.55,0,.24,.54,.24);c('deflector','steel',0,.92,0,1,.15,1)});

refine('highbay',()=>{c('mount','iron',0,.87,0,.39,.26,.39);e('shade','iron',0,.53,0,1,.65,1);c('diffuser','white',0,.23,0,.98,.13,.98)});

refine('range-hood',()=>{b('canopy','steel',0,.47,0,1,.68,1);b('flue','steel',0,.88,-.22,.5,.24,.42);for(let i=0;i<15;i++)b('baffle','iron',-.44+i*.063,.11,0,.03,.22,.73)});
refine('toaster',()=>{b('case','steel',0,.5,0,1,.88,.89);for(const z of [-.22,.22])b('bread-slot','black',0,.95,z,.76,.063,.19);b('lift','black',.44,.67,.42,.10,.09,.13)});
refine('coffee',()=>{b('base','black',0,.09,0,.95,.18,1);b('tower','black',0,.5,-.34,.93,.95,.32);b('head','iron',0,.84,0,.91,.30,.85);e('carafe','glass',0,.38,.13,.70,.42,.63);ring('handle','black',.33,.42,.13,.23,.29,.13)});
refine('microwave',()=>{b('case','steel',0,.5,0,1,1,.89);b('door','black',-.09,.50,.46,.74,.84,.035);b('window','glass',-.09,.5,.49,.55,.57,.025);b('panel','iron',.38,.5,.47,.18,.83,.055);for(let j=0;j<3;j++)for(let i=0;i<2;i++)b('key','gray',.34+i*.079,.30+j*.14,.51,.05,.07,.02)});
refine('soap',()=>{b('reservoir','white',0,.6,-.04,.91,.8,.88);b('push','gray',0,.38,.42,.81,.34,.12);c('tip','iron',0,.13,.17,.20,.26,.26)});
refine('sink',()=>{b('bottom','steel',0,.075,0,.95,.15,.95);for(const x of [-.47,.47,0])b('wall','steel',x,.5,0,.042,1,1);for(const z of [-.48,.48])b('wall','steel',0,.5,z,.95,1,.04);for(const x of [-.24,.24])c('drain','iron',x,.155,0,.13,.018,.18)});


refine('face-shield',()=>{e('visor','glass',0,.43,.10,.97,.85,.63);ring('band','blue',0,.91,0,.99,.15,1,'y')});
refine('wrench',()=>{b('shank','steel',0,.51,0,.19,.67,.46);ring('box-end','steel',0,.12,0,.73,.23,.74,'y');for(const x of [-.33,.33])b('jaw','steel',x,.88,0,.26,.20,.85);b('throat','steel',0,.80,0,.76,.13,.84)});
refine('screwdriver',()=>{e('handle','red',0,.28,0,.97,.56,.96);c('shaft','steel',0,.70,0,.18,.46,.18);b('tip','iron',0,.954,0,.26,.092,.13)});
refine('glove-box',()=>{b('carton','paper',0,.5,0,1,1,1);e('opening','black',0,1.005,0,.66,.03,.50);e('glove','blue',.05,1.03,0,.46,.08,.36)});
refine('compressor',()=>{c('tank','blue',0,.35,0,.98,.53,.81,'x');for(const x of [-.30,.30])b('foot','iron',x,.07,0,.09,.14,.88);b('pump','iron',-.17,.79,0,.42,.33,.54);for(let i=0;i<6;i++)b('fin','steel',-.34+i*.06,.86,0,.025,.27,.63);c('motor','iron',.22,.73,0,.30,.27,.48,'x')});
refine('recliner',()=>{forms.couch('cloth');b('footrest','cloth',0,.28,.41,.70,.40,.16);c('lever','oak',.50,.38,0,.05,.12,.11,'x')});
refine('dustpan',()=>{b('pan','gray',0,.16,.06,.95,.24,.85);for(const x of [-.45,.45])b('side','gray',x,.40,.04,.045,.58,.81);b('back','gray',0,.48,-.34,.92,.77,.08);b('handle','black',0,.77,-.40,.21,.27,.20)});
refine('trousers',()=>{for(const x of [-.245,.245]){b('folded-leg','cloth',x,.40,.06,.47,.8,.86);b('reflector','amber',x,.80,.24,.46,.04,.20)}b('waist','cloth',0,.75,-.30,.96,.50,.35)});
refine('extinguisher',()=>{c('tank','red',0,.39,0,.88,.73,.86);e('shoulder','red',0,.745,0,.87,.20,.85);c('neck','brass',0,.844,0,.29,.14,.34);b('lever','iron',-.13,.92,0,.61,.06,.20);b('instruction','paper',0,.46,.412,.46,.32,.035);c('hose','black',.44,.57,0,.09,.56,.09);c('pressure','paper',.24,.84,.14,.24,.068,.11,'z')});
refine('detector',()=>{c('base','white',0,.72,0,1,.56,1);c('case','white',0,.38,0,.88,.63,.88);for(let i=0;i<12;i++){let a=i*Math.PI/6;e('vent','gray',.39*Math.cos(a),.28,.39*Math.sin(a),.11,.19,.10)}});

