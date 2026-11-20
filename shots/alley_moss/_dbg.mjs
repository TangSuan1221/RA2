// 调试截图：在截图前执行一段 JS（例如隐藏对象），用法：node _dbg.mjs out.jpg "js" [shot]
import puppeteer from 'puppeteer-core';
const [ out, js = '', shot = 'hero' ] = process.argv.slice( 2 );
const b = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist' ], defaultViewport: { width: 1600, height: 900 } } );
const p = await b.newPage();
const logs = [];
p.on( 'console', ( m ) => [ 'error', 'warn' ].includes( m.type() ) && logs.push( m.type() + ' ' + m.text() ) );
p.on( 'pageerror', ( e ) => logs.push( 'pageerror ' + e.message ) );
await p.goto( `http://localhost:5173/?scene=alley_moss&shot=${shot}&ui=0` );
await p.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
const res = await p.evaluate( js || '0' );
setTimeout( () => process.exit( 2 ), 60000 );
await new Promise( ( r ) => setTimeout( r, 2500 ) );
await p.screenshot( { path: out, type: 'jpeg', quality: 88 } );
console.log( JSON.stringify( res ), logs.slice( 0, 8 ).join( '\n' ) );
await b.close();
