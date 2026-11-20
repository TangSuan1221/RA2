// 地面：破损沥青（两套贴图去平铺）+ 地面信息图驱动（裂缝/洼地积水/烘焙遮蔽/堆积物）+ 车道线磨损 + 油污/轮迹
//       积水：洼地阈值化 → 中心近镜面（平面反射 + 环境天空兜底）、边缘潮湿暗环、雨滴涟漪法线
import * as THREE from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, mix, smoothstep, positionWorld, texture, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float,
	luminance, abs, normalMap, transformNormalToView, max, min, uniform, step, reflector, positionViewDirection, normalView, dot, pow,
	time, fract, floor, sin, length, sqrt, normalize,
} from 'three/tsl';
import { L } from './layout.js';
import { texSet, untiler, weatherMat, triplanar, W } from './materials.js';
import { SHADOW_LAYER, REFLECT_LAYER } from './atmosphere.js';
import { GM } from './groundmap.js';

export const groundP = {
	puddles: uniform( 0.55 ),
	reflect: uniform( 1.0 ),
	ripple: uniform( 1.0 ),
};

function planeXZ( x0, z0, x1, z1, y = 0, seg = 1 ) {

	const g = new THREE.PlaneGeometry( x1 - x0, z1 - z0, seg, seg );
	g.rotateX( - Math.PI / 2 );
	g.translate( ( x0 + x1 ) / 2, y, ( z0 + z1 ) / 2 );
	return g;

}

// 盒子（世界空间三平面材质，不依赖 UV）
export function boxGeo( x0, y0, z0, x1, y1, z1 ) {

	const g = new THREE.BoxGeometry( x1 - x0, y1 - y0, z1 - z0 );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	return g;

}

// 地面信息图采样（世界 xz → uv）
export const gmSample = ( pw ) => texture( GM.tex, pw.sub( vec2( GM.x0, GM.z0 ) ).div( vec2( GM.x1 - GM.x0, GM.z1 - GM.z0 ) ) );

// 雨滴涟漪：网格化的扩散圆环（每格一个随机相位），返回切线空间扰动 xy
const ripples = Fn( ( [ p ] ) => {

	const acc = vec2( 0 ).toVar();
	for ( let k = 0; k < 2; k ++ ) {

		const q = p.mul( 2.6 + k * 1.3 ).add( k * 17.3 );
		const id = floor( q );
		const f = fract( q ).sub( 0.5 );
		const h = fract( sin( id.dot( vec2( 127.1, 311.7 ) ) ).mul( 43758.5453 ) );
		const h2 = fract( sin( id.dot( vec2( 269.5, 183.3 ) ) ).mul( 43758.5453 ) );
		const c = vec2( h, h2 ).sub( 0.5 ).mul( 0.6 );
		const d = f.sub( c );
		const r = length( d );
		const t = fract( time.mul( 0.9 ).add( h ).add( h2.mul( 3.7 ) ) );
		const ring = sin( r.sub( t.mul( 0.45 ) ).mul( 60 ) ).mul( smoothstep( 0.06, 0.0, abs( r.sub( t.mul( 0.45 ) ) ) ) ).mul( t.oneMinus().pow( 2 ) );
		acc.addAssign( d.div( r.max( 0.001 ) ).mul( ring ) );

	}

	return acc;

} );

// 沥青材质（refl：平面反射节点，积水处使用）
function roadMaterial( refl ) {

	const A = texSet( 'road_damaged', '2k' ), B = texSet( 'asphalt_02', '2k' ), LV = texSet( 'dry_decay_leaves', '1k' ), MO = texSet( 'concrete_moss', '1k' );
	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 1, metalness: 0 } );
	const pw = positionWorld.xz;
	const gm = gmSample( pw );
	const crackD = gm.r.mul( 0.5 ); // 米
	const depth = gm.g, occl = gm.b, accum = gm.a;

	const uvA = pw.div( 2.2 ), uvB = pw.div( 3.0 ).add( 0.5 );
	const big = mx_fractal_noise_float( vec3( pw.mul( 0.045 ), 1.7 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const kAB = smoothstep( 0.4, 0.6, big );
	const uA = untiler( uvA ), uB = untiler( uvB, 1.3 );
	const dA = uA( A.diff ).rgb, dB = uB( B.diff ).rgb;
	const armA = uA( A.arm ), armB = uB( B.arm );
	let col = mix( dA, dB.mul( 0.92 ), kAB );
	col = mix( vec3( luminance( col ) ), col, 0.6 ).mul( 0.72 ); // 沥青基本无彩、偏深（旧沥青）
	// 大尺度色斑（补丁修补、褪色）+ 修补沥青块（深色矩形）
	const blot = mx_fractal_noise_float( vec3( pw.mul( 0.13 ), 3.1 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
	col = col.mul( mix( float( 0.55 ), float( 1.0 ), blot ) );
	const pq = floor( pw.div( vec2( 2.6, 4.2 ) ) );
	const ph = fract( sin( pq.dot( vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) );

	// —— 车道线：中央双黄线 + 白色虚线 + 路口斑马线 + 停止线（磨损严重）——
	const x = positionWorld.x, z = positionWorld.z;
	const onMain = step( abs( x ), L.roadHalf ).mul( step( z, L.cross.z0 ).add( step( L.cross.z1, z ) ) );
	const yellow = smoothstep( 0.07, 0.05, abs( abs( x ).sub( 0.18 ) ) ).mul( onMain );
	const dash = step( z.div( 9 ).fract(), 0.36 );
	const white = smoothstep( 0.07, 0.05, abs( abs( x ).sub( 3.5 ) ) ).mul( dash ).mul( onMain );
	const inZebraZ = step( abs( z.sub( L.cross.z1 + 2.2 ) ), 1.6 ).add( step( abs( z.sub( L.cross.z0 - 2.2 ) ), 1.6 ) );
	const zebra = inZebraZ.mul( step( x.add( 100 ).div( 1.1 ).fract(), 0.5 ) ).mul( step( abs( x ), L.roadHalf - 0.4 ) );
	const stop = step( abs( z.sub( L.cross.z1 + 4.4 ) ), 0.2 ).mul( step( 0, x ) ).mul( step( x, L.roadHalf - 0.4 ) );
	const wear = smoothstep( 0.35, 0.75, mx_fractal_noise_float( vec3( pw.mul( 1.6 ), 0 ), 3, 2.0, 0.6 ).mul( 0.5 ).add( 0.5 ).add( luminance( dA ).mul( 0.8 ) ).sub( 0.25 ) );
	const paintK = white.add( zebra ).add( stop ).clamp();
	col = mix( col, vec3( 0.36, 0.29, 0.13 ), yellow.mul( wear ).mul( 0.8 ) );
	col = mix( col, vec3( 0.22, 0.22, 0.21 ), paintK.mul( wear ).mul( 0.65 ) );

	// —— 轮迹污渍与油斑（车道中心偏深、条状）——
	const lane = abs( x ).mod( 3.5 );
	const track = smoothstep( 0.5, 0.1, abs( lane.sub( 1.75 ) ) ).mul( onMain ).mul( mx_fractal_noise_float( vec3( x.mul( 0.5 ), z.mul( 0.05 ), 2 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) );
	col = col.mul( mix( float( 1 ), float( 0.72 ), track.mul( 0.7 ) ) );
	const oil = smoothstep( 0.72, 0.8, mx_fractal_noise_float( vec3( pw.mul( 0.5 ), 11 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) );
	col = mix( col, vec3( 0.025, 0.025, 0.028 ), oil.mul( 0.7 ) );

	// —— 裂缝（信息图距离场，线宽随噪声 1.5–5cm）——
	const cw = mx_noise_float( vec3( pw.mul( 3.0 ), 2 ) ).mul( 0.5 ).add( 0.5 ).mul( 0.05 ).add( 0.022 );
	const crack = smoothstep( cw, cw.mul( 0.4 ), crackD );
	const crackEdge = smoothstep( cw.mul( 5 ), cw, crackD ); // 裂缝两侧的破碎、泥与苔
	const mossN = mx_fractal_noise_float( vec3( pw.mul( 0.4 ), 5.0 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const mtex = triplanar( MO.diff, 0.5 ).rgb;
	const mossCol = mix( vec3( W.mossColor ), vec3( W.mossColor2 ), mossN ).mul( luminance( mtex ).mul( 1.4 ).add( 0.45 ) );
	col = mix( col, col.mul( 0.5 ), crackEdge.mul( 0.75 ) );
	col = mix( col, mix( vec3( 0.03, 0.03, 0.025 ), mossCol, smoothstep( 0.4, 0.6, mossN ) ), crack );

	// —— 堆积物：泥 + 落叶 + 苔藓（路缘、裂缝两侧、车辆周围）——
	const lv = untiler( pw.div( 1.6 ), 2.1 )( LV.diff ).rgb;
	const lvK = smoothstep( 0.35, 0.7, accum.add( mossN.mul( 0.25 ) ).sub( 0.1 ) );
	const dirt = mix( vec3( 0.07, 0.065, 0.05 ), mix( vec3( luminance( lv ) ).mul( vec3( 0.95, 0.85, 0.7 ) ), lv, 0.5 ).mul( 0.8 ), smoothstep( 0.5, 0.8, accum ) );
	col = mix( col, dirt, lvK.mul( 0.85 ) );
	col = mix( col, mossCol, smoothstep( 0.55, 0.85, accum.mul( mossN.add( 0.4 ) ) ).mul( 0.75 ) );

	// —— 积水：洼地阈值化；中心水体、边缘潮湿暗环 ——
	const edgeN = mx_noise_float( vec3( pw.mul( 2.3 ), 0 ) ).mul( 0.07 ).add( mx_noise_float( vec3( pw.mul( 7.0 ), 3 ) ).mul( 0.03 ) );
	const pv = depth.add( edgeN );
	const th = float( 0.58 ).sub( groundP.puddles.mul( 0.3 ) );
	const water = smoothstep( th, th.add( 0.035 ), pv );
	const damp = smoothstep( th.sub( 0.09 ), th, pv );
	const wetK = max( W.wet.mul( 0.28 ), damp );
	col = col.mul( mix( float( 1 ), float( 0.58 ), wetK ) );
	// 积水底：深色浑水（albedo × 0.3）
	col = mix( col, col.mul( 0.22 ).add( vec3( 0.002, 0.003, 0.003 ) ), water );
	// 烘焙遮蔽（车底、路障、墙脚）只压漫反射
	col = col.mul( occl.mul( occl ) );
	m.colorNode = col;

	// —— 法线：沥青法线（积水处抹平）+ 雨滴涟漪 ——
	const nA = uA( A.nor ).rgb, nB = uB( B.nor ).rgb;
	const rip = ripples( pw ).mul( groundP.ripple ).mul( 0.5 );
	const nTex = mix( mix( nA, nB, kAB ), vec3( vec2( 0.5 ).add( rip.mul( 0.5 ) ), 1 ), water );
	m.normalNode = normalMap( vec4( nTex, 1 ), vec2( mix( float( 1.8 ), float( 1 ), water ) ) );

	// —— 平面反射：积水镜面（涟漪扰动 uv），湿沥青弱反射；菲涅尔 F0=0.02 ——
	const ndv = dot( positionViewDirection.negate(), normalView ).abs().clamp();
	const fres = pow( float( 1 ).sub( ndv ), 5 ).mul( 0.98 ).add( 0.02 );
	// 涟漪扰动 + 低频水面起伏（倒影边缘不再是硬直线）；mip 模糊（脏水、细雨）
	const wob = vec2( mx_noise_float( vec3( pw.mul( 1.3 ), time.mul( 0.2 ) ) ), mx_noise_float( vec3( pw.mul( 1.3 ).add( 5 ), time.mul( 0.2 ) ) ) ).mul( 0.012 );
	refl.uvNode = refl.uvNode.add( rip.mul( 0.02 ).add( wob ).mul( water ) );
	const reflC = refl.level( float( 2.4 ) );
	// 俯视（ndv→1）时水面几乎只透出浑水底色，掠射角才是镜面；涟漪处反射被打散
	const rk = water.mul( fres.mul( 0.95 ) ).mul( float( 1 ).sub( length( rip ).mul( 2 ).clamp( 0, 0.5 ) ) ).add( wetK.mul( fres ).mul( 0.05 ) ).mul( groundP.reflect );
	m.emissiveNode = reflC.rgb.mul( rk ).mul( occl.mul( 0.5 ).add( 0.5 ) );

	const rough = mix( armA.g, armB.g, kAB );
	// 积水处镜面主要由平面反射给出；环境高光粗糙度取 0.35（兜底：射线落空时仍有天空高光）
	m.roughnessNode = mix( mix( rough.max( 0.75 ), rough.mul( 0.6 ), wetK ), float( 0.22 ), water ).max( 0.06 );
	// 干沥青的掠射角环境高光过强（整条街发白）：干燥区按菲涅尔压低间接光；积水区保留（由平面反射接管）
	const dryK = water.oneMinus().mul( damp.oneMinus() );
	// 镜面强度：干沥青 F0 远低于 0.04（多孔、积灰），湿区/积水恢复；遮蔽处一并压低
	// 积水：镜面全部由平面反射给出（含天空背景 + 楼体遮挡 → 倒影有明暗），环境高光只留 15% 作兜底
	m.specularIntensityNode = mix( mix( float( 0.25 ), float( 0.7 ), damp ), float( 0.15 ), water ).mul( occl );
	m.aoNode = mix( armA.r, armB.r, kAB ).mul( occl ).mul( crack.oneMinus().mul( 0.6 ).add( 0.4 ) ).mul( mix( float( 1 ), float( 0.45 ), fres.mul( dryK ) ) );
	m.userData.water = water;
	return m;

}

// 人行道材质（方砖）+ 信息图（树根顶裂、积水、遮蔽、堆积物）
function walkMaterial() {

	const T = texSet( 'concrete_tiles', '2k' ), LV = texSet( 'dry_decay_leaves', '1k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, color: 0xb8b8b0 } );
	const pw0 = positionWorld.xz;
	const gm = gmSample( pw0 );
	const pw = pw0.div( 1.85 );
	const u = untiler( pw );
	const d = u( T.diff ).rgb;
	const arm = u( T.arm );
	const lv = untiler( pw0.div( 1.6 ), 2.1 )( LV.diff ).rgb;
	const acc = smoothstep( 0.35, 0.75, gm.a );
	let base = mix( d.mul( vec3( 0.7, 0.71, 0.69 ) ), mix( vec3( luminance( lv ) ), lv, 0.5 ).mul( 0.7 ), acc.mul( 0.8 ) );
	const crack = smoothstep( 0.03, 0.01, gm.r.mul( 0.5 ) );
	base = mix( base, vec3( 0.03, 0.035, 0.025 ), crack );
	const water = smoothstep( 0.55, 0.6, gm.g );
	base = mix( base, base.mul( 0.35 ), water );
	weatherMat( m, { moss: 1.4, streak: 0, grime: 1, baseNode: base.mul( gm.b.mul( gm.b ) ), roughNode: mix( arm.g, float( 0.08 ), water ) } );
	m.aoNode = arm.r.mul( gm.b );
	m.normalNode = normalMap( vec4( mix( u( T.nor ).rgb, vec3( 0.5, 0.5, 1 ), water ), 1 ) );
	return m;

}

export function buildGround( camera ) {

	const group = new THREE.Group();

	// 主沥青面（覆盖整个街区网格，楼下被遮住）
	const refl = reflector( { resolutionScale: 0.5, bounces: false, generateMipmaps: true } );
	refl.target.rotateX( - Math.PI / 2 );
	refl.target.position.y = 0.005;
	// 预先登记反射相机：只渲染 REFLECT_LAYER
	const vcam = camera.clone();
	vcam.layers.set( REFLECT_LAYER );
	refl.reflector.virtualCameras.set( camera, vcam );
	const road = new THREE.Mesh( planeXZ( - 160, - 240, 160, 60, 0 ), roadMaterial( refl ) );
	road.receiveShadow = true;
	road.name = 'road';
	group.add( road );
	group.add( refl.target );

	// 人行道 + 路缘：主街两侧（被横街截断）+ 横街两侧
	const walk = walkMaterial();
	const curbMat = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	{

		const T = texSet( 'brushed_concrete', '1k' );
		weatherMat( curbMat, { moss: 1.3, streak: 0.3, baseNode: triplanar( T.diff, 0.6 ).rgb.mul( 0.62 ), roughNode: triplanar( T.arm, 0.6 ).g } );

	}

	const geos = [], curbs = [];
	const r = L.roadHalf, w = L.walk, c = L.curb;
	const zSeg = [ [ L.cross.z1, L.zNear ], [ L.zFar, L.cross.z0 ] ];
	for ( const s of [ - 1, 1 ] ) {

		for ( const [ z0, z1 ] of zSeg ) {

			const xa = s > 0 ? r : - r - w, xb = s > 0 ? r + w : - r;
			geos.push( boxGeo( xa, - 0.2, z0, xb, c, z1 ) );
			const cx = s > 0 ? r : - r - 0.28;
			curbs.push( boxGeo( cx, - 0.2, z0, cx + 0.28, c + 0.012, z1 ) );

		}

		// 横街两侧人行道
		for ( const [ za, zb ] of [ [ L.cross.z1, L.cross.z1 + w ], [ L.cross.z0 - w, L.cross.z0 ] ] ) {

			const xa = s > 0 ? r + w : - L.crossFar, xb = s > 0 ? L.crossFar : - r - w;
			geos.push( boxGeo( xa, - 0.2, za, xb, c, zb ) );
			const cz = za === L.cross.z1 ? L.cross.z1 : L.cross.z0 - 0.28;
			curbs.push( boxGeo( xa, - 0.2, cz, xb, c + 0.012, cz + 0.28 ) );

		}

	}

	for ( const g of geos ) { const mesh = new THREE.Mesh( g, walk ); mesh.receiveShadow = true; group.add( mesh ); }
	for ( const g of curbs ) { const mesh = new THREE.Mesh( g, curbMat ); mesh.receiveShadow = true; group.add( mesh ); }

	// 井盖与排水箅子（俯视镜头的细节锚点）
	const T = texSet( 'rusty_metal_02', '1k' );
	const iron = new THREE.MeshStandardNodeMaterial( { roughness: 0.8, metalness: 0.6 } );
	const ip = positionWorld.xz;
	const rings = sin( length( fract( ip.div( 0.9 ).add( 0.5 ) ).sub( 0.5 ) ).mul( 60 ) );
	weatherMat( iron, { moss: 0.8, streak: 0, baseNode: triplanar( T.diff, 1.0 ).rgb.mul( 0.35 ).mul( rings.mul( 0.15 ).add( 0.85 ) ), roughNode: float( 0.6 ) } );
	const mh = new THREE.CylinderGeometry( 0.42, 0.42, 0.02, 24 );
	const mhPos = [ [ 2.2, 18 ], [ - 3.8, - 15 ], [ 4.4, - 36 ], [ - 1.6, - 62 ], [ 20, - 14 ], [ - 22, - 17 ] ];
	const mi = new THREE.InstancedMesh( mh, iron, mhPos.length );
	mhPos.forEach( ( [ x, z ], i ) => mi.setMatrixAt( i, new THREE.Matrix4().makeTranslation( x, 0.006, z ) ) );
	mi.receiveShadow = true;
	group.add( mi );
	const grate = new THREE.BoxGeometry( 0.9, 0.02, 0.45 );
	const gPos = [];
	for ( let z = 34; z > - 140; z -= 13 ) for ( const s of [ - 1, 1 ] ) if ( z < L.cross.z0 - 1 || z > L.cross.z1 + 1 ) gPos.push( [ s * ( L.roadHalf - 0.3 ), z + ( s > 0 ? 4 : 0 ) ] );
	const gi = new THREE.InstancedMesh( grate, iron, gPos.length );
	gPos.forEach( ( [ x, z ], i ) => gi.setMatrixAt( i, new THREE.Matrix4().makeTranslation( x, 0.006, z ) ) );
	group.add( gi );
	return group;

}
