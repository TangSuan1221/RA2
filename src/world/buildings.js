// 程序化建筑：用 Poly Haven「模块化城市公寓立面」套件按规则拼装废弃楼
// 模块规格：墙段 3m 宽 × 3m 高，局部坐标 x ∈ [-3, 0]，朝 +Z
// 规则：
//   底层：沿街面为商铺大窗 / 门，部分被卷帘门封死
//   楼层：随机窗型，部分窗户玻璃破碎（不放玻璃）、部分封板（实墙）
//   楼层分隔线：cornice 腰线；顶部：crown 女儿墙；底部：base 勒脚
import * as THREE from 'three/webgpu';
import { InstanceBatch, trs, pbrMaterial } from './assets.js';
import { boxWorldUV } from './ground.js';
import { weathered } from '../materials/weathering.js';

const FLOOR_H = 3, MOD = 3;

// 简单可复现随机数
export function rng( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = ( s * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

}

const UPPER_WINDOWS = [ 'centered_large_02', 'centered_double_02', 'centered_small_02', 'offset_small_03' ];
const GROUND_WINDOWS = [ 'centered_large_01', 'centered_double_01' ];

// 四个立面：起点、行进方向、旋转
function sides( x0, z0, x1, z1 ) {

	return [
		{ name: 'S', start: [ x0, z1 ], dir: [ 1, 0 ], ry: 0, len: x1 - x0 },
		{ name: 'E', start: [ x1, z1 ], dir: [ 0, - 1 ], ry: Math.PI / 2, len: z1 - z0 },
		{ name: 'N', start: [ x1, z0 ], dir: [ - 1, 0 ], ry: Math.PI, len: x1 - x0 },
		{ name: 'W', start: [ x0, z0 ], dir: [ 0, 1 ], ry: - Math.PI / 2, len: z1 - z0 },
	];

}

let _shared = null;
function sharedMaterials() {

	if ( _shared ) return _shared;
	const roof = pbrMaterial( 'brushed_concrete', '1k', 1 );
	weathered( roof, { strength: 1.5 } );
	const interior = new THREE.MeshStandardNodeMaterial( { color: 0x15140f, roughness: 0.95 } );
	_shared = { roof, interior };
	return _shared;

}

/**
 * @param {object} kit  loadModel('modular_urban_apartments_facade') 的结果
 * @param {object} b    { x0, z0, x1, z1, floors, seed, shopSides: ['S'], tint }
 */
export function buildBuilding( kit, b, batch = new InstanceBatch() ) {

	const P = kit.parts;
	const r = rng( b.seed );
	const H = b.floors * FLOOR_H;
	const tint = b.tint ? new THREE.Color( b.tint ) : null;
	const noGlass = ( part ) => ! /glass/i.test( part.material.name );

	for ( const s of sides( b.x0, b.z0, b.x1, b.z1 ) ) {

		const n = Math.round( s.len / MOD );
		const isShop = ( b.shopSides || [] ).includes( s.name );
		const doorAt = isShop ? 1 + Math.floor( r() * ( n - 2 ) ) : - 1;

		for ( let i = 0; i < n; i ++ ) {

			const px = s.start[ 0 ] + s.dir[ 0 ] * MOD * ( i + 1 );
			const pz = s.start[ 1 ] + s.dir[ 1 ] * MOD * ( i + 1 );

			for ( let f = 0; f < b.floors; f ++ ) {

				const y = f * FLOOR_H;
				const m = trs( px, y, pz, s.ry );
				const roll = r();

				if ( f === 0 ) {

					if ( i === doorAt ) {

						batch.add( P, 'wall_door_centered_large_01', m, tint );
						batch.add( P, 'door_centered_large_01', m, null, roll < 0.6 ? noGlass : null );

					} else if ( isShop && roll < 0.75 ) {

						const w = GROUND_WINDOWS[ Math.floor( r() * GROUND_WINDOWS.length ) ];
						batch.add( P, `wall_window_${w}`, m, tint );
						batch.add( P, `window_${w}`, m, null, r() < 0.55 ? noGlass : null );

					} else {

						batch.add( P, 'wall_standard_standard_01', m, tint );

					}

					batch.add( P, 'base_standard_01', m );

				} else {

					if ( roll < 0.18 ) {

						batch.add( P, 'wall_standard_standard_01', m, tint ); // 封死/无窗

					} else {

						const w = UPPER_WINDOWS[ Math.floor( r() * UPPER_WINDOWS.length ) ];
						batch.add( P, `wall_window_${w}`, m, tint );
						batch.add( P, `window_${w}`, m, null, r() < 0.4 ? noGlass : null ); // 40% 玻璃已碎

					}

					batch.add( P, 'cornice_standard_standard_01', trs( px, y - 0.1, pz, s.ry ) );

				}

			}

			batch.add( P, 'crown_standard_standard_01', trs( px, H, pz, s.ry ) );

		}

		// 立面转角的壁柱
		batch.add( P, 'wall_pier_corner_01', trs( s.start[ 0 ], 0, s.start[ 1 ], s.ry ), tint );
		for ( let f = 1; f < b.floors; f ++ ) batch.add( P, 'wall_pier_corner_01', trs( s.start[ 0 ], f * FLOOR_H, s.start[ 1 ], s.ry ), tint );

	}

	// 室内暗体（透过破窗看到的黑暗室内）+ 屋顶板
	const { roof, interior } = sharedMaterials();
	const inset = 0.35;
	const inner = new THREE.Mesh( new THREE.BoxGeometry( b.x1 - b.x0 - inset * 2, H - 0.05, b.z1 - b.z0 - inset * 2 ), interior );
	inner.position.set( ( b.x0 + b.x1 ) / 2, H / 2, ( b.z0 + b.z1 ) / 2 );
	inner.receiveShadow = true;
	const roofMesh = new THREE.Mesh( boxWorldUV( b.x0 + 0.02, H - 0.3, b.z0 + 0.02, b.x1 - 0.02, H + 0.05, b.z1 - 0.02, 2.5 ), roof );
	roofMesh.receiveShadow = roofMesh.castShadow = true;

	return { batch, extra: [ inner, roofMesh ], height: H };

}

// 给立面套件的材质统一加上废土层（只需调用一次）
export function weatherFacadeKit( kit ) {

	const done = new Set();
	for ( const list of Object.values( kit.parts ) ) {

		for ( const { material } of list ) {

			if ( done.has( material ) || /glass/i.test( material.name ) ) continue;
			done.add( material );
			weathered( material, { strength: /plaster/.test( material.name ) ? 1.0 : 0.7 } );

		}

	}

}
