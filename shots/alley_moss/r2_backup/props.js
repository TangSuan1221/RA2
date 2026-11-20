// 苔藓小巷：巷尾层次（铁丝网门 + 挂布 → 树影 → 模块化立面楼 + 消防梯）、冷白灯、叙事杂物、架空电缆、接触阴影
import * as THREE from 'three/webgpu';
import { Tree } from '@dgreenheck/ez-tree';
import { loadModel, InstanceBatch, trs } from '../world/assets.js';
import { buildBuilding, weatherFacadeKit } from '../world/buildings.js';
import { createVolumeFog, VOLUME_LAYER } from '../core/renderer.js';
import { L, n01, skyAO } from './materials.js';
import { rng, fbm2, smooth, merge, mergeIndexed, bevelBox, xf, T, taperTube, lumpGeometry, instanced, worldUV } from './util.js';
import {
	positionWorld, mix, vec3, vec2, smoothstep, materialColor, float, uv, length, instanceColor, max, normalWorldGeometry, luminance,
} from 'three/tsl';

export const END = { FENCE_Z: - 37.6, FACADE_Z: - 48, LAMP: new THREE.Vector3( 1.25, 3.9, - 33.6 ) };

// 给模型材质叠一层潮湿 + 苔藓 + 天空遮蔽
export function dampen( mat, { moss = 0.5, dark = 0.6, tint = null } = {} ) {

	if ( mat.userData.damp ) return;
	mat.userData.damp = true;
	const p = positionWorld;
	const n = n01( p.mul( 3.0 ), 3 );
	const m = smoothstep( 0.58, 0.72, n.add( smoothstep( 0.5, 1.0, normalWorldGeometry.y ).mul( 0.1 ) ) ).mul( moss );
	let base = materialColor.rgb;
	if ( tint ) base = vec3( luminance( base ) ).mul( vec3( tint ) ).mul( 2.5 );
	// 底部泥渍：离地 25cm 内变暗
	const mud = smoothstep( L.SLAB_TOP + 0.25, L.SLAB_TOP, p.y ).mul( 0.5 );
	mat.colorNode = mix( base.mul( dark ).mul( float( 1 ).sub( mud ) ), vec3( 0.025, 0.035, 0.012 ), m );
	mat.aoNode = skyAO();

}

// —— 布料（挂布、衣物）：带褶皱的细分平面 ——
function cloth( w, h, nx, ny, shape ) {

	const g = new THREE.PlaneGeometry( w, h, nx, ny );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const v = shape( p.getX( i ), p.getY( i ) );
		p.setXYZ( i, v[ 0 ], v[ 1 ], v[ 2 ] );

	}

	g.computeVertexNormals();
	return g;

}

export async function buildEnd( mats, scene ) {

	const group = new THREE.Group();
	const r = rng( 61 );
	const FZ = END.FENCE_Z, Y = L.SLAB_TOP;

	// —— 1. 铁丝网围栏 + 半开的门 ——
	const fence = await loadModel( 'modular_chainlink_fence' );
	for ( const list of Object.values( fence.parts ) ) for ( const p of list ) dampen( p.material, { moss: 0.15, dark: 0.55 } );
	const b = new InstanceBatch();
	b.add( fence.parts, 'modular_chainlink_fence_double', trs( - 0.32, Y, FZ, 0 ) );
	b.add( fence.parts, 'modular_chainlink_fence', trs( 1.95, Y, FZ, 0 ) );
	for ( const x of [ - 2.28, - 0.32, 0.95, 1.95 ] ) b.add( fence.parts, 'modular_chainlink_fence_post', trs( x, Y, FZ, 0 ) );
	// 门扇：绕门柱向巷内转开约 110°
	b.add( fence.parts, 'modular_chainlink_fence_door_gate', trs( 0.95, Y + 1.075, FZ, Math.PI + 1.15 ) );
	group.add( b.build() );

	// 挂在围栏上的防水布：上沿系在围栏顶，下垂、扭曲、底部被撕裂
	const tarp = cloth( 1.75, 1.9, 24, 26, ( x, y ) => {

		const t = ( 0.95 - y ) / 1.9; // 0 顶 → 1 底
		const fold = Math.sin( x * 9 + t * 2 ) * 0.04 * t + ( fbm2( x * 3, y * 3, 3 ) - 0.5 ) * 0.12 * t;
		const sag = Math.sin( ( x / 1.75 + 0.5 ) * Math.PI ) * 0.12 * ( 1 - t );
		return [ x + ( fbm2( y * 2, 5, 2 ) - 0.5 ) * 0.1 * t, y - sag - 0.04 * t * t, fold + 0.04 + t * 0.06 ];

	} );
	tarp.translate( - 1.3, Y + 2.38 - 0.95, FZ );
	const tm = new THREE.Mesh( tarp, mats.tarp );
	tm.castShadow = tm.receiveShadow = true;
	group.add( tm );

	// —— 2. 巷尾空场地面（旧沥青 + 苔藓）——
	const far = new THREE.PlaneGeometry( 60, 26, 1, 1 );
	far.rotateX( - Math.PI / 2 );
	far.translate( 0, 0.07, - 53 );
	const fm = new THREE.Mesh( far, mats.farGround );
	fm.receiveShadow = true;
	group.add( fm );

	// —— 3. 立面楼（共享模块化立面套件）+ 生锈消防梯 ——
	const kit = await loadModel( 'modular_urban_apartments_facade' );
	weatherFacadeKit( kit );
	const batch = new InstanceBatch();
	const fz = END.FACADE_Z;
	const b1 = buildBuilding( kit, { x0: - 16.5, z0: fz - 12, x1: 4.5, z1: fz, floors: 4, seed: 12, shopSides: [ 'S' ], tint: 0x5e605c }, batch );
	const b2 = buildBuilding( kit, { x0: 4.5, z0: fz - 9, x1: 16.5, z1: fz + 1.5, floors: 5, seed: 31, shopSides: [ 'S' ], tint: 0x66625a }, batch );
	const esc = await loadModel( 'modular_fire_escape' );
	for ( const list of Object.values( esc.parts ) ) for ( const p of list ) dampen( p.material, { moss: 0.1, dark: 0.45, tint: new THREE.Color( 0.12, 0.07, 0.045 ) } );
	const off = esc.offsets;
	const base = off.modular_fire_escape_platform_middle;
	const fx = - 4.0;
	for ( let f = 1; f < 4; f ++ ) {

		const y0 = f * 3 + 0.05;
		for ( const name of [ 'modular_fire_escape_platform_middle', 'modular_fire_escape_railing_middle', 'modular_fire_escape_stairs' ] ) {

			const o = off[ name ];
			batch.add( esc.parts, name, trs( fx + o[ 0 ] - base[ 0 ], y0 + o[ 1 ] - base[ 1 ], fz + 0.85 + o[ 2 ] - base[ 2 ], 0 ) );

		}

	}

	group.add( batch.build() );
	for ( const e of [ ...b1.extra, ...b2.extra ] ) group.add( e );

	// —— 4. 树影：围栏与楼之间的空场上，几棵疯长的树（ez-tree 程序化）——
	const treeSpots = [ [ - 6.5, - 43.5, 'Ash Medium', 3 ], [ 3.2, - 44.5, 'Oak Medium', 7 ], [ - 1.5, - 45.5, 'Ash Small', 11 ], [ 7.5, - 42.5, 'Ash Medium', 19 ], [ - 11, - 42, 'Oak Medium', 23 ] ];
	for ( const [ x, z, preset, seed ] of treeSpots ) {

		try {

			const t = new Tree();
			t.loadPreset( preset );
			t.options.seed = seed;
			t.generate();
			const leafMap = t.leavesMesh.material.map;
			const barkMap = t.branchesMesh.material.map;
			t.branchesMesh.material = mats.bark( barkMap );
			t.leavesMesh.material = mats.treeLeaf( leafMap );
			t.branchesMesh.castShadow = t.leavesMesh.castShadow = false;
			t.position.set( x, 0.07, z );
			const bb = new THREE.Box3().setFromObject( t );
			const h = bb.max.y - bb.min.y;
			t.scale.setScalar( ( 7 + r() * 4 ) / Math.max( h, 1 ) );
			t.rotation.y = r() * 6.28;
			t.update = () => {};
			group.add( t );

		} catch ( e ) {

			console.warn( 'ez-tree 生成失败', e.message );

		}

	}

	// —— 5. 冷白灯：装在右墙上的投光灯（灯臂 + 灯罩 + 发光面），真实聚光灯 + 体积光锥 ——
	const Lp = END.LAMP;
	const lampParts = [];
	const arm = bevelBox( 0.05, 0.05, 0.8, 0.008 );
	xf( arm, T( L.WALL_X - 0.4, Lp.y + 0.12, Lp.z, 0, Math.PI / 2 ) );
	lampParts.push( arm );
	const brace = bevelBox( 0.04, 0.04, 0.65, 0.006 );
	xf( brace, T( L.WALL_X - 0.25, Lp.y - 0.12, Lp.z, 0.0, Math.PI / 2, 0.75 ) );
	lampParts.push( brace );
	const plate = bevelBox( 0.03, 0.3, 0.2, 0.006 );
	xf( plate, T( L.WALL_X - 0.02, Lp.y, Lp.z ) );
	lampParts.push( plate );
	const shade = new THREE.CylinderGeometry( 0.1, 0.24, 0.2, 18, 1, true ).toNonIndexed();
	shade.translate( 0, 0, 0 );
	xf( shade, T( Lp.x, Lp.y, Lp.z, 0, 0, 0.35 ) );
	lampParts.push( shade );
	const lm = new THREE.Mesh( merge( lampParts ), mats.lampMetal );
	lm.castShadow = true;
	group.add( lm );
	const bulb = new THREE.Mesh( new THREE.CircleGeometry( 0.2, 20 ), mats.lamp );
	bulb.rotation.x = Math.PI / 2;
	bulb.rotation.y = - 0.35;
	bulb.position.set( Lp.x - 0.03, Lp.y - 0.09, Lp.z );
	group.add( bulb );

	const spot = new THREE.SpotLight( 0xdde8ff, 70, 22, 0.9, 0.65, 2 );
	spot.position.set( Lp.x - 0.05, Lp.y - 0.12, Lp.z );
	spot.target.position.set( - 0.6, 0, Lp.z - 1.2 );
	spot.castShadow = true;
	spot.shadow.mapSize.set( 1024, 1024 );
	spot.shadow.bias = - 0.0005;
	spot.shadow.normalBias = 0.02;
	spot.shadow.radius = 3;
	spot.layers.enable( VOLUME_LAYER );
	group.add( spot, spot.target );
	// 灯泡周围的弱补光（照亮灯具本身与墙面）
	const glow = new THREE.PointLight( 0xdde8ff, 1.6, 5, 2 );
	glow.position.set( Lp.x - 0.3, Lp.y - 0.3, Lp.z );
	group.add( glow );

	// 体积雾：只覆盖灯下一块区域（节省开销）
	const vg = new THREE.BoxGeometry( 4.3, 4.6, 8 );
	const vol = createVolumeFog( vg, { density: 0.32, steps: 14, noise: ( p ) => n01( p.mul( 0.9 ), 2 ).mul( 0.8 ).add( 0.4 ) } );
	vol.position.set( - 0.15, 2.3, Lp.z - 1 );
	group.add( vol );

	return { group, spot, vol };

}

// ———————————————————————— 叙事杂物 ————————————————————————
function bicycle() {

	const tubes = [];
	const R = 0.33;
	const wheel = ( cx ) => {

		const t = new THREE.TorusGeometry( R, 0.018, 6, 40 );
		t.translate( cx, R, 0 );
		tubes.push( t );
		const rim = new THREE.TorusGeometry( R - 0.03, 0.008, 4, 40 );
		rim.translate( cx, R, 0 );
		tubes.push( rim );
		for ( let k = 0; k < 16; k ++ ) {

			const a = k / 16 * Math.PI * 2;
			tubes.push( taperTube( [ new THREE.Vector3( cx, R, ( k % 2 ? 1 : - 1 ) * 0.02 ), new THREE.Vector3( cx + Math.cos( a ) * ( R - 0.03 ), R + Math.sin( a ) * ( R - 0.03 ), 0 ) ], 0.0018, 0.0018, 3 ) );

		}

		const hub = new THREE.CylinderGeometry( 0.025, 0.025, 0.07, 8 );
		hub.rotateX( Math.PI / 2 ); hub.translate( cx, R, 0 );
		tubes.push( hub );

	};

	wheel( - 0.52 ); wheel( 0.52 );
	const V = ( x, y, z = 0 ) => new THREE.Vector3( x, y, z );
	const bb = V( - 0.02, R ), seat = V( - 0.17, 0.86 ), head = V( 0.36, 0.84 ), headLow = V( 0.39, 0.72 );
	const frame = [ [ bb, seat ], [ bb, headLow ], [ V( - 0.15, 0.8 ), head ], [ bb, V( - 0.52, R, 0.03 ) ], [ V( - 0.15, 0.82 ), V( - 0.52, R, 0.03 ) ], [ head, V( 0.52, R ) ], [ seat, V( - 0.19, 0.95 ) ], [ head, V( 0.34, 1.0 ) ] ];
	for ( const [ a, b2 ] of frame ) tubes.push( taperTube( [ a, b2 ], 0.016, 0.016, 6 ) );
	tubes.push( taperTube( [ V( 0.34, 1.0, - 0.25 ), V( 0.36, 1.02, 0 ), V( 0.34, 1.0, 0.25 ) ], 0.012, 0.012, 6 ) );
	const crank = new THREE.TorusGeometry( 0.09, 0.008, 4, 20 );
	crank.translate( - 0.02, R, 0.04 );
	tubes.push( crank );
	const saddle = lumpGeometry( 31, 1, 0.35 );
	saddle.scale( 0.13, 0.12, 0.07 );
	saddle.translate( - 0.2, 0.96, 0 );
	tubes.push( saddle );
	return mergeIndexed( tubes );

}

function backpack() {

	const body = new THREE.BoxGeometry( 0.34, 0.46, 0.2, 6, 8, 4 );
	const p = body.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const k = 1 - 0.18 * Math.pow( Math.abs( y ) / 0.23, 3 );
		p.setXYZ( i, x * k * ( 1 + 0.05 * Math.sin( y * 20 ) ), y, z * k * ( 1 - 0.15 * ( y + 0.23 ) ) + 0.02 * Math.sin( x * 15 ) );

	}

	body.computeVertexNormals();
	body.translate( 0, 0.23, 0 );
	const pocket = new THREE.BoxGeometry( 0.26, 0.18, 0.08, 4, 3, 2 );
	pocket.translate( 0, 0.15, 0.12 );
	const flap = new THREE.BoxGeometry( 0.33, 0.04, 0.22, 4, 1, 3 );
	flap.translate( 0, 0.47, 0.005 );
	const strap1 = new THREE.TorusGeometry( 0.17, 0.012, 4, 16, Math.PI );
	strap1.rotateZ( Math.PI / 2 ); strap1.rotateY( Math.PI / 2 ); strap1.translate( 0.09, 0.27, - 0.1 );
	const strap2 = strap1.clone(); strap2.translate( - 0.18, 0, 0 );
	return mergeIndexed( [ body, pocket, flap, strap1, strap2 ] );

}

function hoseReel() {

	const parts = [];
	const drum = new THREE.CylinderGeometry( 0.12, 0.12, 0.34, 16, 1 );
	drum.rotateZ( Math.PI / 2 ); drum.translate( 0, 0.42, 0 );
	parts.push( drum );
	for ( const s of [ - 1, 1 ] ) {

		const disk = new THREE.TorusGeometry( 0.22, 0.012, 4, 24 );
		disk.rotateY( Math.PI / 2 ); disk.translate( s * 0.18, 0.42, 0 );
		parts.push( disk );
		parts.push( taperTube( [ new THREE.Vector3( s * 0.2, 0, 0.18 ), new THREE.Vector3( s * 0.2, 0.42, 0 ), new THREE.Vector3( s * 0.2, 0, - 0.18 ) ], 0.012, 0.012, 5 ) );

	}

	parts.push( taperTube( [ new THREE.Vector3( - 0.2, 0.72, - 0.1 ), new THREE.Vector3( 0, 0.74, - 0.1 ), new THREE.Vector3( 0.2, 0.72, - 0.1 ) ], 0.012, 0.012, 5 ) );
	parts.push( taperTube( [ new THREE.Vector3( - 0.2, 0.42, 0 ), new THREE.Vector3( - 0.2, 0.72, - 0.1 ) ], 0.012, 0.012, 5 ) );
	parts.push( taperTube( [ new THREE.Vector3( 0.2, 0.42, 0 ), new THREE.Vector3( 0.2, 0.72, - 0.1 ) ], 0.012, 0.012, 5 ) );
	return mergeIndexed( parts );

}

function hoseCoils() {

	const parts = [];
	for ( let k = 0; k < 7; k ++ ) {

		const t = new THREE.TorusGeometry( 0.15 + ( k % 2 ) * 0.02, 0.016, 5, 20 );
		t.rotateY( Math.PI / 2 ); t.translate( - 0.13 + k * 0.042, 0.42, 0 );
		parts.push( t );

	}

	return mergeIndexed( parts );

}

export async function buildProps( mats, ground, ivy ) {

	const ids = [ 'trashbag', 'cardboard_box_01', 'barrel_03', 'old_tyre', 'wooden_crate_01', 'plastic_monobloc_chair_01', 'metal_trash_can', 'cement_bag', 'metal_jerrycan', 'binder_notebook', 'utility_box_01' ];
	const M = Object.fromEntries( await Promise.all( ids.map( async ( id ) => [ id, await loadModel( id ) ] ) ) );
	const opts = {
		barrel_03: { moss: 0.15, dark: 0.5 }, plastic_monobloc_chair_01: { moss: 0.35, dark: 0.32, tint: new THREE.Color( 0.07, 0.075, 0.065 ) }, metal_trash_can: { moss: 0.2, dark: 0.5 },
		utility_box_01: { moss: 0.3, dark: 0.45 }, trashbag: { moss: 0.1, dark: 0.55 }, cardboard_box_01: { moss: 0.2, dark: 0.45 },
	};
	for ( const id of ids ) for ( const list of Object.values( M[ id ].parts ) ) for ( const p of list ) dampen( p.material, opts[ id ] || { moss: 0.4, dark: 0.55 } );

	const r = rng( 55 );
	const b = new InstanceBatch();
	const H = ( x, z ) => ground.heightAt( x, z );
	const blobs = []; // 接触阴影 [x, y, z, sx, sz, ry]
	const put = ( id, name, x, z, ry, s = 1, rx = 0, rz = 0, dy = 0, shadow = [ 0.5, 0.5 ] ) => {

		const y = H( x, z ) + dy;
		b.add( M[ id ].parts, name || Object.keys( M[ id ].parts )[ 0 ], trs( x, y, z, ry, s, rx, rz ) );
		if ( shadow ) blobs.push( [ x, y, z, shadow[ 0 ] * s, shadow[ 1 ] * s, ry ] );

	};

	// 温室一侧：垃圾堆（袋子、纸箱、翻倒的铁皮垃圾桶）
	put( 'trashbag', null, - 1.72, - 4.2, 0.6, 1.0, 0, 0, 0, [ 0.7, 0.7 ] );
	put( 'trashbag', null, - 1.38, - 4.7, 2.1, 0.85, 0, 0, 0, [ 0.6, 0.6 ] );
	put( 'trashbag', null, - 1.78, - 4.75, 1.1, 0.8, 0.3, 0.1, 0.3, null );
	put( 'cardboard_box_01', null, - 1.62, - 3.45, 0.4, 1.0, 0, 0, 0.17, [ 0.55, 0.6 ] );
	put( 'cardboard_box_01', null, - 1.55, - 12.6, 1.9, 1.1, 0.0, Math.PI / 2 - 0.1, 0.2, [ 0.6, 0.6 ] );
	put( 'metal_trash_can', 'metal_trash_can_rust', - 1.25, - 5.6, 1.2, 1.0, 0, Math.PI / 2, 0.29, [ 0.8, 1.0 ] );
	put( 'metal_trash_can', 'metal_trash_can_rust_lid', - 0.7, - 6.3, 0.4, 1.0, 0.08, 0, 0.005, [ 0.4, 0.4 ] );
	// 墙根：轮胎、油桶、木箱、水泥袋
	put( 'old_tyre', null, 1.0, - 9.5, 0.4, 1.0, Math.PI / 2 - 0.12, 0, 0.08, [ 0.6, 0.6 ] );
	put( 'barrel_03', null, 1.25, - 17.2, 0.6, 1.0, 0, 0, 0, [ 0.7, 0.7 ] );
	put( 'barrel_03', null, 0.7, - 18.0, 1.6, 1.0, Math.PI / 2, 0, 0.32, [ 1.0, 0.7 ] );
	put( 'wooden_crate_01', null, - 1.6, - 20, 0.3, 1.0, 0, 0, 0, [ 0.9, 0.5 ] );
	put( 'trashbag', null, - 1.5, - 21, 2.6, 0.9, 0, 0, 0, [ 0.6, 0.6 ] );
	put( 'cement_bag', null, - 1.7, - 20.8, 0.2, 1.0, 0, 0, 0.0, [ 0.5, 0.7 ] );
	put( 'cement_bag', null, - 1.65, - 20.75, 0.5, 1.0, 0, 0, 0.17, null );
	put( 'metal_jerrycan', null, 1.05, - 13.2, 1.3, 1.0, 0, 1.45, 0.08, [ 0.4, 0.5 ] );
	put( 'binder_notebook', 'binder_notebook', - 0.25, - 7.6, 2.2, 1.2, 0, 0, 0.003, [ 0.3, 0.3 ] );
	put( 'utility_box_01', null, - 1.85, - 35.8, Math.PI / 2, 1.0, 0, 0, 0, [ 0.6, 0.6 ] );
	// 塑料椅：一把立着、一把侧翻、一把向后倒
	put( 'plastic_monobloc_chair_01', null, - 1.45, - 9.6, 1.0, 1.0, 0, 0, 0, [ 0.7, 0.7 ] );
	put( 'plastic_monobloc_chair_01', null, - 0.75, - 10.6, 2.5, 1.0, 0, Math.PI / 2, 0.32, [ 0.8, 0.8 ] );
	put( 'plastic_monobloc_chair_01', null, 0.55, - 24.5, 0.8, 1.0, - Math.PI / 2 + 0.25, 0, 0.3, [ 0.9, 0.9 ] );
	put( 'trashbag', null, - 1.7, - 31.5, 0.9, 1.0, 0, 0, 0, [ 0.7, 0.7 ] );
	put( 'cardboard_box_01', null, - 1.3, - 31.9, 0.9, 0.9, 0, 0, 0.15, [ 0.5, 0.5 ] );
	const group = new THREE.Group();
	group.add( b.build() );

	// —— 程序化道具 ——
	// 生锈自行车：靠在温室矮墙上
	const bike = new THREE.Mesh( bicycle(), mats.bikeMetal );
	bike.position.set( L.GH_X + 0.32, L.SLAB_TOP, - 15.2 );
	bike.rotation.set( 0, Math.PI / 2 - 0.05, 0.16 );
	bike.castShadow = bike.receiveShadow = true;
	group.add( bike );
	blobs.push( [ L.GH_X + 0.3, L.SLAB_TOP, - 15.2, 0.4, 1.4, 0 ] );

	// 背包：倒在塑料椅旁
	const bp = new THREE.Mesh( backpack(), mats.fabric );
	bp.position.set( - 1.05, H( - 1.05, - 9.2 ) + 0.1, - 9.2 );
	bp.rotation.set( - Math.PI / 2 + 0.2, 0.6, 0 );
	bp.castShadow = bp.receiveShadow = true;
	group.add( bp );
	blobs.push( [ - 1.05, H( - 1.05, - 9.2 ), - 9.2, 0.5, 0.6, 0.6 ] );

	// 衣物：一件外套摊在地上（贴合地面高度 + 褶皱）
	const coat = cloth( 0.7, 0.85, 16, 18, ( x, y ) => [ x * ( 1 - 0.25 * Math.abs( y ) ), y, Math.max( 0, ( fbm2( x * 6, y * 6, 3 ) - 0.4 ) * 0.09 ) + Math.max( 0, Math.sin( x * 14 ) ) * 0.015 ] );
	coat.rotateX( - Math.PI / 2 );
	coat.rotateY( 0.7 );
	coat.translate( 0.35, 0, - 12.1 );
	{

		const p = coat.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + H( p.getX( i ), p.getZ( i ) ) + 0.004 );
		coat.computeVertexNormals();

	}

	const cm = new THREE.Mesh( coat, mats.cloth );
	cm.receiveShadow = true;
	group.add( cm );

	// 水管卷盘 + 拖在地上的软管
	const reel = new THREE.Group();
	const rm = new THREE.Mesh( hoseReel(), mats.bikeMetal );
	const hc = new THREE.Mesh( hoseCoils(), mats.hose );
	reel.add( rm, hc );
	reel.position.set( - 1.75, L.SLAB_TOP, - 23.6 );
	reel.rotation.y = 0.3;
	rm.castShadow = hc.castShadow = true;
	group.add( reel );
	blobs.push( [ - 1.75, L.SLAB_TOP, - 23.6, 0.5, 0.5, 0.3 ] );
	{

		const pts = [];
		let x = - 1.6, z = - 23.4;
		for ( let i = 0; i < 40; i ++ ) {

			pts.push( new THREE.Vector3( x, H( x, z ) + 0.016, z ) );
			x += 0.06 + Math.sin( i * 0.4 ) * 0.04; z += 0.08 + Math.cos( i * 0.31 ) * 0.07;

		}

		const hm = new THREE.Mesh( taperTube( pts, 0.016, 0.016, 6 ), mats.hose );
		hm.castShadow = true;
		group.add( hm );

	}

	// 碎花盆（温室墙根）
	const pots = [];
	for ( let i = 0; i < 9; i ++ ) {

		const z = - 2 - r() * 30, x = L.GH_X + 0.3 + r() * 0.4;
		const g = new THREE.LatheGeometry( [ [ 0.08, 0 ], [ 0.12, 0.2 ], [ 0.14, 0.235 ] ].map( ( p ) => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), 12, 0, Math.PI * ( 0.5 + r() * 0.7 ) );
		g.rotateX( Math.PI / 2 * ( r() < 0.6 ? 1 : 0 ) );
		g.rotateY( r() * 6 );
		g.translate( x, H( x, z ) + 0.1, z );
		pots.push( g );

	}

	const potM = new THREE.Mesh( mergeIndexed( pots ), mats.terracotta );
	potM.castShadow = true;
	group.add( potM );

	// 散落纸张（含漂在积水里的）
	const paperG = new THREE.PlaneGeometry( 0.21, 0.29, 2, 2 );
	{

		const p = paperG.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) p.setZ( i, Math.abs( p.getX( i ) ) * 0.08 + p.getY( i ) * p.getY( i ) * 0.2 );
		paperG.rotateX( - Math.PI / 2 );
		paperG.computeVertexNormals();

	}

	const pm = [], pc = [];
	for ( let i = 0; i < 70; i ++ ) {

		const x = - 2.0 + r() * 3.2, z = 6 - r() * 42;
		const inW = ground.sunk( x, z ) < 0.95;
		const y = inW ? L.WATER_Y + 0.003 : H( x, z ) + 0.006;
		pm.push( new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( inW ? 0 : ( r() - 0.5 ) * 0.3, r() * 6.28, 0 ) ), new THREE.Vector3( 1, 1, 1 ).multiplyScalar( 0.7 + r() * 0.5 ) ) );
		const v = 0.2 + r() * 0.12;
		pc.push( new THREE.Color().setRGB( v, v * 0.97, v * 0.88 ).multiplyScalar( inW ? 0.5 : 1 ) );

	}

	group.add( instanced( paperG, mats.paper, pm, pc, { cast: false } ) );

	// 接触阴影（贴地径向渐变）
	const blobG = new THREE.PlaneGeometry( 1, 1 );
	blobG.rotateX( - Math.PI / 2 );
	const bm = blobs.map( ( [ x, y, z, sx, sz, ry ] ) => new THREE.Matrix4().compose( new THREE.Vector3( x, Math.max( H( x, z ), L.SLAB_TOP - 0.02 ) + 0.004, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ry, 0 ) ), new THREE.Vector3( sx * 1.6, 1, sz * 1.6 ) ) );
	const blobMesh = instanced( blobG, mats.contactAO, bm, null, { cast: false, receive: false } );
	blobMesh.renderOrder = 3;
	group.add( blobMesh );

	// —— 架空电缆：墙与温室之间，垂度各异 ——
	const cables = [];
	const cr = rng( 88 );
	for ( const [ z, sag, dz ] of [ [ - 6.5, 0.9, 0.3 ], [ - 6.9, 0.55, - 0.2 ], [ - 7.2, 1.25, 0.6 ], [ - 18.5, 1.1, - 0.8 ], [ - 19.1, 0.7, 0.4 ], [ - 27.5, 0.65, 0.2 ], [ - 30.2, 1.5, - 1.2 ] ] ) {

		const pts = [];
		for ( let t = 0; t <= 1.0001; t += 1 / 30 ) {

			const x = L.WALL_X - 0.05 + ( L.GH_X - L.WALL_X + 0.1 ) * t;
			const y = L.WALL_H - 0.35 + ( L.GH_H - L.WALL_H + 0.35 ) * t - sag * 4 * t * ( 1 - t );
			pts.push( new THREE.Vector3( x, y, z + dz * t + ( cr() - 0.5 ) * 0.01 ) );

		}

		cables.push( taperTube( pts, 0.011, 0.011, 5 ) );

	}

	// 一根断掉垂到地面的电缆
	{

		const pts = [];
		for ( let t = 0; t <= 1.0001; t += 1 / 30 ) {

			const y = L.WALL_H - 0.35 - t * ( L.WALL_H - 0.6 ) - Math.sin( t * Math.PI ) * 0.2;
			pts.push( new THREE.Vector3( L.WALL_X - 0.08 - t * 0.9 - Math.sin( t * 3 ) * 0.1, Math.max( y, 0.15 ), - 22.4 + t * 0.4 ) );

		}

		cables.push( taperTube( pts, 0.011, 0.011, 5 ) );

	}

	const cm2 = new THREE.Mesh( mergeIndexed( cables ), mats.cable );
	cm2.castShadow = true;
	group.add( cm2 );
	return group;

}
