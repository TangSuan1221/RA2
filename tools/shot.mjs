// 无头截图工具：用本机 Chrome（带 GPU / WebGPU）渲染指定场景与机位并保存 PNG
// 用法：
//   node tools/shot.mjs --url "http://localhost:5173/?scene=interior&shot=hall" --out shots/x.png [--w 1600 --h 900] [--wait 6000]
//   node tools/shot.mjs --batch shots/plan.json      plan.json = [{ "url": "...", "out": "..." }, ...]
// 页面就绪约定：main.js 渲染稳定后设置 window.__ready = true；同时把统计写到 window.__stats
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = Object.fromEntries( process.argv.slice( 2 ).reduce( ( a, v, i, arr ) => ( v.startsWith( '--' ) ? [ ...a, [ v.slice( 2 ), arr[ i + 1 ]?.startsWith( '--' ) ? true : arr[ i + 1 ] ] ] : a ), [] ) );
const W = + ( args.w || 1600 ), H = + ( args.h || 900 ), WAIT = + ( args.wait || 4000 );
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const jobs = args.batch ? JSON.parse( await readFile( args.batch, 'utf8' ) ) : [ { url: args.url, out: args.out } ];

const browser = await puppeteer.launch( {
	executablePath: CHROME,
	headless: 'new',
	args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}` ],
	defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
} );

const results = [];
for ( const job of jobs ) {

	const page = await browser.newPage();
	const logs = [];
	page.on( 'console', ( m ) => { if ( [ 'error', 'warn' ].includes( m.type() ) ) logs.push( `[${m.type()}] ${m.text()}` ); } );
	page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
	const url = job.url + ( job.url.includes( '?' ) ? '&' : '?' ) + 'ui=0';
	const t0 = performance.now();
	try {

		await page.goto( url, { waitUntil: 'load', timeout: 120000 } );
		await page.waitForFunction( 'window.__ready === true || window.__error', { timeout: 180000 } );
		await new Promise( ( r ) => setTimeout( r, + ( job.wait || WAIT ) ) ); // 让 TRAA 收敛
		const stats = await page.evaluate( () => ( { error: window.__error || null, stats: window.__stats || null } ) );
		await mkdir( dirname( job.out ), { recursive: true } );
		await page.screenshot( { path: job.out, type: job.out.endsWith( '.jpg' ) ? 'jpeg' : 'png', quality: job.out.endsWith( '.jpg' ) ? 88 : undefined } );
		results.push( { out: job.out, ms: Math.round( performance.now() - t0 ), ...stats, logs: logs.slice( 0, 20 ) } );

	} catch ( e ) {

		results.push( { out: job.out, failed: e.message, logs: logs.slice( 0, 20 ) } );

	}

	await page.close();

}

await browser.close();
console.log( JSON.stringify( results, null, 2 ) );
if ( args.report ) await writeFile( args.report, JSON.stringify( results, null, 2 ) );
