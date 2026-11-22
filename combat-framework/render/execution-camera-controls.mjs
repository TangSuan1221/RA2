const curves={smootherstep:'缓入缓出（明显）',smoothstep:'缓入缓出（柔和）',linear:'匀速'};
const fields=[
  ['angle','侧转角度（度）',-150,150,1],['distance','距离（米）',.9,4,.05],
  ['height','取景高度（米）',.8,1.9,.05],['hold','起始停留（秒）',0,2,.05],
  ['duration','转场时间（秒）',.15,2,.05]
];
export function syncExecutionCamera(settings){
  function read(){
    const curve=localStorage.getItem('execution-camera-curve');
    if(Object.hasOwn(curves,curve))settings.curve=curve;
    for(const [key,,min,max] of fields){
      const saved=localStorage.getItem('execution-camera-'+key);
      if(saved!==null&&Number.isFinite(+saved))settings[key]=Math.max(min,Math.min(max,+saved));
    }
  }
  read();
  window.addEventListener('storage',e=>{if(e.key?.startsWith('execution-camera-'))read()});
}
export function executionCameraControls(settings,before,redraw){
  syncExecutionCamera(settings);
  const panel=document.createElement('details');
  panel.id='execution-camera';panel.open=true;panel.hidden=true;
  panel.innerHTML='<summary>处决镜头</summary>';
  for(const [key,title,min,max,step] of fields){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='number';Object.assign(input,{min,max,step});input.style.width='4.5em';
    input.value=settings[key];label.append(title+' ',input);panel.append(label,' ');
    input.oninput=()=>{
      const n=input.valueAsNumber;
      if(!Number.isFinite(n)||n<min||n>max)return;
      settings[key]=n;localStorage.setItem('execution-camera-'+key,String(n));redraw();
    };
    input.onchange=()=>{input.value=settings[key]};
  }
  const label=document.createElement('label'),select=document.createElement('select');
  for(const [value,name] of Object.entries(curves))select.add(new Option(name,value));
  select.value=settings.curve;
  select.onchange=()=>{
    settings.curve=select.value;localStorage.setItem('execution-camera-curve',select.value);redraw();
  };
  label.append('转场曲线 ',select);panel.append(label);
  before.before(panel);return panel;
}
