// 打开页面 → 执行表达式 → 等待 → 截图：node evalshot.mjs "<url>" "<js>" out.jpg [wait]
import puppeteer from 'puppeteer-core';
const [ url, expr, out, wait = 3000 ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1600,900' ], defaultViewport: { width: 1600, height: 900 } } );
const page = await browser.newPage();
const logs = [];
page.on( 'console', ( m ) => { if ( [ 'error', 'warn' ].includes( m.type() ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url + '&ui=0', { waitUntil: 'load', timeout: 120000 } );
await page.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
console.log( JSON.stringify( await page.evaluate( expr ) ) );
await new Promise( ( r ) => setTimeout( r, + wait ) );
await page.screenshot( { path: out, type: 'jpeg', quality: 90 } );
console.log( logs.slice( 0, 20 ).join( '\n' ) );
await browser.close();
