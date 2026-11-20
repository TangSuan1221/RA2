// 场景：阳光室内（参考图 ref2）—— 废弃木质书店/咖啡馆
// 核心：屋顶左侧坍塌，暖金色硬阳光从破洞斜射进来，在木地板与混凝土地面上投出带椽条阴影的光斑；
//      体积光柱 + 漂浮尘埃；室内其余部分压到很暗；左侧门洞外的草与爬满常春藤的树干侵入室内。
// 坐标：室内 x∈[-8,8]，z∈[-12,4]，屋高 5.2m；相机看向 -Z。
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, luminance, length, screenUV, time, hash,
	instanceIndex, sin, cos, fract, uv, mx_noise_float, positionWorld, positionGeometry, texture,
} from 'three/tsl';
import { createVolumeFog, VOLUME_LAYER } from '../core/renderer.js';
import { loadModel, InstanceBatch, trs } from '../world/assets.js';
import { Kit, rng } from '../interior_sun/kit.js';
import { woodMaterial, pbr, look } from '../interior_sun/materials.js';
import { LeafField, StemField, trunkSurface, growIvy, hangIvy } from '../interior_sun/foliage.js';

export const SHOTS = {
	hero: { position: [ 1.3, 1.62, 2.7 ], lookAt: [ - 0.4, 0.95, - 7 ], fov: 55 },
	top: { mode: 'top', yaw: 0, pitch: 62, distance: 25, target: [ - 0.5, 0, - 4 ] },
};

// 屋顶层：俯视时隐藏（仍然投射阴影）
const ROOF_LAYER = 2;
const W0 = - 8, W1 = 8, Z0 = - 12, Z1 = 4, H = 5.2, STAGE = 0.12;

// 屋顶破洞区域（左侧大面积坍塌 + 前景上方）
const TRUNK = [ - 3.9, - 7.2 ];
// 破洞：左前方大块坍塌（参差边缘由屋面板随机抖动形成）+ 树干穿出处
const inHole = ( x, z ) => ( x > - 5.6 && x < 2.0 && z > - 4.6 && z < 4.4 && ! ( x > 0 && z < - 3.2 ) ) || Math.hypot( x - TRUNK[ 0 ], z - TRUNK[ 1 ] ) < 1.8;

export async function build( { scene, renderer, camera, params } ) {

	const R = rng( 2024 );
	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.0;

	scene.background = new THREE.Color( 0xb9c4c8 );

	// —— 材质 ——
	const floorWood = woodMaterial( 'wood_floor_worn', { res: '2k', texMeters: 2.4, tint: 0x9a9ea2, dust: 1.2, variation: 0.3 } );
	const wallWood = woodMaterial( 'dark_wooden_planks', { texMeters: 2.5, tint: 0x9a7a5e, dust: 0.3, vGrain: false } );
	const wallWoodV = woodMaterial( 'weathered_planks', { texMeters: 2.2, tint: 0x8a6c55, dust: 0.3 } );
	const beamWood = woodMaterial( 'weathered_planks', { texMeters: 2.0, tint: 0x6e5644, dust: 0.6 } );
	const lightWood = woodMaterial( 'raw_plank_wall', { texMeters: 1.6, tint: 0x8c7864, dust: 1.4, variation: 0.25 } );
	const shelfWood = woodMaterial( 'dark_wooden_planks', { texMeters: 1.5, tint: 0x8d6f55, dust: 1.0 } );
	const concrete = pbr( 'brushed_concrete', { texMeters: 3.0, tint: 0x9aa0a4, dust: 0.2, variation: 0.35 } );
	const bark = pbr( 'bark_platanus', { texMeters: 1.4, tint: 0xb8b2a4, dust: 0, variation: 0.2 } );
	const outdoorGround = pbr( 'brown_mud_leaves_01', { texMeters: 3.0, tint: 0x6a6a58, dust: 0 } );

	const kit = new Kit( 11 ); // 室内主体
	const roofKit = new Kit( 12 ); // 屋顶 + 南墙（俯视隐藏）

	// —— 地面 ——
	// 木质平台（书店地板），左侧边缘有包边木条
	kit.box( floorWood, [ W1 + 1.4, STAGE, Z1 - Z0 ], [ ( W1 - 1.4 ) / 2, STAGE / 2, ( Z0 + Z1 ) / 2 ], [ 0, 0, 0 ], { grain: 'z' } );
	kit.box( beamWood, [ 0.07, STAGE + 0.02, Z1 - Z0 ], [ - 1.43, ( STAGE + 0.02 ) / 2, ( Z0 + Z1 ) / 2 ], [ 0, 0, 0 ], { bevel: 0.015 } );
	// 左侧混凝土地面（原来的露台/通道）
	kit.box( concrete, [ 6.6, 0.1, Z1 - Z0 ], [ - 4.7, - 0.05, ( Z0 + Z1 ) / 2 ] );
	// 室外地面
	// 室外地面：一整块大地面（四周都要覆盖，俯视时不能露底）
	for ( const [ cx, cz, w, d ] of [ [ - 20, - 4, 24, 60 ], [ 20, - 4, 24, 60 ], [ 0, - 24, 16, 24 ], [ 0, 16, 16, 24 ] ] ) kit.box( outdoorGround, [ w, 0.1, d ], [ cx, - 0.07, cz ] );

	// —— 墙体 ——
	const wallT = 0.18;
	// 后墙
	kit.box( wallWood, [ W1 - W0 + 0.4, H, wallT ], [ 0, H / 2, Z0 - wallT / 2 ] );
	// 右墙：高窗下方 + 高窗上方 + 窗间墙
	const winY0 = 3.55, winY1 = 4.45;
	kit.box( wallWood, [ wallT, winY0, Z1 - Z0 ], [ W1 + wallT / 2, winY0 / 2, ( Z0 + Z1 ) / 2 ] );
	kit.box( wallWood, [ wallT, H - winY1, Z1 - Z0 ], [ W1 + wallT / 2, ( H + winY1 ) / 2, ( Z0 + Z1 ) / 2 ] );
	const winZ = [ [ - 11.2, - 8.6 ], [ - 7.4, - 4.8 ], [ - 3.6, - 1.0 ] ];
	let zc = Z0;
	for ( const [ a, b ] of winZ ) {

		kit.box( wallWood, [ wallT, winY1 - winY0, a - zc ], [ W1 + wallT / 2, ( winY0 + winY1 ) / 2, ( a + zc ) / 2 ] );
		zc = b;

	}

	kit.box( wallWood, [ wallT, winY1 - winY0, Z1 - zc ], [ W1 + wallT / 2, ( winY0 + winY1 ) / 2, ( Z1 + zc ) / 2 ] );
	// 高窗：脏玻璃（自发光，外面是亮天）+ 窗棂
	const glass = new THREE.MeshStandardNodeMaterial( { roughness: 0.9 } );
	glass.colorNode = vec3( 0.0 );
	const gN = mx_noise_float( positionWorld.mul( vec3( 1, 6, 3 ) ) ).mul( 0.5 ).add( 0.5 );
	glass.emissiveNode = vec3( 1.0, 0.93, 0.8 ).mul( mix( float( 0.08 ), float( 0.2 ), gN ) );
	for ( const [ a, b ] of winZ ) {

		kit.box( glass, [ 0.02, winY1 - winY0, b - a ], [ W1 + 0.12, ( winY0 + winY1 ) / 2, ( a + b ) / 2 ] );
		const n = 4;
		for ( let i = 0; i <= n; i ++ ) kit.box( beamWood, [ 0.08, winY1 - winY0, 0.06 ], [ W1 + 0.04, ( winY0 + winY1 ) / 2, a + ( b - a ) * i / n ] );
		kit.box( beamWood, [ 0.1, 0.07, b - a ], [ W1 + 0.04, winY0, ( a + b ) / 2 ] );
		kit.box( beamWood, [ 0.1, 0.07, b - a ], [ W1 + 0.04, winY1, ( a + b ) / 2 ] );

	}

	// 左墙：大部分已倒塌，只剩立柱、门楣、一段残墙
	for ( const z of [ - 12, - 8.5, - 2.4, 2 ] ) kit.box( beamWood, [ 0.3, H, 0.25 ], [ W0 + 0.05, H / 2, z ], [ 0, 0, 0 ], { bevel: 0.02 } );
	// 左墙：门洞 z∈[-6.6,-4.4]，破窗 z∈[-2.4,1.0]（y 0.9~2.7），其余为木板墙
	const lw = ( z0, z1, y0, y1 ) => kit.box( wallWoodV, [ wallT, y1 - y0, z1 - z0 ], [ W0, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ] );
	lw( Z0, - 6.6, 0, H );
	lw( - 6.6, - 4.4, 2.6, H );
	lw( - 4.4, - 2.4, 0, H );
	lw( - 2.4, 1.0, 0, 0.9 );
	lw( - 2.4, 1.0, 2.7, H );
	lw( 1.0, Z1, 0, H );
	// 门框、窗框
	for ( const z of [ - 6.6, - 4.4 ] ) kit.box( beamWood, [ 0.26, 2.6, 0.12 ], [ W0, 1.3, z ], [ 0, 0, 0 ], { bevel: 0.015 } );
	kit.box( beamWood, [ 0.26, 0.14, 2.4 ], [ W0, 2.62, - 5.5 ], [ 0, 0, 0 ], { bevel: 0.015 } );
	kit.box( beamWood, [ 0.3, 0.08, 3.5 ], [ W0 + 0.02, 0.9, - 0.7 ], [ 0, 0, 0 ], { bevel: 0.015 } );
	kit.box( beamWood, [ 0.26, 0.1, 3.4 ], [ W0, 2.7, - 0.7 ], [ 0, 0, 0 ], { bevel: 0.015 } );
	kit.box( beamWood, [ 0.1, 1.8, 0.08 ], [ W0, 1.8, - 0.7 ], [ 0, 0, 0.05 ], { bevel: 0.01 } );
	// 南墙（相机背后，俯视隐藏）
	roofKit.box( wallWood, [ W1 - W0 + 0.4, 1.6, wallT ], [ 0, 0.8, Z1 + wallT / 2 ] );

	// 室内立柱 + 横梁
	for ( const z of [ - 9, - 4.5 ] ) kit.box( beamWood, [ 0.26, H - 0.3, 0.26 ], [ 3.2, ( H - 0.3 ) / 2 + STAGE, z ], [ 0, 0, 0 ], { bevel: 0.02 } );
	roofKit.box( beamWood, [ 0.24, 0.36, Z1 - Z0 ], [ 3.2, H - 0.25, ( Z0 + Z1 ) / 2 ], [ 0, 0, 0 ], { bevel: 0.02 } );
	roofKit.box( beamWood, [ 0.24, 0.36, Z1 - Z0 ], [ - 5.9, H - 0.25, ( Z0 + Z1 ) / 2 ], [ 0, 0, 0 ], { bevel: 0.02 } );

	// —— 屋顶：椽条（沿 x）+ 屋面板，破洞处只剩部分椽条 ——
	for ( let z = Z0 + 0.4; z < Z1; z += 0.85 ) {

		// 每根椽条按 0.5m 小段决定是否残留（破洞区随机断裂）
		let segStart = null;
		const flush = ( x ) => {

			if ( segStart !== null && x - segStart > 0.2 ) roofKit.box( beamWood, [ x - segStart, 0.2, 0.1 ], [ ( x + segStart ) / 2, H - 0.05, z ], [ 0, 0, ( R() - 0.5 ) * 0.02 ] );
			segStart = null;

		};

		const keepHole = R() < 0.7;
		for ( let x = W0 - 0.5; x < W1 + 0.2; x += 0.5 ) {

			const hole = inHole( x + 0.25, z );
			const keep = ! hole || ( keepHole && R() < 0.85 );
			if ( keep && segStart === null ) segStart = x;
			if ( ! keep ) flush( x );

		}

		flush( W1 + 0.2 );

	}

	// 屋面板：0.3m 宽板条，破洞边缘参差
	for ( let x = W0 - 0.5; x < W1 + 0.2; x += 0.3 ) {

		let zs = null;
		// 破洞里残留的板条：整列保留或断成几截，把大光斑切成一道道光柱
		const survive = R() < 0.42;
		const cut0 = Z0 + R() * ( Z1 - Z0 ), cut1 = cut0 + 0.8 + R() * 3;
		const flush = ( z ) => {

			if ( zs !== null && z - zs > 0.1 ) roofKit.box( wallWood, [ 0.29, 0.04, z - zs ], [ x + 0.15, H + 0.08, ( z + zs ) / 2 ], [ 0, 0, 0 ], { grain: 'z' } );
			zs = null;

		};

		for ( let z = Z0 - 0.2; z < Z1 + 0.2; z += 0.25 ) {

			const jag = ( R() - 0.5 ) * 1.2;
			const hole = inHole( x + 0.15 + jag * 0.5, z + jag ) && ! ( survive && ( z < cut0 || z > cut1 ) );
			if ( ! hole && zs === null ) zs = z;
			if ( hole ) flush( z );

		}

		flush( Z1 + 0.2 );

	}

	// 屋顶上方再加一层不透光的面（防止屋面板缝隙漏光）
	const roofCap = new THREE.MeshBasicNodeMaterial( { color: 0x000000 } );
	{

		for ( let x = W0 - 0.5; x < W1 + 0.2; x += 0.3 ) for ( let z = Z0 - 0.2; z < Z1 + 0.2; z += 0.25 ) {

			if ( ! inHole( x + 0.15, z + 0.125 ) && ! inHole( x + 0.15 - 0.6, z + 0.125 + 0.6 ) ) roofKit.box( roofCap, [ 0.3, 0.02, 0.25 ], [ x + 0.15, H + 0.12, z + 0.125 ] );

		}

	}

	// —— 中央展示柜（书箱）：开口木箱 + 斜隔板 ——
	const counter = new THREE.Matrix4().compose( new THREE.Vector3( - 0.2, STAGE, - 1.3 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, 0.12, 0 ) ), new THREE.Vector3( 1, 1, 1 ) );
	{

		const cw = 2.3, cd = 1.0, ch = 0.82, t = 0.045;
		const P = { parent: counter, bevel: 0.008 };
		kit.box( lightWood, [ cw, ch, t ], [ 0, ch / 2, cd / 2 ], [ 0, 0, 0 ], P );
		kit.box( lightWood, [ cw, ch + 0.12, t ], [ 0, ( ch + 0.12 ) / 2, - cd / 2 ], [ 0, 0, 0 ], P );
		kit.box( lightWood, [ t, ch + 0.06, cd ], [ - cw / 2, ( ch + 0.06 ) / 2, 0 ], [ 0, 0, 0 ], P );
		kit.box( lightWood, [ t, ch + 0.06, cd ], [ cw / 2, ( ch + 0.06 ) / 2, 0 ], [ 0, 0, 0 ], P );
		kit.box( lightWood, [ cw, t, cd ], [ 0, 0.35, 0 ], [ 0, 0, 0 ], P );
		// 斜隔板（书槽）
		for ( let i = 0; i < 3; i ++ ) kit.box( lightWood, [ cw - 0.1, 0.5, 0.025 ], [ 0, 0.62, - 0.3 + i * 0.3 ], [ - 0.35, 0, 0 ], P );
		// 顶沿压条
		kit.box( lightWood, [ cw + 0.04, 0.03, 0.08 ], [ 0, ch + 0.01, cd / 2 ], [ 0, 0, 0 ], P );
		// 底座踢脚
		kit.box( beamWood, [ cw - 0.06, 0.08, cd - 0.06 ], [ 0, 0.04, 0 ], [ 0, 0, 0 ], P );

	}

	// —— 后墙柜台 + 上方陈列架 ——
	{

		const y = STAGE;
		kit.box( shelfWood, [ 6.2, 1.0, 0.7 ], [ 2.6, y + 0.5, - 10.6 ], [ 0, 0, 0 ], { bevel: 0.01 } );
		kit.box( lightWood, [ 6.3, 0.05, 0.8 ], [ 2.6, y + 1.02, - 10.6 ], [ 0, 0, 0 ], { bevel: 0.01 } );
		// 柜台立面竖向护板
		for ( let x = - 0.4; x < 5.7; x += 0.16 ) kit.box( shelfWood, [ 0.13, 0.9, 0.02 ], [ x, y + 0.48, - 10.24 ], [ 0, 0, 0 ], { grain: 'y' } );
		// 墙上长搁板（三层）
		for ( const sy of [ 2.0, 2.45, 2.9 ] ) kit.box( shelfWood, [ 7.5, 0.04, 0.32 ], [ 2.3, sy, - 11.82 ], [ 0, 0, 0 ], { bevel: 0.005 } );
		// 搁板上的杂物：罐子/杯子/盒子
		for ( const sy of [ 2.0, 2.45, 2.9 ] ) for ( let x = - 1.2; x < 5.9; x += 0.12 + R() * 0.25 ) {

			if ( R() < 0.25 ) continue;
			const h = 0.08 + R() * 0.18, w = 0.06 + R() * 0.1;
			kit.box( R() < 0.5 ? lightWood : beamWood, [ w, h, 0.08 + R() * 0.1 ], [ x, sy + 0.02 + h / 2, - 11.85 ], [ 0, R() * 0.4, 0 ], { bevel: 0.005 } );

		}

		// 招牌底板
		kit.box( beamWood, [ 3.4, 0.62, 0.06 ], [ 0.6, 3.6, - 11.86 ], [ 0, 0, 0 ], { bevel: 0.01 } );

	}

	// —— 右侧墙边高书架（程序化，2.9m 高）——
	{

		for ( let z = - 11.6; z < 1.0; z += 1.6 ) {

			if ( z > - 3 && z < - 1 ) continue;
			const x = W1 - 0.25, d = 0.45, h = 3.0;
			kit.box( shelfWood, [ d, h, 0.05 ], [ x, STAGE + h / 2, z ], [ 0, 0, 0 ], { grain: 'y', bevel: 0.006 } );
			kit.box( shelfWood, [ d, h, 0.05 ], [ x, STAGE + h / 2, z + 1.55 ], [ 0, 0, 0 ], { grain: 'y', bevel: 0.006 } );
			for ( let k = 0; k < 7; k ++ ) kit.box( shelfWood, [ d, 0.035, 1.55 ], [ x, STAGE + 0.08 + k * 0.45, z + 0.775 ], [ 0, 0, 0 ], { bevel: 0.006 } );
			kit.box( shelfWood, [ 0.02, h, 1.55 ], [ x + d / 2, STAGE + h / 2, z + 0.775 ] );

		}

	}

	// —— 左侧露台：沙发、扶手椅（软包材质）——
	const fabric = new THREE.MeshStandardNodeMaterial( { roughness: 0.95 } );
	{

		const fn = mx_noise_float( positionWorld.mul( 4 ) ).mul( 0.5 ).add( 0.5 );
		const fn2 = mx_noise_float( positionWorld.mul( 40 ) ).mul( 0.5 ).add( 0.5 );
		fabric.colorNode = vec3( 0.23, 0.16, 0.11 ).mul( mix( float( 0.6 ), float( 1.15 ), fn ) ).mul( mix( float( 0.85 ), float( 1.05 ), fn2 ) );
		const sofa = ( x, z, ry, w ) => {

			const M = new THREE.Matrix4().compose( new THREE.Vector3( x, 0, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ry, 0 ) ), new THREE.Vector3( 1, 1, 1 ) );
			const P = { parent: M, bevel: 0.06 };
			kit.box( fabric, [ w, 0.42, 0.85 ], [ 0, 0.21, 0 ], [ 0, 0, 0 ], P );
			kit.box( fabric, [ w - 0.3, 0.16, 0.65 ], [ 0, 0.5, 0.06 ], [ - 0.03, 0, 0 ], P );
			kit.box( fabric, [ w, 0.55, 0.22 ], [ 0, 0.62, - 0.34 ], [ - 0.12, 0, 0 ], P );
			kit.box( fabric, [ 0.2, 0.62, 0.85 ], [ - w / 2 + 0.1, 0.31, 0 ], [ 0, 0, 0 ], P );
			kit.box( fabric, [ 0.2, 0.62, 0.85 ], [ w / 2 - 0.1, 0.31, 0 ], [ 0, 0, 0 ], P );

		};

		sofa( - 6.9, - 4.2, Math.PI / 2, 2.0 );
		sofa( - 5.6, - 6.4, 0.25, 1.0 );

	}

	// —— 树干（梧桐，穿过屋顶破洞）——
	const trunkBase = new THREE.Vector3( TRUNK[ 0 ], 0, TRUNK[ 1 ] );
	const trunkR = ( h ) => 0.36 - h * 0.025 + Math.max( 0, 0.6 - h ) * 0.25;
	{

		const tg = new THREE.CylinderGeometry( 1, 1, 9, 24, 36, true );
		const p = tg.attributes.position;
		const uvA = tg.attributes.uv;
		for ( let i = 0; i < p.count; i ++ ) {

			const h = p.getY( i ) + 4.5;
			const a = Math.atan2( p.getZ( i ), p.getX( i ) );
			const r = trunkR( h ) * ( 1 + 0.06 * Math.sin( a * 3 + h * 1.3 ) + 0.04 * Math.sin( a * 7 - h * 2.1 ) ) + Math.max( 0, 0.35 - h ) * 0.5 * Math.max( 0, Math.sin( a * 4 ) );
			const lean = h * h * 0.006;
			p.setXYZ( i, Math.cos( a ) * r + lean, h, Math.sin( a ) * r );
			// 周长方向 UV 按真实周长（米）
			uvA.setXY( i, uvA.getX( i ) * ( 2 * Math.PI * 0.36 ) / 1.4, h / 1.4 );

		}

		tg.computeVertexNormals();
		tg.translate( trunkBase.x, 0, trunkBase.z );
		kit.add( bark, tg );
		// 树枝：几根伸出屋顶的粗枝
		for ( let i = 0; i < 6; i ++ ) {

			const a = i * 1.1 + R();
			const bg = new THREE.CylinderGeometry( 0.05, 0.13, 3.0, 10, 4, true );
			bg.translate( 0, 1.5, 0 );
			const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( 0.9 * Math.cos( a ), 0, 0.9 * Math.sin( a ) ) );
			bg.applyMatrix4( new THREE.Matrix4().compose( new THREE.Vector3( trunkBase.x + 0.25, 6.0 + i * 0.35, trunkBase.z ), q, new THREE.Vector3( 1, 1, 1 ) ) );
			kit.add( bark, bg );

		}

	}

	// —— 资产：书架、书、木箱、植被 ——
	const ids = [ 'wooden_bookshelf_worn', 'grass_medium_01', 'fern_02', 'wooden_crate_01', 'wooden_display_shelves_01', 'hanging_industrial_lamp', 'wooden_stool_01', 'cardboard_box_01', 'shrub_02' ];
	const models = await Promise.all( ids.map( loadModel ) );
	const M = Object.fromEntries( ids.map( ( id, i ) => [ id, models[ i ] ] ) );
	const batch = new InstanceBatch();
	const shelfLevels = [ 0.11, 0.38, 0.65, 0.95, 1.26, 1.65 ];
	const bookColors = [ 0x5a3a2a, 0x3a4a5a, 0x6a5a3a, 0x4a3030, 0x2e3a2e, 0x7a6a50, 0x8a7a60 ].map( ( c ) => new THREE.Color( c ) );
	// 书：低模实例（Poly Haven 精装书单本 3400 面太重，书架上几百本改用程序化书块）
	const bookM = [], bookC = [];
	const putBook = ( m, col ) => { bookM.push( m ); bookC.push( col ); };
	const putBooks = ( Mshelf, levels, width, scale, fill = 0.4 ) => {

		for ( const ly of levels ) {

			if ( R() > fill ) continue;
			let x = - width / 2 + 0.06 + R() * 0.3;
			const end = x + 0.2 + R() * ( width - 0.4 );
			const col = bookColors[ Math.floor( R() * bookColors.length ) ];
			while ( x < Math.min( end, width / 2 - 0.08 ) ) {

				const bw = 0.025 + R() * 0.03, bh = 0.18 + R() * 0.09, bd = 0.14 + R() * 0.06;
				const lean = R() < 0.08 ? 0.3 : 0;
				const m = Mshelf.clone().multiply( trs( x + bw / 2, ly + 0.012, 0.26 - bd / 2, 0, scale, 0, lean ) ).multiply( new THREE.Matrix4().makeScale( bw, bh, bd ) );
				putBook( m, col.clone().multiplyScalar( 0.6 + R() * 0.7 ) );
				x += ( bw + 0.002 ) * scale;

			}

		}

	};

	// 书架（模型）：后墙左侧、中景右侧
	const shelves = [
		[ - 0.6, - 11.45, 0, 1.18 ],
		[ 0.85, - 11.45, 0, 1.18 ],
		[ 4.9, - 6.6, - 0.08, 1.2 ],
		[ 5.0, - 3.4, - 0.05, 1.2 ],
		[ - 1.6, - 7.6, 0.05, 1.12 ],
		[ - 0.05, - 7.65, - 0.03, 1.12 ],
	];
	for ( const [ x, z, ry, s ] of shelves ) {

		const m = trs( x, STAGE, z, ry, s );
		batch.add( M.wooden_bookshelf_worn.parts, 'wooden_bookshelf_worn', m );
		putBooks( m, shelfLevels, 1.3, 1 / s * 1.0, 0.8 );

	}

	// 右墙高书架上零星的书
	for ( let z = - 11.6; z < 1.0; z += 1.6 ) {

		if ( z > - 3 && z < - 1 ) continue;
		const m = new THREE.Matrix4().compose( new THREE.Vector3( W1 - 0.3, STAGE, z + 0.775 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, - Math.PI / 2, 0 ) ), new THREE.Vector3( 1, 1, 1 ) );
		putBooks( m, [ 0.1, 0.55, 1.0, 1.45, 1.9, 2.35 ].map( ( v ) => v - 0.01 ), 1.5, 1.05, 0.6 );

	}

	// 展示柜里的书（斜靠在隔板上）
	for ( let i = 0; i < 26; i ++ ) {

		const slot = Math.floor( R() * 3 );
		const m = counter.clone().multiply( trs( - 1.05 + R() * 2.1, 0.37, - 0.33 + slot * 0.3 + 0.08, Math.PI / 2, 1, 0, 0.35 ) );
		putBook( m.multiply( new THREE.Matrix4().makeScale( 0.03, 0.22, 0.16 ) ), bookColors[ Math.floor( R() * bookColors.length ) ].clone() );

	}

	// 陈列柜、木箱、凳子、纸箱
	batch.add( M.wooden_display_shelves_01.parts, 'wooden_display_shelves_01', trs( 6.4, STAGE, - 9.2, Math.PI / 2 ) );
	for ( const n of [ 'wooden_display_shelves_01_drawer_01', 'wooden_display_shelves_01_drawer_02', 'wooden_display_shelves_01_drawer_03' ] ) batch.add( M.wooden_display_shelves_01.parts, n, trs( 6.4, STAGE, - 9.2, Math.PI / 2 ) );
	const crates = [ [ - 2.6, 0, - 3.2, 0.4 ], [ - 2.4, 0, - 2.4, 1.9 ], [ 2.4, STAGE, - 5.6, 0.2 ], [ 6.6, STAGE, - 1.4, - 0.3 ] ];
	for ( const [ x, y, z, r ] of crates ) for ( const n of Object.keys( M.wooden_crate_01.parts ) ) batch.add( M.wooden_crate_01.parts, n, trs( x, y, z, r ) );
	batch.add( M.wooden_stool_01.parts, 'wooden_stool_01', trs( 1.9, STAGE, - 8.9, 0.6 ) );
	batch.add( M.wooden_stool_01.parts, 'wooden_stool_01', trs( 3.6, STAGE, - 9.6, 0.2, 1, 0, Math.PI / 2 - 0.05 ) );
	for ( const n of Object.keys( M.cardboard_box_01.parts ) ) {

		batch.add( M.cardboard_box_01.parts, n, trs( 6.9, STAGE, - 4.6, 0.3 ) );
		batch.add( M.cardboard_box_01.parts, n, trs( - 1.0, STAGE, - 9.5, 1.1 ) );

	}

	// 吊灯（熄灭）
	for ( const [ x, z ] of [ [ 1.0, - 8.5 ], [ 5.2, - 8.5 ], [ 5.2, - 4 ] ] ) for ( const n of Object.keys( M.hanging_industrial_lamp.parts ) ) batch.add( M.hanging_industrial_lamp.parts, n, trs( x, H - 0.05, z ) );

	// 草：门洞外、树根周围、地面裂缝、沿平台边缘
	const grassNames = Object.keys( M.grass_medium_01.parts ).filter( ( n ) => ! /tiny|large/.test( n ) );
	const plantGrass = ( cx, cz, rx, rz, n, sMin = 1.6, sMax = 3.2 ) => {

		for ( let i = 0; i < n; i ++ ) {

			const a = R() * Math.PI * 2, r = Math.sqrt( R() );
			const x = cx + Math.cos( a ) * rx * r, z = cz + Math.sin( a ) * rz * r;
			const y = x > - 1.4 && x < W1 && z > Z0 && z < Z1 ? STAGE : ( x < W0 ? - 0.02 : 0 );
			batch.add( M.grass_medium_01.parts, grassNames[ Math.floor( R() * grassNames.length ) ], trs( x, y, z, R() * 6.28, sMin + R() * ( sMax - sMin ) ) );

		}

	};

	plantGrass( trunkBase.x, trunkBase.z, 2.0, 2.2, 260 );
	plantGrass( - 7.6, - 5.5, 1.3, 4.0, 220 );
	plantGrass( - 11, - 4, 3.5, 9, 520, 2.0, 3.6 );
	plantGrass( - 2.6, - 6.0, 1.0, 1.4, 90 );
	plantGrass( - 2.2, - 4.6, 0.7, 1.4, 50, 1.2, 2.2 );
	plantGrass( - 6.0, 1.2, 1.6, 2.0, 120 );
	// 前景混凝土裂缝里的草（参考图左下角）
	plantGrass( - 3.6, 0.6, 1.6, 2.2, 160, 1.4, 2.8 );
	plantGrass( - 2.0, 2.4, 0.5, 1.2, 50, 1.2, 2.2 );
	for ( let i = 0; i < 26; i ++ ) plantGrass( - 1.6 - R() * 0.3, Z0 + R() * ( Z1 - Z0 ), 0.2, 0.4, 3, 1.0, 1.8 );
	for ( let i = 0; i < 14; i ++ ) for ( const n of Object.keys( M.fern_02.parts ) ) {

		if ( R() < 0.6 ) continue;
		const a = R() * 6.28, r = 0.6 + R() * 2.2;
		batch.add( M.fern_02.parts, n, trs( trunkBase.x + Math.cos( a ) * r * 0.8, 0, trunkBase.z + Math.sin( a ) * r, R() * 6.28, 0.9 + R() * 0.8 ) );

	}

	for ( const [ x, z, s ] of [ [ - 10.5, - 9, 1.6 ], [ - 12, - 2, 2.0 ], [ - 10, 2, 1.4 ], [ - 7.3, - 11.2, 1.2 ] ] ) for ( const n of Object.keys( M.shrub_02.parts ) ) {

		if ( R() < 0.5 ) continue;
		batch.add( M.shrub_02.parts, n, trs( x + R() * 1.2, - 0.02, z + R() * 1.2, R() * 6.28, s ) );

	}

	// 草的颜色：取贴图明度，染成阳光下的黄绿（参考图草地偏亮黄绿）
	for ( const p of M.grass_medium_01.parts[ grassNames[ 0 ] ] ) p.material.color = new THREE.Color( 0xc8d890 );

	// —— 常春藤（程序化实例叶片）——
	const ivy = new LeafField( 5 );
	const stems = new StemField();
	const seeds = Array.from({length:14}, (_, i) => ({p: trunkBase.clone().add(new THREE.Vector3(Math.cos(i)*trunkR(0), .05, Math.sin(i)*trunkR(0))) }));
	growIvy(ivy, stems, trunkSurface(trunkBase,trunkR,6.5), seeds, {maxLen:6.5});
	function hangingCurtain(field,start,end,{count,minLen,maxLen,size,face}) {
		for(let i=0;i<count;i++) hangIvy(field,stems,start.clone().lerp(end,R()),{size,face,len:minLen+R()*(maxLen-minLen)});
	}
	function vineAlong(field,points,normal,{density,size,spread}) {
		stems.add(points);
		const curve=new THREE.CatmullRomCurve3(points);
		for(let i=0;i<density;i++) {
			const p=curve.getPoint(R()); p.z+=(R()-.5)*spread;
			field.put(p,normal,size);
		}
	}
	// 屋顶破洞边缘垂下的藤帘（左上角大团常春藤）
	hangingCurtain( ivy, new THREE.Vector3( - 3.45, H - 0.1, - 12 ), new THREE.Vector3( - 3.45, H - 0.1, - 2.5 ), { count: 38, minLen: 0.6, maxLen: 2.6, size: 0.12, face: new THREE.Vector3( 1, 0, 0 ) } );
	hangingCurtain( ivy, new THREE.Vector3( W0, 3.7, - 12 ), new THREE.Vector3( W0, 3.7, 3 ), { count: 60, minLen: 0.5, maxLen: 3.4, size: 0.12, face: new THREE.Vector3( 1, 0, 0 ) } );
	// 左墙残墙/立柱爬藤
	for ( const z of [ - 12, - 8.5, - 2.4, 2 ] ) vineAlong( ivy, [ 0, 1, 2, 3, 4 ].map( ( k ) => new THREE.Vector3( W0 + 0.14, k * 0.85, z + Math.sin( k * 2 + z ) * 0.12 ) ), new THREE.Vector3( 1, 0, 0 ), { density: 70, spread: 0.14, size: 0.1 } );
	for ( let k = 0; k < 10; k ++ ) {

		const z0 = - 11.8 + R() * 3.0;
		vineAlong( ivy, [ 0, 1, 2, 3 ].map( ( j ) => new THREE.Vector3( W0 + 0.11, j * ( 0.6 + R() * 0.5 ), z0 + ( R() - 0.5 ) * 0.8 ) ), new THREE.Vector3( 1, 0, 0 ), { density: 60, spread: 0.12, size: 0.1 } );

	}

	// 树冠：屋顶上方的叶团（也负责在地面投下斑驳阴影）
	const canopy = new LeafField( 9 );
	const blob = ( c, r, n ) => {

		for ( let i = 0; i < n; i ++ ) {

			const d = new THREE.Vector3( R() - 0.5, ( R() - 0.5 ) * 0.7, R() - 0.5 ).normalize();
			const p = c.clone().addScaledVector( d, r * Math.cbrt( R() ) );
			canopy.put( p, d, 0.22 );

		}

	};

	for ( let i = 0; i < 16; i ++ ) blob( new THREE.Vector3( trunkBase.x - 1 + ( R() - 0.5 ) * 7, 7.8 + R() * 2.6, trunkBase.z + ( R() - 0.5 ) * 8 ), 1.2 + R() * 1.0, 420 );
	// 前景上方的枝叶（光斑里的斑驳阴影）
	// 室外背景树丛（左侧门洞看出去）
	for ( let i = 0; i < 18; i ++ ) blob( new THREE.Vector3( - 13 - R() * 6, 1.5 + R() * 5, - 14 + R() * 20 ), 1.4 + R() * 1.4, 300 );

	// —— 散落的纸张、落叶 ——
	const debris = new Kit( 31 );
	const paper = new THREE.MeshStandardNodeMaterial( { roughness: 0.85, side: THREE.DoubleSide } );
	paper.colorNode = vec3( 0.36, 0.32, 0.26 ).mul( mix( float( 0.6 ), float( 1.0 ), mx_noise_float( positionWorld.mul( 8 ) ).mul( 0.5 ).add( 0.5 ) ) );
	for ( let i = 0; i < 22; i ++ ) {

		const x = - 1.2 + R() * 9, z = Z0 + 0.5 + R() * 15;
		if ( Math.abs( x + 0.2 ) < 1.4 && Math.abs( z + 1.3 ) < 0.7 ) continue;
		debris.box( paper, [ 0.15, 0.002, 0.21 ], [ x, STAGE + 0.003 + R() * 0.004, z ], [ ( R() - 0.5 ) * 0.06, R() * 6.28, ( R() - 0.5 ) * 0.06 ] );

	}

	const dryLeaf = new LeafField( 77 );
	for ( let i = 0; i < 900; i ++ ) {

		const x = - 7.8 + Math.pow( R(), 1.6 ) * 9.5, z = Z0 + R() * ( Z1 - Z0 );
		const y = x > - 1.4 ? STAGE : 0;
		const o = new THREE.Object3D();
		o.position.set( x, y + 0.01, z );
		o.rotation.set( - Math.PI / 2 + ( R() - 0.5 ) * 0.4, 0, R() * 6.28 );
		o.scale.setScalar( 0.07 + R() * 0.06 );
		o.updateMatrix();
		dryLeaf.m.push( o.matrix.clone() );

	}

	// 书网格：底面在 y=0 的单位盒，书脊朝 +z；书页一侧（-z）偏白
	{

		const bg = new THREE.BoxGeometry( 1, 1, 1 );
		bg.translate( 0, 0.5, 0 );
		const bm = new THREE.MeshStandardNodeMaterial( { roughness: 0.8 } );
		const pageSide = smoothstep( - 0.3, - 0.5, positionGeometry.z ).max( smoothstep( 0.9, 0.98, positionGeometry.y ).mul( 0.6 ) );
		const bn = mx_noise_float( positionWorld.mul( 30 ) ).mul( 0.15 ).add( 0.9 );
		bm.colorNode = mix( vec3( 1 ), vec3( 0.55, 0.5, 0.4 ), pageSide ).mul( bn );
		const books = new THREE.InstancedMesh( bg, bm, bookM.length );
		bookM.forEach( ( m, i ) => { books.setMatrixAt( i, m ); books.setColorAt( i, bookC[ i ] ); } );
		books.castShadow = books.receiveShadow = true;
		books.computeBoundingSphere();
		scene.add( books );

	}

	// —— 组装 ——
	const interior = kit.build();
	const roof = roofKit.build();
	roof.traverse( ( o ) => o.layers.set( ROOF_LAYER ) );
	scene.add( interior, roof, batch.build(), debris.build( { castShadow: false } ) );
	const canopyMesh = canopy.build( 0x3d5a1c );
	canopyMesh.layers.set( ROOF_LAYER ); // 树冠在屋顶之上，俯视隐藏（仍投斑驳阴影）
	scene.add( stems.build(new THREE.MeshStandardNodeMaterial({color:0x302d1c})), ivy.build( 0x34521a ), canopyMesh, dryLeaf.build( 0x5a3e1e ) );

	// —— 光照 ——
	// 太阳：左后上方，暖金色硬光
	const sunDir = new THREE.Vector3( - 0.3, 0.78, 0.55 ).normalize();
	const sun = new THREE.DirectionalLight( 0xffe2a0, 34.0 );
	sun.position.copy( sunDir ).multiplyScalar( 30 ).add( new THREE.Vector3( - 1, 0, - 4 ) );
	sun.target.position.set( - 1, 0, - 4 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 4096, 4096 );
	const sc = sun.shadow.camera;
	sc.left = - 16; sc.right = 16; sc.top = 16; sc.bottom = - 16; sc.near = 5; sc.far = 60;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.02;
	sun.shadow.radius = 2;
	sc.layers.enable( 0 );
	sc.layers.enable( ROOF_LAYER );
	scene.add( sun, sun.target );

	// 体积光模型不支持方向光（没有 distance），用一盏远处的窄聚光灯模拟太阳，只放在体积层（不照亮表面）
	const sunTarget = new THREE.Vector3( - 2.2, 0, - 1.5 );
	const volSun = new THREE.SpotLight( 0xffcf8a, 2.0, 0, 0.26, 0.15, 0 );
	volSun.position.copy( sunDir ).multiplyScalar( 45 ).add( sunTarget );
	volSun.target.position.copy( sunTarget );
	volSun.castShadow = true;
	volSun.shadow.mapSize.set( 2048, 2048 );
	volSun.shadow.bias = - 0.0005;
	volSun.shadow.camera.near = 25;
	volSun.shadow.camera.far = 70;
	volSun.layers.set( VOLUME_LAYER );
	// 阴影相机必须看到实体（第 0 层 + 屋顶层），否则体积通道里只会渲染体积层
	volSun.shadow.camera.layers.set( 0 );
	volSun.shadow.camera.layers.enable( ROOF_LAYER );
	scene.add( volSun, volSun.target );

	// 天光：冷色弱环境光（阴影里保持一点冷色可读性）
	const hemi = new THREE.HemisphereLight( 0x8ea4c0, 0x2a2420, 0.75 );
	scene.add( hemi );
	// 反弹光（伪 GI）：地面光斑把暖光反射到展示柜、屋顶、周围
	const bounces = [];
	for ( const [ x, y, z, i ] of [ [ 0.5, 0.6, - 1.5, 3.0 ], [ - 2.5, 0.6, - 2.5, 3.0 ], [ 1.0, 1.5, - 5.5, 2.5 ], [ - 4.0, 1.2, - 6.5, 2.5 ], [ 4.5, 1.5, - 3.0, 2.0 ] ] ) {

		const b = new THREE.PointLight( 0xffb06a, i * 0.55, 9, 1.6 );
		b.position.set( x, y, z );
		scene.add( b );
		bounces.push( b );

	}

	// 室外天光从左侧门洞进来（偏冷）
	const skyFill = new THREE.PointLight( 0x9fb4d0, 6, 18, 1.4 );
	skyFill.position.set( - 10, 3, - 5 );
	scene.add( skyFill );

	// —— 体积光（阳光光柱）——
	const volDensity = uniform( 0.55 * Number( params.get( 'vol' ) ?? 1 ) );
	const fogBox = createVolumeFog( new THREE.BoxGeometry( W1 - W0, H, Z1 - Z0 ), {
		density: volDensity,
		steps: 20,
		noise: ( p ) => smoothstep( - 0.35, 0.6, mx_noise_float( p.mul( 0.55 ).add( vec3( time.mul( 0.03 ), 0, 0 ) ) ) ).mul( 1.1 ).add( 0.15 ).mul( smoothstep( 4.8, 2.5, p.y ).mul( 0.6 ).add( 0.4 ) ),
	} );
	fogBox.position.set( ( W0 + W1 ) / 2, H / 2, ( Z0 + Z1 ) / 2 );
	scene.add( fogBox );

	// —— 漂浮尘埃：只出现在光柱里（沿太阳方向从地面光斑反推）——
	const moteMat = new THREE.SpriteNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
	{

		const i = instanceIndex;
		const h1 = hash( i ), h2 = hash( i.add( 101 ) ), h3 = hash( i.add( 211 ) ), h4 = hash( i.add( 307 ) );
		const base = vec3( mix( float( - 3.5 ), float( 4.0 ), h1 ), STAGE, mix( float( - 8.0 ), float( - 0.5 ), h2 ) );
		const along = vec3( sunDir.x, sunDir.y, sunDir.z ).mul( h3.mul( 4.2 ).add( 0.2 ) );
		const t = time.mul( 0.05 );
		const drift = vec3( sin( t.add( h1.mul( 50 ) ) ).mul( 0.25 ), fract( t.mul( 0.3 ).add( h4 ) ).sub( 0.5 ).mul( 0.5 ), cos( t.mul( 0.8 ).add( h2.mul( 50 ) ) ).mul( 0.25 ) );
		const mp = base.add( along ).add( drift );
		moteMat.positionNode = mp;
		// 光照遮罩：沿太阳方向投影到屋顶，落在破洞区域内才被照亮（与 inHole 同一判定）
		const k = float( H ).sub( mp.y ).div( sunDir.y );
		const rx = mp.x.add( k.mul( sunDir.x ) ), rz = mp.z.add( k.mul( sunDir.z ) );
		const lit = rx.greaterThan( - 5.6 ).and( rx.lessThan( 2.0 ) ).and( rz.greaterThan( - 4.6 ) ).and( rz.lessThan( 4.4 ) ).select( float( 1 ), float( 0.0 ) );
		moteMat.scaleNode = mix( float( 0.004 ), float( 0.012 ), h4.pow( 3 ) );
		const tw = sin( time.mul( mix( float( 0.5 ), float( 2.0 ), h2 ) ).add( h3.mul( 30 ) ) ).mul( 0.5 ).add( 0.5 );
		const disc = smoothstep( 0.5, 0.0, uv().sub( 0.5 ).length() );
		moteMat.colorNode = vec4( vec3( 1.0, 0.8, 0.5 ).mul( tw.mul( 1.5 ).add( 0.3 ) ).mul( disc ).mul( lit ), disc );

	}

	const motes = new THREE.Sprite( moteMat );
	motes.count = 1800;
	motes.frustumCulled = false;
	scene.add( motes );

	// 远处空气：轻微的暗暖色距离雾
	scene.fogNode = null;

	// —— 后期 ——
	const g = {
		contrast: uniform( 1.12 ),
		saturation: uniform( 0.78 ),
		lift: uniform( 0.012 ),
		shadowTint: uniform( new THREE.Color( 0.78, 0.92, 1.16 ) ),
		highTint: uniform( new THREE.Color( 1.04, 0.99, 0.9 ) ),
		vignette: uniform( 0.4 ),
		grain: uniform( 0.03 ),
	};
	const postLDR = ( ldr ) => Fn( () => {

		let c = ldr.rgb.toVar();
		c.assign( c.sub( 0.4 ).mul( g.contrast ).add( 0.4 ).max( 0 ) );
		const l = luminance( c );
		c.assign( mix( vec3( l ), c, g.saturation ) );
		const w = smoothstep( 0.0, 0.6, l );
		c.assign( c.mul( mix( vec3( g.shadowTint ), vec3( g.highTint ), w ) ) );
		c.assign( c.add( g.lift ).div( float( 1 ).add( g.lift ) ) );
		const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.25, 1.0 ) ) );
		c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( g.vignette ) ) ) );
		const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
		c.assign( c.add( n.mul( g.grain ) ) );
		return vec4( c, 1 );

	} )();

	// 俯视/近景切换：俯视时隐藏屋顶与南墙（仍投影）
	const update = () => {

		const top = ! window.__app?.ctx?.lockCamera;
		if ( top ) camera.layers.disable( ROOF_LAYER ); else camera.layers.enable( ROOF_LAYER );

	};

	camera.layers.enable( ROOF_LAYER );
	if ( params.get( 'shot' ) === 'top' ) camera.layers.disable( ROOF_LAYER );

	const gui = ( lil ) => {

		const f = lil.addFolder( '阳光室内' );
		f.add( sun, 'intensity', 0, 30 ).name( '太阳强度' );
		f.add( hemi, 'intensity', 0, 2 ).name( '天光' );
		f.add( volDensity, 'value', 0, 3 ).name( '光柱浓度' );
		f.add( look.dust, 'value', 0, 2 ).name( '灰尘' );
		f.add( g.contrast, 'value', 0.5, 2 ).name( '对比' );
		f.add( g.saturation, 'value', 0, 2 ).name( '饱和' );
		f.add( renderer, 'toneMappingExposure', 0.2, 3 ).name( '曝光' );

	};

	return {
		sun, M, update, gui,
		pipelineOptions: { volumes: [ fogBox ], volumeIntensity: 1, volumeResolution: 0.5, postLDR, bloomThreshold: 0.9 },
	};

}

