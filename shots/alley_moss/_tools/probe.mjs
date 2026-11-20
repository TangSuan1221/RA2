// 探针：统计场景各部分三角面
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5173/?scene=alley_moss&shot=hero&ui=0';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-angle=d3d11','--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
p.on('console', m => { if (['error','warn','info'].includes(m.type())) console.log('LOG', m.text()); });
await p.goto(url); await p.waitForFunction('window.__ready===true||window.__error', { timeout: 180000 });
const res = await p.evaluate(() => {
  const out = {}; const s = window.__app.scene;
  s.traverse(o => { if (!o.isMesh || !o.visible) return; let par = o; while (par.parent && par.parent !== s) par = par.parent;
    if (o.parent && o.parent.isLOD && o.parent.levels[0].object !== o) return;
    const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    const k = (par.name || par.type) + ':' + s.children.indexOf(par) + ':' + (o.material.name || o.material.type);
    out[k] = (out[k] || 0) + t; });
  return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ' ' + (v / 1e6).toFixed(3) + 'M');
});
console.log(res.join('\n'));
await b.close();
