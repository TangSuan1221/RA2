// 程序化废弃车辆：轿车 / 旅行车 / 皮卡 三种车身 + 公交车
// 每种车身按材质合并为少量网格（车漆、玻璃、饰件[顶点色]、轮胎），所有同型车实例化（每型 4 次绘制）
// 车漆：每实例的油漆色 + 种子（自定义实例属性 paint），锈蚀按 局部高度/轮拱距离/噪声 分层；朝上面苔藓落叶（weatherMat）
// 轮胎：泄气（底部压平外鼓）；车身按实例随机侧倾（单侧爆胎），保证最低点贴地
import * as THREE from 'three/webgpu';
import {
	float, vec2, vec3, vec4, mix, smoothstep, step, positionGeometry, normalGeometry, attribute, luminance, abs, length, max, min,
	mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, mx_worley_noise_vec2, fract, sin, texture, uv, positionWorld, vertexColor,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texSet, triplanar, weatherMat, W } from './materials.js';
import { SHADOW_LAYER, REFLECT_LAYER } from './atmosphere.js';
import { rng } from './noise.js';

// —— 几何工具 ——
// 统一属性：position / normal / uv / color（非索引），便于合并
function prep( g, color = null ) {

	color = color || [ 1, 1, 1 ];

	let q = g.index ? g.toNonIndexed() : g;
	if ( ! q.attributes.normal ) q.computeVertexNormals();
	if ( ! q.attributes.uv ) q.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( q.attributes.position.count * 2 ), 2 ) );
	const n = q.attributes.position.count;
	const c = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) c.set( color, i * 3 );
	q.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
	for ( const k of Object.keys( q.attributes ) ) if ( ! [ 'position', 'normal', 'uv', 'color' ].includes( k ) ) q.deleteAttribute( k );
	return q;

}

const box = ( sx, sy, sz, x, y, z, color, rz = 0, ry = 0 ) => {

	const g = new THREE.BoxGeometry( sx, sy, sz );
	if ( rz ) g.rotateZ( rz );
	if ( ry ) g.rotateY( ry );
	g.translate( x, y, z );
	return prep( g, color );

};

// 侧视轮廓 → 沿宽度挤出（局部：x = 车长方向，车头朝 +x；y 向上；z = 宽度方向）
function extrudeProfile( pts, width, { bevel = 0.04, arches = null, taperTop = 0, taperEnds = 0, yBelt = 0.6, endX = 2.3, tumble = 0.05 } = {} ) {

	const s = new THREE.Shape();
	if ( arches ) {

		// 底边带轮拱：pts 只给上轮廓（从车头下方开始，逆时针到车尾下方），底边由轮拱自动生成
		const [ xr, xf, r, cy, yb ] = arches;
		const first = pts[ 0 ], last = pts[ pts.length - 1 ];
		s.moveTo( last[ 0 ], yb );
		s.lineTo( xr - r, yb );
		s.absarc( xr, cy, r, Math.PI, 0, true );
		s.lineTo( xf - r, yb );
		s.absarc( xf, cy, r, Math.PI, 0, true );
		s.lineTo( first[ 0 ], yb );
		for ( const p of pts ) s.lineTo( p[ 0 ], p[ 1 ] );
		s.closePath();

	} else {

		s.moveTo( pts[ 0 ][ 0 ], pts[ 0 ][ 1 ] );
		for ( const p of pts.slice( 1 ) ) s.lineTo( p[ 0 ], p[ 1 ] );
		s.closePath();

	}

	const g = new THREE.ExtrudeGeometry( s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 } );
	g.translate( 0, 0, - ( width - bevel * 2 ) / 2 );
	// 侧面内收（tumblehome）+ 车顶收窄 + 首尾在俯视平面上收圆
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		let k = 1 - tumble * Math.max( 0, y - yBelt ) / 0.4;
		k *= 1 - taperTop * Math.max( 0, y - yBelt );
		const e = Math.max( 0, ( Math.abs( x ) - ( endX - 0.5 ) ) / 0.5 );
		k *= 1 - taperEnds * e * e;
		p.setZ( i, z * k );

	}

	g.computeVertexNormals();
	return g;

}

// 轮胎（车轮轴沿 z），泄气：底部压平、侧壁外鼓
function tireGeo( R = 0.33, Wd = 0.21, flat = 0.04 ) {

	const prof = [ [ 0.2, - Wd / 2 ], [ R - 0.03, - Wd / 2 - 0.005 ], [ R - 0.005, - Wd / 2 + 0.03 ], [ R, 0 ], [ R - 0.005, Wd / 2 - 0.03 ], [ R - 0.03, Wd / 2 + 0.005 ], [ 0.2, Wd / 2 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) );
	const g = new THREE.LatheGeometry( prof, 22 );
	g.rotateX( Math.PI / 2 );
	const p = g.attributes.position;
	const yMin = - R + flat;
	for ( let i = 0; i < p.count; i ++ ) {

		const y = p.getY( i );
		if ( y < yMin ) {

			const t = ( yMin - y ) / flat;
			p.setY( i, yMin );
			p.setZ( i, p.getZ( i ) * ( 1 + 0.25 * t ) );

		}

	}

	g.computeVertexNormals();
	return g;

}

function rimGeo() {

	const prof = [ [ 0.0, 0.03 ], [ 0.08, 0.035 ], [ 0.17, 0.0 ], [ 0.2, - 0.04 ], [ 0.2, - 0.09 ], [ 0.0, - 0.09 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) );
	const g = new THREE.LatheGeometry( prof, 16 );
	g.rotateX( Math.PI / 2 );
	return g;

}

// 沿两点放一根立柱（玻璃外侧），z 为侧面位置
function pillar( a, b, wdt, z, color, th = 0.03 ) {

	const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ];
	const len = Math.hypot( dx, dy );
	const g = new THREE.BoxGeometry( wdt, len + 0.04, th );
	g.rotateZ( - Math.atan2( dx, dy ) );
	g.translate( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, z );
	return prep( g, color );

}

const C = {
	chrome: [ 0.21, 0.205, 0.195 ], rubber: [ 0.035, 0.035, 0.035 ], grille: [ 0.03, 0.032, 0.03 ], head: [ 0.55, 0.56, 0.55 ],
	tail: [ 0.22, 0.03, 0.025 ], amber: [ 0.3, 0.15, 0.03 ], plate: [ 0.3, 0.29, 0.25 ], rim: [ 0.12, 0.085, 0.06 ], interior: [ 0.02, 0.02, 0.018 ],
};

// —— 车型定义 ——
function bodyDef( type ) {

	const L2 = type === 'pickup' ? 2.6 : 2.42;
	const arches = [ type === 'pickup' ? - 1.65 : - 1.45, type === 'pickup' ? 1.6 : 1.45, 0.43, 0.32, 0.24 ];
	// 下车身上轮廓（车头下 → 车尾下）
	const lower = type === 'pickup'
		? [ [ L2 - 0.02, 0.3 ], [ L2 + 0.04, 0.55 ], [ L2 - 0.05, 0.86 ], [ 1.0, 0.98 ], [ - L2 + 0.05, 0.98 ], [ - L2 - 0.02, 0.55 ], [ - L2, 0.3 ] ]
		: [ [ L2 - 0.04, 0.3 ], [ L2 + 0.02, 0.52 ], [ L2 - 0.06, 0.74 ], [ 1.18, 0.86 ], [ - 1.3, 0.88 ], [ - L2 + 0.08, 0.84 ], [ - L2 - 0.02, 0.56 ], [ - L2, 0.3 ] ];
	if ( type === 'wagon' ) lower.splice( 4, 2, [ - L2 + 0.1, 0.88 ] );
	const cabin = {
		sedan: [ [ 1.18, 0.86 ], [ 0.42, 1.36 ], [ - 0.72, 1.34 ], [ - 1.3, 0.88 ] ],
		wagon: [ [ 1.18, 0.86 ], [ 0.42, 1.38 ], [ - 2.2, 1.36 ], [ - L2 + 0.1, 0.88 ] ],
		pickup: [ [ 1.0, 0.98 ], [ 0.45, 1.6 ], [ - 0.75, 1.6 ], [ - 0.82, 0.98 ] ],
	}[ type ];
	return { L2, arches, lower, cabin, width: type === 'pickup' ? 1.9 : 1.8 };

}

function buildType( type ) {

	const d = bodyDef( type );
	const W2 = d.width / 2;
	const body = [], glass = [], trim = [];
	// 下车身
	body.push( prep( extrudeProfile( d.lower, d.width, { arches: d.arches, bevel: 0.05, yBelt: 0.55, tumble: 0.05, taperEnds: 0.1, endX: d.L2 } ) ) );
	// 玻璃舱（整体为玻璃，再用立柱/车顶覆盖）
	const cw = d.width - 0.24;
	const cab = extrudeProfile( d.cabin, cw, { bevel: 0.02, yBelt: d.cabin[ 0 ][ 1 ], taperTop: 0.32, tumble: 0 } );
	glass.push( prep( cab ) );
	// 车顶板
	const c1 = d.cabin[ 1 ], c2 = d.cabin[ 2 ];
	const topW = cw * ( 1 - 0.32 * ( c1[ 1 ] - d.cabin[ 0 ][ 1 ] ) ) + 0.04;
	body.push( prep( extrudeProfile( [ [ c1[ 0 ] + 0.02, c1[ 1 ] - 0.05 ], [ c1[ 0 ] - 0.02, c1[ 1 ] + 0.025 ], [ c2[ 0 ] + 0.02, c2[ 1 ] + 0.025 ], [ c2[ 0 ] - 0.03, c2[ 1 ] - 0.05 ] ], topW, { bevel: 0.015, tumble: 0 } ) ) );
	// 立柱：A 柱、B 柱、C 柱（两侧）
	const zAt = ( y ) => ( cw / 2 ) * ( 1 - 0.32 * ( y - d.cabin[ 0 ][ 1 ] ) ) + 0.012;
	for ( const s of [ - 1, 1 ] ) {

		const a0 = d.cabin[ 0 ], a1 = d.cabin[ 1 ], b0 = d.cabin[ 3 ], b1 = d.cabin[ 2 ];
		const zm = s * zAt( ( a0[ 1 ] + a1[ 1 ] ) / 2 );
		body.push( pillar( a0, a1, 0.08, zm, null ) );
		body.push( pillar( b0, b1, type === 'sedan' ? 0.3 : 0.12, zm, null ) );
		const bx = type === 'pickup' ? - 0.2 : - 0.12;
		body.push( pillar( [ bx, d.cabin[ 0 ][ 1 ] ], [ bx - 0.04, c1[ 1 ] ], 0.1, zm, null ) );
		if ( type === 'wagon' ) body.push( pillar( [ - 1.3, d.cabin[ 0 ][ 1 ] ], [ - 1.32, c1[ 1 ] ], 0.14, zm, null ) );
		// 后视镜
		trim.push( box( 0.12, 0.1, 0.16, a0[ 0 ] - 0.12, a0[ 1 ] + 0.06, s * ( W2 + 0.05 ), C.rubber ) );
		// 防擦条
		trim.push( box( d.L2 * 1.6, 0.05, 0.02, - 0.05, 0.58, s * ( W2 - 0.035 ), C.rubber ) );
		// 门缝（深色细线）
		for ( const x of type === 'pickup' ? [ 0.95, - 0.82 ] : [ 1.08, - 0.12, - 1.28 ] ) trim.push( box( 0.012, 0.5, 0.01, x, 0.62, s * ( W2 - 0.02 ), C.grille ) );
		// 门把手
		for ( const x of type === 'pickup' ? [ - 0.55 ] : [ - 0.05, - 1.05 ] ) trim.push( box( 0.14, 0.025, 0.02, x, 0.8, s * ( W2 - 0.03 ), C.chrome ) );

	}

	// 皮卡货斗：内凹（深色底板 + 斗壁）
	if ( type === 'pickup' ) {

		trim.push( box( 1.65, 0.02, d.width - 0.16, - 1.75, 0.99, 0, C.interior ) );

	}

	// 前后保险杠、格栅、大灯、尾灯、牌照
	const fx = d.L2 + 0.02, rx = - d.L2 - 0.02;
	trim.push( box( 0.16, 0.16, d.width - 0.02, fx + 0.02, 0.4, 0, C.chrome ) );
	trim.push( box( 0.16, 0.16, d.width - 0.02, rx - 0.02, 0.4, 0, C.chrome ) );
	trim.push( box( 0.04, 0.16, 0.9, fx + 0.005, 0.62, 0, C.grille ) );
	for ( const s of [ - 1, 1 ] ) {

		trim.push( box( 0.04, 0.13, 0.26, fx, 0.63, s * ( W2 - 0.25 ), C.head ) );
		trim.push( box( 0.04, 0.05, 0.12, fx, 0.48, s * ( W2 - 0.16 ), C.amber ) );
		trim.push( box( 0.04, 0.16, 0.3, rx + 0.01, 0.66, s * ( W2 - 0.22 ), C.tail ) );

	}

	trim.push( box( 0.02, 0.12, 0.32, rx - 0.11, 0.42, 0, C.plate ) );
	// 车内暗体（破窗时可见座椅暗影）
	trim.push( box( 1.2, 0.35, d.width - 0.5, - 0.2, 0.95, 0, C.interior ) );

	// 车轮：轮辋（锈）进饰件；轮胎单独
	const tires = [];
	const [ xr, xf ] = d.arches;
	for ( const x of [ xr, xf ] ) for ( const s of [ - 1, 1 ] ) {

		const t = tireGeo();
		t.translate( x, 0.33, s * ( W2 - 0.16 ) );
		tires.push( prep( t ) );
		const r = rimGeo();
		if ( s < 0 ) r.rotateY( Math.PI );
		r.translate( x, 0.33, s * ( W2 - 0.12 ) );
		trim.push( prep( r, C.rim ) );

	}

	const merge = ( l ) => {

		const g = mergeGeometries( l.map( ( x ) => x.clone() ) );
		g.computeBoundingSphere();
		return g;

	};

	return { body: merge( body ), glass: merge( glass ), trim: merge( trim ), tire: merge( tires ), def: d };

}

// —— 材质 ——
// 车漆：attribute('paint') = vec4(油漆 rgb, 种子)
function carPaintMat( { band = null } = {} ) {

	const R = texSet( 'rust_coarse_01', '1k' ), P = texSet( 'rusty_painted_metal', '1k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.2 } );
	const pa = attribute( 'paint', 'vec4' );
	const seed = pa.w;
	const p = positionGeometry; // 局部坐标（车身随实例移动，锈斑不"游动"）
	const ps = p.add( vec3( seed.mul( 37.0 ), seed.mul( 11.0 ), seed.mul( 23.0 ) ) );
	const rc = triplanar( R.diff, 0.9, ps, normalGeometry ).rgb;
	const rustC = mix( vec3( luminance( rc ) ), rc, 0.4 ).mul( vec3( 0.5, 0.42, 0.36 ) );
	const chip = luminance( triplanar( P.diff, 0.8, ps, normalGeometry ).rgb );
	// 多尺度：大块锈区 + 细碎锈点（避免大块迷彩斑）
	const n = mx_fractal_noise_float( ps.mul( 2.2 ), 3, 2.0, 0.5 ).mul( 0.35 ).add( mx_fractal_noise_float( ps.mul( 11.0 ), 3, 2.0, 0.6 ).mul( 0.25 ) ).add( 0.5 );
	// 锈蚀驱动：底部（溅水）、轮拱边缘、朝上面（积水）、噪声、每车锈蚀程度
	const low = smoothstep( 0.7, 0.25, p.y ).mul( 0.35 );
	const archD = min( length( vec2( p.x.sub( 1.45 ), p.y.sub( 0.32 ) ) ), length( vec2( p.x.add( 1.45 ), p.y.sub( 0.32 ) ) ) );
	const arch = smoothstep( 0.62, 0.44, archD ).mul( 0.45 );
	const up = smoothstep( 0.5, 0.9, normalGeometry.y ).mul( 0.22 );
	const level = seed.mul( 0.35 ).add( 0.1 );
	const rk = smoothstep( 0.72, 0.8, n.add( low ).add( arch ).add( up ).add( chip.mul( 0.25 ) ).add( level ) );
	// 锈边晕染（锈斑周围油漆起泡发褐）
	const halo = smoothstep( 0.6, 0.72, n.add( low ).add( arch ).add( up ).add( chip.mul( 0.25 ) ).add( level ) ).sub( rk );
	let paint = pa.xyz;
	if ( band ) paint = mix( paint, vec3( band.x, band.y, band.z ), step( band.y0, p.y ).mul( step( p.y, band.y1 ) ) );
	const faded = mix( paint, vec3( luminance( paint ) ), smoothstep( 0.3, 0.9, normalGeometry.y ).mul( 0.5 ) ); // 顶面日晒褪色
	const paintC = faded.mul( chip.mul( 0.35 ).add( 0.7 ) ).mul( 0.85 );
	let base = mix( paintC, paintC.mul( vec3( 0.6, 0.48, 0.38 ) ), halo.mul( 0.8 ) );
	base = mix( base, rustC, rk );
	// 灰尘层：朝上面浅灰尘
	const dust = smoothstep( 0.4, 0.95, normalGeometry.y ).mul( mx_noise_float( ps.mul( 3.3 ) ).mul( 0.3 ).add( 0.6 ) );
	base = mix( base, vec3( 0.12, 0.115, 0.1 ), dust.mul( 0.45 ) );
	weatherMat( m, { moss: 0.3, streak: 0.5, grime: 1.3, baseNode: base, roughNode: mix( mix( float( 0.38 ), float( 0.75 ), dust ), float( 0.95 ), rk ) } );
	m.metalnessNode = mix( float( 0.3 ), float( 0.05 ), max( rk, dust ) );
	return m;

}

// 车窗玻璃：深色、低粗糙度（反射天空），脏污遮罩、龟裂纹；部分车窗全碎（暗洞）
function carGlassMat() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.05, metalness: 0 } );
	const pa = attribute( 'paint', 'vec4' );
	const seed = pa.w;
	const p = positionGeometry;
	const dirt = smoothstep( 0.35, 0.8, mx_fractal_noise_float( p.mul( 2.5 ).add( seed.mul( 9 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ).add( smoothstep( 1.1, 0.85, p.y ).mul( 0.3 ) ) );
	// 龟裂：Worley 边 + 冲击点放射
	const imp = vec3( seed.mul( 2.4 ).sub( 1.2 ), 1.15, seed.mul( 7.0 ).fract().sub( 0.5 ) );
	const di = length( p.sub( imp ) );
	// 冲击点放射裂纹：极坐标角度噪声 + 少量同心环，只在冲击点附近；只有部分车有
	const dv = p.sub( imp );
	const ang = dv.z.atan( dv.x.add( 0.0001 ) );
	const radial = smoothstep( 0.92, 1.0, mx_noise_float( vec3( ang.mul( 9.0 ), seed.mul( 13 ), 0 ) ).mul( 0.5 ).add( 0.5 ) );
	const ring = smoothstep( 0.015, 0.0, abs( fract( di.mul( 9.0 ) ).sub( 0.5 ) ).sub( 0.47 ).max( 0 ) );
	const cracks = radial.add( ring.mul( 0.3 ) ).clamp().mul( smoothstep( 0.45, 0.02, di ) ).mul( step( 0.35, fract( seed.mul( 5.3 ) ) ) );
	const broken = step( 0.72, seed ); // 碎窗车
	const col = mix( vec3( 0.012, 0.015, 0.016 ), vec3( 0.09, 0.09, 0.08 ), dirt.mul( 0.7 ) );
	m.colorNode = mix( mix( col, vec3( 0.25, 0.26, 0.25 ), cracks.mul( 0.6 ) ), vec3( 0.008 ), broken );
	m.roughnessNode = mix( mix( float( 0.04 ), float( 0.6 ), dirt ), float( 1 ), broken ).add( cracks.mul( 0.3 ) ).min( 1 );
	return m;

}

function trimMat() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.3 } );
	const p = positionWorld;
	const n = mx_fractal_noise_float( p.mul( 3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const vc = vertexColor().rgb;
	const isChrome = smoothstep( 0.2, 0.3, luminance( vc ) ).mul( smoothstep( 0.05, 0.0, abs( vc.x.sub( vc.z ) ) ) );
	// 镀铬件也锈：斑驳
	const base = mix( vc, vec3( 0.14, 0.09, 0.06 ), isChrome.mul( smoothstep( 0.45, 0.7, n ) ) );
	weatherMat( m, { moss: 0.6, streak: 0.3, grime: 1.2, baseNode: base, roughNode: mix( float( 0.75 ), float( 0.3 ), isChrome ) } );
	m.metalnessNode = isChrome.mul( 0.6 );
	return m;

}

function tireMat() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.92, metalness: 0 } );
	weatherMat( m, { moss: 0.5, streak: 0, grime: 1.5, baseNode: vec3( 0.03, 0.03, 0.028 ).mul( mx_noise_float( positionWorld.mul( 6 ) ).mul( 0.3 ).add( 1 ) ), roughNode: float( 0.92 ) } );
	return m;

}

const PALETTE = [
	[ 0.16, 0.2, 0.25 ], [ 0.3, 0.1, 0.075 ], [ 0.38, 0.35, 0.29 ], [ 0.12, 0.17, 0.13 ], [ 0.42, 0.42, 0.4 ], [ 0.07, 0.07, 0.07 ],
	[ 0.24, 0.2, 0.12 ], [ 0.2, 0.24, 0.26 ], [ 0.33, 0.27, 0.16 ],
];

/**
 * 摆放车辆
 * @param {Array} list [{ x, z, ry, type, roll?, pitch?, door? }]  ry：车头方向（0 = 车头朝 -Z）
 * @returns { group, footprints: [{x,z,hw,hd,ry}] }
 */
export function makeCars( list, { groundY = () => 0 } = {} ) {

	const types = {};
	const mats = { body: carPaintMat(), glass: carGlassMat(), trim: trimMat(), tire: tireMat() };
	const group = new THREE.Group();
	const r = rng( 4242 );
	const byType = {};
	const footprints = [];
	const doors = [];
	for ( const c of list ) ( byType[ c.type || 'sedan' ] ||= [] ).push( c );
	for ( const [ type, cars ] of Object.entries( byType ) ) {

		const T = types[ type ] ||= buildType( type );
		const n = cars.length;
		const paint = new Float32Array( n * 4 );
		const matrices = cars.map( ( c, i ) => {

			const col = c.color || PALETTE[ Math.floor( r() * PALETTE.length ) ];
			paint.set( [ ...col, c.seed ?? r() ], i * 4 );
			// 车局部 +x 为车头；ry=0 时车头朝 -Z
			const roll = c.roll ?? ( r() - 0.5 ) * 0.05, pitch = c.pitch ?? ( r() - 0.5 ) * 0.03;
			const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( roll, c.ry + Math.PI / 2, pitch, 'YXZ' ) );
			// 侧倾后最低轮胎点 ≈ 抬起量：half-width × |roll| + half-wheelbase × |pitch|
			// 轮胎压平后最低点在局部 y=0.04；侧倾时取中间值，使低侧轮胎微陷、高侧轮胎刚好着地
			const y = groundY( c.x, c.z ) - 0.045 + Math.abs( roll ) * 0.42 + Math.abs( pitch ) * 0.75;
			footprints.push( { x: c.x, z: c.z, hw: T.def.L2, hd: T.def.width / 2, ry: c.ry + Math.PI / 2 } );
			if ( c.door ) doors.push( { c, q, y, T, col } );
			return new THREE.Matrix4().compose( new THREE.Vector3( c.x, y, c.z ), q, new THREE.Vector3( 1, 1, 1 ) );

		} );
		for ( const k of [ 'body', 'glass', 'trim', 'tire' ] ) {

			const g = T[ k ].clone();
			g.setAttribute( 'paint', new THREE.InstancedBufferAttribute( paint, 4 ) );
			const im = new THREE.InstancedMesh( g, mats[ k ], n );
			matrices.forEach( ( m, i ) => im.setMatrixAt( i, m ) );
			im.castShadow = true; im.receiveShadow = true;
			im.layers.enable( SHADOW_LAYER );
			if ( k !== 'tire' ) im.layers.enable( REFLECT_LAYER );
			im.computeBoundingSphere();
			group.add( im );

		}

	}

	// 敞开的车门：门板绕前铰链外摆（单独小网格，车身侧对应位置贴暗色门洞）
	if ( doors.length ) {

		const dg = [], hole = [];
		for ( const { c, q, y, T, col } of doors ) {

			const W2 = T.def.width / 2;
			const s = c.door; // +1 右侧 / -1 左侧
			const hinge = new THREE.Vector3( 1.08, 0, s * ( W2 - 0.01 ) );
			const ang = s * ( 0.55 + r() * 0.3 );
			const g = new THREE.BoxGeometry( 1.15, 0.62, 0.05 );
			g.translate( - 0.575, 0.62, 0 );
			const gl = new THREE.BoxGeometry( 0.9, 0.38, 0.02 );
			gl.translate( - 0.5, 1.12, 0 );
			const m = new THREE.Matrix4().compose( new THREE.Vector3( c.x, y, c.z ), q, new THREE.Vector3( 1, 1, 1 ) )
				.multiply( new THREE.Matrix4().makeTranslation( hinge.x, 0, hinge.z ) ).multiply( new THREE.Matrix4().makeRotationY( ang ) );
			g.applyMatrix4( m ); gl.applyMatrix4( m );
			dg.push( prep( g, col.map( ( v ) => v * 0.85 ) ), prep( gl, C.rubber ) );
			const h = new THREE.BoxGeometry( 1.12, 0.8, 0.02 );
			h.translate( 0.52, 0.85, s * ( W2 + 0.005 ) );
			h.applyMatrix4( new THREE.Matrix4().compose( new THREE.Vector3( c.x, y, c.z ), q, new THREE.Vector3( 1, 1, 1 ) ) );
			hole.push( prep( h, C.interior ) );

		}

		const doorMesh = new THREE.Mesh( mergeGeometries( dg ), mats.trim );
		const holeMesh = new THREE.Mesh( mergeGeometries( hole ), mats.trim );
		for ( const o of [ doorMesh, holeMesh ] ) { o.castShadow = o.receiveShadow = true; o.layers.enable( SHADOW_LAYER ); group.add( o ); }

	}

	return { group, footprints };

}

// —— 公交车（单节，12m）：车身侧轮廓挤出 + 窗带玻璃面板 + 立柱 + 前后挡风 + 两扇门 + 路牌 + 车顶空调罩；车顶锈蚀长苔 ——
function destSignTexture( text ) {

	const c = document.createElement( 'canvas' );
	c.width = 512; c.height = 64;
	const ctx = c.getContext( '2d' );
	ctx.fillStyle = '#0a0b0a'; ctx.fillRect( 0, 0, 512, 64 );
	ctx.fillStyle = 'rgb(120,105,50)';
	ctx.font = 'bold 40px monospace';
	ctx.fillText( text, 18, 46 );
	// 字点阵感：竖线遮罩
	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	for ( let x = 0; x < 512; x += 4 ) ctx.fillRect( x, 0, 1, 64 );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	return t;

}

let _busParts = null;
function busParts() {

	if ( _busParts ) return _busParts;
	const L2 = 6.0, Wd = 2.55, H = 3.05, W2 = Wd / 2;
	const body = [], glass = [], trim = [];
	// 侧轮廓：车头（+x）挡风玻璃微斜，车顶圆角
	const prof = [ [ L2, 0.35 ], [ L2 + 0.05, 1.0 ], [ L2 - 0.05, 2.75 ], [ L2 - 0.3, H ], [ - L2 + 0.25, H ], [ - L2, 2.8 ], [ - L2, 0.35 ] ];
	body.push( prep( extrudeProfile( prof, Wd, { arches: [ - 3.4, 3.9, 0.58, 0.5, 0.32 ], bevel: 0.06, tumble: 0, taperTop: 0.04, yBelt: 2.6, taperEnds: 0.03, endX: L2 } ) ) );
	// 侧窗带：7 块窗（左侧）/ 门位置跳过（右侧前门、中门）
	for ( const s of [ - 1, 1 ] ) {

		const zf = s * ( W2 + 0.01 );
		for ( let i = 0; i < 8; i ++ ) {

			const x0 = - L2 + 0.5 + i * 1.32, x1 = x0 + 1.18;
			const isDoor = s > 0 && ( i === 7 || i === 3 );
			if ( isDoor ) continue;
			glass.push( box( x1 - x0, 1.0, 0.02, ( x0 + x1 ) / 2, 2.05, zf ) );
			// 窗框橡胶
			trim.push( box( x1 - x0 + 0.06, 0.04, 0.03, ( x0 + x1 ) / 2, 2.57, zf, C.rubber ) );
			trim.push( box( x1 - x0 + 0.06, 0.04, 0.03, ( x0 + x1 ) / 2, 1.53, zf, C.rubber ) );
			// 上方小气窗分隔
			trim.push( box( x1 - x0, 0.025, 0.025, ( x0 + x1 ) / 2, 2.3, zf, C.rubber ) );

		}

		// 腰线饰条、裙边
		trim.push( box( L2 * 2 - 0.2, 0.08, 0.03, 0, 1.42, zf, C.chrome ) );
		trim.push( box( L2 * 2 - 0.2, 0.18, 0.03, 0, 0.42, zf, C.rubber ) );

	}

	// 右侧两扇折叠门（玻璃 + 橡胶边）
	for ( const xc of [ - L2 + 0.5 + 3 * 1.32 + 0.59, - L2 + 0.5 + 7 * 1.32 + 0.45 ] ) {

		const zf = W2 + 0.015;
		trim.push( box( 1.2, 2.55, 0.03, xc, 1.62, zf, C.rubber ) );
		for ( const dx of [ - 0.29, 0.29 ] ) glass.push( box( 0.5, 2.3, 0.02, xc + dx, 1.62, zf + 0.012 ) );
		trim.push( box( 0.03, 2.4, 0.04, xc, 1.62, zf + 0.02, C.chrome ) );

	}

	// 前挡风（两片）+ 后窗
	glass.push( box( 0.03, 1.4, Wd - 0.3, L2 + 0.02, 2.0, 0 ) );
	trim.push( box( 0.05, 1.5, 0.05, L2 + 0.03, 2.0, 0, C.rubber ) );
	glass.push( box( 0.03, 0.8, Wd - 0.5, - L2 - 0.02, 2.2, 0 ) );
	// 路牌（前上方）——单独材质
	const sign = prep( new THREE.PlaneGeometry( Wd - 0.6, 0.28 ).rotateY( Math.PI / 2 ).translate( L2 - 0.02, 2.85, 0 ) );
	// 保险杠、大灯、尾灯
	trim.push( box( 0.2, 0.35, Wd + 0.02, L2 + 0.08, 0.55, 0, C.rubber ) );
	trim.push( box( 0.2, 0.35, Wd + 0.02, - L2 - 0.08, 0.55, 0, C.rubber ) );
	for ( const s of [ - 1, 1 ] ) {

		trim.push( box( 0.05, 0.22, 0.4, L2 + 0.06, 0.95, s * ( W2 - 0.35 ), C.head ) );
		trim.push( box( 0.05, 0.4, 0.18, - L2 - 0.04, 1.1, s * ( W2 - 0.2 ), C.tail ) );
		// 后视镜（长臂）
		trim.push( box( 0.5, 0.04, 0.04, L2 - 0.1, 2.5, s * ( W2 + 0.25 ), C.rubber ) );
		trim.push( box( 0.08, 0.35, 0.22, L2 + 0.12, 2.35, s * ( W2 + 0.45 ), C.rubber ) );

	}

	// 车顶空调罩 + 检修盖
	body.push( box( 2.6, 0.28, 1.7, - 1.6, H + 0.14, 0, null ) );
	body.push( box( 0.9, 0.08, 0.9, 2.6, H + 0.04, 0, null ) );
	// 车内座椅暗体
	trim.push( box( L2 * 2 - 1.2, 0.9, Wd - 0.5, - 0.3, 1.3, 0, C.interior ) );
	// 轮子
	const tires = [];
	for ( const x of [ - 3.4, 3.9 ] ) for ( const s of [ - 1, 1 ] ) {

		const t = tireGeo( 0.5, 0.3, 0.07 );
		t.translate( x, 0.5, s * ( W2 - 0.22 ) );
		tires.push( prep( t ) );
		const rg = rimGeo(); rg.scale( 1.4, 1.4, 1.4 );
		if ( s < 0 ) rg.rotateY( Math.PI );
		rg.translate( x, 0.5, s * ( W2 - 0.16 ) );
		trim.push( prep( rg, C.rim ) );

	}

	const merge = ( l ) => mergeGeometries( l );
	_busParts = { body: merge( body ), glass: merge( glass ), trim: merge( trim ), tire: merge( tires ), sign };
	return _busParts;

}

/**
 * 公交车：list = [{ x, z, ry, roll, color, text }]；返回 { group, footprints }
 */
export function makeBuses( list ) {

	const P = busParts();
	const body = carPaintMat( { band: { x: 0.11, y: 0.2, z: 0.2, y0: 0.6, y1: 1.4 } } );
	const glass = carGlassMat(), trim = trimMat(), tire = tireMat();
	const group = new THREE.Group();
	const footprints = [];
	const n = list.length;
	const paint = new Float32Array( n * 4 );
	const mats = list.map( ( b, i ) => {

		paint.set( [ ...( b.color || [ 0.42, 0.41, 0.37 ] ), b.seed ?? 0.5 + i * 0.13 ], i * 4 );
		const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( b.roll || 0, b.ry + Math.PI / 2, 0, 'YXZ' ) );
		footprints.push( { x: b.x, z: b.z, hw: 6.1, hd: 1.3, ry: b.ry + Math.PI / 2 } );
		return new THREE.Matrix4().compose( new THREE.Vector3( b.x, ( b.gy || 0 ) - 0.07 + Math.abs( b.roll || 0 ) * 0.5, b.z ), q, new THREE.Vector3( 1, 1, 1 ) );

	} );
	for ( const [ k, mat ] of [ [ 'body', body ], [ 'glass', glass ], [ 'trim', trim ], [ 'tire', tire ] ] ) {

		const g = P[ k ].clone();
		g.setAttribute( 'paint', new THREE.InstancedBufferAttribute( paint, 4 ) );
		const im = new THREE.InstancedMesh( g, mat, n );
		mats.forEach( ( m, i ) => im.setMatrixAt( i, m ) );
		im.castShadow = im.receiveShadow = true;
		im.layers.enable( SHADOW_LAYER );
		im.layers.enable( REFLECT_LAYER );
		im.computeBoundingSphere();
		group.add( im );

	}

	const signMat = new THREE.MeshStandardNodeMaterial( { map: destSignTexture( '  54  DOWNTOWN' ), roughness: 0.3 } );
	const sg = P.sign.clone();
	const sm = new THREE.InstancedMesh( sg, signMat, n );
	mats.forEach( ( m, i ) => sm.setMatrixAt( i, m ) );
	group.add( sm );
	return { group, footprints };

}
