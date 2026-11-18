// 地面：泥地底板、破损沥青路（带积水）、人行道与路缘石
// 场景布局（单位：米，+X 东，+Z 南）：
//   东西向主路  z ∈ [-4, 4]
//   南北向支路  x ∈ [8, 16]
//   人行道宽 3m，路缘高 0.15m
import * as THREE from 'three/webgpu';
import { uniform, float, vec3, mix, smoothstep, positionWorld, mx_fractal_noise_float, materialColor, materialRoughness, texture } from 'three/tsl';
import { pbrMaterial, loadTexture } from './assets.js';
import { weathered, puddleGround, tintDetail } from '../materials/weathering.js';

export const ground = { grass: uniform( 0.4 ), grassColor: uniform( new THREE.Color( 0x3b4724 ) ) };

export const LAYOUT = {
	roadEW: { z0: - 4, z1: 4 },
	roadNS: { x0: 8, x1: 16 },
	sidewalk: 3,
	curb: 0.15,
	extent: 60, // 地面半径
};

// 平面几何体，UV 按世界尺寸平铺（tile 米一个贴图周期）
function planeXZ( x0, z0, x1, z1, tile, y = 0 ) {

	const g = new THREE.PlaneGeometry( x1 - x0, z1 - z0, 1, 1 );
	g.rotateX( - Math.PI / 2 );
	g.translate( ( x0 + x1 ) / 2, y, ( z0 + z1 ) / 2 );
	const pos = g.attributes.position, uv = g.attributes.uv;
	for ( let i = 0; i < pos.count; i ++ ) uv.setXY( i, pos.getX( i ) / tile, - pos.getZ( i ) / tile );
	return g;

}

// 盒子几何体，各面 UV 都按世界尺寸平铺
function boxWorldUV( x0, y0, z0, x1, y1, z1, tile ) {

	const g = new THREE.BoxGeometry( x1 - x0, y1 - y0, z1 - z0 );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		const ax = Math.abs( nor.getX( i ) ), ay = Math.abs( nor.getY( i ) );
		if ( ay > 0.5 ) uv.setXY( i, x / tile, - z / tile );
		else if ( ax > 0.5 ) uv.setXY( i, z / tile, y / tile );
		else uv.setXY( i, x / tile, y / tile );

	}

	return g;

}

export { boxWorldUV };

export function onRoad( x, z ) {

	const { roadEW, roadNS } = LAYOUT;
	return ( z > roadEW.z0 && z < roadEW.z1 ) || ( x > roadNS.x0 && x < roadNS.x1 );

}

// 地表高度：人行道抬高 0.15m，其余为 0
export function heightAt( x, z ) {

	if ( onRoad( x, z ) ) return 0;
	const { roadEW, roadNS, sidewalk: sw, curb } = LAYOUT;
	const nearEW = ( z > roadEW.z0 - sw && z < roadEW.z0 ) || ( z > roadEW.z1 && z < roadEW.z1 + sw );
	const nearNS = ( x > roadNS.x0 - sw && x < roadNS.x0 ) || ( x > roadNS.x1 && x < roadNS.x1 + sw );
	return nearEW || nearNS ? curb : 0;

}

export function buildGround() {

	const group = new THREE.Group();
	const { roadEW, roadNS, sidewalk: sw, curb, extent: E } = LAYOUT;

	// —— 荒地底板：泥土与野草按噪声混合（西雅图潮湿气候下，荒地 20 年后是绿色的）——
	const mud = pbrMaterial( 'brown_mud_leaves_01', '1k' );
	const grassMap = loadTexture( 'textures/leafy_grass/leafy_grass_diff_1k.jpg', { srgb: true } );
	const pw = positionWorld.xz;
	const g = mx_fractal_noise_float( vec3( pw.x, 0, pw.y ).mul( 0.08 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const grassMask = smoothstep( float( 0.55 ).sub( ground.grass.mul( 0.4 ) ), float( 0.65 ).sub( ground.grass.mul( 0.4 ) ), g );
	mud.colorNode = mix( materialColor.rgb.mul( 0.55 ), tintDetail( texture( grassMap, pw.mul( 0.45 ) ).rgb, ground.grassColor ), grassMask );
	mud.roughnessNode = mix( materialRoughness, float( 0.9 ), grassMask );
	const base = new THREE.Mesh( planeXZ( - E, - E, E, E, 2.2, - 0.02 ), mud );
	base.receiveShadow = true;
	group.add( base );

	// —— 沥青路（东西 + 南北，交叉口合并为一块）——
	const road = pbrMaterial( 'road_damaged', '2k' );
	puddleGround( road );
	const roads = [
		planeXZ( - E, roadEW.z0, E, roadEW.z1, 4.0 ),
		planeXZ( roadNS.x0, - E, roadNS.x1, roadEW.z0, 4.0 ),
		planeXZ( roadNS.x0, roadEW.z1, roadNS.x1, E, 4.0 ),
	];
	for ( const g of roads ) {

		const m = new THREE.Mesh( g, road );
		m.receiveShadow = true;
		group.add( m );

	}

	// —— 人行道：四个街角各一块 L 形（用两块矩形拼）——
	const walk = pbrMaterial( 'concrete_tiles', '2k' );
	weathered( walk, { strength: 1.1 } );
	const curbMat = pbrMaterial( 'brushed_concrete', '1k' );
	weathered( curbMat, { strength: 0.9 } );

	const blocks = [
		// [x0, z0, x1, z1] 街区范围（不含道路）
		[ - E, - E, roadNS.x0, roadEW.z0 ], // 西南
		[ - E, roadEW.z1, roadNS.x0, E ], // 西北
		[ roadNS.x1, - E, E, roadEW.z0 ], // 东南
		[ roadNS.x1, roadEW.z1, E, E ], // 东北
	];
	for ( const [ x0, z0, x1, z1 ] of blocks ) {

		// 靠路一侧的人行道条带
		const nearZ = z1 === roadEW.z0 ? [ z1 - sw, z1 ] : [ z0, z0 + sw ];
		const nearX = x1 === roadNS.x0 ? [ x1 - sw, x1 ] : [ x0, x0 + sw ];
		const strips = [
			[ x0, nearZ[ 0 ], x1, nearZ[ 1 ] ],
			[ nearX[ 0 ], z0, nearX[ 1 ], z1 ],
		];
		for ( const [ a, b, c, d ] of strips ) {

			const m = new THREE.Mesh( boxWorldUV( a, - 0.1, b, c, curb, d, 1.85 ), walk );
			m.receiveShadow = true;
			m.castShadow = true;
			group.add( m );

		}

		// 路缘石（人行道外沿 0.25m 宽）
		const cz = z1 === roadEW.z0 ? z1 - 0.25 : z0;
		const cx = x1 === roadNS.x0 ? x1 - 0.25 : x0;
		for ( const [ a, b, c, d ] of [ [ x0, cz, x1, cz + 0.25 ], [ cx, z0, cx + 0.25, z1 ] ] ) {

			const m = new THREE.Mesh( boxWorldUV( a, - 0.1, b, c, curb + 0.01, d, 1.0 ), curbMat );
			m.receiveShadow = true;
			group.add( m );

		}

	}

	return group;

}
