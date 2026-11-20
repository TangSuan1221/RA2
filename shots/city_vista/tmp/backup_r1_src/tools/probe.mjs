// 调试探针：读取场景运行时信息（树高、各网格三角面数）
import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const b = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist' ], defaultViewport: { width: 800, height: 450 } } );
const p = await b.newPage();
p.on( 'console', ( m ) => { if ( m.type() === 'error' ) console.log( 'ERR', m.text() ); } );
await p.goto( url + '&ui=0' );
await p.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
const r = await p.evaluate( () => {
	const s = window.__app.scene; const out = [];
	s.traverse( ( o ) => { if ( o.isMesh ) { const g = o.geometry; const t = ( g.index ? g.index.count : g.attributes.position.count ) / 3; out.push( [ o.name || o.material?.name || o.type, Math.round( t ), o.count || 1, Math.round( t * ( o.count || 1 ) ) ] ); } } );
	out.sort( ( a, b ) => b[ 3 ] - a[ 3 ] );
	return { meshes: out.slice( 0, 25 ), extra: window.__app.ctx.debug || null };
} );
console.log( JSON.stringify( r, null, 1 ) );
await b.close();
