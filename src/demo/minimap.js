import {edges, open} from './network.js';

export function minimap(canvas) {
  let local=false;
  canvas.title='点击切换全图或附近道路';
  canvas.setAttribute('aria-label',canvas.title);
  canvas.setAttribute('role','button');
  canvas.tabIndex=0;
  canvas.onclick=()=>local=!local;
  canvas.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();canvas.click();}};
  const g=canvas.getContext('2d');
  return (pos,heading,mode,path,target)=>{
    const w=canvas.width, radius=local?250:1024, s=w/(radius*2);
    const ox=local?pos.x-radius:0, oz=local?pos.z-radius:0;
    const px=x=>(x-ox)*s,py=z=>(z-oz)*s;
    g.fillStyle='#263631';g.fillRect(0,0,w,w);
    g.fillStyle='#41616a';g.fillRect(0,py(440),w,80*s);
    for(const e of edges){
      if(e.state==='closed') continue;
      const allowed=open(e,mode);
      g.strokeStyle=allowed?'#899789':'#806052';
      g.lineWidth=local?(e.grade==='L1'?3:1.7):1;
      g.setLineDash(allowed?[]:[3,3]);
      g.beginPath();g.moveTo(px(e.A[0]),py(e.A[1]));g.lineTo(px(e.B[0]),py(e.B[1]));g.stroke();
    }
    g.setLineDash([]);g.strokeStyle='#efcf84';g.lineWidth=2;
    g.beginPath();g.moveTo(px(pos.x),py(pos.z));
    for(const [x,z] of path)g.lineTo(px(x),py(z));
    g.stroke();
    g.fillStyle='#ffac57';g.fillRect(px(target[0])-3,py(target[1])-3,6,6);
    g.save();g.translate(px(pos.x),py(pos.z));g.rotate(-heading);
    g.beginPath();g.moveTo(0,6);g.lineTo(-4,-4);g.lineTo(0,-2);g.lineTo(4,-4);g.closePath();
    g.fillStyle='#fff';g.fill();g.restore();
    g.font='12px sans-serif';g.fillStyle='#e0e8de';g.fillText('N ↑',8,15);
    const meters=local?50:200, x=8,y=w-10;
    g.fillRect(x,y,meters*s,2);g.fillText(meters+' m',x,y-4);
  };
}
