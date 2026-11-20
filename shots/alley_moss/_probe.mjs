// 调试：列出场景里三角面最多的网格（三角数 × 实例数）
import puppeteer from 'puppeteer-core';
const url = process.argv[ 2 ] || 'http://localhost:5173/?scene=alley_moss&shot=hero&ui=0';
const b = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist' ], defaultViewport: { width: 1600, height: 900 } } );
const p = await b.newPage();
const logs = [];
p.on( 'console', ( m ) => logs.push( m.type() + ' ' + m.text() ) );
p.on( 'pageerror', ( e ) => logs.push( 'pageerror ' + e.message ) );
await p.goto( url );
await p.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
const r = await p.evaluate( () => {
	const out = [];
	window.__app.scene.traverse( ( o ) => {
		if ( ! o.isMesh ) return;
		const g = o.geometry; const t = ( g.index ? g.index.count : g.attributes.position.count ) / 3;
		const n = o.isInstancedMesh ? o.count : 1;
		out.push( [ o.name || o.material?.name || o.geometry.type, Math.round( t ), n, Math.round( t * n ), o.castShadow ] );
	} );
	out.sort( ( a, b ) => b[ 3 ] - a[ 3 ] );
	return { top: out.slice( 0, 25 ), total: out.reduce( ( s, a ) => s + a[ 3 ], 0 ), n: out.length, stats: window.__stats };
} );
console.log( JSON.stringify( r, null, 0 ).replace( /\],\[/g, '],\n[' ) );
console.log( logs.slice( 0, 20 ).join( '\n' ) );
await b.close();
