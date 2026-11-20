// 预算探针：逐个隐藏场景顶层子节点，测量三角面/绘制调用的减少量
import puppeteer from 'puppeteer-core';
const shot = process.argv[2] || 'hero';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-angle=d3d11','--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
p.on('console', m => { if (['error','info'].includes(m.type())) console.log('LOG', m.text()); });
await p.goto('http://localhost:5173/?scene=alley_moss&ui=0&shot=' + shot); await p.waitForFunction('window.__ready===true||window.__error', { timeout: 180000 });
await new Promise(r => setTimeout(r, 1500));
const res = await p.evaluate(async () => {
  const { scene, renderer } = window.__app; const wait = () => new Promise(r => setTimeout(r, 1500));
  const read = () => ({ t: renderer.info.render.triangles, d: renderer.info.render.drawCalls });
  await wait(); const base = read(); const out = ['base ' + (base.t / 1e6).toFixed(2) + 'M ' + base.d];
  for (let i = 0; i < scene.children.length; i++) { const c = scene.children[i]; if (!c.visible || c.isLight || c.isObject3D && c.type==='Object3D') continue; c.visible = false; await wait(); const r = read(); c.visible = true;
    let tri = 0; c.traverse(o => { if (o.isMesh) { const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    out.push(i + ' ' + c.type + ' ' + (c.name||'') + ' -' + ((base.t - r.t) / 1e6).toFixed(2) + 'M -' + (base.d - r.d) + 'dc geo=' + (tri/1e6).toFixed(2)); }
  return out; });
console.log(res.join('\n')); await b.close();
