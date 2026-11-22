const preview=document.querySelector('#preview');
const view=document.querySelector('#view');
const status=document.querySelector('#status');
const merge=document.querySelector('#merge');
const checks=[...document.querySelectorAll('input')];
let record,ready=false,busy=false;
function update(){
  merge.disabled=!record || record.merged || busy || !ready || !checks.every(box=>box.checked);
}
function loadView(){
  ready=false;
  preview.src='/?scene=evac&candidate=station&review='+view.value;
  update();
}
view.onchange=loadView;
checks.forEach(box=>box.onchange=update);
setInterval(()=>{
  const win=preview.contentWindow;
  ready=win.location.search.includes('review='+view.value) && !!win.demoMetrics?.environmentReady;
  update();
},400);
async function sync(method){
  busy=true;update();
  try{
    const response=await fetch('/api/review/station',{method,headers:method==='POST'?{'X-Review-Revision':record.revision}:{}});
    if(!response.ok)throw Error();
    record=await response.json();
    status.textContent=(record.merged?'已验收并合并':'待验收')+' · '+record.revision.slice(0,8);
  }catch{
    record=null;
    status.textContent=method==='POST'?'合并失败，请刷新后复核当前版本。':'当前为预览模式。请在本地开发服务中提交验收。';
  }finally{busy=false;update();}
}
merge.onclick=()=>sync('POST');
loadView();sync('GET');
