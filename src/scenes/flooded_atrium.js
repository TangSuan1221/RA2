// 场景：淹水中庭 / 大楼入口（对标 ref7 —— TLOU2 划艇穿过被淹的大厅）
// 前景：铝制划艇漂在深绿色近乎镜面的死水上，水面漂着睡莲叶；
// 左侧：夹层楼板上垂下的常春藤帘幕、种植池里的蕨类；
// 正前方：过曝的明亮出口（拱形钢架 + 玻璃门），门外是阳光草地与带刺铁丝网围栏，水面倒映出口的亮光；
// 两侧：深色木包柱 / 油漆钢柱。室内极暗 vs 室外过曝的强烈明暗对比。
// 坐标：+X 右，-Z 朝出口，水面 y = 0
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, luminance, screenUV, time, positionWorld,
	mx_fractal_noise_float, mx_noise_vec3, mx_noise_float, reflector, transformNormalToView, cameraPosition,
	normalize, dot, pow, max, texture, uv, instanceIndex, hash, fog, rangeFogFactor, step, select, sin, abs,
} from 'three/tsl';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import { createVolumeFog, VOLUME_LAYER } from '../core/renderer.js';
import { loadModel, loadHDR, InstanceBatch, trs } from '../world/assets.js';
import { WATER_Y, archMaterial, paintedSteel, oldWood } from '../flooded_atrium/materials.js';
import { buildBoat, BOAT } from '../flooded_atrium/boat.js';
import { hangStrand, growWallIvy, buildFoliage, lilyGeometry, lilyMaterial } from '../flooded_atrium/foliage.js';
import { lilyGeometry as detailedLilyGeometry, lilyMaterial as detailedLilyMaterial } from '../flooded_atrium/water.js';
import { buildExterior, OUT_Y } from '../flooded_atrium/exterior.js';
import { mulberry, boxUV, merge, box, meshOf, texSet } from '../flooded_atrium/util.js';

// —— 大厅尺寸（米）——
const H = {
	x0: - 7.5, x1: 7.5,
	zFront: - 14, // 出口所在的前墙（内表面）
	zBack: 9,
	ceil: 8.6,
	mezzY: 4.2, mezzX: - 4.6, // 左侧夹层楼板：高度 / 边缘
	door: { hw: 3.3, rectTop: 4.0, rise: 0.26, sill: OUT_Y }, // 出口：半宽、矩形顶、拱高、门槛
};

const ROOF_LAYER = 3;
// 天窗洞口（天花上的坍塌缺口）
const SKY = { x0: - 5.2, x1: - 2.2, z0: - 8.2, z1: - 5.0 }; // 屋顶/上部墙体：俯视镜头隐藏（剖切），但仍投射阴影

export const SHOTS = {
	hero: { position: [ 2.3, 1.85, 1.8 ], lookAt: [ 2.6, -0.85, - 12 ], fov: 57 },
	top: { mode: 'top', yaw: 0, pitch: 55, distance: 19, target: [ 0, 0, - 2.6 ] },
};

// —— 调色（替换默认）：高对比、暗部青绿、亮部微暖、抬黑位、颗粒、暗角 ——
const G = {
	contrast: uniform( 1.1 ),
	saturation: uniform( 0.9 ),
	lift: uniform( 0.03 ),
	shadowTint: uniform( new THREE.Color( 0.88, 1.0, 0.94 ) ),
	highlightTint: uniform( new THREE.Color( 1.03, 1.0, 0.94 ) ),
	vignette: uniform( 0.42 ),
	grain: uniform( 0.028 ),
};

const atriumGrade = Fn( ( [ color ] ) => {

	let c = color.rgb.toVar();
	c.assign( c.sub( 0.32 ).mul( G.contrast ).add( 0.32 ).max( 0 ) );
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, G.saturation ) );
	const w = smoothstep( 0.0, 0.55, l );
	c.assign( c.mul( mix( vec3( G.shadowTint ), vec3( G.highlightTint ), w ) ) );
	c.assign( c.add( vec3( 0.8, 1.0, 0.9 ).mul( G.lift ) ) );
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.3, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( G.vignette ) ) ) );
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( G.grain ).mul( l.add( 0.04 ).sqrt() ) ) );
	return vec4( c, color.a );

} );

// 把对象（及子级）放到屋顶图层
function roofLayer( o ) {

	o.traverse( ( c ) => { c.layers.set( ROOF_LAYER ); } );
	return o;

}

export async function build( { scene, renderer, camera } ) {

	const rng = mulberry( 1337 );
	RectAreaLightNode_init();

	// ================= 环境与天光 =================
	const hdr = await loadHDR( 'hdri/kloofendal_overcast_1k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.05; // 室内几乎没有天光
	scene.background = new THREE.Color( 0x000000 );
	renderer.toneMappingExposure = 1.0;
	camera.near = 0.05; camera.far = 160; camera.updateProjectionMatrix();
	camera.layers.enable( ROOF_LAYER );

	const MODEL_IDS = [ 'modular_chainlink_fence', 'grass_medium_01', 'shrub_02', 'fern_02', 'metal_jerrycan' ];
	const loaded = await Promise.all( MODEL_IDS.map( loadModel ) );
	const M = Object.fromEntries( MODEL_IDS.map( ( id, i ) => [ id, loaded[ i ] ] ) );

	// ================= 材质 =================
	const plaster = archMaterial( 'worn_mossy_plasterwall', { scale: 0.32, tint: 0x8a8a80, dark: 0.55, streak: 0.8, moss: 0.5 } );
	const concrete = archMaterial( 'concrete_wall_008', { scale: 0.25, tint: 0x9a9890, dark: 0.5, streak: 0.7, moss: 0.4, res: '2k' } );
	const ceilingMat = archMaterial( 'concrete_wall_008', { scale: 0.22, tint: 0x80807a, dark: 0.35, streak: 0.0, moss: 0.0, res: '2k' } );
	const woodClad = archMaterial( 'dark_wood', { scale: 0.7, tint: 0x5a4a3c, dark: 0.55, streak: 0.4, moss: 0.25, rough: 0.9, metal: 0 } );
	woodClad.colorNode; // 木纹竖向：在几何 UV 里交换
	const steel = paintedSteel( { paint: 0x1c2220 } );
	const steelDoor = paintedSteel( { paint: 0x23292a, rustAmt: 0.4 } );

	// ================= 建筑 =================
	const { x0, x1, zFront, zBack, ceil, mezzY, mezzX, door } = H;
	const shell = [];
	const upper = [];
	const T = 4; // 厚墙：俯视剖切时露出墙体截面，不会看到虚空
	// 左右墙、后墙（下部 + 上部分开，上部在俯视时剖切）
	const split = mezzY + 0.6;
	shell.push( box( T, split + 1.5, zBack - zFront + 2 * T, x0 - T / 2, ( split - 1.5 ) / 2, ( zBack + zFront ) / 2 ) );
	shell.push( box( T, split + 1.5, zBack - zFront + 2 * T, x1 + T / 2, ( split - 1.5 ) / 2, ( zBack + zFront ) / 2 ) );
	shell.push( box( x1 - x0 + 1, split + 1.5, T, 0, ( split - 1.5 ) / 2, zBack + T / 2 ) );
	upper.push( box( T, ceil - split + 0.3, zBack - zFront + 2 * T, x0 - T / 2, ( ceil + split ) / 2, ( zBack + zFront ) / 2 ) );
	upper.push( box( T, ceil - split + 0.3, zBack - zFront + 2 * T, x1 + T / 2, ( ceil + split ) / 2, ( zBack + zFront ) / 2 ) );
	upper.push( box( x1 - x0 + 1, ceil - split + 0.3, T, 0, ( ceil + split ) / 2, zBack + T / 2 ) );
	scene.add( meshOf( boxUV( merge( shell ), 1 ), plaster ) );
	scene.add( roofLayer( meshOf( boxUV( merge( upper ), 1 ), plaster ) ) );

	// 前墙：带拱形出口的整面墙（挤出）
	const fw = new THREE.Shape();
	fw.moveTo( x0 - T, - 1.5 ); fw.lineTo( x1 + T, - 1.5 ); fw.lineTo( x1 + T, ceil + 0.3 ); fw.lineTo( x0 - T, ceil + 0.3 ); fw.closePath();
	const hole = new THREE.Path();
	hole.moveTo( - door.hw, door.sill );
	hole.lineTo( door.hw, door.sill );
	hole.lineTo( door.hw, door.rectTop );
	for ( let i = 1; i < 32; i ++ ) {

		const a = ( i / 32 ) * Math.PI;
		hole.lineTo( Math.cos( a ) * door.hw, door.rectTop + Math.sin( a ) * door.rise );

	}

	hole.lineTo( - door.hw, door.rectTop );
	hole.closePath();
	fw.holes.push( hole );
	const fwGeo = new THREE.ExtrudeGeometry( fw, { depth: 0.7, bevelEnabled: false, curveSegments: 4 } );
	fwGeo.translate( 0, 0, zFront - 0.7 );
	scene.add( meshOf( boxUV( fwGeo, 1 ), concrete ) );

	// 天花 + 钢梁（屋顶层）
	// 天花：左侧有一处坍塌的天窗洞口（SKY），四周用四块板围出
	const rx0 = x0 - 0.6, rx1 = x1 + 0.6, rz0 = zFront - 0.8, rz1 = zBack + 0.8;
	const roof = [
		box( SKY.x0 - rx0, 0.5, rz1 - rz0, ( SKY.x0 + rx0 ) / 2, ceil + 0.25, ( rz0 + rz1 ) / 2 ),
		box( rx1 - SKY.x1, 0.5, rz1 - rz0, ( SKY.x1 + rx1 ) / 2, ceil + 0.25, ( rz0 + rz1 ) / 2 ),
		box( SKY.x1 - SKY.x0, 0.5, SKY.z0 - rz0, ( SKY.x0 + SKY.x1 ) / 2, ceil + 0.25, ( rz0 + SKY.z0 ) / 2 ),
		box( SKY.x1 - SKY.x0, 0.5, rz1 - SKY.z1, ( SKY.x0 + SKY.x1 ) / 2, ceil + 0.25, ( SKY.z1 + rz1 ) / 2 ),
	];
	roof.push( box( x1 - x0 + 1.2, 0.4, 2, 0, ceil + 0.25, zFront - 1.6 ) ); // 门廊顶（门外雨棚）
	scene.add( roofLayer( meshOf( boxUV( merge( roof ), 1 ), ceilingMat ) ) );
	const beams = [];
	for ( let z = zFront + 2.5; z < zBack; z += 4.2 ) {

		// 工字钢：上下翼缘 + 腹板
		beams.push( box( x1 - x0, 0.03, 0.26, 0, ceil - 0.015, z ), box( x1 - x0, 0.5, 0.025, 0, ceil - 0.27, z ), box( x1 - x0, 0.03, 0.26, 0, ceil - 0.52, z ) );

	}

	// 天窗残存的钢格栅（一根断裂下垂）
	for ( let x = SKY.x0 + 0.75; x < SKY.x1 - 0.1; x += 0.75 ) beams.push( box( 0.07, 0.12, SKY.z1 - SKY.z0 + 0.4, x, ceil - 0.05, ( SKY.z0 + SKY.z1 ) / 2 ) );
	beams.push( box( SKY.x1 - SKY.x0, 0.12, 0.07, ( SKY.x0 + SKY.x1 ) / 2, ceil - 0.05, ( SKY.z0 + SKY.z1 ) / 2 ) );
	beams.push( box( 1.6, 0.1, 0.07, SKY.x0 + 1.4, ceil - 0.55, SKY.z0 + 0.9, { rz: 0.7, ry: 0.3 } ) );
	scene.add( roofLayer( meshOf( boxUV( merge( beams ), 1 ), steel ) ) );

	// 左侧夹层：楼板 + 檐口封板 + 栏杆（钢）
	const mezz = [ box( mezzX - x0, 0.32, zBack - zFront, ( mezzX + x0 ) / 2, mezzY, ( zBack + zFront ) / 2, { bevel: 0.02 } ) ];
	mezz.push( box( 0.08, 0.55, zBack - zFront, mezzX - 0.02, mezzY - 0.1, ( zBack + zFront ) / 2, { bevel: 0.015 } ) );
	scene.add( meshOf( boxUV( merge( mezz ), 1 ), concrete ) );
	const rail = [];
	for ( let z = zFront + 0.3; z < zBack; z += 0.14 ) rail.push( box( 0.018, 1.0, 0.018, mezzX + 0.04, mezzY + 0.66, z ) );
	rail.push( box( 0.06, 0.05, zBack - zFront, mezzX + 0.04, mezzY + 1.18, ( zBack + zFront ) / 2, { bevel: 0.01 } ) );
	rail.push( box( 0.04, 0.04, zBack - zFront, mezzX + 0.04, mezzY + 0.22, ( zBack + zFront ) / 2 ) );
	scene.add( meshOf( boxUV( merge( rail ), 2 ), steel ) );

	// 柱：左侧木包方柱（支撑夹层），右侧油漆钢圆柱（通高）
	const wood = [], steelCols = [], upperCols = [];
	for ( const z of [ - 10.4, - 5.6, - 0.8, 4.0 ] ) {

		wood.push( box( 0.62, mezzY + 1.2, 0.62, mezzX + 0.32, ( mezzY - 1.2 ) / 2, z, { bevel: 0.025 } ) );
		// 柱头/柱脚金属箍
		steelCols.push( box( 0.68, 0.12, 0.68, mezzX + 0.32, mezzY - 0.22, z, { bevel: 0.02 } ) );
		const c = new THREE.CylinderGeometry( 0.3, 0.3, split + 1.5, 24 );
		c.translate( 4.6, ( split - 1.5 ) / 2, z );
		steelCols.push( c );
		const cu = new THREE.CylinderGeometry( 0.3, 0.3, ceil - split, 24 );
		cu.translate( 4.6, ( ceil + split ) / 2, z );
		upperCols.push( cu );
		// 钢柱顶部法兰
		const f = new THREE.CylinderGeometry( 0.42, 0.42, 0.18, 24 );
		f.translate( 4.6, ceil - 0.09, z );
		upperCols.push( f );

	}

	// 出口两侧的钢方柱
	for ( const s of [ - 1, 1 ] ) {

		steelCols.push( box( 0.45, split + 1.5, 0.45, s * ( door.hw + 0.55 ), ( split - 1.5 ) / 2, zFront + 0.25, { bevel: 0.02 } ) );
		upperCols.push( box( 0.45, ceil - split, 0.45, s * ( door.hw + 0.55 ), ( ceil + split ) / 2, zFront + 0.25, { bevel: 0.02 } ) );

	}
	const woodGeo = boxUV( merge( wood ), 1 );
	{ // 木纹竖向：交换 UV

		const a = woodGeo.attributes.uv;
		for ( let i = 0; i < a.count; i ++ ) a.setXY( i, a.getY( i ) * 0.5, a.getX( i ) * 2 );

	}

	scene.add( meshOf( woodGeo, woodClad ) );
	scene.add( meshOf( boxUV( merge( steelCols ), 1 ), steel ) );
	scene.add( roofLayer( meshOf( boxUV( merge( upperCols ), 1 ), steel ) ) );

	// 右墙高窗：木板封死，缝隙漏一点冷光（窗框 + 封板）
	const boards = [];
	for ( const z of [ - 8, - 3.2, 1.6 ] ) {

		for ( let k = 0; k < 7; k ++ ) {

			const y = 2.2 + k * 0.42 + rng() * 0.05;
			boards.push( box( 0.04, 0.3, 2.2, x1 - 0.04, y, z + ( rng() - 0.5 ) * 0.2, { rx: ( rng() - 0.5 ) * 0.06, bevel: 0.008 } ) );

		}

	}

	scene.add( meshOf( boxUV( merge( boards ), 1 ), oldWood( { tint: 0x4a4038, scale: 1 } ) ) );

	// 左侧种植池（露出水面 0.45m），里面长满蕨类
	const planters = [];
	for ( const [ z, len ] of [ [ - 8.0, 3.2 ], [ - 3.2, 3.2 ], [ 1.6, 3.0 ] ] ) {

		planters.push( box( 1.1, 1.6, len, mezzX - 0.1, - 0.35, z, { bevel: 0.04 } ) );

	}

	scene.add( meshOf( boxUV( merge( planters ), 1 ), concrete ) );

	// ================= 出口：拱形钢架 + 玻璃门 =================
	const frame = [];
	const prof = 0.11;
	// 拱形外框（沿拱线的方管段）
	const archPt = ( a ) => new THREE.Vector3( Math.cos( a ) * ( door.hw - 0.05 ), door.rectTop + Math.sin( a ) * ( door.rise - 0.05 ), zFront - 0.35 );
	for ( let i = 0; i < 24; i ++ ) {

		const a0 = ( i / 24 ) * Math.PI, a1 = ( ( i + 1 ) / 24 ) * Math.PI;
		const p0 = archPt( a0 ), p1 = archPt( a1 );
		const mid = p0.clone().add( p1 ).multiplyScalar( 0.5 );
		const len = p0.distanceTo( p1 ) + 0.01;
		frame.push( box( len, prof, prof, mid.x, mid.y, mid.z, { rz: Math.atan2( p1.y - p0.y, p1.x - p0.x ) } ) );

	}

	// 竖框、横档、扇形放射格条
	for ( const x of [ - door.hw + 0.05, - 1.35, 0, 1.35, door.hw - 0.05 ] ) frame.push( box( prof, door.rectTop - door.sill, prof, x, ( door.rectTop + door.sill ) / 2, zFront - 0.35 ) );
	frame.push( box( door.hw * 2, prof * 1.4, prof * 1.2, 0, door.rectTop, zFront - 0.35 ) );
	frame.push( box( door.hw * 2, prof, prof, 0, door.sill + 0.05, zFront - 0.35 ) );
	for ( let k = 1; k < 6; k ++ ) {

		const a = ( k / 6 ) * Math.PI;
		const p = archPt( a );
		const c = new THREE.Vector3( 0, door.rectTop, zFront - 0.35 );
		const mid = p.clone().add( c ).multiplyScalar( 0.5 );
		frame.push( box( p.distanceTo( c ), 0.06, 0.06, mid.x, mid.y, mid.z, { rz: Math.atan2( p.y - c.y, p.x - c.x ) } ) );

	}

	scene.add( meshOf( boxUV( merge( frame ), 1.5 ), steelDoor ) );

	// 玻璃：脏、半透明；部分破碎缺失；中间两扇门一扇向外半开
	const glassMat = new THREE.MeshStandardNodeMaterial( { transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0 } );
	const gp = positionWorld;
	const grime = mx_fractal_noise_float( gp.mul( vec3( 2.2, 0.6, 2.2 ) ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const lowDirt = smoothstep( 1.6, OUT_Y, gp.y );
	glassMat.colorNode = vec3( 0.24, 0.25, 0.2 );
	glassMat.opacityNode = mix( float( 0.04 ), float( 0.4 ), grime.mul( 0.6 ).add( lowDirt.mul( 0.5 ) ).clamp() );
	glassMat.roughnessNode = mix( float( 0.08 ), float( 0.6 ), grime );
	const glass = [];
	const panes = [ [ - door.hw + 0.05, - 1.35 ], [ 1.35, door.hw - 0.05 ] ];
	for ( const [ a, b ] of panes ) glass.push( box( b - a - 0.08, (door.rectTop - door.sill) * 0.28, 0.01, ( a + b ) / 2, door.sill + (door.rectTop - door.sill) * 0.14, zFront - 0.35 ) );
	// 拱内扇形玻璃（只保留部分扇区，其余破碎）
	for ( let k = 0; k < 6; k ++ ) {

		if ( k === 2 || k === 4 ) continue;
		const sh = new THREE.Shape();
		sh.moveTo( 0, 0 );
		for ( let i = 0; i <= 6; i ++ ) {

			const a = ( ( k + i / 6 ) / 6 ) * Math.PI;
			sh.lineTo( Math.cos( a ) * ( door.hw - 0.1 ), Math.sin( a ) * ( door.rise - 0.1 ) );

		}

		sh.closePath();
		const g = new THREE.ShapeGeometry( sh );
		g.translate( 0, door.rectTop, zFront - 0.35 );
		glass.push( g );

	}

	const glassMesh = new THREE.Mesh( merge( glass ), glassMat );
	glassMesh.renderOrder = 2;
	// Main glazing has collapsed: retain frame and open courtyard view.
	// scene.add( glassMesh );

	// 中间两扇玻璃门：左扇关着（玻璃碎了一半），右扇向外半开
	const doorLeaf = ( w, h ) => {

		const g = new THREE.Group();
		const fr = merge( [ box( 0.07, h, 0.06, - w / 2 + 0.035, h / 2, 0 ), box( 0.07, h, 0.06, w / 2 - 0.035, h / 2, 0 ), box( w, 0.07, 0.06, 0, h - 0.035, 0 ), box( w, 0.22, 0.06, 0, 0.11, 0 ), box( w - 0.1, 0.04, 0.05, 0, 1.05, 0 ) ] );
		g.add( meshOf( boxUV( fr, 2 ), steelDoor ) );
		const gl = new THREE.Mesh( new THREE.PlaneGeometry( w - 0.12, h - 0.32 ), glassMat );
		gl.position.set( 0, h / 2 + 0.08, 0 );
		gl.renderOrder = 2;
		// Broken door glazing leaves only steel frames; side shards retain grime.
		// g.add( gl );
		return g;

	};

	const dl = doorLeaf( 1.3, door.rectTop - door.sill - 0.1 );
	dl.position.set( - 0.675, door.sill + 0.02, zFront - 0.35 );
	scene.add( dl );
	const dr = doorLeaf( 1.3, door.rectTop - door.sill - 0.1 );
	const hinge = new THREE.Group();
	hinge.position.set( 1.35, door.sill + 0.02, zFront - 0.35 );
	dr.position.set( - 0.65, 0, 0 );
	hinge.add( dr );
	hinge.rotation.y = - 1.1; // 向外推开
	scene.add( hinge );

	// ================= 门外 =================
	await buildExterior( { scene, M, hdr, doorX: door.hw, wallZ: zFront - 0.7 } );

	// ================= 水面 =================
	const refl = reflector( { resolutionScale: 0.6, bounces: false } );
	refl.target.rotateX( - Math.PI / 2 );
	refl.target.position.y = WATER_Y;
	scene.add( refl.target );
	const waterMat = new THREE.MeshStandardNodeMaterial( { metalness: 0, alphaTest: 0.5 } );
	// 船体内部不能露出水面：在船的局部坐标里按船壳水线轮廓剔除水面
	const BOAT_POS = [ 1.6, -2.0 ], BOAT_YAW = Math.PI / 2 + 0.06;
	{

		const cy = Math.cos( BOAT_YAW ), sy = Math.sin( BOAT_YAW );
		const dx = positionWorld.x.sub( BOAT_POS[ 0 ] ), dz = positionWorld.z.sub( BOAT_POS[ 1 ] );
		const lx = dx.mul( cy ).sub( dz.mul( sy ) ), lz = dx.mul( sy ).add( dz.mul( cy ) );
		const u = lx.div( BOAT.L ).add( 0.5 );
		const k = u.sub( 0.42 ).div( 0.58 ).clamp( 0, 1 );
		const hwA = float( 0.8 ).add( sin( u.div( 0.42 ).clamp( 0, 1 ).mul( Math.PI / 2 ) ).mul( 0.2 ) );
		const hwB = pow( float( 1 ).sub( pow( k, 2.1 ) ).max( 0 ), 0.62 );
		const hw = select( u.lessThan( 0.42 ), hwA, hwB ).mul( BOAT.W * 0.86 ).sub( 0.01 );
		const inside = u.greaterThan( 0.0 ).and( u.lessThan( 0.97 ) ).and( abs( lz ).lessThan( hw ) );
		waterMat.opacityNode = select( inside, float( 0 ), float( 1 ) );

	}
	const wp = positionWorld;
	// 死水：极缓慢的大尺度起伏 + 细碎涟漪（幅度很小，保持近镜面）
	const rip = mx_noise_vec3( vec3( wp.x.mul( 0.9 ), wp.z.mul( 0.9 ), time.mul( 0.08 ) ) ).mul( 0.5 )
		.add( mx_noise_vec3( vec3( wp.x.mul( 5.0 ), wp.z.mul( 5.0 ), time.mul( 0.2 ) ) ).mul( 0.22 ) );
	// 水面浮萍/藻膜：靠墙和柱子一带更多
	const edge = smoothstep( 2.5, 0.0, wp.x.sub( x0 ).min( wp.x.sub( x1 ).negate() ) ).mul( 0.25 );
	const scumN = mx_fractal_noise_float( vec3( wp.x.mul( 0.55 ), 0, wp.z.mul( 0.55 ) ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 ).add( edge );
	const scumFine = mx_fractal_noise_float( vec3( wp.x.mul( 6 ), 0, wp.z.mul( 6 ) ), 2, 2.0, 0.5 ).mul( 0.08 );
	const scum = smoothstep( 0.7, 0.8, scumN.add( scumFine ) );
	const nW = normalize( vec3( rip.x.mul( 0.085 ), 1, rip.y.mul( 0.085 ) ) );
	waterMat.normalNode = transformNormalToView( nW );
	refl.uvNode = refl.uvNode.add( rip.xy.mul( 0.018 ) );
	const V = normalize( cameraPosition.sub( wp ) );
	const fres = float( 0.02 ).add( float( 0.98 ).mul( pow( float( 1 ).sub( max( dot( V, nW ), 0 ) ), 5 ) ) );
	const murk = vec3( 0.008, 0.014, 0.008 );
	waterMat.colorNode = mix( murk, vec3( 0.014, 0.022, 0.006 ), scum );
	waterMat.roughnessNode = mix( float( 0.12 ), float( 0.50 ), scum );
	// 深色水体几乎不透光，反射占主导：在物理菲涅尔基础上略抬（视觉上的“黑镜”）
	waterMat.emissiveNode = refl.rgb.mul( fres.mul( 0.60 ).add( 0.04 ).min( 1 ) ).mul( mix( float( 1.0 ), float( 0.15 ), scum ) ).mul( vec3( 0.9, 1.0, 0.92 ) );
	const water = new THREE.Mesh( new THREE.PlaneGeometry( x1 - x0 + 0.2, zBack - zFront + 0.2, 1, 1 ), waterMat );
	water.rotation.x = - Math.PI / 2;
	water.position.set( 0, WATER_Y, ( zBack + zFront ) / 2 );
	water.receiveShadow = true;
	scene.add( water );

	// ================= 划艇 =================
	const fuel = M.metal_jerrycan.scene.clone(true);
	const fuelBox = new THREE.Box3().setFromObject(fuel), fuelSize = fuelBox.getSize(new THREE.Vector3()), fuelCenter = fuelBox.getCenter(new THREE.Vector3());
	const fuelScale = .43 / fuelSize.y;
	fuel.position.set(-fuelCenter.x*fuelScale,-fuelBox.min.y*fuelScale,-fuelCenter.z*fuelScale);fuel.scale.setScalar(fuelScale);
	fuel.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.colorNode=vec3(.30,.065,.04).mul(luminance(texture(o.material.map,uv()).rgb).mul(3).add(.35));}});
	const fuelRoot = new THREE.Group(); fuelRoot.add(fuel);
	const boat = buildBoat({jerrycan:fuelRoot});
	const boatRoot = new THREE.Group();
	boatRoot.add( boat );
	boatRoot.position.set( 1.6, 0.33, -2.0 );
	boatRoot.rotation.y = Math.PI / 2 + 0.06;
	scene.add( boatRoot );

	// ================= 植被 =================
	const ivy = { leaves: [], stems: [] };
	// 1) 夹层边缘垂下的常春藤帘幕（左侧），越靠近镜头越长越密
	for ( let z = zFront + 0.4; z < zBack - 0.5; z += 0.11 + rng() * 0.12 ) {

		const clump = 0.5 + 0.5 * Math.sin( z * 0.9 ) * Math.sin( z * 0.37 + 1 );
		if ( rng() > 0.35 + clump * 0.6 ) continue;
		const len = 1.2 + rng() * 2.6 * ( 0.4 + clump );
		hangStrand( new THREE.Vector3( mezzX - 0.05 + ( rng() - 0.5 ) * 0.12, mezzY - 0.35, z ), Math.min( len, mezzY - 0.5 ), rng, ivy, { leafScale: 0.09, density: 0.9 } );

	}

	// 2) 前墙出口左上方垂下的长帘（框住出口）
	for ( let x = x0 + 0.3; x < - door.hw - 0.9; x += 0.12 + rng() * 0.1 ) {

		const top = ceil - 0.6 - rng() * 0.6;
		hangStrand( new THREE.Vector3( x, top, zFront + 0.15 + rng() * 0.15 ), 2.5 + rng() * 4.2, rng, ivy, { leafScale: 0.1, density: 1.0 } );

	}

	// 出口前第一根钢梁（z = zFront + 2.5）上垂下的藤条：在明亮门洞前形成逆光剪影
	for ( let x = - 3.6; x < - 0.6; x += 0.1 + rng() * 0.14 ) {

		const k = 1 - ( x + 3.6 ) / 3.0; // 越靠左越长
		hangStrand( new THREE.Vector3( x, ceil - 0.55, zFront + 2.5 + ( rng() - 0.5 ) * 0.2 ), 2.2 + rng() * 2.2 + k * 2.6, rng, ivy, { leafScale: 0.095, density: 0.95 } );

	}

	for ( let x = 1.2; x < 2.6; x += 0.18 + rng() * 0.2 ) hangStrand( new THREE.Vector3( x, ceil - 0.55, zFront + 2.5 ), 0.8 + rng() * 2.2, rng, ivy, { leafScale: 0.09, density: 0.8 } );

	// 前景：镜头左上方两根钢梁（z≈1.1 / 5.3）垂下的厚帘，框住画面左侧（参考图的垂挂常春藤帘幕）
	for ( const [ bz, xr, lenK ] of [ [ 5.3, 2.4, 1.0 ], [ 1.1, 2.0, 0.8 ], [ - 3.1, 1.6, 0.7 ] ] ) {

		for ( let x = mezzX + 0.1; x < mezzX + xr; x += 0.07 + rng() * 0.08 ) {

			const k = 1 - ( x - mezzX ) / xr; // 越靠墙越长越密
			const len = ( 1.5 + rng() * 2.5 + k * 3.2 ) * lenK;
			hangStrand( new THREE.Vector3( x, ceil - 0.55, bz + ( rng() - 0.5 ) * 0.3 ), Math.min( len, ceil - 1.3 ), rng, ivy, { leafScale: 0.1, density: 0.75 + k * 0.3 } );

		}

	}

	// 右侧钢梁上稀疏的几条
	for ( const bz of [ 1.1, - 3.1 ] ) for ( let x = 3.4; x < 6.8; x += 0.3 + rng() * 0.5 ) hangStrand( new THREE.Vector3( x, ceil - 0.55, bz ), 0.8 + rng() * 2.6, rng, ivy, { leafScale: 0.09, density: 0.7 } );

	// 拱顶上方零星垂下的几条
	for ( let i = 0; i < 9; i ++ ) {

		const x = - door.hw + rng() * door.hw * 1.3;
		hangStrand( new THREE.Vector3( x, ceil - 0.6, zFront + 0.12 + rng() * 0.2 ), 1.0 + rng() * 2.4, rng, ivy, { leafScale: 0.085, density: 0.7 } );

	}

	// 3) 前墙墙面常春藤（出口两侧，从墙根和高处同时蔓延）
	growWallIvy( { origin: new THREE.Vector3( x0, 0, zFront + 0.005 ), uDir: new THREE.Vector3( 1, 0, 0 ), normal: new THREE.Vector3( 0, 0, 1 ), width: x0 * - 1 - door.hw - 0.6, height: ceil - 0.6 }, {
		seeds: [ [ 0.6, 0.3 ], [ 1.8, 0.4 ], [ 3.0, 0.3 ], [ 4.0, 0.5 ], [ 1.2, 4 ], [ 2.6, 6 ] ], rng, steps: 170,
		density: ( u, v ) => 0.75 - Math.max( 0, v - 6 ) * 0.2,
	}, ivy );
	growWallIvy( { origin: new THREE.Vector3( door.hw + 0.8, 0, zFront + 0.005 ), uDir: new THREE.Vector3( 1, 0, 0 ), normal: new THREE.Vector3( 0, 0, 1 ), width: x1 - door.hw - 0.8, height: ceil - 0.6 }, {
		seeds: [ [ 0.5, 0.3 ], [ 1.6, 0.3 ], [ 3.2, 0.4 ] ], rng, steps: 120,
		density: ( u, v ) => 0.55,
	}, ivy );
	// 左墙夹层下方（种植池上方）
	growWallIvy( { origin: new THREE.Vector3( x0 + 0.005, 0, zBack ), uDir: new THREE.Vector3( 0, 0, - 1 ), normal: new THREE.Vector3( 1, 0, 0 ), width: zBack - zFront, height: mezzY - 0.2 }, {
		seeds: Array.from( { length: 12 }, ( _, i ) => [ 1 + i * 1.9, 0.3 ] ), rng, steps: 110,
		density: () => 0.8,
	}, ivy );
	scene.add( buildFoliage( ivy, { sway: 0.004, backLight: { pos: [ 0, 2.6, zFront - 2 ], range: 16, k: 9 } } ) );

	// 蕨类：种植池、夹层边缘
	const fernParts = M.fern_02.parts;
	const fernNames = Object.keys( fernParts );
	const fb = new InstanceBatch();
	for ( const [ z, len ] of [ [ - 8.0, 3.2 ], [ - 3.2, 3.2 ], [ 1.6, 3.0 ] ] ) {

		for ( let i = 0; i < 9; i ++ ) {

			const zz = z + ( rng() - 0.5 ) * ( len - 0.3 );
			fb.add( fernParts, fernNames[ i % 4 ], trs( mezzX - 0.1 + ( rng() - 0.5 ) * 0.7, 0.45, zz, rng() * 6.28, 1.5 + rng() * 1.3 ) );

		}

	}

	for ( let z = zFront + 0.6; z < zBack; z += 0.9 + rng() * 0.8 ) fb.add( fernParts, fernNames[ Math.floor( rng() * 4 ) ], trs( mezzX - 0.5 - rng() * 0.6, mezzY + 0.16, z, rng() * 6.28, 1.2 + rng() * 1.2 ) );
	// Fallen planter soil supports irregular foreground fern silhouettes.
	for ( let i = 0; i < 16; i ++ ) {
		fb.add( fernParts, fernNames[ i % fernNames.length ], trs( -2.6 + rng() * 1.1, 0.08, -2.0 + rng() * 4.0, rng() * 6.28, 1.4 + rng() * 1.6 ) );
	}
	const ferns = fb.build();
	ferns.traverse( ( o ) => {

		if ( o.isMesh && ! o.material.userData.done ) {

			const m = o.material;
			const h = hash( instanceIndex );
			m.colorNode = mix( vec3( 0.045, 0.075, 0.02 ), vec3( 0.08, 0.1, 0.03 ), h ).mul( luminance( texture( m.map, uv() ).rgb ).mul( 3.2 ) );
			m.userData.done = true;

		}

	} );
	scene.add( ferns );

	// 睡莲叶：成簇分布，左侧和前景较多，避开船
	const lilies = [];
	const clusters = [ [ - 3.2, 4.5, 1.6 ], [ - 2.5, 0.5, 1.4 ], [ - 3.4, - 4.5, 1.8 ], [ 2.4, 5.5, 1.0 ], [ 2.8, - 2, 1.4 ], [ - 1.5, - 8.5, 1.2 ], [ 1.8, - 10.5, 1.1 ], [ 5.8, 1.5, 1.2 ], [ - 5.8, 7, 1.2 ] ];
	for ( const [ cx, cz, r ] of clusters ) {

		const n = Math.floor( 16 + r * 14 );
		for ( let i = 0; i < n; i ++ ) {

			const a = rng() * 6.28, d = Math.sqrt( rng() ) * r;
			const x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			if ( Math.abs( x - 1.6 ) < 0.92 && z > -4.2 && z < 0.2 ) continue; // 船体位置
			if ( x < mezzX + 0.05 && x > mezzX - 0.8 ) continue; // 种植池
			const s = 0.045 + Math.pow( rng(), 1.8 ) * 0.13;
			lilies.push( trs( x, WATER_Y, z, rng() * 6.28, s ) );

		}

	}

	const lilyMesh = new THREE.InstancedMesh( detailedLilyGeometry(), detailedLilyMaterial(), lilies.length );
	lilies.forEach( ( m, i ) => lilyMesh.setMatrixAt( i, m ) );
	lilyMesh.receiveShadow = true;
	lilyMesh.computeBoundingSphere();
	scene.add( lilyMesh );

	// 漂浮木板 / 杂物
	const planks = [];
	for ( let i = 0; i < 7; i ++ ) {

		const x = ( rng() - 0.5 ) * 11, z = - 12 + rng() * 18;
		if ( Math.abs( x ) < 1.2 && z > 0 ) continue;
		planks.push( box( 0.9 + rng() * 1.2, 0.04, 0.12 + rng() * 0.1, x, 0.005, z, { ry: rng() * 3.14, rx: ( rng() - 0.5 ) * 0.04, bevel: 0.01 } ) );

	}

	scene.add( meshOf( merge( planks ), oldWood( { tint: 0x3c342a, scale: 1 } ) ) );

	// ================= 灯光 =================
	// 太阳：从出口后上方照进来（门洞内形成光斑和体积光束），门外草地被照亮
	const sun = new THREE.DirectionalLight( 0xdde8ed, 2.2 );
	sun.position.set( - 6, 14, zFront - 22 );
	sun.target.position.set( 0, 0, zFront + 2 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 4096, 4096 );
	const sc = sun.shadow.camera;
	sc.left = - 22; sc.right = 22; sc.top = 22; sc.bottom = - 22; sc.near = 1; sc.far = 70;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.03;
	sun.shadow.radius = 3;
	sc.layers.enable( ROOF_LAYER ); // 屋顶即使在俯视镜头中隐藏，也照样挡光
	sun.layers.enable( VOLUME_LAYER );
	scene.add( sun, sun.target );

	// 出口的反弹光：门洞平面上的面光源（草地的绿 + 天空的白），照亮柱子的侧面和水面
	// （面光源 RectAreaLight 在近镜面水面上会出现 LTC 网格瑕疵，改用门洞后方的大角度柔和聚光）
	const bounce = new THREE.SpotLight( 0xd9e6c8, 60, 30, 1.15, 1, 1.6 );
	bounce.position.set( 0, 2.4, zFront - 1.2 );
	bounce.target.position.set( 0, 0.6, zFront + 10 );
	scene.add( bounce, bounce.target );

	// 天窗光束：从坍塌的天窗斜射进来，照亮左侧常春藤帘幕与种植池的蕨类
	const skySpot = new THREE.SpotLight( 0xdce7eb, 900, 40, 0.16, 0.45, 2 );
	skySpot.position.set( - 4.6, 24, - 12.5 );
	skySpot.target.position.set( - 4.3, 0.4, - 4.2 );
	skySpot.castShadow = true;
	skySpot.shadow.mapSize.set( 2048, 2048 );
	skySpot.shadow.bias = - 0.0002;
	skySpot.shadow.normalBias = 0.02;
	skySpot.shadow.camera.near = 8; skySpot.shadow.camera.far = 40;
	skySpot.shadow.camera.layers.enable( ROOF_LAYER );
	skySpot.layers.enable( VOLUME_LAYER );
	scene.add( skySpot, skySpot.target );

	// 镜头后方的弱补光（大厅后部的反弹光）：只为让划艇的油漆与锈迹可读
	const fill = new THREE.SpotLight( 0xb8c8bc, 13, 14, 0.75, 1, 2 );
	fill.position.set( 2.0, 2.6, 3.4 );
	fill.target.position.set( 0.5, 0.6, -1.5 );
	scene.add( fill, fill.target );

	// 体积雾：门内一段空气中的灰尘，被阳光穿透形成光束
	const volGeo = new THREE.BoxGeometry( 14.8, 8.4, 20 );
	const fogVol = createVolumeFog( volGeo, {
		density: 0.075, steps: 14,
		noise: ( p ) => mx_fractal_noise_float( p.mul( 0.35 ).add( vec3( 0, time.mul( 0.03 ), 0 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.6 ).mul( smoothstep( 8.5, 0.5, p.y ) ),
	} );
	fogVol.position.set( 0, 4.2, zFront + 10 );
	scene.add( fogVol );

	// 距离雾：室内压暗偏绿，室外偏亮（过曝的空气透视）
	const outside = smoothstep( zFront - 1, zFront - 3, positionWorld.z );
	const fogCol = mix( vec3( 0.006, 0.009, 0.007 ), vec3( 0.19, 0.24, 0.22 ), outside );
	const fogF = mix( rangeFogFactor( 6, 60 ).mul( 0.55 ), rangeFogFactor( 26, 80 ).mul( 0.2 ), outside );
	scene.fogNode = fog( fogCol, fogF );

	// ================= 每帧更新 =================
	const ctx = {
		sun,
		update( dt, t ) {

			// 船：极缓的起伏与摇摆
			boatRoot.position.y = 0.33 + Math.sin( t * 0.7 ) * 0.008;
			boat.rotation.x = Math.sin( t * 0.55 ) * 0.008;
			boat.rotation.z = Math.sin( t * 0.43 + 1 ) * 0.005;
			// 俯视镜头：剖切屋顶与上部墙体
			// 俯视时（游戏镜头）相当于自动曝光：提高曝光与环境光，保证可读性
			const top = camera.position.y > ceil - 0.5;
			if ( top ) camera.layers.disable( ROOF_LAYER ); else camera.layers.enable( ROOF_LAYER );
			renderer.toneMappingExposure = top ? 1.9 : 1.15;
			scene.environmentIntensity = top ? 0.09 : 0.12;

		},
		pipelineOptions: {
			volumes: [ fogVol ],
			volumeIntensity: 1,
			volumeResolution: 0.5,
			bloomThreshold: 0.9,
			postLDR: ( out ) => atriumGrade( out ),
		},
		gui( gui ) {

			const f = gui.addFolder( '淹水中庭' );
			f.add( G.contrast, 'value', 0.8, 1.5 ).name( '对比' );
			f.add( G.saturation, 'value', 0, 1.5 ).name( '饱和' );
			f.add( G.lift, 'value', 0, 0.1 ).name( '黑位' );
			f.add( sun, 'intensity', 0, 20 ).name( '太阳' );
			f.add( bounce, 'intensity', 0, 200 ).name( '出口反弹光' );
			f.add( renderer, 'toneMappingExposure', 0.3, 3 ).name( '曝光' );

		},
	};
	return ctx;

}

let _ltcInit = false;
function RectAreaLightNode_init() {

	if ( _ltcInit ) return;
	THREE.RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() );
	_ltcInit = true;

}
