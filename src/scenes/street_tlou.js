// 场景：street_tlou —— TLOU2 风格的西雅图废弃市中心十字路口（阴天、潮湿、冷、低饱和、植被吞城）
// 主街南北向（-Z 为远方），十字路口在 z ∈ [-22, -8]；远端是倒塌/倾斜的高楼溶在雾里
// 叙事：疫情爆发初期军方在路口设立检查站（HESCO + 沙袋 + 混凝土墩 + 刺网），之后失守；车流堵死在检查站前
import * as THREE from 'three/webgpu';
import { loadModel, InstanceBatch, trs } from '../world/assets.js';
import { setupAtmosphere, tlouGrade, atmo, tgrade, makeStrongAO, makeParticles, SHADOW_LAYER, REFLECT_LAYER } from '../street_tlou/atmosphere.js';
import { buildGround, groundP } from '../street_tlou/ground.js';
import { buildGroundMap, addOccluder, GM } from '../street_tlou/groundmap.js';
import { makeKitVariants, buildBuilding, towerGeo, towerMaterial, shadowProxy, buildDetailInstances, buildDetailMeshes, roofSpots, detail, shared } from '../street_tlou/buildings.js';
import { IvySystem, ivyStats } from '../street_tlou/ivy.js';
import { weatherModel, makeSandbags, makeConcertina, makeRubble, makePoles, makeHesco } from '../street_tlou/props.js';
import { makeCars, makeBuses } from '../street_tlou/vehicles.js';
import { buildVegetation } from '../street_tlou/vegetation.js';
import { W } from '../street_tlou/materials.js';
import { L, groundY } from '../street_tlou/layout.js';
import { rng } from '../street_tlou/noise.js';
import { GeoBin, M4 } from '../street_tlou/geo.js';
import { skyColor, air } from '../city_vista/atmos.js';
import { positionWorldDirection } from 'three/tsl';
import { reclaimStreet } from '../city_vista/reclamation.js';
import {buildTrees} from '../city_vista/trees.js';

export const SHOTS = {
	hero: { position: [ - 2.2, 1.7, 30 ], lookAt: [ 0.8, 4.0, - 60 ], fov: 52 },
	golden: { position: [ - 0.4, 1.85, 33 ], lookAt: [ 0.8, 4.0, - 60 ], fov: 56 },
	top: { mode: 'top', yaw: 35, pitch: 55, distance: 38, target: [ 0, 0, - 12 ] },
};

const MODEL_IDS = [
	'modular_urban_apartments_facade', 'modular_fire_escape', 'concrete_road_barrier_02', 'modular_chainlink_fence', 'street_lamp_01',
	'trashbag', 'cardboard_box_01', 'old_tyre', 'barrel_03', 'metal_trash_can', 'utility_box_01', 'wooden_military_crate',
	'cement_bag', 'metal_jerrycan', 'fern_02', 'shrub_02', 'weed_plant_02', 'rollershutter_door',
];

// 街区建筑（占地边长为 3 的倍数）
const BUILDINGS = [
	// 近端两侧
	{ x0: - 26, z0: - 4, x1: - 11, z1: 17, floors: 5, seed: 11, variant: 'brick', shop: [ 'E', 'N' ], tint: 0xb0aaa0, ivy: 0.6 },
	{ x0: - 26, z0: 20, x1: - 11, z1: 38, floors: 3, seed: 23, variant: 'paint', shop: [ 'E' ], tint: 0x9aa39c, ivy: 0.7 },
	{ x0: 11, z0: - 4, x1: 26, z1: 14, floors: 4, seed: 37, variant: 'concrete', shop: [ 'W', 'N' ], tint: 0xa8a59c, ivy: 0.55 },
	{ x0: 11, z0: 17, x1: 23, z1: 38, floors: 6, seed: 41, variant: 'brick', shop: [ 'W' ], tint: 0x9c8f84, ivy: 0.5 },
	// 路口另一侧：西北角坍塌（东、南立面高处逐列缺失）
	{ x0: - 29, z0: - 47, x1: - 11, z1: - 26, floors: 7, seed: 53, variant: 'concrete', shop: [ 'E', 'S' ], tint: 0x9fa19d, ivy: 0.5,
		cut: ( s, i, n ) => s === 'E' ? Math.max( 2, 7 - Math.floor( Math.max( 0, ( n - 1 - i ) - n * 0.35 ) * 1.2 ) ) : s === 'S' ? Math.max( 2, 7 - Math.floor( Math.max( 0, i - n * 0.35 ) * 1.2 ) ) : 7, cutHeight: 7 * 3 },
	{ x0: 11, z0: - 44, x1: 29, z1: - 26, floors: 5, seed: 61, variant: 'paint', shop: [ 'W', 'S' ], tint: 0x8f9a95, ivy: 0.65 },
	{ x0: - 26, z0: - 74, x1: - 11, z1: - 50, floors: 4, seed: 71, variant: 'brick', shop: [ 'E' ], tint: 0xa09486, ivy: 0.7 },
	{ x0: 11, z0: - 71, x1: 26, z1: - 47, floors: 6, seed: 83, variant: 'concrete', shop: [ 'W' ], tint: 0x9a9a94, ivy: 0.5 },
];

export async function build( { scene, renderer, camera, params } ) {

	const atm = await setupAtmosphere( scene, renderer );
	const golden = params?.get('shot') === 'golden' || params?.get('weather') === 'golden';
	if (golden) {
		atm.sun.colorNode = null;
		atm.sun.color.set(0xffe5be); atm.sun.intensity=5.6;
		atm.sun.position.set(28,20,-85); atm.sun.shadow.radius=1.6;
		scene.environmentIntensity=.36;
		air.sunDir.value.copy(atm.sun.position).normalize();
		air.skyIntensity.value=.85;air.cloud.value=.8;
		scene.backgroundNode=skyColor(positionWorldDirection);
		atmo.fogColor.value.set(0xb4ad91);atmo.fogDensity.value=.002;
		tgrade.saturation.value=.86;tgrade.contrast.value=1.12;
		tgrade.highlightTint.value.setRGB(1.03,1,.95);
		atmo.rain.value=0; W.wet.value=.26;
		scene.add(reclaimStreet());
		const saplings=buildTrees([
			{type:'farA',x:8.8,y:.16,z:19,s:.48,ry:1.1},
			{type:'farA',x:-8.6,y:.16,z:-10,s:.62,ry:2.4},
			{type:'farA',x:8.6,y:.16,z:-39,s:.7,ry:3.7},
		]);
		saplings.traverse(o=>{if(o.isMesh)o.layers.enable(SHADOW_LAYER);});
		scene.add(saplings);
	}
	const loaded = await Promise.all( MODEL_IDS.map( loadModel ) );
	const M = Object.fromEntries( MODEL_IDS.map( ( id, i ) => [ id, loaded[ i ] ] ) );
	const r = rng( 9 );
	const blocked = ( x, z, pad = 0.05 ) => BUILDINGS.some( ( b ) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad );

	// —— 车辆（先摆，地面信息图要用它们的占地做遮蔽/堆积）——
	// type：sedan / wagon / pickup；ry：车头方向（0 = 朝 -Z 远方）；door：±1 打开的车门
	const carList = [
		{ x: - 4.4, z: 21.5, ry: 0.1, type: 'sedan', door: 1, roll: 0.035, color: [ 0.11, 0.14, 0.15 ], seed: 0.55 },
		{ x: 4.0, z: 15, ry: Math.PI - 0.22, type: 'wagon' },
		{ x: - 1.2, z: 7.5, ry: 1.25, type: 'sedan', roll: - 0.04 },
		{ x: 5.2, z: - 2, ry: 0.06, type: 'pickup', door: - 1 },
		{ x: 1.8, z: - 4.8, ry: - 0.5, type: 'sedan' },
		{ x: - 5.2, z: - 30, ry: 0.22, type: 'wagon' },
		{ x: 2.5, z: - 40, ry: - 0.4, type: 'sedan', door: 1 },
		{ x: - 3.4, z: - 58, ry: 0.12, type: 'pickup' },
		{ x: 4.9, z: - 66, ry: 0.05, type: 'sedan' },
		{ x: - 18, z: - 12.5, ry: 1.62, type: 'sedan' },
		{ x: 22, z: - 17.5, ry: - 1.45, type: 'wagon', door: - 1 },
		{ x: 0.5, z: - 82, ry: 0.7, type: 'sedan' },
		{ x: - 30, z: - 16, ry: 1.5, type: 'pickup' },
		{ x: 8.1, z: 27, ry: 0.0, type: 'sedan', roll: 0.08 }, // 一侧冲上路缘
	];
	const cars = makeCars( carList, { groundY: ( x, z ) => ( x === 8.1 ? L.curb * 0.5 : 0 ) } );
	scene.add( cars.group );
	const buses = makeBuses( [
		{ x: 3.4, z: - 48, ry: 0.3, roll: 0.03, seed: 0.62 }, // 斜停路中，堵住车道
		{ x: - 3.9, z: 1.5, ry: - 0.16, roll: - 0.035, seed: 0.81, color: [ 0.36, 0.38, 0.34 ] },
	] );
	scene.add( buses.group );
	const footprints = [ ...cars.footprints, ...buses.footprints ];
	for ( const f of footprints ) addOccluder( f.x, f.z, f.hw - 0.1, f.hd - 0.05, f.ry, 0.55, 0.88 );

	// —— 建筑 ——
	const kit = M.modular_urban_apartments_facade;
	const variants = makeKitVariants( kit );
	const batch = new InstanceBatch();
	const ivy = new IvySystem();
	// 两个机位都看不到的背面不拼装（省面数）：N 面全部、西侧楼的 W 面（俯视机位从东南方看，东侧楼的 E 面可见，必须保留）
	for ( const b of BUILDINGS ) b.hide = b.x0 < 0 ? [ 'N', 'W' ] : [ 'N' ];
	for ( const b of BUILDINGS ) buildBuilding( variants, b, batch, ivy ).forEach( ( o ) => scene.add( o ) );

	// —— 坍塌转角（西北楼东南角）：断裂楼板斜插地面 + 瓦砾锥 + 外露钢筋 ——
	{

		const S = shared();
		const sb = detail.slab;
		// 三块从高层塌落的楼板：一端搭在残存楼体上，一端插在瓦砾里
		sb.box( 8, 0.35, 5.5, M4( - 13.2, 6.0, - 28.5, 0.1, 0.25, - 0.72 ), [ 0.8, 0.8, 0.78 ] );
		sb.box( 6.5, 0.3, 4.5, M4( - 9.6, 2.6, - 31.5, - 0.3, - 0.4, 0.45 ), [ 0.75, 0.75, 0.72 ] );
		sb.box( 5, 0.3, 4.2, M4( - 15, 9.5, - 31, 0.5, 0, - 0.35 ), [ 0.8, 0.8, 0.78 ] );
		// 断柱
		sb.box( 0.5, 4.5, 0.5, M4( - 11.5, 2.0, - 26.6, 0.15, 0, 0.3 ), [ 0.7, 0.7, 0.7 ] );
		for ( let i = 0; i < 40; i ++ ) detail.rebar.push( { x: - 13 + ( r() - 0.5 ) * 6, y: 2 + r() * 8, z: - 29 + ( r() - 0.5 ) * 5, rx: ( r() - 0.5 ) * 2, ry: r() * 6, rz: ( r() - 0.5 ) * 2, len: 0.6 + r() * 1.8 } );

	}

	buildDetailInstances( M, batch );
	weatherModel( M.modular_fire_escape, { moss: 0.5, streak: 1.0, desat: 0.4, dark: 0.45 } );
	weatherModel( M.rollershutter_door, { moss: 0.6, streak: 1.2, dark: 0.55 } );
	weatherModel( M.modular_chainlink_fence, { moss: 0.3, streak: 0.6, desat: 0.5, dark: 0.45 } );
	const kitGroup = batch.build( { castShadow: false } );
	scene.add( kitGroup );
	scene.add( buildDetailMeshes() );

	// —— 远景：塔楼天际线（多层剪影：近层清晰、中层退台、远层残破与塔吊）——
	const tbin = new GeoBin();
	const towers = [
		// [x, z, w, d, h, 选项]
		[ - 22, - 92, 20, 18, 34, { seed: 1 } ], [ 30, - 125, 22, 22, 38, { seed: 2, broken: true } ], [ - 30, - 120, 24, 22, 62, { seed: 3 } ],
		[ 6, - 168, 30, 24, 78, { seed: 4, crane: true } ], [ - 40, - 160, 26, 26, 54, { seed: 5, broken: true } ],
		[ - 70, - 110, 30, 30, 48, { seed: 7 } ], [ 70, - 100, 30, 30, 42, { seed: 8 } ], [ - 15, - 215, 36, 30, 98, { seed: 9 } ], [ 42, - 222, 30, 30, 66, { seed: 10, broken: true } ],
		[ - 62, - 190, 30, 26, 70, { seed: 11 } ], [ 80, - 180, 32, 28, 84, { seed: 12, crane: true } ], [ 18, - 260, 40, 30, 120, { seed: 13 } ],
		// 横街两端 + 俯视镜头可见的周边街区
		[ - 52, - 15, 24, 18, 28, { seed: 14 } ], [ - 52, 12, 22, 20, 20, { seed: 15 } ], [ 50, - 14, 22, 18, 24, { seed: 16 } ], [ 48, 18, 22, 22, 32, { seed: 17 } ],
		[ - 50, - 55, 26, 22, 36, { seed: 18, broken: true } ], [ 52, - 58, 24, 24, 30, { seed: 19 } ],
	];
	const towerProxies = new THREE.Group();
	towers.forEach( ( [ x, z, w, d, h, o ], i ) => {

		towerGeo( tbin, x, z, w, d, h, { ...o, tint: 0.8 + ( ( i * 0.37 ) % 1 ) * 0.4 } );
		const pr = shadowProxy( new THREE.BoxGeometry( w, h, d ) );
		pr.position.set( x, h / 2, z );
		towerProxies.add( pr );

	} );
	const towerMesh = tbin.build( towerMaterial(), { shadow: false } );
	scene.add( towerMesh, towerProxies );
	// 倾斜塔楼：靠在邻楼上（12°），主街右侧远处
	const lean = towerGeo( null, 24, - 90, 18, 20, 48, { tilt: 0.21, tiltAxis: 'z', seed: 21, tint: 0.9 } );
	scene.add( lean );
	// 倒塌的高楼：断成两截，上半截斜靠在对面楼上，横跨街道上空（ref5 构图的视觉焦点）
	const fallen = towerGeo( null, - 20, - 104, 14, 14, 40, { tilt: - 0.62, tiltAxis: 'z', seed: 22, setback: false, broken: true, tint: 0.85 } );
	fallen.matrix.premultiply( new THREE.Matrix4().makeTranslation( 0, - 4, 0 ) );
	const stump = towerGeo( null, - 20, - 104, 14, 14, 16, { seed: 23, setback: false, broken: true, tint: 0.85 } );
	scene.add( fallen, stump );
	const towerObjs = [ towerMesh, lean, fallen, stump ];

	// —— 常春藤补充：远景塔楼底部 ——
	for ( const [ x, z, w, d, h ] of towers.slice( 0, 3 ) ) {

		const side = x < 0 ? 1 : - 1; // 朝街一面
		ivy.addWall( [ x + side * w / 2 + side * 0.05, 0, z + d / 2 ], [ 0, 0, - 1 ], [ side, 0, 0 ], d, Math.min( h, 24 ), { cover: 0.6, seed: Math.abs( x * z ) | 0, hang: 0.5, climb: 1.0, density: 0.6 } );

	}

	// 墙根藤蔓堆
	for ( const b of BUILDINGS ) {

		for ( let i = 0; i < 7; i ++ ) {

			const onE = b.x0 < 0;
			const x = onE ? b.x1 + 0.5 : b.x0 - 0.5;
			const z = b.z0 + r() * ( b.z1 - b.z0 );
			ivy.addMound( x, groundY( x, z ), z, 0.7 + r() * 0.9, 70, b.seed + i );

		}

	}

	// 坍塌转角瓦砾上的藤蔓
	ivy.addMound( - 10, 1.2, - 30, 2.2, 160, 999 );
	const ivyMesh = ivy.build(); ivyMesh.name = 'ivy'; scene.add( ivyMesh );

	// —— 道具 ——
	const props = new InstanceBatch();
	const add = ( id, node, m, c ) => props.add( M[ id ].parts, node, m, c );
	for ( const id of [ 'concrete_road_barrier_02', 'street_lamp_01', 'trashbag', 'cardboard_box_01', 'old_tyre', 'barrel_03', 'metal_trash_can', 'utility_box_01', 'wooden_military_crate', 'cement_bag', 'metal_jerrycan' ] ) weatherModel( M[ id ], { dark: 0.62 } );

	// 军事检查站：路口北侧（远端）一线 —— 混凝土墩 + HESCO + 沙袋掩体 + 刺网 + 铁丝网门
	const barrier = ( x, z, ry, tip = 0, id = 'concrete_road_barrier_02' ) => {

		add( id, id, trs( x, tip ? 0.18 : 0, z, ry, 1, 0, tip ) );
		addOccluder( x, z, 0.85, 0.3, ry, 0.4, 0.7 );

	};

	for ( let i = 0; i < 8; i ++ ) {

		if ( i === 4 ) continue; // 缺口
		barrier( - 6.4 + i * 1.65 + ( r() - 0.5 ) * 0.15, - 24.6 + ( r() - 0.5 ) * 0.3, ( r() - 0.5 ) * 0.15 );

	}

	barrier( 6.6, - 27.2, 1.1, 1.45 ); // 翻倒
	barrier( - 2.0, - 20.5, 0.4 );
	barrier( 1.2, - 19.8, - 0.2 );
	const hesco = makeHesco( [
		{ x0: - 10.6, z0: - 26.2, x1: - 6.8, z1: - 26.2 },
		{ x0: 7.4, z0: - 25.8, x1: 10.6, z1: - 25.8 },
		{ x0: 13, z0: - 23.2, x1: 18, z1: - 23.2 },
		{ x0: - 18.5, z0: - 23.2, x1: - 13, z1: - 23.2 },
	] );
	scene.add( hesco );
	scene.add( makeSandbags( [
		{ x: - 3.5, z: - 6.3, ry: 0, len: 5, rows: 4 },
		{ x: - 6.2, z: - 5.0, ry: Math.PI / 2, len: 2.6, rows: 4 },
		{ x: 4.0, z: - 7.4, ry: 0.15, len: 3.5, rows: 3 },
		{ x: 13.5, z: - 25, ry: 0, len: 4, rows: 3, gy: L.curb },
		{ x: - 14, z: - 7, ry: 0, len: 3.2, rows: 5, gy: L.curb },
		{ x: - 9.0, z: - 22.3, ry: 0.3, len: 3.5, rows: 3 },
		{ x: 8.8, z: - 22.0, ry: - 0.4, len: 3.0, rows: 4 },
		{ x: 0.2, z: - 27.6, ry: 0, len: 3.6, rows: 2 },
	] ) );
	// 沙袋顶上的 HESCO 杂草（检查站废弃多年）
	const crate = ( x, z, ry, y = null ) => {

		const gy = y ?? groundY( x, z );
		add( 'wooden_military_crate', 'wooden_military_crate', trs( x, gy, z, ry ) );
		add( 'wooden_military_crate', 'wooden_military_crate_lid', trs( x, gy, z, ry ).multiply( new THREE.Matrix4().makeTranslation( 0, 0.38, - 0.2 ) ) );
		addOccluder( x, z, 0.62, 0.26, ry, 0.3, 0.6 );

	};

	for ( const [ x, z, ry ] of [ [ - 5.2, - 7.6, 0.2 ], [ - 4.0, - 7.8, 0.1 ], [ 14.5, - 27, 1.2 ], [ 8.6, - 6.5, 0.8 ], [ - 7.8, - 20.8, 0.5 ], [ 10.2, - 21.0, - 0.3 ] ] ) crate( x, z, ry );
	crate( - 4.6, - 7.7, 0.25, 0.38 );
	for ( let i = 0; i < 10; i ++ ) add( 'cement_bag', 'cement_bag', trs( 9.5 + r() * 1.2, 0.18 * ( i % 3 ) + L.curb, - 8.6 - r() * 1.4, r() * 6, 1 ) );
	for ( let i = 0; i < 3; i ++ ) add( 'metal_jerrycan', 'metal_jerrycan', trs( - 6.4 + r() * 1.5, 0, - 8.4 - r(), r() * 6 ) );

	// 铁丝网围栏：横街西段封锁 + 东段 + 巷口；顶部刺网
	const F = M.modular_chainlink_fence.parts;
	const fenceRuns = [];
	const fenceLine = ( x0, z0, x1, z1, gy = 0, leanAt = - 1 ) => {

		const dx = x1 - x0, dz = z1 - z0, len = Math.hypot( dx, dz ), ry = - Math.atan2( dz, dx );
		const n = Math.round( len / 2 );
		for ( let i = 0; i < n; i ++ ) {

			const u = ( i + 1 ) / n;
			const lean = i === leanAt ? 0.28 : 0;
			const x = x0 + dx * u, z = z0 + dz * u;
			props.add( F, 'modular_chainlink_fence_double', trs( x, gy, z, ry, 1, lean, 0 ) );
			const px = x0 + dx * i / n, pz = z0 + dz * i / n;
			props.add( F, 'modular_chainlink_fence_post', trs( px, gy, pz, ry ) );

		}

		props.add( F, 'modular_chainlink_fence_post', trs( x1, gy, z1, ry ) );
		fenceRuns.push( { x0, z0, x1, z1, y: gy + 2.45 } );

	};

	fenceLine( - 11.5, - 9, - 11.5, - 21, 0, 2 );
	fenceLine( 11.5, - 9, 11.5, - 21, 0, 3 );
	fenceLine( - 11.2, 17.3, - 11.2, 19.7, L.curb );
	fenceLine( 11.2, 14.3, 11.2, 16.7, L.curb );
	fenceLine( - 22, - 26.4, - 12, - 26.4, L.curb, 1 );
	scene.add( makeConcertina( fenceRuns.concat( [ { x0: - 6.3, z0: - 25.25, x1: 6, z1: - 25.25, y: 0.82 }, { x0: - 10.6, z0: - 26.2, x1: - 6.8, z1: - 26.2, y: 1.35 } ] ) ) );

	// 路灯（部分倾斜）+ 电线杆与电线
	for ( const [ x, z, ry, tilt ] of [ [ - 10.4, 26, Math.PI / 2, 0 ], [ 10.4, 8, - Math.PI / 2, 0.12 ], [ - 10.4, - 36, Math.PI / 2, 0 ], [ 10.4, - 58, - Math.PI / 2, - 0.2 ], [ - 10.4, - 80, Math.PI / 2, 0.05 ] ] ) {

		add( 'street_lamp_01', 'street_lamp_01', trs( x, L.curb, z, ry, 1.6, tilt, 0 ) );

	}

	scene.add( makePoles( [
		{ x: 9.8, z: 34 }, { x: 9.8, z: 4 }, { x: 9.8, z: - 30, tz: 0.04 }, { x: 9.8, z: - 62, tz: - 0.1 }, { x: 9.8, z: - 92, tz: 0.22, noWire: true }, { x: 6, z: - 98, tz: 1.2 },
	] ) );

	// 垃圾：沿墙根成堆（簇状），车辆周围散落；轮胎、桶、轮辋
	const pile = ( cx, cz, n, rad ) => {

		addOccluder( cx, cz, rad * 0.6, rad * 0.6, 0, 0.4, 0.45 );
		for ( let i = 0; i < n; i ++ ) {

			const a = r() * 6.28, d = Math.sqrt( r() ) * rad;
			const x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			if ( blocked( x, z, 0.25 ) ) continue;
			const k = r();
			const y = groundY( x, z );
			if ( k < 0.6 ) add( 'trashbag', 'trashbag', trs( x, y - 0.03, z, r() * 6.28, 0.8 + r() * 0.45, ( r() - 0.5 ) * 0.3, ( r() - 0.5 ) * 0.3 ) );
			else if ( k < 0.7 ) add( 'cardboard_box_01', 'cardboard_box_01', trs( x, y + 0.17, z, r() * 6.28, 0.8 + r() * 0.4, 0, r() < 0.3 ? Math.PI / 2 : 0 ) );
			else if ( k < 0.9 ) add( 'old_tyre', 'old_tyre', trs( x, y + 0.08, z, r() * 6.28, 1, Math.PI / 2 ) );
			else add( 'barrel_03', 'barrel_03', r() < 0.5 ? trs( x, y, z, r() * 6.28 ) : trs( x, y + 0.32, z, r() * 6.28, 1, Math.PI / 2 ) );

		}

	};

	for ( let z = 34; z > - 76; z -= 5 + r() * 7 ) {

		const side = r() < 0.5 ? - 1 : 1;
		const x = side * ( L.roadHalf + L.walk - 0.6 );
		if ( blocked( x, z, 0.5 ) || ( z > L.cross.z0 - 1 && z < L.cross.z1 + 1 ) ) continue;
		pile( x, z, 4 + Math.floor( r() * 6 ), 0.9 + r() * 0.8 );

	}

	// 路缘散落 + 车辆周围
	for ( let i = 0; i < 26; i ++ ) {

		const side = r() < 0.5 ? - 1 : 1;
		const x = side * ( L.roadHalf - 0.4 - r() * 0.9 ), z = 36 - r() * 110;
		const k = r();
		if ( k < 0.5 ) add( 'trashbag', 'trashbag', trs( x, - 0.03, z, r() * 6.28, 0.8 + r() * 0.4 ) );
		else if ( k < 0.8 ) add( 'old_tyre', 'old_tyre', trs( x, 0.08, z, r() * 6.28, 1, Math.PI / 2 ) );
		else add( 'barrel_03', 'barrel_03', trs( x, 0.32, z, r() * 6.28, 1, Math.PI / 2 ) );

	}

	add( 'metal_trash_can', 'metal_trash_can_rust', trs( - 10.2, L.curb, 12, 0.3 ) );
	add( 'metal_trash_can', 'metal_trash_can', trs( 9.2, L.curb + 0.28, 20, 1.1, 1, 0, 1.45 ) );
	add( 'utility_box_01', 'utility_box_01_box', trs( 10.3, L.curb, - 2, - Math.PI / 2 ) );

	const propGroup = props.build();
	// 只让低面数大件投影（阴影 3 级联 = 面数 ×3）：围栏、军用箱、新式混凝土墩
	propGroup.traverse( ( o ) => { if ( o.isMesh && /barrier_02|chainlink|crate/.test( o.material.name ) ) o.layers.enable( SHADOW_LAYER ); } );
	propGroup.name = 'props'; scene.add( propGroup );

	// 瓦砾堆：坍塌转角下方（大）、远景倒塌楼体、路口一角
	scene.add( makeRubble( [
		{ x: - 10.5, z: - 30, radius: 6.5, height: 3.2, count: 520 },
		{ x: - 7.5, z: - 27, radius: 3, height: 1.2, count: 120 },
		{ x: - 14, z: - 100, radius: 12, height: 6, count: 380 },
		{ x: 18, z: - 90, radius: 9, height: 3, count: 200 },
		{ x: - 6, z: - 116, radius: 9, height: 3.5, count: 200 },
		{ x: 9, z: 26, radius: 2.2, height: 0.6, count: 70, gy: L.curb, size: 0.5, rebar: false },
		{ x: 13, z: - 23, radius: 3, height: 1.2, count: 90 },
		{ x: 6.5, z: - 50, radius: 2.5, height: 0.8, count: 60 },
		// 路面零散碎块（从楼上掉落）
		{ x: - 5.5, z: 12, radius: 2.2, height: 0.2, count: 50, size: 0.3, rebar: false }, { x: 5.6, z: 23, radius: 1.6, height: 0.15, count: 40, size: 0.25, rebar: false }, { x: 1.2, z: 24.5, radius: 1.3, height: 0.1, count: 30, size: 0.2, rebar: false }, { x: - 1.5, z: 15, radius: 1.2, height: 0.1, count: 24, size: 0.2, rebar: false }, { x: - 6, z: - 44, radius: 2.5, height: 0.3, count: 50, size: 0.45, rebar: false },
		{ x: 6.2, z: 2.5, radius: 1.6, height: 0.2, count: 30, size: 0.35, rebar: false }, { x: - 6.2, z: 30, radius: 1.5, height: 0.2, count: 30, size: 0.35, rebar: false },
	] ) );

	// —— 地面信息图（所有遮挡体登记完毕后生成）+ 地面 ——
	buildGroundMap( BUILDINGS );
	scene.add( buildGround( camera ) );

	// 植被
	const veg = buildVegetation( M, { blocked, roofSpots, footprints } ); veg.name = 'veg'; scene.add( veg );

	// 雨丝与孢子
	const particles = makeParticles( camera );
	particles.name = 'particles';
	scene.add( particles );

	// 积水反射层：大体块（建筑、塔楼、藤蔓、公交、车辆）
	// 立面套件（高面数）不进反射：反射里由楼体代理盒（暗色）代替，倒影本身被模糊、看不出细节
	const reflectable = [ ...towerObjs ];
	for ( const o of reflectable ) o.traverse( ( c ) => { if ( c.isMesh && c.layers.isEnabled( 0 ) ) c.layers.enable( REFLECT_LAYER ); } );
	scene.traverse( ( c ) => { if ( c.isMesh && /roof|interior/.test( c.userData.kind || '' ) ) c.layers.enable( REFLECT_LAYER ); } );

	// 调试：?hide=a,b 按名字隐藏分组（排查用）
	const hide = ( params?.get( 'hide' ) || '' ).split( ',' ).filter( Boolean );
	scene.traverse( ( o ) => { if ( hide.includes( o.name ) ) o.visible = false; } );
	window.__ivyStats = ivyStats;
	// 调试开关：?dbg=nofog,norefl,noenv,nosun
	const dbg = ( params?.get( 'dbg' ) || '' ).split( ',' );
	if ( dbg.includes( 'norefl' ) ) groundP.reflect.value = 0;
	if ( dbg.includes( 'noenv' ) ) scene.environmentIntensity = 0;
	if ( dbg.includes( 'nosun' ) ) atm.sun.intensity = 0;
	const noFog = dbg.includes( 'nofog' );
	if ( dbg.includes( 'redfog' ) ) atmo.fogColor.value.set( 1, 0, 0 );
	if ( dbg.includes( 'nobg' ) ) scene.backgroundNode = null;
	window.__GM = GM;

	let strongAO = null, aoApplied = false;
	return {
		sun: atm.sun, csm: atm.csm, M,
		pipelineOptions: {
			bloomThreshold: 0.9,
			postHDR: ( hdr, ctx ) => { strongAO = makeStrongAO( ctx ); return hdr; },
			postLDR: ( c ) => tlouGrade( c ),
		},
		update() {

			// 管线 rebuild() 在 postHDR 之后才写入默认 AO 上下文 → 首帧再覆盖为大半径 AO
			if ( strongAO && ! aoApplied ) { strongAO.apply(); aoApplied = true; }
			particles.userData.update();
			const hk = THREE.MathUtils.smoothstep( camera.position.y, 3, 20 ); // 0 = 街面视角，1 = 俯视
			// 俯视镜头：主体区域保持清晰（雾起始推远、贴地雾减弱），只压远处边缘
			atmo.fogStart.value = THREE.MathUtils.lerp( 8, 30, hk );
			atmo.groundDensity.value = THREE.MathUtils.lerp( 0.013, 0.006, hk );
			if (golden) atmo.groundDensity.value=.0025;
			if ( noFog ) { atmo.groundDensity.value = 0; atmo.fogDensity.value = 0; }
			tgrade.exposure.value = THREE.MathUtils.lerp( 0.88, 1.18, hk );
			if (golden) tgrade.exposure.value=1.03;
			tgrade.vignette.value = THREE.MathUtils.lerp( 0.42, 0.34, hk );

		},
		gui( gui ) {

			const f = gui.addFolder( 'street_tlou' );
			f.add( atmo.fogDensity, 'value', 0, 0.04, 0.0005 ).name( '高空雾' );
			f.add( atmo.groundDensity, 'value', 0, 0.2, 0.001 ).name( '贴地雾' );
			f.add( atmo.mist, 'value', 0, 2, 0.01 ).name( '雾团' );
			f.add( atmo.cloud, 'value', 0, 1, 0.01 ).name( '云影' );
			f.add( tgrade.exposure, 'value', 0.3, 2, 0.01 ).name( '曝光' );
			f.add( tgrade.contrast, 'value', 0.8, 1.6, 0.01 ).name( '对比' );
			f.add( tgrade.toe, 'value', 0, 0.3, 0.005 ).name( '趾部' );
			f.add( tgrade.saturation, 'value', 0, 1.5, 0.01 ).name( '饱和' );
			f.add( W.wet, 'value', 0, 1, 0.01 ).name( '潮湿' );
			f.add( W.moss, 'value', 0, 1.5, 0.01 ).name( '苔藓' );
			f.add( groundP.puddles, 'value', 0, 1, 0.01 ).name( '积水' );

		},
	};

}
