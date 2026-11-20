// 地面信息图（CPU 生成，0.125m/像素）：所有地面细节与植被摆放共用同一套遮罩，保证"裂缝里长草、洼地里积水、车底最暗"一致
//   R：裂缝距离场（米，0..0.5 → 0..255，255 = 无裂缝）—— 双线性插值后在着色器里阈值化，线宽可到 2cm
//   G：洼地深度（车辙、坑洼、排水沟）0..1 —— 积水由它决定，不再是随机噪声斑块
//   B：烘焙遮蔽（建筑脚、车底、路障、沙袋下方）1 = 无遮蔽
//   A：堆积物（泥、苔藓、落叶：路缘、墙根、裂缝两侧、车辆周围）
import * as THREE from 'three/webgpu';
import { rng, fbm, vnoise, smooth, clamp01 } from './noise.js';
import { L, onRoad, onWalk } from './layout.js';

export const GM = { x0: - 64, z0: - 176, x1: 64, z1: 48, res: 0.125 };
GM.w = Math.round( ( GM.x1 - GM.x0 ) / GM.res );
GM.h = Math.round( ( GM.z1 - GM.z0 ) / GM.res );

// 遮挡体登记：{ x, z, hw, hd, ry, r: 衰减半径, k: 强度 }（矩形，可旋转）
export const occluders = [];
export function addOccluder( x, z, hw, hd, ry = 0, r = 0.8, k = 0.75 ) {

	occluders.push( { x, z, hw, hd, ry, r, k } );

}

// 整数哈希（CPU）
function h2( x, y, s ) {

	let h = ( x * 374761393 + y * 668265263 + s * 982451653 ) | 0;
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}

// Voronoi：返回 F2-F1 的一半（≈ 到最近裂缝边的距离）与单元 id
function voronoiEdge( x, y, cell, seed ) {

	const fx = x / cell, fy = y / cell;
	const ix = Math.floor( fx ), iy = Math.floor( fy );
	let d1 = 1e9, d2 = 1e9, id = 0;
	let p1x = 0, p1y = 0;
	const pts = [];
	for ( let j = - 1; j <= 1; j ++ ) for ( let i = - 1; i <= 1; i ++ ) {

		const cx = ix + i, cy = iy + j;
		const px = cx + 0.1 + 0.8 * h2( cx, cy, seed ), py = cy + 0.1 + 0.8 * h2( cx, cy, seed + 7 );
		pts.push( px, py );
		const d = ( px - fx ) ** 2 + ( py - fy ) ** 2;
		if ( d < d1 ) { d2 = d1; d1 = d; id = h2( cx, cy, seed + 3 ); p1x = px; p1y = py; } else if ( d < d2 ) d2 = d;

	}

	// 精确边距离：到每个相邻点中垂线的距离取最小
	let e = 1e9;
	for ( let k = 0; k < pts.length; k += 2 ) {

		const px = pts[ k ], py = pts[ k + 1 ];
		if ( px === p1x && py === p1y ) continue;
		const mx = ( px + p1x ) / 2, my = ( py + p1y ) / 2;
		let nx = px - p1x, ny = py - p1y;
		const nl = Math.hypot( nx, ny ); nx /= nl; ny /= nl;
		const d = ( mx - fx ) * nx + ( my - fy ) * ny;
		if ( d < e ) e = d;

	}

	return [ e * cell, id ];

}

let _data = null;
// [x, z, 半径x, 半径z, 深度]
const POTHOLES = [ [ 0.6, 19, 2.6, 5.5, 0.9 ], [ - 1.8, 9, 1.8, 3.2, 0.85 ], [ 2.8, 2, 1.6, 4, 0.8 ], [ - 0.5, - 12, 3.5, 2.2, 0.85 ], [ 3.5, - 16, 2, 1.5, 0.8 ], [ - 2.5, - 34, 2.2, 5, 0.9 ], [ 1.2, - 52, 2.5, 6, 0.9 ], [ - 1, - 70, 3, 7, 0.9 ] ];
// 生成（在所有遮挡体登记完之后调用）
export function buildGroundMap( buildings ) {

	const { w, h, res, x0, z0 } = GM;
	const data = new Uint8Array( w * h * 4 );
	const ao = new Float32Array( w * h ).fill( 1 );

	// —— 遮蔽：每个遮挡体只遍历包围盒 ——
	const occl = occluders.concat( buildings.map( ( b ) => ( { x: ( b.x0 + b.x1 ) / 2, z: ( b.z0 + b.z1 ) / 2, hw: ( b.x1 - b.x0 ) / 2, hd: ( b.z1 - b.z0 ) / 2, ry: 0, r: 2.2, k: 0.6 } ) ) );
	for ( const o of occl ) {

		const c = Math.cos( o.ry ), s = Math.sin( o.ry );
		const ext = Math.hypot( o.hw, o.hd ) + o.r * 3;
		const ia = Math.max( 0, Math.floor( ( o.x - ext - x0 ) / res ) ), ib = Math.min( w - 1, Math.ceil( ( o.x + ext - x0 ) / res ) );
		const ja = Math.max( 0, Math.floor( ( o.z - ext - z0 ) / res ) ), jb = Math.min( h - 1, Math.ceil( ( o.z + ext - z0 ) / res ) );
		for ( let j = ja; j <= jb; j ++ ) for ( let i = ia; i <= ib; i ++ ) {

			const px = x0 + ( i + 0.5 ) * res - o.x, pz = z0 + ( j + 0.5 ) * res - o.z;
			// 旋转到局部（物体 ry 为绕 Y 旋转）
			const lx = c * px - s * pz, lz = s * px + c * pz;
			const dx = Math.abs( lx ) - o.hw, dz = Math.abs( lz ) - o.hd;
			const d = Math.hypot( Math.max( dx, 0 ), Math.max( dz, 0 ) ) + Math.min( Math.max( dx, dz ), 0 );
			const v = 1 - o.k * ( d < 0 ? 1 : Math.exp( - d / o.r ) );
			const k = j * w + i;
			ao[ k ] = Math.min( ao[ k ], v );

		}

	}

	for ( let j = 0; j < h; j ++ ) {

		const z = z0 + ( j + 0.5 ) * res;
		for ( let i = 0; i < w; i ++ ) {

			const x = x0 + ( i + 0.5 ) * res;
			const ax = Math.abs( x );
			const road = onRoad( x, z ), walk = onWalk( x, z );
			// —— 裂缝：龟裂（Voronoi 边）+ 纵向长裂缝；由低频噪声控制哪里开裂 ——
			const gate = fbm( x * 0.06, z * 0.06, 3, 41 );
			const [ e1 ] = voronoiEdge( x, z, road ? 2.4 : 1.6, 5 );
			const [ e2 ] = voronoiEdge( x, z, 0.8, 9 ); // 细碎龟裂（只在重度破损区）
			const wob = ( vnoise( z * 0.35, 1.3, 3 ) - 0.5 ) * 0.5 + ( vnoise( z * 1.7, 4.1, 5 ) - 0.5 ) * 0.12;
			let crack = 9;
			if ( road ) {

				const g1 = smooth( 0.36, 0.5, gate ), g2 = smooth( 0.55, 0.66, gate );
				if ( g1 > 0.01 ) crack = Math.min( crack, e1 + ( 1 - g1 ) * 0.5 );
				if ( g2 > 0.01 ) crack = Math.min( crack, e2 + ( 1 - g2 ) * 0.4 );
				// 车道接缝纵裂
				const seam = Math.min( Math.abs( ax - 3.5 + wob ), Math.abs( x - 0.0 + wob * 0.6 ) );
				if ( fbm( z * 0.05, 7.7, 2, 13 ) > 0.45 && onRoad( x, z ) && Math.abs( x ) < L.roadHalf ) crack = Math.min( crack, seam );
				// 路缘接缝
				crack = Math.min( crack, Math.abs( ax - L.roadHalf + 0.05 ) + 0.01 );

			} else if ( walk ) {

				// 人行道：方砖接缝由贴图提供，这里只有树根顶裂的大裂缝
				if ( gate > 0.55 ) crack = Math.min( crack, e1 + ( 0.7 - Math.min( gate, 0.7 ) ) * 2 );

			}

			// —— 洼地：车辙（4 车道 × 两条轮迹）、坑洼、排水沟 ——
			let dep = 0;
			if ( road ) {

				const lane = ( ( ax % 3.5 ) + 3.5 ) % 3.5; // 车道内坐标
				const rut = Math.max( smooth( 0.55, 0.0, Math.abs( lane - 0.9 + wob * 0.3 ) ), smooth( 0.55, 0.0, Math.abs( lane - 2.6 + wob * 0.3 ) ) );
				const n = fbm( x * 0.09, z * 0.09, 4, 77 );
				dep = rut * 0.75 * smooth( 0.3, 0.65, n ) + smooth( 0.45, 0.78, n ) * 0.8;
				// 坑洼：龟裂区的单元塌陷
				dep += smooth( 0.62, 0.8, gate ) * smooth( 0.4, 0.0, e1 ) * 0.25;
				// 排水沟（路缘内侧 0.8m）
				dep += smooth( 1.0, 0.0, Math.abs( ax - L.roadHalf + 0.25 ) ) * 0.35 * smooth( 0.3, 0.6, fbm( z * 0.15, 3.3, 2, 19 ) );
				dep += ( fbm( x * 0.6, z * 0.6, 2, 88 ) - 0.5 ) * 0.18;

				// 指定坑洼（构图用：街面机位前景与中景的积水倒影）
				for ( const [ px, pz, rx, rz, k ] of POTHOLES ) {

					const d = Math.hypot( ( x - px ) / rx, ( z - pz ) / rz ) + ( fbm( x * 0.8, z * 0.8, 2, 23 ) - 0.5 ) * 0.5;
					dep = Math.max( dep, smooth( 1.0, 0.35, d ) * k );

				}

			} else if ( walk ) {

				dep = smooth( 0.62, 0.85, fbm( x * 0.15, z * 0.15, 3, 99 ) ) * 0.8;

			}

			// —— 堆积物：路缘、墙根、裂缝两侧 ——
			const gutter = road ? smooth( 1.4, 0.0, Math.abs( ax - L.roadHalf ) ) : 0;
			const wallFoot = walk ? smooth( 1.2, 0.0, ( L.roadHalf + L.walk ) - ax ) : 0;
			const crackDirt = smooth( 0.35, 0.0, crack );
			const k = j * w + i;
			const accum = clamp01( Math.max( gutter * 0.9, wallFoot, crackDirt * 0.4, ( 1 - ao[ k ] ) * 0.8 ) * ( 0.55 + 0.6 * fbm( x * 0.4, z * 0.4, 3, 55 ) ) );

			const o = k * 4;
			data[ o ] = Math.min( 255, Math.round( Math.min( crack, 0.5 ) / 0.5 * 255 ) );
			data[ o + 1 ] = Math.round( clamp01( dep ) * 255 );
			data[ o + 2 ] = Math.round( clamp01( ao[ k ] ) * 255 );
			data[ o + 3 ] = Math.round( accum * 255 );

		}

	}

	_data = data;
	const tex = new THREE.DataTexture( data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType );
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
	tex.needsUpdate = true;
	GM.tex = tex;
	return tex;

}

// CPU 采样（植被/碎屑摆放用），返回 { crack(米), dep, ao, acc }
export function sampleGM( x, z ) {

	const i = Math.floor( ( x - GM.x0 ) / GM.res ), j = Math.floor( ( z - GM.z0 ) / GM.res );
	if ( ! _data || i < 0 || j < 0 || i >= GM.w || j >= GM.h ) return { crack: 1, dep: 0, ao: 1, acc: 0 };
	const o = ( j * GM.w + i ) * 4;
	return { crack: _data[ o ] / 255 * 0.5, dep: _data[ o + 1 ] / 255, ao: _data[ o + 2 ] / 255, acc: _data[ o + 3 ] / 255 };

}
