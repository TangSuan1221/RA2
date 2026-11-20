// 统计：分别隐藏反射/阴影后的三角面
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist' ], defaultViewport: { width: 1600, height: 900 } } );
setTimeout( () => process.exit( 2 ), 100000 );
const p = await b.newPage();
await p.goto( 'http://localhost:5173/?scene=alley_moss&shot=hero&ui=0' );
await p.waitForFunction( 'window.__ready === true', { timeout: 90000 } );
const r = await p.evaluate( async () => {
	const w = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
	const s = window.__app.scene; const out = {};
	await w( 800 ); out.base = window.__stats.triangles;
	let water; s.traverse( ( o ) => { if ( o.isMesh && o.renderOrder === 1 ) water = o; } );
	water.visible = false; await w( 800 ); out.noRefl = window.__stats.triangles; water.visible = true;
	const sun = s.children.find( ( o ) => o.isDirectionalLight ); sun.castShadow = false; await w( 800 ); out.noSunShadow = window.__stats.triangles;
	return out;
} );
console.log( JSON.stringify( r ) );
await b.close(); process.exit( 0 );
