import {design,b,c,e,ring,legs} from './designs.mjs';
import {forms} from './forms.mjs';
const make=design;
make('pump-a','可装载泵 A','任务',[.56,.49,.45],()=>portable('red',1));
make('pump-b','可装载泵 B','任务',[.52,.48,.49],()=>portable('olive',-1));
function portable(m,s){
 b('skid','iron',0,.04,0,1,.08,.87);
 c('volute',m,0,.43,.12,.62,.66,.53,'z');c('flange','steel',0,.43,.42,.42,.44,.12,'z');
 c('intake','black',0,.43,.49,.29,.31,.022,'z');c('motor','iron',0,.43,-.23,.65,.56,.45,'z');
 for(let i=0;i<7;i++)c('cooling-fin',m,0,.43,-.43+i*.051,.72,.62,.024,'z');
 for(const x of [-.39,.39])b('lifting-post','iron',x,.52,0,.053,.90,.07);
 c('lift-grip','rubber',0,.97,0,.83,.06,.08,'x');b('id-plate','paper',s*.27,.24,.43,.20,.09,.03);
}
make('chain-seat','固定链座','任务',[.12,.19,.09],()=>{forms.panel('red');ring('guide','steel',0,.42,.45,.63,.51,.34)},'wall');
make('cart-latch','泵扣','任务',[.13,.079,.047],()=>{forms.panel('iron');b('toggle','brass',0,.6,.44,.69,.24,.12)},'cart');
make('dock-plate','装载桥','任务',[1.25,.09,.87],()=>{b('plate','iron',0,.51,0,1,.88,1);for(let i=0;i<12;i++)b('rib','steel',0,.97,-.45+i*.08,.95,.06,.019)});
make('handoff-line','交接线','任务',[1.5,.004,.12],()=>{for(let i=0;i<8;i++)b('stripe','amber',-.44+i*.125,.5,0,.075,1,1)});
make('holding-rail','平台扶手','建筑装修',[1.8,1.05,.08],()=>{for(const x of [-.475,.475])c('post','iron',x,.5,0,.035,1,.65);for(const y of [.51,.97])c('rail','steel',0,y,0,1,.045,.60,'x')});
make('double-door','洗消双开门','建筑装修',[1.6,2.20,.10],()=>{for(const x of [-.25,.25]){b('leaf','olive',x,.5,0,.494,1,.54);b('window','glass',x,.69,.29,.22,.23,.04);b('kick','steel',x,.085,.29,.48,.15,.04);b('push','steel',x,.48,.39,.33,.023,.21)}},'opening');
make('duct-elbow','风管弯头','机电',[.67,.41,.65],()=>{b('leg-a','steel',-.19,.5,0,.62,1,1);b('leg-b','steel',.17,.5,.19,.66,1,.62)},'ceiling');
make('emergency-light','双头应急灯','照明报警',[.36,.16,.13],()=>{b('battery','white',0,.4,-.1,.64,.8,.65);for(const x of [-.36,.36])c('beam','white',x,.69,.11,.28,.55,.72,'z')},'wall');
make('cutaway-ceiling','缺板吊顶','建筑装修',[1.2,.052,.60],()=>{b('tile','white',-.25,.5,0,.49,.6,.98);for(const z of [-.48,.48])b('runner','steel',0,.45,z,1,.8,.035);b('runner','steel',.49,.45,0,.02,.8,1)},'ceiling');
make('hose-tail','半展开水带','水带与维修',[1.68,.074,.36],()=>{for(let i=0;i<20;i++){let t=i/19; b('webbing','cloth',-.475+.95*t,.39,Math.sin(t*Math.PI*2)*.22,.058,.59,.34)}c('coupling','brass',.46,.50,0,.072,1,.31,'x')});
make('exhaust-drop','悬吊尾气抽排管','车厅',[.24,2.30,.24],()=>{c('hose','black',0,.53,0,.78,.94,.78);for(let i=0;i<40;i++)c('rib','rubber',0,.09+i*.022,0,.86,.009,.86);c('nozzle','iron',0,.04,0,1,.08,1)},'ceiling');
for(const [id,label,room,m] of [['lead','充电线','车厅','black'],['drain-hose','排水软管','洗消','gray'],['usb','床头充电线','起居与宿舍','black']]){
 make(id,label,room,id==='usb'?[.17,.012,.11]:[.36,.043,.29],()=>{for(let i=0;i<3;i++)ring('loop',m,i*.048,.38+i*.12,0,.80,.40,.93,'y');b('plug','iron',.43,.51,.25,.12,.70,.2)},'shelf');
}
make('manifold','分水器','水带与维修',[.34,.19,.25],()=>{c('body','red',0,.46,0,.83,.65,.59,'x');for(const x of [-.30,.30]){c('outlet','brass',x,.46,.25,.26,.49,.47,'z');ring('wheel','red',x,.87,0,.32,.19,.38,'y')}c('inlet','steel',0,.46,-.29,.41,.58,.40,'z')},'bench');
make('vise','台钳','水带与维修',[.31,.19,.17],()=>{c('base','iron',0,.11,0,.72,.22,.97);b('body','blue',0,.42,0,.87,.46,.47);for(const x of [-.25,.25])b('jaw','iron',x,.83,0,.23,.34,.91);c('handle','steel',.46,.45,0,.05,.79,.06)},'bench');
make('hanging-rail','临时挂衣架','洗消',[1.12,1.53,.50],()=>{for(const x of [-.46,.46]){b('foot','steel',x,.035,0,.08,.07,1);c('post','steel',x,.5,0,.031,.95,.07)}c('rail','steel',0,.97,0,.96,.029,.06,'x')});
make('stove','四眼灶台','厨房',[.76,.90,.72],()=>{forms.appliance('steel');for(const x of [-.24,.24])for(const z of [-.24,.24])ring('burner','black',x,1.01,z,.33,.025,.34,'y')});
make('mug','马克杯','厨房',[.126,.102,.095],()=>{c('cup','white',-.105,.49,0,.76,.98,1);c('inside','oak',-.105,.985,0,.66,.015,.87);ring('handle','white',.275,.52,0,.44,.59,.12)},'counter');
make('bowl','碗','厨房',[.16,.078,.16],()=>{e('bowl','white',0,.50,0,1,.98,1);c('interior','cloth',0,.76,0,.93,.06,.93)},'counter');
make('toilet','坐便器','卫浴',[.41,.77,.71],()=>{b('tank','white',0,.75,-.33,.91,.5,.32);e('bowl','white',0,.46,.11,1,.48,.78);ring('seat','white',0,.63,.11,.93,.1,.73,'y');e('pedestal','white',0,.20,.0,.62,.4,.59)});
make('safety-bar','无障碍扶手','卫浴',[.64,.08,.10],()=>{c('bar','steel',0,.5,.28,.94,.48,.36,'x');for(const x of [-.45,.45])c('base','steel',x,.5,-.08,.074,.86,.78,'z')},'wall');
make('floor-lamp','落地灯','起居与宿舍',[.39,1.53,.39],()=>{c('foot','iron',0,.02,0,.76,.04,.76);c('stem','iron',0,.42,0,.06,.8,.06);c('shade','cloth',0,.89,0,1,.22,1)});
make('uniform-hanger','制服衣架','起居与宿舍',[.43,.24,.024],()=>{b('left','oak',-.23,.46,0,.52,.12,.73,.35);b('right','oak',.23,.46,0,.52,.12,.73,-.35);b('cross','oak',0,.25,0,.9,.08,.66);ring('hook','steel',0,.84,0,.12,.30,.34)},'shelf');
make('treadmill','跑步机','扩展',[.81,1.40,1.85],()=>{b('base','iron',0,.10,0,1,.20,1);b('belt','rubber',0,.212,0,.82,.023,.92);for(const x of [-.42,.42])b('upright','iron',x,.57,-.33,.056,.76,.055);b('console','black',0,.94,-.33,.88,.12,.12)});
make('manikin','训练假人','扩展',[.50,.21,1.71],()=>{e('head','skin',0,.50,-.40,.38,.76,.16);e('torso','blue',0,.50,-.17,.78,.90,.32);for(const x of [-.21,.21]){e('leg','black',x,.45,.24,.34,.77,.5);e('arm','skin',x*1.94,.49,-.13,.18,.62,.31)}});
make('breached-wall','破口残墙端段','灾后叙事',[1.2,1,.15],()=>{for(let i=0;i<8;i++){let h=1-i*.096;b('plaster','gray',-.4375+i*.125,h/2,0,.125,h,.94);b('fracture','cloth',-.4375+i*.125,h-.023,0,.125,.046,1)}});
for(const [id,label,m,w,h,d] of [['drywall-shard','断板','white',.44,.04,.31],['rubble','靠墙碎块','gray',.70,.14,.38],['dust','粉尘','cloth',.74,.006,.53],['leak','渗水印','olive',.59,.83,.002],['old-paint','旧漆修补','gray',.62,.43,.002],['gear-shadow','装备洁净轮廓','cloth',.47,.67,.002]]){
 make(id,label,'灾后叙事',[w,h,d],()=>{for(let i=0;i<8;i++){let t=i*2.4;e('fragment',m,.27*Math.cos(t),.28+.18*Math.sin(t),.27*Math.sin(t),.43+.1*Math.cos(t),.47,.50)}},d<.01&&h>.01?'wall':'floor');
}
for(const [id,label,m] of [['engine','消防车','red'],['ambulance','救护车','white']]){
 make(id,label,'车厅',id==='engine'?[2.54,3.28,8.2]:[2.41,2.91,6.6],()=>{
 b('chassis','iron',0,.23,0,.83,.18,.91);b('body',m,0,.60,-.12,.95,.63,.70);b('cab',m,0,.56,.335,.94,.63,.30);
 b('windshield','glass',0,.725,.49,.86,.245,.014);for(const x of [-.49,.49]){
 b('cab-glass','glass',x,.722,.33,.014,.23,.22);b('mirror','black',x*1.09,.70,.417,.067,.10,.04);
 b('running-board','steel',x,.26,.31,.085,.055,.32);
 for(const z of [-.32,.28]){c('tyre','rubber',x*.93,.16,z,.13,.32,.125,'x');c('rim','steel',x*1.045,.16,z,.025,.17,.07,'x')}
 for(let i=0;i<3;i++){let z=-.34+i*.20;b('locker','steel',x,.62,z,.029,.42,.173);b('pull','iron',x*1.04,.45,z,.013,.026,.056);}
 b('reflective','amber',x,.365,-.1,.031,.035,.69);}
 b('bumper','steel',0,.25,.495,1,.11,.027);b('grille','iron',0,.48,.494,.51,.18,.027);
 for(const x of [-.37,.37])b('headlight','white',x,.5,.5,.14,.10,.029);
 b('lightbar','red',0,.90,.33,.68,.055,.06);if(id==='engine'){for(const x of [-.25,.25])b('ladder-rail','steel',x,.94,-.1,.024,.04,.68);for(let i=0;i<16;i++)b('rung','steel',0,.94,-.42+i*.041,.51,.026,.012)}
 });
}
