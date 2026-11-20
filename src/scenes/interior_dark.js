// 场景：黑暗积水室内（对标 ref3 —— TLOU2 淹水大堂）
// 近乎全黑的废弃大堂，没过小腿的黑色死水；唯一的主光是玩家手电（暖白聚光，相机右侧 1.2m 高、光斑 cookie），
// 光束穿过空气中的孢子与灰尘形成体积光锥，打在深处的双开门与门框上；门后小房间的暖光只从门缝和夹丝玻璃透出来。
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, luminance, screenUV, time, positionWorld,
	mx_fractal_noise_float, mx_noise_vec3, mx_noise_float, reflector, transformNormalToView, cameraPosition,
	normalize, dot, pow, max, min, abs, instancedBufferAttribute, instanceIndex, hash, sin, fract, uv, texture, exp,
	positionView, normalMap, viewportDepthTexture, perspectiveDepthToViewZ, cameraNear, cameraFar,
} from 'three/tsl';
import { fog, rangeFogFactor } from 'three/tsl';
import { VOLUME_LAYER } from '../core/renderer.js';
import { createVolumeFogTAA } from '../interior_dark/volume.js';
import { loadModel } from '../world/assets.js';
import {
	WATER_Y, wallMaterial, woodMaterial, ceilingMaterial, metalMaterial, weatherProp, boxUV, texSet, doorPaintMaterial, wiredGlassMaterial,
} from '../interior_dark/materials.js';
import { mulberry, leafGeometry, leafMaterial } from '../interior_dark/ivy.js';
import { Ivy } from '../interior_dark/ivy2.js';
import { buildDoubleDoor, buildRingLamp, cable, ceilingTileMaterial, soggyPaper, paperMaterial, rbox } from '../interior_dark/props.js';
import { makeCookieTexture, FL, flashAt, syncFlash } from '../interior_dark/flash.js';

// —— 房间尺寸（米）——  +X 右，-Z 向里（门洞方向）
const R = {
	x0: - 4.2, x1: 4.2, // 大堂左右墙
	nearLeft: - 1.65, // 近处左墙（玻璃门所在）向内收，镜头贴着它
	zBack: - 9.4, zFront: 3, zStep: - 3.4, // 近处左墙在 zStep 处折回到大堂左墙（拐角有包木方柱）
	h: 3.4, // 吊顶高度
	slab: 4.0, // 结构楼板底（吊顶上方的设备层）
	door: { x0: 0.25, x1: 2.1, y1: 2.3 }, // 背墙门洞
	backRoom: - 12.2, // 门后小房间深度
};

// 手电（相机右侧 +0.35m、离地 1.2m、相机后 0.3m）
const CAM = [ - 0.15, 1.52, 1.6 ];
const CUT_Y = 2.45; // 俯视剖切平面高度（米）
const FLASH = { pos: [ CAM[ 0 ] + 0.55, 1.2, CAM[ 2 ] - 0.2 ], target: [ 0.95, 1.25, - 9.4 ] }; // 光斑中心落在左门扇 1.0~1.6m 高处
// 俯视（游戏镜头）时：角色站在房间中前部，手电朝前照向门
const FLASH_TOP = { pos: [ - 0.2, 1.2, - 0.6 ], target: [ 0.5, 0.0, - 4.6 ] };

export const SHOTS = {
	hero: { position: CAM, lookAt: [ 0.55, 1.38, - 9.4 ], fov: 47 },
	top: { mode: 'top', yaw: 0, pitch: 55, distance: 10.5, target: [ 0.0, 0, - 4.6 ] },
	// 调试用近景：背墙常春藤
	ivy: { position: [ 0.6, 1.5, - 5.8 ], lookAt: [ 1.6, 1.6, - 9.4 ], fov: 55 },
};

// 场景调色（替换默认调色）：对比、暗部偏青绿、暖光处略暖、黑位抬向灰绿（0x0f120d）、颗粒、暗角
const G = {
	contrast: uniform( 1.0 ),
	saturation: uniform( 0.7 ),
	lift: uniform( 0.4 ),
	shadowTint: uniform( new THREE.Color( 0.96, 0.95, 0.9 ) ), // 暗部只略偏橄榄灰，不再偏青绿
	highlightTint: uniform( new THREE.Color( 1.0, 1.0, 0.95 ) ),
	vignette: uniform( 0.4 ),
	grain: uniform( 0.028 ),
};

const darkGrade = Fn( ( [ color ] ) => {

	let c = color.rgb.toVar();
	c.assign( c.sub( 0.25 ).mul( G.contrast ).add( 0.25 ).max( 0 ) );
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, G.saturation ) );
	const w = smoothstep( 0.0, 0.45, l );
	c.assign( c.mul( mix( vec3( G.shadowTint ), vec3( G.highlightTint ), w ) ) );
	// 抬黑位：朝灰绿 0x0f120d 抬，高光处不抬
	c.assign( c.add( vec3( 0.06, 0.064, 0.052 ).mul( G.lift ).mul( float( 1 ).sub( l ) ) ) );
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.3, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( G.vignette ) ) ) );
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( G.grain ).mul( l.add( 0.05 ).sqrt() ) ) );
	return vec4( c, color.a );

} );

// 合并同材质的几何体，减少绘制调用（全部转为非索引，兼容 RoundedBox）
function merged( geos, mat, { cast = true, receive = true } = {} ) {

	const m = new THREE.Mesh( mergeGeos( geos ), mat );
	m.castShadow = cast; m.receiveShadow = receive;
	return m;

}

function mergeGeos( geos ) {

	const list = geos.map( ( g ) => ( g.index ? g.toNonIndexed() : g ) );
	let n = 0;
	for ( const g of list ) n += g.attributes.position.count;
	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), uvs = new Float32Array( n * 2 );
	let o = 0;
	for ( const g of list ) {

		pos.set( g.attributes.position.array, o * 3 );
		nor.set( g.attributes.normal.array, o * 3 );
		if ( g.attributes.uv ) uvs.set( g.attributes.uv.array, o * 2 );
		o += g.attributes.position.count;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	return out;

}


// 把一个组里的网格按材质烘焙世界矩阵后合并（门、吊灯等多部件道具 → 每种材质一次绘制）
function bakeGroup( group, { cast = true } = {} ) {

	group.updateMatrixWorld( true );
	const byMat = new Map();
	group.traverse( ( o ) => {

		if ( ! o.isMesh ) return;
		const g = o.geometry.clone().applyMatrix4( o.matrixWorld );
		if ( ! g.attributes.uv ) g.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( g.attributes.position.count * 2 ), 2 ) );
		( byMat.get( o.material ) || byMat.set( o.material, [] ).get( o.material ) ).push( g );

	} );
	const out = new THREE.Group();
	for ( const [ mat, geos ] of byMat ) out.add( merged( geos, mat, { cast: cast && ! mat.emissiveNode } ) );
	return out;

}

// 平滑的二维值噪声（0~1），用于常春藤覆盖区的不规则边缘
function vnoise( x, y ) {

	const h = ( i, j ) => { const t = Math.sin( i * 127.1 + j * 311.7 ) * 43758.5453; return t - Math.floor( t ); };
	const xi = Math.floor( x ), yi = Math.floor( y ), xf = x - xi, yf = y - yi;
	const sx = xf * xf * ( 3 - 2 * xf ), sy = yf * yf * ( 3 - 2 * yf );
	const a = h( xi, yi ) + ( h( xi + 1, yi ) - h( xi, yi ) ) * sx;
	const b = h( xi, yi + 1 ) + ( h( xi + 1, yi + 1 ) - h( xi, yi + 1 ) ) * sx;
	return a + ( b - a ) * sy;

}

// 变换后的几何体副本
const xf = ( g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 ) => {

	const m = new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz ) ), new THREE.Vector3( 1, 1, 1 ) );
	return g.clone().applyMatrix4( m );

};

export async function build( { scene, renderer, camera } ) {

	const rng = mulberry( 20261118 );
	const BG_HERO = new THREE.Color( 0x000000 ), BG_TOP = new THREE.Color( 0x080a08 );
	scene.background = BG_HERO.clone();
	renderer.toneMappingExposure = 1.28;

	const cutaway = []; // 俯视时隐藏（吊顶、楼板、前墙、吊灯）
	const topOnly = []; // 俯视时才显示（剖切面）

	// ================= 房间壳体 =================
	const T = 0.2; // 墙厚
	const wallMatA = wallMaterial( { tint: 0x7f8c84, tile: 2.2, seed: 1, peel: 0.55 } ); // 灰绿旧漆
	const wallMatB = wallMaterial( { tint: 0x6f7a72, tile: 2.6, seed: 4, peel: 0.85 } ); // 门后小房间，更破
	const wood = woodMaterial( { tint: 0x5e3e24, tile: 1.1 } );
	const woodDark = woodMaterial( { tint: 0x3d2a1a, tile: 0.9, seed: 2 } );

	const walls = [];
	const { x0, x1, nearLeft, zBack, zFront, zStep, h, door } = R;
	const H = R.slab; // 墙体一直砌到结构楼板
	walls.push( boxUV( x0, 0, zBack - T, door.x0, H, zBack ) );
	walls.push( boxUV( door.x1, 0, zBack - T, x1, H, zBack ) );
	walls.push( boxUV( door.x0, door.y1, zBack - T, door.x1, H, zBack ) );
	walls.push( boxUV( x1, 0, zBack - T, x1 + T, H, zFront ) );
	walls.push( boxUV( x0 - T, 0, zBack - T, x0, H, zStep ) );
	walls.push( boxUV( x0 - T, 0, zStep, nearLeft, H, zStep + T ) );
	walls.push( boxUV( nearLeft - T, 0, zStep, nearLeft, H, zFront ) );
	scene.add( merged( walls, wallMatA ) );

	// 前墙（镜头背后，挡住反射里的黑洞；俯视时隐藏）
	const front = merged( [ boxUV( nearLeft - T, 0, zFront, x1 + T, H, zFront + T ) ], wallMatA );
	scene.add( front ); cutaway.push( front );

	// 门后小房间
	const br = [];
	const bx0 = door.x0 - 1.2, bx1 = door.x1 + 1.2;
	br.push( boxUV( bx0 - T, 0, R.backRoom - T, bx1 + T, H, R.backRoom ) );
	br.push( boxUV( bx0 - T, 0, R.backRoom, bx0, H, zBack - T ) );
	br.push( boxUV( bx1, 0, R.backRoom, bx1 + T, H, zBack - T ) );
	br.push( boxUV( bx0 - T, h, R.backRoom - T, bx1 + T, h + T, zBack - T ) );
	scene.add( merged( br, wallMatB ) );

	// 结构楼板（吊顶上方的混凝土板）
	const slabMat = ceilingMaterial();
	const slab = merged( [ boxUV( x0 - T, H, zBack - T, x1 + T, H + 0.25, zFront + T ) ], slabMat );
	scene.add( slab ); cutaway.push( slab );

	// 吊顶：60cm 矿棉板 + 金属龙骨；一片区域塌落，露出上方的风管与楼板
	const tileMat = ceilingTileMaterial();
	const tiles = [];
	const holeC = new THREE.Vector2( 2.2, - 2.6 );
	const fallen = [];
	for ( let tx = x0; tx < x1 - 0.01; tx += 0.6 ) for ( let tz = zBack; tz < zFront - 0.01; tz += 0.6 ) {

		const cx = tx + 0.3, cz = tz + 0.3;
		const dh = Math.hypot( ( cx - holeC.x ) / 1.3, ( cz - holeC.y ) / 1.0 );
		if ( dh < 1 || rng() < 0.05 ) { fallen.push( [ cx, cz ] ); continue; }
		// 吸水下垂：个别板子歪斜
		const sag = rng() < 0.15 ? ( rng() - 0.5 ) * 0.12 : 0;
		tiles.push( xf( rbox( - 0.295, - 0.012, - 0.295, 0.295, 0.004, 0.295, 0.004 ), cx, h - Math.abs( sag ) * 0.3, cz, 0, sag, sag * 0.5 ) );

	}

	const tileMesh = merged( tiles, tileMat );
	scene.add( tileMesh ); cutaway.push( tileMesh );
	// 龙骨（T 型条）
	const metalGrid = metalMaterial( { color: 0x2c2b27, rust: 0.6 } );
	const grid = [];
	for ( let tx = x0; tx <= x1 + 0.01; tx += 0.6 ) grid.push( boxUV( tx - 0.012, h - 0.02, zBack, tx + 0.012, h + 0.01, zFront ) );
	for ( let tz = zBack; tz <= zFront + 0.01; tz += 0.6 ) grid.push( boxUV( x0, h - 0.02, tz - 0.012, x1, h + 0.01, tz + 0.012 ) );
	const gridMesh = merged( grid, metalGrid );
	scene.add( gridMesh ); cutaway.push( gridMesh );
	// 塌落处垂下的龙骨（一端断开，斜挂）
	const hang = [];
	for ( let k = 0; k < 2; k ++ ) {

		const len = 0.5 + rng() * 0.5;
		hang.push( xf( boxUV( - 0.012, - len, - 0.01, 0.012, 0, 0.01 ), holeC.x - 1.0 + k * 0.6, h, holeC.y + ( rng() - 0.5 ) * 0.8, rng() * 3, 0.4 + rng() * 0.5, ( rng() - 0.5 ) * 0.6 ) );

	}

	const hangMesh = merged( hang, metalGrid );
	scene.add( hangMesh ); cutaway.push( hangMesh );
	// 设备层风管
	const duct = merged( [ boxUV( x0, H - 0.42, holeC.y - 0.25, x1, H - 0.05, holeC.y + 0.25 ) ], metalMaterial( { color: 0x55534c, rust: 0.4 } ) );
	scene.add( duct ); cutaway.push( duct );

	// 地面（水下）：深色瓷砖，泥沙覆盖
	const floorSet = texSet( 'worn_tile_floor' );
	const floorMat = new THREE.MeshStandardNodeMaterial( { roughness: 0.6 } );
	floorMat.colorNode = mix( vec3( luminance( texture( floorSet.diff, uv().div( 1.2 ) ).rgb ) ), vec3( 0.05, 0.06, 0.03 ), 0.5 ).mul( 0.3 );
	const floor = new THREE.Mesh( boxUV( x0 - T, - 0.1, R.backRoom - T, x1 + T, 0, zFront + T ), floorMat );
	floor.receiveShadow = true;
	scene.add( floor );

	// 俯视剖切面：周围建筑的楼板剖面（深色混凝土 + 苔藓），让房间外不是纯黑的虚空
	const capSet = texSet( 'concrete_layers_02' );
	const capMat = new THREE.MeshStandardNodeMaterial( { roughness: 0.95 } );
	const cn = mx_fractal_noise_float( positionWorld.mul( 0.4 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	capMat.colorNode = mix( vec3( 0.075, 0.077, 0.07 ), vec3( 0.05, 0.06, 0.042 ), smoothstep( 0.3, 0.8, cn ) ).mul( luminance( texture( capSet.diff, uv().div( 3 ) ).rgb ).mul( 2.5 ) );
	capMat.normalNode = normalMap( texture( capSet.nor, uv().div( 3 ) ).rgb );
	const ex = 40;
	const capY = CUT_Y; // 俯视剖切高度：墙体在此被“切开”，房间内部完整可读
	const caps = [
		boxUV( - ex, capY - 0.3, - ex, ex, capY, R.backRoom - T ),
		boxUV( - ex, capY - 0.3, zFront + T, ex, capY, ex ),
		boxUV( - ex, capY - 0.3, R.backRoom - T, Math.min( x0, bx0 ) - T, capY, zFront + T ),
		boxUV( x1 + T, capY - 0.3, R.backRoom - T, ex, capY, zFront + T ),
		// 近处左墙外侧（大堂左墙在 zStep 处内收，外侧是相邻房间的楼板）
		boxUV( x0 - T, capY - 0.3, zStep + T, nearLeft - T, capY, zFront + T ),
		// 门后小房间两侧的空隙
		boxUV( x0 - T, capY - 0.3, R.backRoom - T, bx0 - T, capY, zBack - T ),
		boxUV( bx1 + T, capY - 0.3, R.backRoom - T, x1 + T, capY, zBack - T ),
	];
	const cap = merged( caps, capMat, { cast: false } );
	cap.visible = false;
	scene.add( cap ); topOnly.push( cap );
	// 墙顶剖面（被“切开”的墙体顶面，浅灰，勾出房间轮廓）
	const wallTopMat = new THREE.MeshStandardNodeMaterial( { roughness: 0.9 } );
	// 墙体剖面：砖/灰泥断面纹理（世界空间 UV），边缘一圈更亮的切口，读出墙厚
	wallTopMat.colorNode = vec3( 0.11, 0.105, 0.095 ).mul( luminance( texture( capSet.diff, uv().div( 1.2 ) ).rgb ).mul( 2.2 ) ).mul( mix( 0.75, 1.1, cn ) );
	wallTopMat.normalNode = normalMap( texture( capSet.nor, uv().div( 1.2 ) ).rgb );
	const wallTops = merged( [
		boxUV( x0 - T, capY - 0.29, zBack - T, x1 + T, capY + 0.01, zBack ),
		boxUV( x1, capY - 0.29, zBack - T, x1 + T, capY + 0.01, zFront + T ),
		boxUV( x0 - T, capY - 0.29, zBack - T, x0, capY + 0.01, zStep + T ),
		boxUV( x0 - T, capY - 0.29, zStep, nearLeft, capY + 0.01, zStep + T ),
		boxUV( nearLeft - T, capY - 0.29, zStep, nearLeft, capY + 0.01, zFront + T ),
		boxUV( nearLeft - T, capY - 0.29, zFront, x1 + T, capY + 0.01, zFront + T ),
		boxUV( bx0 - T, capY - 0.29, R.backRoom - T, bx1 + T, capY + 0.01, R.backRoom ),
		boxUV( bx0 - T, capY - 0.29, R.backRoom, bx0, capY + 0.01, zBack ),
		boxUV( bx1, capY - 0.29, R.backRoom, bx1 + T, capY + 0.01, zBack ),
	], wallTopMat, { cast: false } );
	wallTops.visible = false;
	scene.add( wallTops ); topOnly.push( wallTops );

	// ================= 木质护墙线、檐线、柱子 =================
	const trim = [];
	trim.push( rbox( x1 - 0.04, 0.92, zBack, x1, 1.0, zFront ) );
	trim.push( rbox( x0, 0.92, zBack, x0 + 0.04, 1.0, zStep ) );
	trim.push( rbox( x0, 0.92, zBack, door.x0 - 0.1, 1.0, zBack + 0.04 ) );
	trim.push( rbox( door.x1 + 0.1, 0.92, zBack, x1, 1.0, zBack + 0.04 ) );
	trim.push( rbox( x0, h - 0.16, zBack, x1, h, zBack + 0.06 ) );
	trim.push( rbox( x1 - 0.06, h - 0.16, zBack, x1, h, zFront ) );
	trim.push( rbox( x0, h - 0.16, zBack, x0 + 0.06, h, zStep ) );
	trim.push( rbox( nearLeft, h - 0.16, zStep, nearLeft + 0.06, h, zFront ) );
	scene.add( merged( trim, woodDark ) );

	// 包木方柱：主体 + 柱头/腰线/柱基 + 竖向凹槽镶板
	const pil = [];
	const px = nearLeft + 0.05, pz = zStep - 0.05;
	pil.push( rbox( px - 0.28, 0, pz - 0.28, px + 0.28, h, pz + 0.28, 0.012 ) );
	pil.push( rbox( px - 0.33, h - 0.45, pz - 0.33, px + 0.33, h - 0.2, pz + 0.33, 0.015 ) );
	pil.push( rbox( px - 0.31, 1.55, pz - 0.31, px + 0.31, 1.68, pz + 0.31, 0.01 ) );
	pil.push( rbox( px - 0.32, 0, pz - 0.32, px + 0.32, 0.5, pz + 0.32, 0.015 ) );
	for ( const sx of [ - 0.15, 0, 0.15 ] ) pil.push( rbox( px + sx - 0.035, 0.55, pz + 0.28, px + sx + 0.035, 1.5, pz + 0.3, 0.006 ) );
	scene.add( merged( pil, wood ) );
	// 柱上的壁灯（坏的）：金属底座 + 歪斜的灯罩
	const sconceMat = metalMaterial( { color: 0x3a3229, rust: 0.7 } );
	const sconce = new THREE.Mesh( new THREE.CylinderGeometry( 0.05, 0.11, 0.2, 16, 1, true ), sconceMat );
	sconce.position.set( px + 0.16, 2.05, pz + 0.38 );
	sconce.rotation.z = 0.25;
	sconce.castShadow = true;
	const plate = new THREE.Mesh( rbox( - 0.06, - 0.09, 0, 0.06, 0.09, 0.02, 0.005 ), sconceMat );
	plate.position.set( px + 0.16, 2.05, pz + 0.28 );
	scene.add( sconce, plate );

	// ================= 背墙双开门（虚掩）=================
	const dd = buildDoubleDoor( door, zBack, T );
	scene.add( bakeGroup( dd.group ) );

	// 近处左墙的大玻璃门（参考图左侧前景）：厚木框 + 中横档把门分成上下两块磨砂玻璃（ref3 左侧两块灰绿玻璃）
	// 玻璃外侧是另一条走廊的冷灰天光；玻璃上有污垢、竖向水痕、下半截泥水溅痕，下框长出一丛野草
	const gdz0 = - 2.5, gdz1 = 0.3, gdx = nearLeft + 0.01;
	const gFrame = [];
	gFrame.push( rbox( gdx, 0, gdz0 - 0.16, gdx + 0.14, 2.86, gdz0, 0.012 ) ); // 远侧门梃
	gFrame.push( rbox( gdx, 0, gdz1, gdx + 0.14, 2.86, gdz1 + 0.16, 0.012 ) ); // 近侧门梃
	gFrame.push( rbox( gdx, 2.7, gdz0, gdx + 0.14, 2.86, gdz1, 0.012 ) ); // 上冒头
	gFrame.push( rbox( gdx, 1.22, gdz0, gdx + 0.13, 1.36, gdz1, 0.012 ) ); // 中横档
	gFrame.push( rbox( gdx, 0, gdz0, gdx + 0.13, 0.3, gdz1, 0.012 ) ); // 下冒头（泡在水里）
	// 门套线（贴墙的二级线脚）
	gFrame.push( rbox( gdx - 0.005, 0, gdz0 - 0.26, gdx + 0.05, 2.98, gdz0 - 0.16, 0.01 ) );
	gFrame.push( rbox( gdx - 0.005, 2.86, gdz0 - 0.26, gdx + 0.05, 2.98, gdz1 + 0.26, 0.01 ) );
	// 玻璃压条
	for ( const [ y0, y1 ] of [ [ 0.3, 1.22 ], [ 1.36, 2.7 ] ] ) {

		gFrame.push( rbox( gdx + 0.1, y0, gdz0, gdx + 0.125, y0 + 0.025, gdz1, 0.004 ) );
		gFrame.push( rbox( gdx + 0.1, y1 - 0.025, gdz0, gdx + 0.125, y1, gdz1, 0.004 ) );
		gFrame.push( rbox( gdx + 0.1, y0, gdz0, gdx + 0.125, y1, gdz0 + 0.025, 0.004 ) );
		gFrame.push( rbox( gdx + 0.1, y0, gdz1 - 0.025, gdx + 0.125, y1, gdz1, 0.004 ) );

	}

	scene.add( merged( gFrame, woodDark ) );
	// 磨砂玻璃：门外（另一侧走廊）昏暗的冷灰天光透过来——ref3 左侧的灰绿大面
	const coldGlass = wiredGlassMaterial( { glow: 0.026, color: 0x93a8a0, uniformGlow: true } );
	for ( const [ y0, y1 ] of [ [ 0.3, 1.22 ], [ 1.36, 2.7 ] ] ) {

		const cg = new THREE.Mesh( new THREE.PlaneGeometry( gdz1 - gdz0, y1 - y0 ), coldGlass );
		cg.rotation.y = Math.PI / 2;
		cg.position.set( gdx + 0.09, ( y0 + y1 ) / 2, ( gdz0 + gdz1 ) / 2 );
		cg.receiveShadow = true;
		scene.add( cg );

	}

	// ================= 门后小房间的暖光（只从门缝与玻璃透出）=================
	const warm = new THREE.SpotLight( 0xffa860, 3.2, 16, 0.75, 0.8, 2 );
	warm.position.set( 1.5, 2.5, R.backRoom + 0.45 );
	warm.target.position.set( 1.0, 0.0, zBack + 3.0 );
	warm.castShadow = true;
	warm.shadow.mapSize.set( 1024, 1024 );
	warm.shadow.bias = - 0.0004;
	warm.shadow.normalBias = 0.02;
	warm.layers.enable( VOLUME_LAYER );
	scene.add( warm, warm.target );
	// 小房间内部的弱暖光（照亮门缝里能看到的墙）
	const warmFill = new THREE.PointLight( 0xff9a50, 0.6, 3.5, 2 );
	warmFill.position.set( 1.2, 1.6, R.backRoom + 1.0 );
	scene.add( warmFill );

	// ================= 吊顶圆环灯（一根吊索断裂，倾斜下坠）=================
	const lamp = buildRingLamp( 0.95 );
	const lampPos = new THREE.Vector3( 0.7, h - 0.42, - 6.4 );
	lamp.position.copy( lampPos );
	lamp.rotation.set( 0.0, 0.4, 0.13 );
	lamp.updateMatrixWorld();
	const lampBaked = bakeGroup( lamp );
	scene.add( lampBaked ); cutaway.push( lampBaked );
	// 吊索与电源线
	lamp.updateMatrixWorld();
	const cableMat = new THREE.MeshStandardNodeMaterial( { color: 0x111110, roughness: 0.6 } );
	const cables = [];
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2 + 0.3;
		const attach = new THREE.Vector3( Math.cos( a ) * 0.95, 0.07, Math.sin( a ) * 0.95 ).applyMatrix4( lamp.matrixWorld );
		if ( i === 2 ) {

			// 断裂的吊索：从吊顶垂下一截，末端卷曲
			const top = new THREE.Vector3( attach.x, h, attach.z );
			cables.push( cable( top, top.clone().add( new THREE.Vector3( 0.05, - 0.5, 0.02 ) ), 0.02, 0.004, [ top.clone().add( new THREE.Vector3( 0.12, - 0.62, 0.06 ) ) ] ) );
			continue;

		}

		cables.push( cable( new THREE.Vector3( attach.x, h, attach.z ), attach, 0.0, 0.004 ) );

	}

	// 电源线：从吊顶下垂到灯体，再多出一截垂荡
	const cA = new THREE.Vector3( 0.4, h, - 6.2 );
	const cB = new THREE.Vector3( 0.95, 0.07, 0.0 ).applyMatrix4( lamp.matrixWorld );
	cables.push( cable( cA, cB, 0.35, 0.007 ) );
	// 塌落处垂下的电线
	for ( let k = 0; k < 4; k ++ ) {

		const s = new THREE.Vector3( holeC.x - 0.8 + rng() * 1.6, H - 0.1, holeC.y - 0.6 + rng() * 1.2 );
		const e = s.clone().add( new THREE.Vector3( ( rng() - 0.5 ) * 0.8, - 0.5 - rng() * 0.7, ( rng() - 0.5 ) * 0.8 ) );
		cables.push( cable( s, e, 0.25 + rng() * 0.3, 0.006, [ e.clone().add( new THREE.Vector3( 0.05, - 0.3, 0.02 ) ) ] ) );

	}

	const cableMesh = merged( cables, cableMat );
	scene.add( cableMesh ); cutaway.push( cableMesh );

	// ================= 家具与道具（Poly Haven CC0，全部做泡水+污垢+积灰+锈蚀）=================
	const ids = [ 'metal_office_desk', 'painted_wooden_chair_01', 'wooden_bookshelf_worn', 'sofa_02', 'painted_wooden_cabinet', 'cardboard_box_01', 'trashbag', 'barrel_03', 'fern_02', 'binder_notebook', 'plastic_monobloc_chair_01', 'wooden_stool_01', 'metal_jerrycan', 'wooden_crate_01',
		'steel_frame_shelves_01', 'drawer_cabinet', 'painted_wooden_table', 'modern_arm_chair_01', 'vintage_suitcase', 'plastic_crate_01', 'painted_wooden_shelves', 'vintage_cabinet_01', 'wall_clock', 'can_rusted', 'plastic_bottle_gallon', 'wheelchair_01', 'painted_wooden_bench', 'standing_chalkboard_01' ];
	const M = Object.fromEntries( await Promise.all( ids.map( async ( id ) => [ id, await loadModel( id ) ] ) ) );
	const place = ( id, x, y, z, ry = 0, s = 1, rx = 0, rz = 0, opt = {} ) => {

		const o = M[ id ].scene.clone();
		o.position.set( x, y, z );
		o.rotation.set( rx, ry, rz );
		o.scale.setScalar( s );
		o.traverse( ( c ) => {

			if ( ! c.isMesh ) return;
			c.castShadow = c.receiveShadow = true;
			weatherProp( c.material, opt );

		} );
		scene.add( o );
		return o;

	};

	// 右侧：歪倒的办公桌（一条腿陷进地里）、倒下的椅子、靠墙前倾的书架、柜子
	place( 'metal_office_desk', 3.25, - 0.04, - 5.4, - Math.PI / 2 + 0.18, 1, 0.0, 0.07, { dark: 0.22, sat: 0.4, rust: 0.8 } );
	place( 'painted_wooden_chair_01', 1.75, 0.21, - 5.2, 2.2, 1, 0, 1.5, { dark: 0.16, sat: 0.4 } ); // 侧翻
	place( 'painted_wooden_chair_01', 2.9, 0.0, - 7.2, 0.4, 1, 0.06, 0, { dark: 0.16, sat: 0.4 } );
	place( 'wooden_bookshelf_worn', x1 - 0.36, 0, - 7.6, - Math.PI / 2, 1, 0, 0.04, { dark: 0.5 } );
	place( 'painted_wooden_cabinet', x1 - 0.3, 0.38, - 2.0, - Math.PI / 2, 1, 0, 0, { dark: 0.22 } );
	// 左侧：泡在水里的沙发、桶、垃圾袋
	place( 'sofa_02', x0 + 0.55, - 0.05, - 6.2, Math.PI / 2, 1, 0, 0.03, { dark: 0.4, sat: 0.4 } );
	place( 'barrel_03', nearLeft - 0.9, 0, zStep - 0.7, 0.5, 1, 0, 0, { rust: 0.8 } );
	place( 'trashbag', x0 + 0.5, 0.05, - 8.6, 1.2 );
	place( 'trashbag', door.x1 + 0.7, 0.02, zBack + 0.45, 2.6, 0.9 );
	// 漂浮物：纸箱（下沉 1~3cm）、塑料椅（翻倒浮起）、凳子、油桶、木箱、活页夹
	place( 'cardboard_box_01', - 0.6, WATER_Y - 0.06, - 3.6, 0.7, 1.1, 0.12, - 0.08, { dark: 0.17, sat: 0.45 } );
	place( 'cardboard_box_01', 2.6, WATER_Y - 0.08, - 8.4, - 0.4, 1.0, - 0.1, 0.18, { dark: 0.17, sat: 0.45 } );
	place( 'plastic_monobloc_chair_01', - 2.6, 0.3, - 7.6, 0.8, 1, - 1.45, 0, { dark: 0.14, sat: 0.3 } );
	place( 'wooden_stool_01', 1.4, 0, - 7.8, 0.3, 1, 0, 0, { dark: 0.4 } );
	place( 'metal_jerrycan', - 0.3, WATER_Y - 0.12, - 6.8, 1.0, 1, 0, Math.PI / 2 - 0.1, { dark: 0.5, rust: 0.9 } );
	place( 'wooden_crate_01', - 3.4, 0.0, - 3.9, 0.3, 1, 0, 0, { dark: 0.45 } );

	// —— 补充的叙事道具（右侧 40% 画面不再空）——
	// 右墙：靠墙的旧木搁架（架上纸箱、行李箱）；前景一张侧翻的木桌，桌腿朝向镜头、半截泡在水里
	place( 'painted_wooden_shelves', x1 - 0.02, 0, - 8.75, - Math.PI / 2, 1.25, 0, 0.0, { dark: 0.3, sat: 0.4 } );
	place( 'painted_wooden_shelves', x1 - 0.02, 0, - 8.05, - Math.PI / 2, 1.25, 0, 0.03, { dark: 0.3, sat: 0.4 } );
	place( 'vintage_suitcase', x1 - 0.3, 0.98, - 8.1, - Math.PI / 2 + 0.1, 0.45, 0, 0, { dark: 0.3, sat: 0.5 } );
	place( 'painted_wooden_table', 3.0, 0.57, - 3.4, - 0.9, 1, 0, Math.PI / 2 - 0.04, { dark: 0.3, sat: 0.4 } ); // 侧翻：桌面朝向门
	place( 'modern_arm_chair_01', 3.2, - 0.03, - 6.4, - 2.1, 1, 0.05, 0.08, { dark: 0.3, sat: 0.4 } );
	// 门前的塑料周转箱堆（漂浮/搁浅）、门左侧行李箱
	place( 'plastic_crate_01', door.x1 + 0.35, 0.0, zBack + 0.9, 0.4, 1, 0, 0, { dark: 0.3, sat: 0.4 } );
	place( 'plastic_crate_01', door.x1 + 0.38, 0.26, zBack + 0.92, 0.25, 1, 0, 0.05, { dark: 0.3, sat: 0.4 } );
	place( 'plastic_crate_01', - 0.9, WATER_Y - 0.17, - 5.3, 1.3, 1, 0.25, 0.1, { dark: 0.3, sat: 0.4 } );
	// 文件柜：侧翻倒在水里，一半没入
	place( 'drawer_cabinet', 2.6, 0.1, - 3.25, - 0.5, 1, 0.05, Math.PI / 2 - 0.12, { dark: 0.22, rust: 0.9 } );
	// 门右侧：老式玻璃柜（门板脱落）靠在常春藤前；轮椅半沉在门前
	place( 'vintage_cabinet_01', door.x1 + 1.35, - 0.02, zBack + 0.42, 0.04, 0.9, - 0.04, 0.02, { dark: 0.32, sat: 0.5 } );
	place( 'wheelchair_01', door.x0 - 0.75, - 0.05, zBack + 1.6, 2.4, 1, 0.1, 0.12, { dark: 0.3, rust: 0.8 } );
	// 左侧：长凳翻倒，黑板倒在沙发旁
	place( 'painted_wooden_bench', - 2.9, 0.12, - 2.2, 1.3, 1, 0, Math.PI / 2 - 0.05, { dark: 0.3, sat: 0.4 } );
	place( 'standing_chalkboard_01', - 3.3, 0.35, - 8.0, 0.6, 1, - 1.35, 0, { dark: 0.4, sat: 0.4 } );
	// 背墙上的挂钟（门左侧，歪斜）
	place( 'wall_clock', door.x0 - 0.95, 2.62, zBack + 0.005, 0, 1.1, 0, 0.12, { dark: 0.5, sat: 0.5 } );

	// —— 小碎屑：易拉罐、塑料瓶，漂在水面或卡在家具边（实例化）——
	const scatter = ( id, n, fn, opt ) => {

		for ( const parts of Object.values( M[ id ].parts ) ) for ( const part of parts ) {

			weatherProp( part.material, opt );
			const im = new THREE.InstancedMesh( part.geometry, part.material, n );
			for ( let i = 0; i < n; i ++ ) im.setMatrixAt( i, fn( i ).multiply( part.local ) );
			im.castShadow = im.receiveShadow = true;
			im.computeBoundingSphere();
			scene.add( im );

		}

	};

	// 漂浮物沿墙边、家具边和背墙聚集（静水把垃圾推到边上）
	const debrisPos = () => {

		for ( let k = 0; k < 20; k ++ ) {

			const wx = x0 + 0.2 + rng() * ( x1 - x0 - 0.4 ), wz = zBack + 0.2 + rng() * ( zFront - zBack - 1.5 );
			const ed = Math.min( wx - x0, x1 - wx, wz - zBack );
			if ( ed < 1.2 || rng() < 0.25 ) return [ wx, wz ];

		}

		return [ x1 - 0.5, zBack + 0.5 ];

	};

	scatter( 'can_rusted', 48, () => {

		const [ wx, wz ] = debrisPos();
		// 罐子横躺，浮在水面（半沉）
		return new THREE.Matrix4().compose( new THREE.Vector3( wx, WATER_Y - 0.045 + rng() * 0.02, wz ), new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.PI / 2 + ( rng() - 0.5 ) * 0.4, rng() * 6.28, 0, 'YXZ' ) ), new THREE.Vector3( 1, 1, 1 ) );

	}, { dark: 0.5, rust: 1.0 } );
	scatter( 'plastic_bottle_gallon', 12, () => {

		const [ wx, wz ] = debrisPos();
		return new THREE.Matrix4().compose( new THREE.Vector3( wx, WATER_Y - 0.06, wz ), new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.PI / 2 + ( rng() - 0.5 ) * 0.3, rng() * 6.28, 0, 'YXZ' ) ), new THREE.Vector3( 1, 1, 1 ) );

	}, { dark: 0.35, sat: 0.3 } );
	// 活页夹：只取合上的那一本，实例化漂在水面（下沉 1cm）
	for ( const part of M.binder_notebook.parts.binder_notebook_closed || Object.values( M.binder_notebook.parts )[ 0 ] ) {

		weatherProp( part.material, { dark: 0.5, sat: 0.6 } );
		const im = new THREE.InstancedMesh( part.geometry, part.material, 7 );
		for ( let i = 0; i < 7; i ++ ) im.setMatrixAt( i, new THREE.Matrix4().compose( new THREE.Vector3( - 1.2 + rng() * 4.0, WATER_Y - 0.01, - 8.8 + rng() * 6.5 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( ( rng() - 0.5 ) * 0.05, rng() * 6.28, ( rng() - 0.5 ) * 0.05 ) ), new THREE.Vector3( 1, 1, 1 ) ).multiply( part.local ) );
		im.castShadow = im.receiveShadow = true;
		scene.add( im );

	}

	// 掉落的吊顶板：漂在水面（部分泡烂下沉）、斜靠在墙边
	const ft = [];
	for ( let i = 0; i < Math.min( 12, fallen.length ); i ++ ) {

		const [ cx, cz ] = fallen[ i ];
		const ox = cx + ( rng() - 0.5 ) * 1.2, oz = cz + ( rng() - 0.5 ) * 1.2;
		ft.push( xf( rbox( - 0.29, - 0.008, - 0.29, 0.29, 0.008, 0.29, 0.004 ), THREE.MathUtils.clamp( ox, x0 + 0.4, x1 - 0.4 ), WATER_Y - 0.002, THREE.MathUtils.clamp( oz, zBack + 0.4, zFront - 1 ), rng() * 3, ( rng() - 0.5 ) * 0.06, ( rng() - 0.5 ) * 0.06 ) );

	}

	ft.push( xf( rbox( - 0.29, - 0.008, - 0.29, 0.29, 0.008, 0.29, 0.004 ), x1 - 0.2, 0.55, - 3.6, 0, 0, 1.2 ) ); // 斜靠右墙
	ft.push( xf( rbox( - 0.29, - 0.008, - 0.29, 0.29, 0.008, 0.29, 0.004 ), x0 + 0.22, 0.5, - 4.8, 0.1, 0, - 1.25 ) );
	scene.add( merged( ft, tileMat ) );

	// ================= 常春藤与植物（第四轮重建：茎驱动生长，叶子只长在茎节上）=================
	const ivy = new Ivy( rng );
	const dc = ( door.x0 + door.x1 ) / 2 - x0; // 门中心在墙面坐标里的 u
	const dHalf = ( door.x1 - door.x0 ) / 2;
	// 背墙覆盖分布：门右侧大团、门楣上方、门左侧较稀；低频噪声打碎边缘 → 不规则团块与空洞
	const backDens = ( u, v ) => {

		if ( Math.abs( u - dc ) < dHalf + 0.09 && v < door.y1 + 0.08 ) return 0; // 门洞与门套
		const right = Math.exp( - ( ( u - dc - 2.0 ) ** 2 ) / 1.6 ) * ( 1 - 0.5 * THREE.MathUtils.smoothstep( v, 2.6, 3.4 ) );
		const top = Math.exp( - ( ( u - dc - 0.2 ) ** 2 ) / 2.2 ) * THREE.MathUtils.smoothstep( v, 1.9, 2.5 );
		const left = 0.6 * Math.exp( - ( ( u - dc + 2.0 ) ** 2 ) / 0.9 ) * THREE.MathUtils.smoothstep( v, 0.2, 1.2 );
		const n = vnoise( u * 1.5, v * 1.5 ) * 0.6 + vnoise( u * 3.7 + 7, v * 3.7 ) * 0.4;
		return THREE.MathUtils.clamp( ( right + top + left ) * 1.5 - 0.35 + ( n - 0.5 ) * 1.3, 0, 1 );

	};

	ivy.growWall( {
		origin: new THREE.Vector3( x0, 0, zBack + 0.001 ), uDir: new THREE.Vector3( 1, 0, 0 ), normal: new THREE.Vector3( 0, 0, 1 ), width: x1 - x0, height: h - 0.02,
	}, {
		steps: 95, leafScale: 0.11, shoot: 0.07, leafRate: 1.0, hangTop: 0.6,
		// 主茎：水线处粗（1.5~2.2cm），沿门框两侧、门楣上方、墙面裂缝出发
		seeds: [
			...Array.from( { length: 16 }, () => [ dc + dHalf + 0.25 + rng() * 2.4, WATER_Y + 0.02, 0.012 + rng() * 0.01 ] ),
			...Array.from( { length: 7 }, () => [ dc - dHalf - 0.3 - rng() * 2.0, WATER_Y + 0.02, 0.01 + rng() * 0.008 ] ),
			...Array.from( { length: 6 }, () => [ dc + dHalf + 0.12 + rng() * 0.06, WATER_Y + 0.05 + rng() * 0.3, 0.012 ] ), // 门框右侧
			...Array.from( { length: 3 }, () => [ dc - dHalf - 0.12 - rng() * 0.06, WATER_Y + 0.05, 0.01 ] ), // 门框左侧
			...Array.from( { length: 5 }, () => [ dc - 0.8 + rng() * 1.6, door.y1 + 0.12, 0.008 ] ), // 门楣
		],
		density: backDens,
		// 门右侧叶团鼓出墙面 30cm（ref3 门右侧那团立体常春藤）
		bulge: ( u, v ) => 0.3 * Math.exp( - ( ( u - dc - 1.9 ) ** 2 ) / 0.6 - ( ( v - 1.6 ) ** 2 ) / 0.9 ) + 0.1 * Math.max( 0, vnoise( u * 2.3 + 3, v * 2.3 + 1 ) - 0.4 ),
	} );
	// 大堂左墙（深处）：两丛
	ivy.growWall( {
		origin: new THREE.Vector3( x0 + 0.001, 0, zStep ), uDir: new THREE.Vector3( 0, 0, - 1 ), normal: new THREE.Vector3( 1, 0, 0 ), width: zStep - zBack, height: h - 0.02,
	}, {
		steps: 85, leafScale: 0.095, shoot: 0.05,
		seeds: [ [ 1.3, WATER_Y, 0.012 ], [ 1.9, WATER_Y, 0.01 ], [ 5.6, WATER_Y, 0.014 ], [ 5.95, WATER_Y, 0.01 ], [ 6.5, WATER_Y, 0.012 ], [ 7.2, WATER_Y, 0.012 ] ],
		density: ( u, v ) => THREE.MathUtils.clamp( Math.exp( - ( ( u - 1.6 ) ** 2 ) / 0.8 ) + Math.exp( - ( ( u - 6.4 ) ** 2 ) / 1.3 ) - 0.15 + ( vnoise( u * 2, v * 2 ) - 0.5 ), 0, 1 ),
	} );
	// 右墙：门旁角落与中段
	ivy.growWall( {
		origin: new THREE.Vector3( x1 - 0.001, 0, zBack ), uDir: new THREE.Vector3( 0, 0, 1 ), normal: new THREE.Vector3( - 1, 0, 0 ), width: zFront - zBack, height: h - 0.02,
	}, {
		steps: 85, leafScale: 0.095, shoot: 0.06,
		seeds: [ [ 0.3, WATER_Y, 0.014 ], [ 0.7, WATER_Y, 0.012 ], [ 1.1, WATER_Y, 0.01 ], [ 4.0, WATER_Y, 0.012 ], [ 4.4, WATER_Y, 0.01 ] ],
		density: ( u, v ) => THREE.MathUtils.clamp( Math.exp( - ( ( u - 0.7 ) ** 2 ) / 0.7 ) + 0.75 * Math.exp( - ( ( u - 4.2 ) ** 2 ) / 0.5 ) - 0.1 + ( vnoise( u * 2 + 5, v * 2 ) - 0.5 ), 0, 1 ),
	} );
	// 包木方柱（朝镜头一面）：一根主茎缠上去，上部稀
	ivy.growWall( {
		origin: new THREE.Vector3( px - 0.28, 0, pz + 0.301 ), uDir: new THREE.Vector3( 1, 0, 0 ), normal: new THREE.Vector3( 0, 0, 1 ), width: 0.56, height: h - 0.02,
	}, {
		steps: 60, leafScale: 0.08, shoot: 0.04, hangTop: 0,
		seeds: [ [ 0.18, WATER_Y, 0.01 ], [ 0.42, WATER_Y, 0.008 ] ],
		density: ( u, v ) => 0.75 * THREE.MathUtils.smoothstep( 2.5 - v, 0, 1.2 ),
	} );
	// 垂帘：门楣上方吊顶边、吊顶塌落处、右后角（参考图右侧的藤帘剪影）
	for ( let k = 0; k < 18; k ++ ) {

		const sx = door.x1 + 0.1 + rng() * 1.8;
		ivy.hang( new THREE.Vector3( sx, h - 0.04, zBack + 0.08 + rng() * 0.1 ), new THREE.Vector3( 0, 0, 1 ), 0.5 + rng() * 1.5, 0.095 );

	}

	for ( let k = 0; k < 26; k ++ ) {

		const a = rng() * 6.28, rr = Math.sqrt( rng() );
		const cl = k < 16 ? holeC : new THREE.Vector2( 3.3, - 7.4 );
		const nrm = new THREE.Vector3( Math.cos( a * 3 ), 0, Math.sin( a * 3 ) );
		ivy.hang( new THREE.Vector3( cl.x + Math.cos( a ) * rr * 1.0, h + 0.03, cl.y + Math.sin( a ) * rr * 0.8 ), nrm, 0.6 + rng() * 1.7, 0.09, 0.6 );

	}

	const ivyMesh = ivy.build();
	scene.add( ivyMesh );

	// 蕨类：墙角、门边（实例化），根部在水下
	const fernParts = M.fern_02.parts;
	const fernNames = Object.keys( fernParts );
	const fernSpots = [ [ door.x1 + 0.55, zBack + 0.35, 1.3 ], [ door.x0 - 0.5, zBack + 0.3, 1.1 ], [ x0 + 0.4, - 4.2, 1.2 ], [ x1 - 0.35, zBack + 0.5, 1.4 ], [ px + 0.45, pz + 0.5, 1.0 ] ];
	const fernMats = {};
	for ( const [ fx, fz, s ] of fernSpots ) {

		const name = fernNames[ Math.floor( rng() * fernNames.length ) ];
		for ( const part of fernParts[ name ] ) {

			const key = name + part.material.uuid;
			( fernMats[ key ] ||= { part, list: [] } ).list.push( new THREE.Matrix4().compose( new THREE.Vector3( fx, WATER_Y - 0.12, fz ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, rng() * 6.28, 0 ) ), new THREE.Vector3( s, s * 1.3, s ) ).multiply( part.local ) );

		}

	}

	for ( const { part, list } of Object.values( fernMats ) ) {

		const mat = part.material;
		weatherProp( mat, { dark: 0.35, sat: 0.55, dust: 0 } );
		mat.alphaToCoverage = true;
		const im = new THREE.InstancedMesh( part.geometry, mat, list.length );
		list.forEach( ( m, i ) => im.setMatrixAt( i, m ) );
		im.castShadow = im.receiveShadow = true;
		scene.add( im );

	}

	// ================= 水面 =================
	const refl = reflector( { resolutionScale: 0.75, bounces: false } );
	refl.target.rotateX( - Math.PI / 2 );
	refl.target.position.y = WATER_Y;
	scene.add( refl.target );

	const waterMat = new THREE.MeshStandardNodeMaterial( { roughness: 0.05, metalness: 0, transparent: true, depthWrite: false } );
	const wp = positionWorld;
	// —— 法线：双向缓慢漂移的两层细涟漪（强度约 0.1）+ 滴水点的同心圆波纹 ——
	const rip = mx_noise_vec3( vec3( wp.x.mul( 1.3 ).add( time.mul( 0.03 ) ), wp.z.mul( 1.3 ), time.mul( 0.06 ) ) ).mul( 0.6 )
		.add( mx_noise_vec3( vec3( wp.x.mul( 5.5 ), wp.z.mul( 5.5 ).sub( time.mul( 0.05 ) ), time.mul( 0.15 ) ) ).mul( 0.4 ) );
	let ringN = vec2( 0 );
	// 天花板塌落处与吊灯下方的滴水点：波纹周期错开
	const drips = [ [ holeC.x - 0.4, holeC.y + 0.2, 0.0 ], [ holeC.x + 0.5, holeC.y - 0.3, 0.37 ], [ 0.9, - 6.2, 0.71 ], [ - 0.9, - 4.6, 0.2 ], [ 1.4, - 8.3, 0.55 ] ];
	for ( const [ cx, cz, off ] of drips ) {

		const d = wp.xz.sub( vec2( cx, cz ) );
		const r = length( d );
		const ph = fract( time.mul( 0.32 ).add( off ) );
		const front = ph.mul( 1.1 );
		const env = exp( r.sub( front ).mul( r.sub( front ) ).mul( - 60 ) ).mul( float( 1 ).sub( ph ).pow( 2 ) );
		const w = sin( r.sub( front ).mul( 55 ) ).mul( env );
		ringN = ringN.add( d.div( r.max( 0.001 ) ).mul( w ).mul( 0.35 ) );

	}

	// 漂浮的浮渣/藻膜/碎屑：fbm 软边，约 20% 覆盖，墙边与角落聚集
	const scumN = mx_fractal_noise_float( vec3( wp.x.mul( 0.8 ), 0, wp.z.mul( 0.8 ) ), 5, 2.1, 0.55 ).mul( 0.5 ).add( 0.5 );
	const fineN = mx_fractal_noise_float( vec3( wp.x.mul( 9.0 ), 3.0, wp.z.mul( 9.0 ) ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const wallDist = min( min( wp.x.sub( x0 ), float( x1 ).sub( wp.x ) ), abs( wp.z.sub( zBack ) ) );
	const edge = smoothstep( 1.2, 0.0, wallDist ).mul( 0.22 );

	// —— 水体厚度：场景深度 − 水面深度（沿视线的米数），用于吸收与接触浮沫 ——
	const sceneZ = perspectiveDepthToViewZ( viewportDepthTexture(), cameraNear, cameraFar );
	const thick = positionView.z.sub( sceneZ ).max( 0 ); // 沿视线方向的 view-space 距离差
	const viewLen = length( positionView ).div( positionView.z.negate().max( 0.001 ) );
	const thickRay = thick.mul( viewLen );
	// 接触浮沫/泡沫线：物体（家具、墙、漂浮物）穿过水面处一圈 3~6cm 的灰白浮沫 + 油膜
	const contact = smoothstep( 0.07, 0.0, thickRay ).mul( smoothstep( 0.25, 0.65, fineN.add( scumN.mul( 0.3 ) ) ) );
	const scum = smoothstep( 0.66, 0.8, scumN.add( edge ).add( fineN.sub( 0.5 ).mul( 0.12 ) ) ).mul( smoothstep( 0.3, 0.6, fineN ).mul( 0.5 ).add( 0.5 ) ).max( contact.mul( 0.8 ) );

	const nW = normalize( vec3( rip.x.mul( 0.025 ).add( ringN.x ), 1, rip.y.mul( 0.025 ).add( ringN.y ) ) ); // 死水：极低幅度的涟漪 → 近镜面
	waterMat.normalNode = transformNormalToView( nW );
	const V = normalize( cameraPosition.sub( wp ) );
	const fres = float( 0.02 ).add( float( 0.98 ).mul( pow( float( 1 ).sub( max( dot( V, nW ), 0 ) ), 5 ) ) );
	// —— 反射：涟漪扰动 + 粗糙度噪声控制的模糊半径（0.03~0.12）+ 竖向拉长（静水微起伏的倒影光柱）——
	const baseUV = refl.uvNode;
	const blurR = mix( float( 0.0015 ), float( 0.007 ), smoothstep( 0.3, 0.75, mx_fractal_noise_float( vec3( wp.x.mul( 0.6 ), 5.0, wp.z.mul( 0.6 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) ) );
	let rsum = vec3( 0 );
	const taps = [ [ 0, - 2, 0.1 ], [ 0, - 1, 0.17 ], [ 0, 0, 0.24 ], [ 0, 1, 0.17 ], [ 0, 2, 0.1 ], [ - 1, 0, 0.11 ], [ 1, 0, 0.11 ] ];
	for ( const [ kx, ky, wgt ] of taps ) rsum = rsum.add( refl.sample( baseUV.add( vec2( rip.x.mul( 0.003 ).add( ringN.x.mul( 0.05 ) ).add( blurR.mul( kx * 0.6 ) ), rip.y.mul( 0.005 ).add( ringN.y.mul( 0.05 ) ).add( blurR.mul( ky ) ) ) ) ).rgb.mul( wgt ) );
	// 浑浊的绿褐色水：泥沙悬浮物让水面本身也能被手电“照出”一片光池（漫反射很弱）
	const murk = vec3( 0.026, 0.03, 0.019 );
	const scumCol = vec3( 0.03, 0.032, 0.02 ).mul( fineN.mul( 0.6 ).add( 0.7 ) );
	const foamCol = vec3( 0.07, 0.068, 0.058 );
	waterMat.colorNode = mix( mix( murk, scumCol, scum ), foamCol, contact.mul( 0.7 ) );
	waterMat.roughnessNode = mix( float( 0.06 ), float( 0.7 ), scum );
	// 浑浊水体的体内散射：悬浮泥沙被手电照亮，在水面形成一片绿褐色光池（俯视时是主要的可读光斑）
	const inScatter = flashAt( wp ).mul( vec3( 0.5, 0.55, 0.36 ) ).mul( float( 1 ).sub( fres ) ).mul( scumN.mul( 0.8 ).add( 0.4 ) ).mul( mix( float( 0.0012 ), float( 0.0004 ), scum ) );
	waterMat.emissiveNode = rsum.mul( fres ).mul( mix( float( 1.0 ), float( 0.15 ), scum ) ).add( inScatter );
	// 按水体厚度吸收：浅处（漂浮物、水下桌椅、掉落的吊顶板）隐约可见，30cm 以上几乎不透
	const trans = exp( thickRay.negate().div( 0.14 ) ).mul( 0.85 );
	waterMat.opacityNode = float( 1 ).sub( trans ).max( scum ).max( fres.mul( 0.8 ) );
	const water = new THREE.Mesh( new THREE.PlaneGeometry( x1 - x0 + 0.4, R.backRoom * - 1 + zFront + 0.4, 1, 1 ), waterMat );
	water.rotation.x = - Math.PI / 2;
	water.position.set( 0, WATER_Y, ( R.backRoom + zFront ) / 2 );
	water.receiveShadow = true;
	scene.add( water );

	// 漂浮物：木板（半沉）、泡水卷曲的纸张、落叶
	const planks = [];
	for ( let i = 0; i < 10; i ++ ) {

		const l = 0.5 + rng() * 1.0;
		const g = rbox( - l / 2, - 0.012, - 0.045 - rng() * 0.04, l / 2, 0.012, 0.05, 0.004 );
		planks.push( xf( g, - 3 + rng() * 6.5, WATER_Y - 0.004, - 10 + rng() * 10.5, rng() * 3.14, ( rng() - 0.5 ) * 0.04, ( rng() - 0.5 ) * 0.05 ) );

	}

	// 前景漂浮的断梁与门板（ref3 前景那根斜漂的深色木梁）：半沉在水里，倒角 + 断口
	planks.push( xf( rbox( - 1.3, - 0.07, - 0.09, 1.3, 0.07, 0.09, 0.012 ), 0.35, WATER_Y - 0.035, - 1.3, 0.55, 0.02, 0.03 ) );
	planks.push( xf( rbox( - 0.45, - 0.02, - 0.3, 0.45, 0.02, 0.3, 0.006 ), - 0.75, WATER_Y - 0.012, - 2.2, - 0.3, 0.03, - 0.02 ) );
	planks.push( xf( rbox( - 0.6, - 0.03, - 0.05, 0.6, 0.03, 0.05, 0.006 ), 1.2, WATER_Y - 0.02, - 2.0, 1.9, 0.0, 0.05 ) );
	scene.add( merged( planks, woodDark ) );
	const papers = [];
	for ( let i = 0; i < 26; i ++ ) {

		papers.push( xf( soggyPaper( rng ), - 2.4 + rng() * 6, WATER_Y + 0.003, - 10.5 + rng() * 11, rng() * 6.28, - Math.PI / 2 ) );

	}

	scene.add( merged( papers, paperMaterial(), { cast: false } ) );

	const fl = [];
	for ( let i = 0; i < 300; i ++ ) {

		const wx = x0 + rng() * ( x1 - x0 ), wz = zBack + rng() * ( zFront - zBack );
		const ed = Math.min( wx - x0, x1 - wx, wz - zBack ) < 1.0 || rng() < 0.3;
		if ( ! ed ) continue;
		const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2 + ( rng() - 0.5 ) * 0.2, 0, rng() * 6.28 ) );
		const s = 0.06 + rng() * 0.05;
		fl.push( new THREE.Matrix4().compose( new THREE.Vector3( wx, WATER_Y + 0.002, wz ), q, new THREE.Vector3( s, s, s ) ) );

	}

	const floatLeaves = new THREE.InstancedMesh( leafGeometry(), leafMaterial( { dry: true } ), fl.length );
	fl.forEach( ( m, i ) => floatLeaves.setMatrixAt( i, m ) );
	floatLeaves.receiveShadow = true;
	scene.add( floatLeaves );

	// ================= 灯光 =================
	// 环境：极弱的冷绿天光（多次反弹的近似），只为让暗部不至于死黑
	const hemi = new THREE.HemisphereLight( 0x7d8c84, 0x2c3329, 0.5 );
	scene.add( hemi );
	// 俯视专用：从吊顶塌落处与背墙高窗漏下的冷灰天光（弱、带体积），给俯视画面第二个视觉焦点
	const skyLights = [];
	for ( const [ px0, pz0, tx, tz, it ] of [ [ holeC.x, holeC.y, holeC.x - 0.2, holeC.y + 0.1, 45 ], [ - 3.2, - 8.6, - 2.8, - 8.0, 22 ] ] ) {

		const sl = new THREE.SpotLight( 0xa9bcc4, it, 9, 0.42, 0.7, 2 );
		sl.position.set( px0, R.slab + 0.2, pz0 );
		sl.target.position.set( tx, 0, tz );
		sl.layers.enable( VOLUME_LAYER ); // 不投影：墙面材质的贴图槽已接近 16 张上限
		sl.visible = false;
		scene.add( sl, sl.target );
		skyLights.push( sl );

	}

	// 手电：暖白 0xFFE9C8，光斑 cookie（硬边热点 + 反光杯亮环 + 外圈溢光）
	const cookie = makeCookieTexture();
	const flash = new THREE.SpotLight( 0xffe9c8, 270, 25, 0.3, 0.12, 2 ); // cookie 决定光斑形状（硬边热点 ≈ 0.1rad 半角）
	flash.position.set( ...FLASH.pos );
	flash.target.position.set( ...FLASH.target );
	flash.map = cookie;
	flash.castShadow = true;
	flash.shadow.mapSize.set( 2048, 2048 );
	flash.shadow.radius = 1.5;
	flash.shadow.camera.near = 0.2;
	flash.shadow.bias = - 0.0002;
	flash.shadow.normalBias = 0.02;
	flash.layers.enable( VOLUME_LAYER );
	scene.add( flash, flash.target );
	// 手电外圈的宽角弱光晕（真实手电反光杯外的散射，照亮近处左侧玻璃门与柱子）
	const corona = new THREE.SpotLight( 0xffe9c8, 4.5, 14, 0.85, 1.0, 2 );
	corona.position.copy( flash.position );
	corona.target.position.set( - 0.6, 1.0, - 5.0 );
	scene.add( corona, corona.target );
	// 手电打在门/柱上的一次反弹（近似 GI，弱，低于热点两个数量级）
	const bounce = new THREE.PointLight( 0xd8cfb8, 1.4, 7, 2 );
	bounce.position.set( 0.9, 1.0, zBack + 1.6 );
	scene.add( bounce );

	// 全局空气透视：潮湿空气里远处蒙一层暗绿灰
	const hazeColor = uniform( new THREE.Color( 0.016, 0.02, 0.016 ) );
	const haze = { near: uniform( 2 ), far: uniform( 16 ), amount: uniform( 0.5 ) };
	scene.fogNode = fog( hazeColor, rangeFogFactor( haze.near, haze.far ).mul( haze.amount ) );

	// ================= 体积雾（灰尘/孢子）=================
	const fogGeo = new THREE.BoxGeometry( x1 - x0, R.h - WATER_Y, R.backRoom * - 1 + zFront );
	// 雾密度：大尺度团块 × 域扭曲后的中尺度涡旋丝缕（对比拉开），贴近水面一层更浓的水汽；镜头附近稀薄
	const fogNoise = ( p ) => {

		const q = p.add( vec3( time.mul( 0.04 ), time.mul( 0.01 ), time.mul( - 0.02 ) ) );
		const warp = mx_noise_vec3( q.mul( 0.35 ) ).mul( 0.9 );
		const big = mx_fractal_noise_float( q.mul( 0.32 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
		const wisp = mx_fractal_noise_float( q.mul( 1.25 ).add( warp ), 3, 2.1, 0.55 ).mul( 0.5 ).add( 0.5 );
		const dens = smoothstep( 0.32, 0.78, wisp.mul( 0.65 ).add( big.mul( 0.35 ) ) ).mul( 1.5 ).add( 0.08 );
		const low = smoothstep( WATER_Y + 0.9, WATER_Y, p.y ).mul( 1.4 ).add( 1.0 );
		// 光锥内加浓：只有手电穿过的空气才“显形”，锥外仅保留 30% 的底雾 → 光束有清晰的边，而不是整屏乳白
		const cA = dot( normalize( p.sub( FL.pos ) ), FL.dir );
		// 光锥内加浓，并按到手电距离² 补偿（近处 1/d² 太亮会变成一大团白光，远处门前的光柱才是重点）
		const dL = length( p.sub( FL.pos ) );
		const inCone = smoothstep( Math.cos( 0.125 ), Math.cos( 0.095 ), cA ).mul( dL.mul( dL ).div( 55 ).min( 1 ) );
		const base = dens.mul( low ).mul( smoothstep( 1.0, - 3.0, p.z ).mul( 0.92 ).add( 0.08 ) );
		// 光锥外一圈很弱的散射晕（反光杯外溢光照亮的空气），让光束有“核心 + 晕”的层次
		const halo = smoothstep( Math.cos( 0.32 ), Math.cos( 0.12 ), cA ).mul( 0.35 );
		return base.mul( float( 0.3 ).add( halo ).add( inCone.mul( mix( float( 0.9 ), float( 2.6 ), wisp ) ) ) );

	};

	const fogVol = createVolumeFogTAA( fogGeo, { density: 0.075, steps: 34, noise: fogNoise } );
	fogVol.position.set( 0, ( R.h + WATER_Y ) / 2, ( R.backRoom + zFront ) / 2 );
	scene.add( fogVol );

	// ================= 尘埃/孢子（非自发光：只被手电照亮，带前向散射）=================
	const NP = 1800;
	const pArr = new Float32Array( NP * 3 );
	{

		const lp = new THREE.Vector3( ...FLASH.pos ), ax = new THREE.Vector3( ...FLASH.target ).sub( lp ).normalize();
		const u = new THREE.Vector3().crossVectors( ax, new THREE.Vector3( 0, 1, 0 ) ).normalize(), w = new THREE.Vector3().crossVectors( u, ax );
		for ( let i = 0; i < NP; i ++ ) {

			// 在光锥（略放大）内采样：近处少、远处多（体积随距离平方增长）
			const t = 1.2 + Math.sqrt( rng() ) * 10.5;
			const r = Math.tan( 0.36 ) * t * Math.sqrt( rng() );
			const a = rng() * Math.PI * 2;
			const p = lp.clone().addScaledVector( ax, t ).addScaledVector( u, Math.cos( a ) * r ).addScaledVector( w, Math.sin( a ) * r );
			p.y = THREE.MathUtils.clamp( p.y, WATER_Y + 0.05, h - 0.1 );
			p.z = Math.max( p.z, zBack + 0.1 );
			pArr.set( [ p.x, p.y, p.z ], i * 3 );

		}

	}

	const pBase = instancedBufferAttribute( new THREE.InstancedBufferAttribute( pArr, 3 ) );
	const dustMat = new THREE.SpriteNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
	const hi = hash( instanceIndex );
	// 漂移：三维噪声场（近似旋度噪声的缓慢翻涌）+ 每颗粒子的小幅自转
	const drift = mx_noise_vec3( pBase.mul( 0.7 ).add( vec3( 0, time.mul( 0.05 ), time.mul( 0.03 ) ) ) ).mul( 0.18 )
		.add( vec3( sin( time.mul( 0.13 ).add( hi.mul( 40 ) ) ), sin( time.mul( 0.07 ).add( hi.mul( 17 ) ) ), sin( time.mul( 0.11 ).add( hi.mul( 23 ) ) ) ).mul( 0.03 ) );
	const pPos = pBase.add( drift );
	dustMat.positionNode = pPos;
	// Henyey-Greenstein 相函数（g=0.55）：逆光时亮，顺光时暗
	const toCam = normalize( cameraPosition.sub( pPos ) );
	const toL = normalize( FL.pos.sub( pPos ) );
	const cosT = dot( toCam, toL.negate() );
	const g = 0.55;
	const hg = float( 1 - g * g ).div( pow( float( 1 + g * g ).sub( cosT.mul( 2 * g ) ), 1.5 ) ).mul( 1 / ( 4 * Math.PI ) );
	const albedo = vec3( 0.55, 0.53, 0.48 );
	// 尺寸分布：大多数是 0.5~1px 的微尘，少数 2~3px 的孢子团；离镜头 1.8m 内的按景深放大并变淡（虚焦）
	const camD = length( cameraPosition.sub( pPos ) );
	const hs = hash( instanceIndex.add( 7 ) );
	const size = hs.mul( hs ).mul( hs ).mul( 0.009 ).add( 0.0018 );
	const coc = smoothstep( 1.8, 0.6, camD ).mul( 0.02 );
	const fade = float( 1 ).div( coc.div( size ).add( 1 ).pow( 2 ) );
	dustMat.colorNode = vec4( flashAt( pPos ).mul( albedo ).mul( hg.add( 0.02 ) ).mul( 0.3 ).mul( fade ).mul( hi.mul( 0.8 ).add( 0.4 ) ), 1 );
	const dr = uv().sub( 0.5 ).length();
	dustMat.opacityNode = smoothstep( 0.5, mix( float( 0.05 ), float( 0.4 ), smoothstep( 0, 0.01, coc ) ), dr );
	dustMat.scaleNode = vec2( size.add( coc ) );
	const dust = new THREE.Sprite( dustMat );
	dust.count = NP;
	dust.frustumCulled = false;
	scene.add( dust );

	// ================= 俯视剖切 / 手电姿态 =================
	const setFlashPose = ( pose ) => {

		flash.position.set( ...pose.pos );
		flash.target.position.set( ...pose.target );
		corona.position.copy( flash.position );
		syncFlash( flash );

	};

	let wasAbove = null;
	const update = () => {

		const above = camera.position.y > R.slab + 0.5;
		if ( above !== wasAbove ) {

			wasAbove = above;
			clipG.enabled = above;
			for ( const o of cutaway ) o.visible = ! above;
			for ( const o of topOnly ) o.visible = above;
			scene.background = above ? BG_TOP : BG_HERO;
			setFlashPose( above ? FLASH_TOP : FLASH );
			// 俯视时光锥放宽（cookie 随 angle 缩放），地面上是一块清晰可读的光池，而不是细长条
			flash.angle = above ? 0.52 : 0.3;
			FL.cosCore.value = Math.cos( above ? 0.155 : 0.088 );
			FL.cosEdge.value = Math.cos( above ? 0.18 : 0.102 );
			flash.intensity = above ? 160 : 270;
			corona.target.position.set( ...( above ? [ - 0.5, 0.4, - 5 ] : [ - 0.6, 1.0, - 5.0 ] ) );
			hemi.intensity = above ? 5.0 : 0.5;
			fogVol.userData.density.value = above ? 0.04 : 0.075; // 俯视时光路短、雾薄一些，光锥保留体积渐变而不是不透明的椭圆
			for ( const l of skyLights ) l.visible = above;
			dust.visible = ! above;

		}

		// 俯视时空气透视按到房间的距离偏移，避免整屏被雾盖住
		haze.near.value = above ? camera.position.distanceTo( new THREE.Vector3( 0, 1, - 3.6 ) ) : 2;
		haze.far.value = haze.near.value + 14;
		syncFlash( flash );

	};

	// —— 俯视剖切：除剖面/周边楼板外，整个场景放进 ClippingGroup，俯视时裁掉 CUT_Y 以上的一切（墙顶、吊顶、灯）——
	const clipG = new THREE.ClippingGroup();
	clipG.clippingPlanes = [ new THREE.Plane( new THREE.Vector3( 0, - 1, 0 ), CUT_Y ) ];
	clipG.clipShadows = false; // 被裁掉的墙体仍然挡光（不漏光）
	clipG.enabled = false;
	for ( const o of [ ...scene.children ] ) if ( ! topOnly.includes( o ) ) clipG.add( o );
	scene.add( clipG );
	update();

	return {
		M,
		update,
		pipelineOptions: {
			volumes: [ fogVol ],
			volumeIntensity: 1.0,
			volumeResolution: 0.75,
			bloomThreshold: 0.9,
			postLDR: ( out ) => darkGrade( out ),
		},
		gui: ( gui ) => {

			const f = gui.addFolder( '黑暗室内' );
			f.add( flash, 'intensity', 0, 1500, 1 ).name( '手电强度' );
			f.add( corona, 'intensity', 0, 60, 0.1 ).name( '手电外圈' );
			f.add( warm, 'intensity', 0, 60, 0.1 ).name( '门后暖光' );
			f.add( hemi, 'intensity', 0, 2, 0.01 ).name( '环境光' );
			f.add( fogVol.userData.density, 'value', 0, 1, 0.005 ).name( '雾浓度' );
			f.add( renderer, 'toneMappingExposure', 0.2, 3, 0.01 ).name( '曝光' );
			f.add( G.contrast, 'value', 0.5, 2, 0.01 ).name( '对比' );
			f.add( G.lift, 'value', 0, 1, 0.01 ).name( '黑位' );

		},
	};

}
