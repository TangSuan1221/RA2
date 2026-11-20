// 场景：城市远景（参考 ref1 · TLOU Part I 被植被吞没的城市公园）
//   从长满苔藓的混凝土高台俯瞰一片荒废的公园球场：齐腰野草、落叶乔木、倒伏的铁丝网、记分牌，
//   中景是高架轨道桥与废弃车辆，远处是破窗高楼、哥特教堂尖塔与雪山，大气透视让远景变蓝灰。
import * as THREE from 'three/webgpu';
import { setupAtmosphere, gradeLDR, air, look } from '../city_vista/atmos.js';
import { bakeFieldMask, ledgeEdge, fieldAt } from '../city_vista/layout.js';
import { buildGround, buildLedge, terrainH, groundLook, ledgeHeight } from '../city_vista/ground.js';
import { buildGrass, grassLook } from '../city_vista/grass.js';
import { buildTrees, treeLook } from '../city_vista/trees.js';
import { buildCity } from '../city_vista/city.js';
import { buildChurch, buildMountains, buildOverpass, buildSign, buildFences, buildBus } from '../city_vista/landmarks.js';
import { rng, fbm2 } from '../city_vista/util.js';
import { loadModel, InstanceBatch, trs } from '../world/assets.js';

export const SHOTS = {
	hero: { position: [ 1.5, 6.6, 4.2 ], lookAt: [ - 2, 4.2, - 80 ], fov: 50 },
	top: { mode: 'top', yaw: 0, pitch: 55, distance: 48, target: [ - 8, 0, - 42 ] },
};

// 树的摆放：参考图的构图（左侧大树、中景树团、右侧树丛、远处沿高架的树带）
function treeList() {

	const r = rng( 333 );
	const L = [];
	const put = ( type, x, z, s, extra = {} ) => {

		if ( fieldAt( x, z ).path > 0.4 ) return;
		L.push( { type, x, y: terrainH( x, z ) - 0.15, z, s, ry: r() * 6.28, ...extra } );

	};

	// 左侧中景大树团（参考图左侧树林）
	put( 'ash', - 34, - 52, 1.1 );
	put( 'oak', - 48, - 70, 1.15 );
	put( 'aspen', - 26, - 78, 1.0 );
	put( 'ash', - 58, - 50, 1.0 );
	put( 'oak', - 70, - 82, 1.2 );
	put( 'oak', - 20, - 40, 0.85 );
	put( 'ash', - 40, - 34, 0.9 );
	put( 'bush', - 22, - 30, 1.0 );
	put( 'bush', - 30, - 24, 1.2 );
	put( 'bush', - 12, - 50, 0.8 );
	put( 'bush', - 44, - 44, 1.3 );
	// 中景（较矮，不挡住远处楼群）
	put( 'aspen', 6, - 86, 0.75 );
	put( 'bush', 10, - 60, 0.9 );
	put( 'bush', - 4, - 98, 1.4 );
	// 右侧树丛
	put( 'ash', 44, - 64, 1.05 );
	put( 'oak', 38, - 92, 1.0 );
	put( 'bush', 24, - 40, 1.0 );
	put( 'aspen', 56, - 46, 1.0 );
	put( 'bush', 46, - 30, 1.3 );
	// 沿高架的树带（远景简化树）
	for ( let x = - 140; x < 160; x += 10 + r() * 10 ) {

		const z = - 108 - r() * 8;
		if ( Math.abs( x + 2 ) < 18 ) continue;
		put( r() < 0.5 ? 'farA' : 'farB', x, z, 0.75 + r() * 0.45 );

	}

	// 高架后方
	for ( let x = - 180; x < 200; x += 13 + r() * 12 ) put( r() < 0.5 ? 'farA' : 'farB', x, - 132 - r() * 20, 0.7 + r() * 0.5 );
	// 中景树团（高架前，参考图中部的大片树冠）
	put( 'oak', - 18, - 102, 1.1 );
	put( 'ash', 22, - 104, 1.0 );
	put( 'aspen', - 30, - 96, 0.9 );
	put( 'bush', 16, - 76, 1.3 );
	put( 'bush', - 8, - 70, 1.1 );
	// 左侧前景大树（构图框架）
	put( 'ash', - 26, - 22, 1.15 );
	put( 'oak', - 48, - 24, 1.1 );
	// 公园内散布
	for ( let i = 0; i < 30; i ++ ) {

		const x = r.range( - 110, 110 ), z = r.range( - 105, - 45 );
		if ( Math.abs( x ) < 18 ) continue;
		put( r() < 0.5 ? 'farA' : 'farB', x, z, 0.75 + r() * 0.4 );

	}

	return L;

}

export async function build( { scene, renderer, camera } ) {

	const atm = await setupAtmosphere( scene, renderer, camera );
	const fenceKit = await loadModel( 'modular_chainlink_fence' );
	const carKit = await loadModel( 'covered_car' );

	const mask = bakeFieldMask();
	scene.add( buildGround( mask ) );
	scene.add( buildLedge() );

	// 草：高台以外的公园
	const grass = buildGrass( {
		camPos: [ 1.5, 5.5 ],
		exclude: ( x, z ) => Math.abs( x ) < 40 && z > ledgeEdge( x ) - 0.4,
		// 高台上：沿前缘与裂缝长出的草丛（避开机位正下方）
		extra: ( r ) => {

			const out = [];
			for ( let i = 0; i < 2600; i ++ ) {

				const x = r.range( - 26, 26 ), z = ledgeEdge( x ) + Math.pow( r(), 1.7 ) * 9;
				const n = fbm2( x * 0.22 + 4, z * 0.22, 3 );
				const edge = 1 - Math.min( 1, ( z - ledgeEdge( x ) ) / 3 );
				if ( n + edge * 0.15 < 0.6 ) continue;
				if ( Math.abs( x - 1.5 ) < 2.5 && z > 2 ) continue;
				out.push( { x, y: ledgeHeight( x, z ) - 0.03, z, s: 0.35 + r() * 0.45 + edge * 0.15 } );

			}

			return out;

		},
	} );
	scene.add( grass );

	const trees = buildTrees( treeList() );
	scene.add( trees );

	scene.add( buildCity() );
	scene.add( buildChurch( 26, - 255, - 0.1 ) );
	scene.add( buildMountains() );
	scene.add( buildOverpass( - 124 ) );
	scene.add( buildSign( 21, - 38, - 0.45 ) );
	scene.add( buildBus( - 34, - 112, 1.45 ) );

	// 铁丝网：前景横向一道（部分倒伏）、右侧斜向一道
	scene.add( buildFences( fenceKit, [
		[ [ - 34, - 14 ], [ - 14, - 12 ], [ 2, - 13 ] ],
		[ [ 14, - 10 ], [ 26, - 22 ], [ 30, - 50 ], [ 34, - 80 ] ],
		[ [ - 60, - 100 ], [ - 10, - 104 ], [ 40, - 102 ], [ 90, - 104 ] ],
	] ) );

	// 废弃车辆（盖布轿车模块）
	const cars = new InstanceBatch();
	for ( const [ x, z, ry ] of [ [ 9, - 100, 0.4 ], [ - 52, - 92, 1.2 ], [ 58, - 112, - 0.3 ] ] ) {

		const y = terrainH( x, z );
		for ( const node of Object.keys( carKit.parts ) ) {

			const isWheel = node.includes( 'wheel' );
			const local = isWheel ? carKit.offsets[ node ] : carKit.offsets.covered_car;
			cars.add( carKit.parts, node, trs( x, y, z, ry ).multiply( new THREE.Matrix4().makeTranslation( ...local ) ), isWheel ? null : new THREE.Color( 0.55, 0.58, 0.5 ) );

		}

	}

	scene.add( cars.build() );

	return {
		...atm,
		debug: trees.userData,
		update: null,
		pipelineOptions: { postLDR: ( out ) => gradeLDR( out ), bloomThreshold: 0.92 },
		gui: ( g ) => {

			const f = g.addFolder( '城市远景' );
			f.add( air.density, 'value', 0, 0.01, 0.0001 ).name( '雾密度' );
			f.add( air.skyIntensity, 'value', 0, 2, 0.01 ).name( '天空强度' );
			f.add( look.contrast, 'value', 0.8, 1.5, 0.01 ).name( '对比' );
			f.add( look.saturation, 'value', 0, 1.5, 0.01 ).name( '饱和' );
			f.add( grassLook.wind, 'value', 0, 1, 0.01 ).name( '风' );
			f.addColor( { c: groundLook.grassMid.value.getHex() }, 'c' ).name( '地面草色' ).onChange( ( v ) => groundLook.grassMid.value.setHex( v ) );
			void treeLook;

		},
	};

}
