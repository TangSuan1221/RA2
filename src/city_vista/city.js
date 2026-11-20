// 城市远景：中远景建筑
//   · 低模盒体（带退台、屋顶机房），全部合并成一个网格 → 1 次绘制调用
//   · 立面完全由 TSL 程序化生成：窗格网格（框/玻璃/破窗/封板）、楼层腰线、污渍流痕、底部爬藤
//   · 每栋楼的参数（层高、窗距、风格、底色、随机种子）写进顶点属性
//   · 抗锯齿：窗格频率高于像素时按 fwidth 平滑过渡到平均色，避免远景闪烁
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, max, min, abs, floor, fract, step, attribute, uv,
	positionWorld, normalWorldGeometry, mx_fractal_noise_float, mx_noise_float, fwidth, sin, hash, uint,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxMeters, addConstAttr, rng } from './util.js';

const n01 = ( p, oct = 3 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

// 风格：0 = 混凝土打孔窗（老酒店/办公楼），1 = 玻璃幕墙（现代高楼），2 = 砖墙
export const STYLE = { PUNCHED: 0, GLASS: 1, BRICK: 2 };

// 单栋楼：{ x, z, w, d, h, ry, style, color, floorH, winW, seed, tiers:[{h, inset}] }
function towerGeometry( b ) {

	const parts = [];
	const r = rng( b.seed );
	let y = 0;
	const tiers = b.tiers || [ { h: b.h, inset: 0 } ];
	for ( const t of tiers ) {

		const w = b.w - t.inset * 2, d = b.d - t.inset * 2;
		const g = boxMeters( w, t.h, d );
		// uv 以米计 + 本层起始高度，保证窗格连续
		const uvA = g.attributes.uv, nA = g.attributes.normal;
		for ( let i = 0; i < uvA.count; i ++ ) if ( Math.abs( nA.getY( i ) ) < 0.5 ) uvA.setY( i, uvA.getY( i ) + y );
		g.translate( 0, y, 0 );
		parts.push( g );
		y += t.h;
		// 檐口（女儿墙压顶）
		const cap = boxMeters( w + 0.8, 1.2, d + 0.8 );
		cap.translate( 0, y - 0.6, 0 );
		addConstAttr( cap, 'roofBox', 1 );
		parts.push( cap );

	}

	// 屋顶机房 / 水箱
	const nRoof = 1 + Math.floor( r() * 3 );
	const top = tiers[ tiers.length - 1 ];
	for ( let i = 0; i < nRoof; i ++ ) {

		const w = ( b.w - top.inset * 2 ) * ( 0.15 + r() * 0.25 ), d = ( b.d - top.inset * 2 ) * ( 0.15 + r() * 0.25 ), h = 2 + r() * 4;
		const g = boxMeters( w, h, d );
		g.translate( ( r() - 0.5 ) * ( b.w - top.inset * 2 - w ) * 0.8, y, ( r() - 0.5 ) * ( b.d - top.inset * 2 - d ) * 0.8 );
		addConstAttr( g, 'roofBox', 1 );
		parts.push( g );

	}

	for ( const g of parts ) if ( ! g.attributes.roofBox ) addConstAttr( g, 'roofBox', 0 );
	const g = mergeGeometries( parts );
	g.rotateY( b.ry || 0 );
	g.translate( b.x, b.base || 0, b.z );
	const c = new THREE.Color( b.color );
	addConstAttr( g, 'bColor', [ c.r, c.g, c.b ], 3 );
	addConstAttr( g, 'bTop', ( b.base || 0 ) + y );
	addConstAttr( g, 'bParams', [ b.floorH || 3.6, b.winW || 3, b.style || 0, ( b.seed % 997 ) / 997 ], 4 );
	return g;

}

function facadeMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.85, metalness: 0 } );
	const bc = attribute( 'bColor', 'vec3' );
	const bp = attribute( 'bParams', 'vec4' );
	const roofBox = attribute( 'roofBox', 'float' );
	const floorH = bp.x, winW = bp.y, style = bp.z, seed = bp.w;
	const isGlass = step( 0.5, style ).mul( step( style, 1.5 ) );
	const isBrick = step( 1.5, style );
	const p = positionWorld;
	const q = uv();
	const vertical = smoothstep( 0.5, 0.2, abs( normalWorldGeometry.y ) );

	// —— 窗格 ——
	const cellU = q.x.div( winW ), cellV = q.y.div( floorH );
	const cu = floor( cellU ), cv = floor( cellV );
	const fu = fract( cellU ), fv = fract( cellV );
	// 每格随机数
	const rnd = hash( uint( cu.add( 512 ).mul( 7919 ).add( cv.mul( 104729 ) ).add( seed.mul( 99991 ) ) ) );
	const rnd2 = hash( uint( cu.add( 913 ).mul( 15485863 ).add( cv.mul( 32452843 ) ).add( seed.mul( 7777 ) ) ) );
	// 窗洞尺寸：玻璃幕墙几乎满格，打孔窗较小
	const ww = mix( mix( float( 0.56 ), float( 0.92 ), isGlass ), float( 0.5 ), isBrick );
	const wh = mix( mix( float( 0.55 ), float( 0.86 ), isGlass ), float( 0.6 ), isBrick );
	const fwU = fwidth( cellU ).max( 1e-4 ), fwV = fwidth( cellV ).max( 1e-4 );
	const boxStep = ( f, half, fw ) => smoothstep( half.add( fw ), half.sub( fw ), abs( f.sub( 0.5 ) ) );
	const inWin = boxStep( fu, ww.mul( 0.5 ), fwU ).mul( boxStep( fv.sub( 0.04 ), wh.mul( 0.5 ), fwV ) );
	// 远处（格子小于约 3 像素）淡出为平均色
	const far = smoothstep( 0.22, 0.55, max( fwU, fwV ) );
	const groundFloor = step( cv, 0.5 );

	// 玻璃颜色：反射天空的蓝灰，破窗为黑洞，部分封板（墙色），部分残留窗帘（暖灰）
	const broken = step( rnd, mix( float( 0.3 ), float( 0.2 ), isGlass ) );
	const boarded = step( 0.93, rnd2 ).mul( float( 1 ).sub( isGlass ) );
	const curtain = step( 0.78, rnd2 ).mul( step( rnd2, 0.93 ) );
	const glassTint = mix( vec3( 0.04, 0.05, 0.06 ), vec3( 0.08, 0.11, 0.15 ), isGlass ).mul( rnd2.mul( 0.8 ).add( 0.5 ) );
	let glassCol = mix( glassTint, vec3( 0.16, 0.14, 0.11 ), curtain.mul( 0.7 ) );
	glassCol = mix( glassCol, vec3( 0.006, 0.006, 0.006 ), broken );
	// 墙体：底色 × 大尺度污渍 × 竖向流痕
	const grime = n01( vec3( p.x.mul( 0.05 ), p.y.mul( 0.03 ), p.z.mul( 0.05 ) ), 3 );
	const streak = n01( vec3( p.x.mul( 0.9 ).add( p.z.mul( 0.9 ) ), p.y.mul( 0.02 ), seed.mul( 10 ) ), 2 );
	let wall = vec3( bc ).mul( 0.78 ).mul( grime.mul( 0.7 ).add( 0.55 ) ).mul( float( 1 ).sub( smoothstep( 0.5, 0.85, streak ).mul( 0.45 ) ) );
	// 大块污损：火烧/水浸后的发黑区域（按楼层×窗列的低频噪声）
	const scorch = smoothstep( 0.62, 0.78, n01( vec3( q.x.mul( 0.04 ), q.y.mul( 0.05 ), seed.mul( 31 ) ), 3 ) );
	wall = wall.mul( float( 1 ).sub( scorch.mul( 0.45 ) ) );
	// 砖：细横纹
	wall = mix( wall, wall.mul( mix( float( 0.82 ), float( 1.05 ), step( 0.12, fract( q.y.mul( 13 ) ) ) ) ), isBrick.mul( float( 1 ).sub( far ) ) );
	// 楼层腰线（打孔窗楼）
	const band = smoothstep( 0.06, 0.0, abs( fv.sub( 0.02 ) ) ).mul( float( 1 ).sub( isGlass ) ).mul( float( 1 ).sub( far ) );
	wall = wall.mul( float( 1 ).sub( band.mul( 0.25 ) ) );
	// 窗下的黑色水渍
	const underWin = smoothstep( 0.6, 0.0, fv ).mul( boxStep( fu, ww.mul( 0.45 ), fwU ) ).mul( float( 1 ).sub( isGlass ) ).mul( n01( vec3( p.xz.mul( 0.7 ), p.y.mul( 0.2 ) ), 2 ) );
	wall = wall.mul( float( 1 ).sub( underWin.mul( 0.35 ) ) );
	// 玻璃幕墙的竖向窗框（深灰金属）
	wall = mix( wall, vec3( bc ).mul( 0.55 ), isGlass.mul( 0.6 ) );

	const winK = inWin.mul( float( 1 ).sub( boarded ) ).mul( vertical ).mul( float( 1 ).sub( roofBox ) );
	const avgGlass = mix( vec3( 0.035, 0.04, 0.045 ), vec3( 0.07, 0.09, 0.12 ), isGlass );
	const winFrac = mix( ww.mul( wh ), float( 0.75 ), isGlass );
	const nearCol = mix( wall, glassCol, winK );
	const farCol = mix( wall, avgGlass, winFrac.mul( 0.95 ).mul( vertical ).mul( float( 1 ).sub( roofBox ) ) );
	let col = mix( nearCol, farCol, far );
	// 底层商铺：更暗、更多破损
	col = mix( col, col.mul( 0.55 ), groundFloor.mul( vertical ).mul( 0.7 ) );

	// 爬藤/苔藓：从底部向上蔓延 + 屋顶边缘的绿化
	const creepH = n01( vec3( p.x.mul( 0.08 ), 0, p.z.mul( 0.08 ) ), 3 ).mul( 34 ).add( 4 );
	const ivyN = n01( p.mul( 0.35 ), 3 );
	const ivy = smoothstep( creepH, creepH.sub( 10 ), p.y ).mul( smoothstep( 0.3, 0.55, ivyN ) ).mul( vertical );
	const roofMoss = smoothstep( 0.7, 0.95, normalWorldGeometry.y ).mul( smoothstep( 0.3, 0.5, ivyN ) );
	// 屋顶垂挂下来的藤蔓：从楼顶向下的不规则带
	const topH = attribute( 'bTop', 'float' );
	const hangLen = n01( vec3( p.x.mul( 0.15 ), 3.0, p.z.mul( 0.15 ) ), 3 ).mul( 18 );
	const hang = smoothstep( topH.sub( hangLen ), topH.sub( hangLen.mul( 0.4 ) ), p.y ).mul( smoothstep( 0.45, 0.62, n01( vec3( p.x.mul( 0.5 ).add( p.z.mul( 0.5 ) ), p.y.mul( 0.05 ), 7 ), 3 ) ) ).mul( vertical );
	const ivyCol = mix( vec3( 0.03, 0.05, 0.015 ), vec3( 0.09, 0.12, 0.035 ), n01( p.mul( 1.7 ), 2 ) );
	col = mix( col, ivyCol, max( max( ivy, hang ), roofMoss.mul( 0.85 ) ) );
	m.colorNode = col;

	// 玻璃：光滑、带一点金属感以反射天空
	const glassK = winK.mul( float( 1 ).sub( broken ) ).mul( float( 1 ).sub( far.mul( 0.6 ) ) ).mul( float( 1 ).sub( ivy ) );
	m.roughnessNode = mix( float( 0.88 ), mix( float( 0.25 ), float( 0.08 ), isGlass ), glassK );
	m.metalnessNode = glassK.mul( mix( float( 0.15 ), float( 0.45 ), isGlass ) );
	void Fn; void vec2; void vec4; void clamp; void min; void mx_noise_float; void sin; void uniform;
	return m;

}

// —— 城市布局：中景 / 远景楼宇。机位在 (0, ~10, 4) 看向 -Z ——
export const TOWERS = [
	// Foreground civic block interrupts the open lawn and establishes human scale.
	// —— 第一排（z -140 ~ -200）：构图主体 ——
	// 左：米白色老酒店（大面积打孔窗，顶部出画）
	{ x: - 108, z: - 150, w: 64, d: 30, h: 118, ry: 0.42, style: 0, color: 0xb0a893, floorH: 3.3, winW: 2.4, seed: 11, tiers: [ { h: 8, inset: - 1 }, { h: 110, inset: 0 } ] },
	// 左中：浅蓝玻璃塔
	{ x: - 62, z: - 205, w: 30, d: 26, h: 128, ry: 0.12, style: 1, color: 0x7f93a3, floorH: 3.8, winW: 1.8, seed: 13, tiers: [ { h: 100, inset: 0 }, { h: 28, inset: 3 } ] },
	// 中左：带广告牌的砖楼
	{ x: - 18, z: - 172, w: 30, d: 22, h: 44, ry: 0.05, style: 2, color: 0x6e5244, floorH: 3.4, winW: 3.0, seed: 15 },
	{ x: - 40, z: - 160, w: 22, d: 20, h: 26, ry: 0.1, style: 0, color: 0x9d988b, floorH: 3.6, winW: 2.8, seed: 31 },
	// 中：深色玻璃高楼（教堂左后）
	{ x: 8, z: - 300, w: 34, d: 30, h: 150, ry: 0.0, style: 1, color: 0x5d7083, floorH: 3.8, winW: 2.0, seed: 16 },
	// 右中：大体量玻璃办公楼
	{ x: 78, z: - 205, w: 72, d: 36, h: 96, ry: - 0.18, style: 1, color: 0x6f8598, floorH: 3.9, winW: 2.2, seed: 17, tiers: [ { h: 70, inset: 0 }, { h: 26, inset: 4 } ] },
	// 右：低矮宽体建筑（展馆）
	{ x: 64, z: - 150, w: 70, d: 26, h: 18, ry: - 0.12, style: 0, color: 0xc4c3bb, floorH: 4.5, winW: 5, seed: 18 },
	// 最右：高塔（出画）
	{ x: 150, z: - 175, w: 40, d: 34, h: 150, ry: - 0.35, style: 1, color: 0x768a9c, floorH: 3.8, winW: 2.0, seed: 19 },
	// —— 第二排（z -260 ~ -380）——
	{ x: - 150, z: - 270, w: 40, d: 36, h: 140, ry: 0.3, style: 0, color: 0xa3a39c, floorH: 3.5, winW: 2.4, seed: 12 },
	{ x: - 95, z: - 320, w: 36, d: 32, h: 175, ry: 0.0, style: 1, color: 0x7a8c9b, floorH: 3.8, winW: 1.8, seed: 20 },
	{ x: - 30, z: - 360, w: 30, d: 30, h: 120, ry: 0.2, style: 0, color: 0x9b9890, floorH: 3.6, winW: 2.4, seed: 21 },
	{ x: 60, z: - 330, w: 40, d: 36, h: 185, ry: - 0.05, style: 1, color: 0x667b8f, floorH: 3.8, winW: 2.0, seed: 22 },
	{ x: 120, z: - 290, w: 36, d: 32, h: 120, ry: - 0.3, style: 0, color: 0xb5b2a6, floorH: 3.5, winW: 2.4, seed: 28 },
	{ x: 200, z: - 260, w: 44, d: 40, h: 110, ry: - 0.4, style: 1, color: 0x6e8396, floorH: 3.8, winW: 2.2, seed: 29 },
	// —— 远景（z -450 以外）——
	{ x: - 230, z: - 460, w: 50, d: 40, h: 150, ry: 0.2, style: 1, color: 0x7c8a95, floorH: 3.8, winW: 2, seed: 23 },
	{ x: - 120, z: - 520, w: 44, d: 40, h: 120, ry: 0.0, style: 0, color: 0x8f918c, floorH: 3.6, winW: 2.6, seed: 24 },
	{ x: 0, z: - 560, w: 46, d: 40, h: 230, ry: 0.1, style: 1, color: 0x76889a, floorH: 3.8, winW: 2, seed: 25 },
	{ x: 140, z: - 500, w: 50, d: 44, h: 170, ry: - 0.2, style: 1, color: 0x667a8c, floorH: 3.8, winW: 2, seed: 26 },
	{ x: 280, z: - 420, w: 50, d: 40, h: 130, ry: - 0.4, style: 0, color: 0x9a978e, floorH: 3.6, winW: 2.6, seed: 27 },
	{ x: - 320, z: - 330, w: 40, d: 50, h: 90, ry: 0.5, style: 0, color: 0xa39d8d, floorH: 3.4, winW: 2.6, seed: 30 },
	// 高架后的低层街区（填补楼脚）
	{ x: - 70, z: - 140, w: 30, d: 16, h: 12, ry: 0.05, style: 2, color: 0x6b5446, floorH: 3.6, winW: 3.2, seed: 32 },
	{ x: 20, z: - 145, w: 34, d: 16, h: 10, ry: - 0.04, style: 0, color: 0x8d877c, floorH: 3.6, winW: 3.4, seed: 33 },
	{ x: 120, z: - 140, w: 34, d: 16, h: 14, ry: - 0.2, style: 2, color: 0x705a4a, floorH: 3.6, winW: 3.2, seed: 34 },
];

export function buildCity() {

	const geos = TOWERS.map( towerGeometry );
	const g = mergeGeometries( geos );
	g.computeBoundingSphere();
	const mesh = new THREE.Mesh( g, facadeMaterial() );
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'city';
	return mesh;

}
