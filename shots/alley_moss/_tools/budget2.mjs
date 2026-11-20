// 预算探针：指定顶层子节点，逐个隐藏它的子节点
import puppeteer from 'puppeteer-core';
const shot = process.argv[2] || 'hero'; const idxs = process.argv.slice(3).map(Number);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-angle=d3d11','--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/?scene=alley_moss&ui=0&shot=' + shot); await p.waitForFunction('window.__ready===true||window.__error', { timeout: 180000 });
await new Promise(r => setTimeout(r, 1500));
const res = await p.evaluate(async (idxs) => {
  const { scene, renderer } = window.__app; const wait = () => new Promise(r => setTimeout(r, 1200));
  const read = () => ({ t: renderer.info.render.triangles, d: renderer.info.render.drawCalls });
  await wait(); const base = read(); const out = ['base ' + (base.t / 1e6).toFixed(2) + 'M ' + base.d];
  for (const gi of idxs) { const g = scene.children[gi];
    for (let i = 0; i < g.children.length; i++) { const c = g.children[i]; if (!c.visible || c.isLight) continue; c.visible = false; await wait(); const r = read(); c.visible = true;
      out.push(gi + '.' + i + ' ' + c.type + ' ' + (c.material?.name || c.name || '') + ' -' + ((base.t - r.t) / 1e6).toFixed(2) + 'M -' + (base.d - r.d) + 'dc'); } }
  return out; }, idxs);
console.log(res.join('\n')); await b.close();
