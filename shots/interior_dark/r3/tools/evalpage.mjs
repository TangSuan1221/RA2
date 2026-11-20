// 打开场景页面并在页面里执行表达式（调试用）：node evalpage.mjs "<url>" "<js 表达式>"
import puppeteer from 'puppeteer-core';
const [ url, expr ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1600,900' ], defaultViewport: { width: 1600, height: 900 } } );
const page = await browser.newPage();
const logs = [];
page.on( 'console', ( m ) => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url + '&ui=0', { waitUntil: 'load', timeout: 120000 } );
await page.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
console.log( JSON.stringify( await page.evaluate( expr ), null, 1 ) );
console.log( logs.slice( 0, 30 ).join( '\n' ) );
await browser.close();
