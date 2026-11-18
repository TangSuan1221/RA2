// 从 Poly Haven（CC0 授权）下载 P0 样板间所需资产到 public/assets/
// 用法：npm run fetch-assets        （已存在的文件会跳过）
//   追加下载（多个 Agent 并行时用这个，不要改本文件）：
//   node tools/fetch-assets.mjs --models a,b --textures moss_wood:2k,concrete_moss:1k --hdris abandoned_garage:2k
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const OUT = join( ROOT, 'public', 'assets' );
const UA = { 'User-Agent': 'the-last-rule-dev/0.1' };

// —— 资产清单 ——（改这里即可增删）
const HDRIS = [ [ 'urban_street_01', '1k' ] ];
const TEXTURES = [
	[ 'road_damaged', '2k' ], // 破损沥青路面
	[ 'concrete_tiles', '2k' ], // 人行道
	[ 'brown_mud_leaves_01', '1k' ], // 泥土落叶（荒地）
	[ 'leafy_grass', '1k' ], // 苔藓/杂草覆盖层
	[ 'brushed_concrete', '1k' ], // 屋顶
];
const MODELS = [
	'modular_urban_apartments_facade', 'modular_fire_escape', 'rollershutter_door',
	'covered_car', 'concrete_road_barrier', 'modular_chainlink_fence', 'street_lamp_01',
	'trashbag', 'cardboard_box_01', 'old_tyre', 'barrel_03', 'metal_trash_can', 'utility_box_01',
	'dead_tree_trunk', 'fern_02', 'shrub_02', 'shrub_04', 'nettle_plant', 'weed_plant_02',
];

// 命令行参数：只下载指定资产（不改默认清单）
const cli = Object.fromEntries( process.argv.slice( 2 ).reduce( ( a, v, i, arr ) => ( v.startsWith( '--' ) ? [ ...a, [ v.slice( 2 ), arr[ i + 1 ] || '' ] ] : a ), [] ) );
if ( Object.keys( cli ).length ) {

	const split = ( s ) => ( s ? s.split( ',' ).filter( Boolean ) : [] );
	const pair = ( s, d ) => split( s ).map( ( x ) => { const [ id, r ] = x.split( ':' ); return [ id, r || d ]; } );
	HDRIS.length = 0; HDRIS.push( ...pair( cli.hdris, '1k' ) );
	TEXTURES.length = 0; TEXTURES.push( ...pair( cli.textures, '1k' ) );
	MODELS.length = 0; MODELS.push( ...split( cli.models ) );

}

const api = async ( path ) => ( await fetch( `https://api.polyhaven.com/${path}`, { headers: UA } ) ).json();

async function exists( p ) {

	try { await access( p ); return true; } catch { return false; }

}

const jobs = [];
const queue = ( url, dest ) => jobs.push( { url, dest } );

for ( const [ id, res ] of HDRIS ) {

	const f = await api( `files/${id}` );
	queue( f.hdri[ res ].hdr.url, join( OUT, 'hdri', `${id}_${res}.hdr` ) );

}

for ( const [ id, res ] of TEXTURES ) {

	const f = await api( `files/${id}` );
	for ( const [ key, suffix ] of [ [ 'Diffuse', 'diff' ], [ 'nor_gl', 'nor_gl' ], [ 'arm', 'arm' ] ] ) {

		queue( f[ key ][ res ].jpg.url, join( OUT, 'textures', id, `${id}_${suffix}_${res}.jpg` ) );

	}

}

for ( const id of MODELS ) {

	const files = await api( `files/${id}` );
	const g = files.gltf[ '1k' ].gltf;
	const dir = join( OUT, 'models', id );
	queue( g.url, join( dir, `${id}.gltf` ) );
	for ( const [ rel, info ] of Object.entries( g.include ) ) queue( info.url, join( dir, rel ) );
	// glTF 包里的漫反射是 JPG（无透明通道），镂空植被/铁丝网需要额外下载独立的 Alpha 贴图
	for ( const key of Object.keys( files ) ) {

		if ( ! /alpha/i.test( key ) || ! files[ key ][ '1k' ]?.jpg ) continue;
		const name = key === 'Alpha' ? 'alpha' : key;
		queue( files[ key ][ '1k' ].jpg.url, join( dir, 'textures', `${id}_${name}_1k.jpg` ) );

	}

}

let done = 0, bytes = 0;
async function worker() {

	while ( jobs.length ) {

		const { url, dest } = jobs.shift();
		if ( await exists( dest ) ) { done ++; continue; }
		const r = await fetch( url, { headers: UA } );
		if ( ! r.ok ) throw new Error( `${r.status} ${url}` );
		const buf = Buffer.from( await r.arrayBuffer() );
		await mkdir( dirname( dest ), { recursive: true } );
		await writeFile( dest, buf );
		bytes += buf.length; done ++;

	}

}

const total = jobs.length;
await Promise.all( Array.from( { length: 6 }, worker ) );

const ids = [ ...HDRIS.map( h => h[ 0 ] ), ...TEXTURES.map( t => t[ 0 ] ), ...MODELS ];
await writeFile( join( OUT, 'LICENSES.md' ), `# 资产授权\n\n以下资产均来自 Poly Haven（https://polyhaven.com），授权为 CC0（公共领域，可商用，无需署名）。\n\n${ids.map( i => `- ${i} — https://polyhaven.com/a/${i}` ).join( '\n' )}\n` );
console.log( `完成：${done}/${total} 个文件，本次下载 ${( bytes / 1e6 ).toFixed( 1 )} MB` );
