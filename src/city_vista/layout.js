// 城市远景：公园场地布局
//   坐标：+X 东（画面右），-Z 为镜头前方。机位位于 z≈+4 的高台上，公园地面 y=0。
//   一张 CPU 生成的「场地遮罩」同时用于：地面着色（小径/泥地/草的茂密度）和草/树的摆放，保证两者一致。
import * as THREE from 'three/webgpu';
import { fbm2, smooth, distToPolyline, smoothPolyline } from './util.js';

// 遮罩覆盖范围（米）
export const MASK = { x0: - 220, x1: 220, z0: - 300, z1: 40, res: 1024 };

// 公园小径（被草吞没的混凝土步道）
export const PATHS = [
	{ pts: smoothPolyline( [ [ 6, - 8 ], [ 0, - 30 ], [ - 10, - 52 ], [ - 14, - 78 ], [ - 26, - 100 ], [ - 40, - 118 ] ] ), w: 2.4 },
	{ pts: smoothPolyline( [ [ - 10, - 52 ], [ 12, - 64 ], [ 40, - 70 ], [ 75, - 84 ] ] ), w: 1.8 },
];
// 旧停车场 / 公路（高架桥下）
export const ROAD = { z0: - 132, z1: - 116 };

// 高台（前景平台）边缘：z 小于此值即跌落到公园地面
export const ledgeEdge = ( x ) => - 1.6 + ( fbm2( x * 0.18, 3.1 ) - 0.5 ) * 2.2 + Math.max( 0, Math.abs( x + 1 ) - 9 ) * 0.35;

/**
 * 场地属性：返回 { path, dirt, lush, road } 均为 0..1
 */
export function fieldAt( x, z ) {

	let path = 0;
	for ( const p of PATHS ) {

		const d = distToPolyline( x, z, p.pts );
		// 边缘被草侵蚀：用噪声扰动宽度
		const w = p.w * ( 0.75 + fbm2( x * 0.3, z * 0.3 ) * 0.5 );
		path = Math.max( path, smooth( w, w * 0.45, d ) );

	}

	const road = smooth( 0.0, 1.5, z - ROAD.z0 ) * smooth( 0.0, 1.5, ROAD.z1 - z ) * ( 0.85 + fbm2( x * 0.2, z * 0.2 ) * 0.15 );
	// 裸露泥地斑块（被动物踩踏、积水干涸）
	const dirt = smooth( 0.62, 0.78, fbm2( x * 0.045 + 7, z * 0.045 - 3, 4 ) ) * ( 1 - path );
	// 草的茂密度：大尺度斑块 + 小尺度碎斑
	const lush = smooth( 0.3, 0.7, fbm2( x * 0.03 - 11, z * 0.03 + 5, 4 ) * 0.7 + fbm2( x * 0.2, z * 0.2, 2 ) * 0.3 );
	return { path, dirt, lush, road };

}

// 烘焙遮罩到 DataTexture：R=小径 G=泥地 B=茂密度 A=道路
export function bakeFieldMask() {

	const { x0, x1, z0, z1, res } = MASK;
	const data = new Uint8Array( res * res * 4 );
	for ( let j = 0; j < res; j ++ ) {

		const z = z0 + ( z1 - z0 ) * ( j + 0.5 ) / res;
		for ( let i = 0; i < res; i ++ ) {

			const x = x0 + ( x1 - x0 ) * ( i + 0.5 ) / res;
			const f = fieldAt( x, z );
			const o = ( j * res + i ) * 4;
			data[ o ] = f.path * 255; data[ o + 1 ] = f.dirt * 255; data[ o + 2 ] = f.lush * 255; data[ o + 3 ] = f.road * 255;

		}

	}

	const t = new THREE.DataTexture( data, res, res, THREE.RGBAFormat );
	t.magFilter = THREE.LinearFilter;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.needsUpdate = true;
	return t;

}
