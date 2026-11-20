// 淹水中庭：水体（TSL）+ 睡莲叶 / 睡莲花 / 漂浮杂物
//   水面：平面反射（纵向拉长的模糊、粗糙度噪声）+ 菲涅尔；两层滚动细节法线；
//         船体与桨叶周围的同心涟漪；按水深吸收（浅处透出被淹的地砖），浮渣/藻膜（高粗糙度，压掉反射）
//   睡莲：带 V 形缺口、边缘上卷的杯状网格，泊松圆盘采样 + 低频密度场（贴墙、贴柱、沿船的航道边缘），避免圆形团块
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, positionWorld, time, mx_fractal_noise_float, mx_noise_vec3, mx_noise_float,
	reflector, transformNormalToView, cameraPosition, normalize, dot, pow, max, min, exp, texture, uv, instanceIndex, hash, select, sin, abs,
	screenUV, luminance, attribute, clamp, normalMap, positionLocal,
} from 'three/tsl';
import { WATER_Y } from './materials.js';
import { texSet, mulberry, merge, box, meshOf } from './util.js';

// ---------- JS 侧的平滑值噪声（用于布点密度场）----------
function makeNoise2( seed ) {

	const r = mulberry( seed );
	const P = new Float32Array( 256 ).map( () => r() );
	const h = ( x, y ) => P[ ( ( x * 73856093 ) ^ ( y * 19349663 ) ) & 255 ];
	const s = ( t ) => t * t * ( 3 - 2 * t );
	return ( x, y ) => {

		const xi = Math.floor( x ), yi = Math.floor( y ), xf = s( x - xi ), yf = s( y - yi );
		const a = h( xi, yi ), b = h( xi + 1, yi ), c = h( xi, yi + 1 ), d = h( xi + 1, yi + 1 );
		return a + ( b - a ) * xf + ( c - a ) * yf + ( a - b - c + d ) * xf * yf;

	};

}

/**
 * 水下地面深度场（米，正值）：大厅中部约 0.9m，墙根/碎石堆/门口台阶处变浅
 * JS 与 TSL 两个版本保持一致
 */
export function depthAtJS( x, z, H ) {

	const dw = Math.min( x - H.x0, H.x1 - x );
	let d = 0.95 - 0.75 * Math.exp( - dw * 1.1 ) - 0.7 * Math.exp( - Math.max( 0, z - H.zFront ) * 0.7 );
	return Math.max( 0.05, d );

}
function depthAt( p, H ) {

	const dw = min( p.x.sub( H.x0 ), float( H.x1 ).sub( p.x ) );
	const n = mx_noise_float( vec3( p.x.mul( 0.6 ), 0, p.z.mul( 0.6 ) ) ).mul( 0.12 );
	return float( 0.95 ).sub( exp( dw.negate().mul( 1.1 ) ).mul( 0.75 ) ).sub( exp( p.z.sub( H.zFront ).max( 0 ).negate().mul( 0.7 ) ).mul( 0.7 ) ).add( n ).max( 0.05 );

}

/**
 * 水面材质
 * opt.H 大厅尺寸；opt.boat = { pos:[x,z], yaw, L, W, hw(u) TSL 函数 }；opt.ringSrc = [[x,z],...] 额外涟漪源（桨叶）
 */
export function buildWater( { H, boatMask, rings, exitPos } ) {

	const refl = reflector( { resolutionScale: 0.5, bounces: false, generateMipmaps: true } );
	refl.target.rotateX( - Math.PI / 2 );
	refl.target.position.y = WATER_Y;

	const m = new THREE.MeshStandardNodeMaterial( { metalness: 0, alphaTest: 0.5 } );
	const wp = positionWorld;
	if ( boatMask ) m.opacityNode = boatMask;

	// —— 法线：极低幅度的两层滚动细节 + 大尺度缓慢起伏 + 同心涟漪 ——
	const n1 = mx_noise_vec3( vec3( wp.x.mul( 2.2 ).add( time.mul( 0.05 ) ), wp.z.mul( 2.2 ), time.mul( 0.12 ) ) );
	const n2 = mx_noise_vec3( vec3( wp.x.mul( 7.0 ), wp.z.mul( 7.0 ).sub( time.mul( 0.08 ) ), time.mul( 0.25 ) ) );
	const n0 = mx_noise_vec3( vec3( wp.x.mul( 0.35 ), wp.z.mul( 0.35 ), time.mul( 0.03 ) ) );
	let slope = n1.xy.mul( 0.02 ).add( n2.xy.mul( 0.012 ) ).add( n0.xy.mul( 0.03 ) );
	// 涟漪：到船体（椭圆距离）与桨叶入水点的同心环，向外传播、衰减
	let ringH = float( 0 );
	for ( const r of rings ) {

		const d = r.dist( wp );
		const w = sin( d.mul( r.freq ).sub( time.mul( r.speed ) ) ).mul( exp( d.negate().mul( r.decay ) ) ).mul( r.amp ).mul( smoothstep( 0.0, 0.03, d ) );
		ringH = ringH.add( w );
		// 解析梯度方向：径向
		const dir = r.dirXZ( wp );
		const dw = sin( d.mul( r.freq ).sub( time.mul( r.speed ) ).add( Math.PI / 2 ) ).mul( exp( d.negate().mul( r.decay ) ) ).mul( r.amp * r.freq * 0.02 ).mul( smoothstep( 0.0, 0.03, d ) );
		slope = slope.add( dir.mul( dw ) );

	}

	// —— 浮渣/藻膜：约 15% 覆盖，靠墙更多；细碎的颗粒 ——
	const edgeW = smoothstep( 2.2, 0.0, min( wp.x.sub( H.x0 ), float( H.x1 ).sub( wp.x ) ) );
	const sN = mx_fractal_noise_float( vec3( wp.x.mul( 0.45 ), 0, wp.z.mul( 0.45 ) ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
	const sF = mx_fractal_noise_float( vec3( wp.x.mul( 5 ), 0, wp.z.mul( 5 ) ), 3, 2.0, 0.6 ).mul( 0.5 ).add( 0.5 );
	const scumField = sN.add( edgeW.mul( 0.22 ) ).add( sF.mul( 0.18 ) ).sub( 0.09 );
	const scum = smoothstep( 0.66, 0.72, scumField );
	const scumThin = smoothstep( 0.56, 0.66, scumField ).mul( 0.5 ); // 薄油膜：只略增粗糙
	const specks = smoothstep( 0.78, 0.82, mx_noise_float( vec3( wp.x.mul( 38 ), 0, wp.z.mul( 38 ) ) ).mul( 0.5 ).add( 0.5 ) ).mul( smoothstep( 0.5, 0.65, scumField ) );

	slope = slope.mul( float( 1 ).sub( scum.mul( 0.85 ) ) );
	const nW = normalize( vec3( slope.x, 1, slope.y ) );
	m.normalNode = transformNormalToView( nW );

	// —— 反射：纵向拉长的多点模糊（出口亮光在水里拉成竖直光带），粗糙度噪声控制模糊程度 ——
	const roughN = mx_fractal_noise_float( vec3( wp.x.mul( 0.8 ), 0, wp.z.mul( 0.8 ) ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const blurAmt = mix( float( 0.004 ), float( 0.016 ), roughN ).add( scumThin.mul( 0.01 ) );
	const baseUV = screenUV.flipX().add( slope.mul( vec2( 0.25, 0.12 ) ) );
	const lod = mix( float( 1.0 ), float( 2.6 ), roughN );
	let rc = vec3( 0 );
	const taps = [ [ 0, 0.22 ], [ 1, 0.18 ], [ - 1, 0.18 ], [ 2, 0.13 ], [ - 2, 0.13 ], [ 3.5, 0.08 ], [ - 3.5, 0.08 ] ];
	for ( const [ k, w ] of taps ) rc = rc.add( refl.sample( baseUV.add( vec2( float( k ).mul( blurAmt ).mul( 0.12 ), float( k ).mul( blurAmt ) ) ) ).level( lod ).rgb.mul( w ) );

	// —— 菲涅尔（Schlick，F0=0.02）——
	const V = normalize( cameraPosition.sub( wp ) );
	const cosT = max( dot( V, nW ), 0 );
	const fres = float( 0.02 ).add( float( 0.98 ).mul( pow( float( 1 ).sub( cosT ), 5 ) ) );

	// —— 水体：按水深吸收；浅处透出被淹的地砖（光线与水下地面求交，折射近似）——
	const F = texSet( 'worn_tile_floor' );
	const dep = depthAt( wp, H );
	const Vin = normalize( vec3( V.x.negate().div( 1.33 ), V.y.negate(), V.z.negate().div( 1.33 ) ) ); // 入水后的视线（向下）
	const tHit = dep.div( Vin.y.negate().max( 0.15 ) );
	const fp = wp.add( Vin.mul( tHit ) );
	const tileUV = fp.xz.mul( 0.33 );
	const tile = texture( F.map, tileUV ).rgb.mul( vec3( 0.75, 0.8, 0.65 ) );
	const silt = mx_fractal_noise_float( vec3( fp.x.mul( 1.3 ), 0, fp.z.mul( 1.3 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const floorAlb = mix( tile, vec3( 0.09, 0.08, 0.05 ), smoothstep( 0.3, 0.7, silt ) ); // 淤泥盖住部分地砖
	const path = tHit.add( dep ); // 光线进 + 出的路径
	const absorb = vec3( 5.5, 2.6, 3.6 ); // 红光最先被吸收 → 深绿
	const Tr = exp( absorb.mul( path ).negate() );
	const scatter = vec3( 0.02, 0.05, 0.03 );
	let body = floorAlb.mul( Tr ).add( scatter.mul( float( 1 ).sub( Tr.g ) ) );

	// 出口照进来的光在水体里的散射（门口附近水体泛出黄绿）
	const dExit = length( wp.xz.sub( vec2( exitPos[ 0 ], exitPos[ 1 ] ) ) );
	const inscatter = vec3( 0.05, 0.08, 0.035 ).mul( exp( dExit.negate().mul( 0.28 ) ) );

	const scumCol = mix( vec3( 0.03, 0.036, 0.016 ), vec3( 0.06, 0.058, 0.03 ), sF );
	body = mix( body, scumCol, scum );
	body = mix( body, vec3( 0.11, 0.1, 0.07 ), specks.mul( 0.6 ) );
	m.colorNode = body;
	m.roughnessNode = clamp( mix( mix( float( 0.04 ), float( 0.1 ), roughN ).add( scumThin.mul( 0.15 ) ), float( 0.65 ), max( scum, specks ) ), 0.03, 1 );
	const reflK = fres.mul( float( 1 ).sub( max( scum, specks ).mul( 0.85 ) ) ).mul( float( 1 ).sub( scumThin.mul( 0.4 ) ) );
	m.emissiveNode = rc.mul( reflK ).mul( vec3( 0.88, 1.0, 0.92 ) ).add( inscatter.mul( float( 1 ).sub( fres ) ).mul( float( 1 ).sub( scum ) ) );

	const water = new THREE.Mesh( new THREE.PlaneGeometry( H.x1 - H.x0 + 0.2, H.zBack - H.zFront + 0.2, 1, 1 ), m );
	water.rotation.x = - Math.PI / 2;
	water.position.set( ( H.x0 + H.x1 ) / 2, WATER_Y, ( H.zBack + H.zFront ) / 2 );
	water.receiveShadow = true;
	return { water, refl };

}

// ---------- 睡莲叶 ----------
// 极坐标网格：6 圈 × 26 段，叶缘向上卷（r^4），整体微凹（杯状），V 形缺口；每片叶子的波浪由实例哈希控制（着色器里不需要）
export function lilyGeometry() {

	const R = 6, S = 26, notch = 0.42;
	const pos = [], uvs = [], idx = [];
	pos.push( 0, 0.006, 0 ); uvs.push( 0.5, 0.5 );
	for ( let i = 1; i <= R; i ++ ) {

		const r = i / R;
		for ( let j = 0; j <= S; j ++ ) {

			const a = notch / 2 + ( j / S ) * ( Math.PI * 2 - notch );
			// 缺口附近半径略收（叶片两瓣圆钝）
			const lobe = 1 - 0.06 * Math.exp( - Math.pow( ( a - notch / 2 ) * 3, 2 ) ) - 0.06 * Math.exp( - Math.pow( ( Math.PI * 2 - notch / 2 - a ) * 3, 2 ) );
			const rr = r * lobe;
			const x = Math.cos( a ) * rr, z = Math.sin( a ) * rr;
			const y = 0.006 + 0.012 * r * r + 0.09 * Math.pow( r, 6 ) + Math.sin( a * 5 + 1 ) * 0.012 * Math.pow( r, 3 );
			pos.push( x, y, z );
			uvs.push( 0.5 + x * 0.5, 0.5 + z * 0.5 );

		}

	}

	for ( let j = 0; j < S; j ++ ) idx.push( 0, 1 + j + 1, 1 + j );
	for ( let i = 1; i < R; i ++ ) for ( let j = 0; j < S; j ++ ) {

		const a = 1 + ( i - 1 ) * ( S + 1 ) + j, b = a + S + 1;
		idx.push( a, a + 1, b, b, a + 1, b + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 睡莲叶材质：深色湿润（≈0.05,0.09,0.04），黄/褐腐烂变化，叶缘红褐，放射叶脉，清漆层模拟湿亮蜡质；部分叶片有腐烂的孔洞
export function lilyMaterial() {

	const m = new THREE.MeshPhysicalNodeMaterial( { side: THREE.DoubleSide, metalness: 0 } );
	const h = hash( instanceIndex );
	const h2 = hash( instanceIndex.add( 331 ) );
	const h3 = hash( instanceIndex.add( 977 ) );
	const c = uv().sub( 0.5 );
	const r = c.length().mul( 2 );
	const ang = c.y.atan( c.x );
	const vein = smoothstep( 0.93, 1.0, sin( ang.mul( 22 ) ).abs() ).mul( smoothstep( 0.08, 0.3, r ) ).mul( 0.3 );
	const base = mix( vec3( 0.04, 0.075, 0.03 ), vec3( 0.07, 0.11, 0.04 ), h );
	const pw = positionWorld;
	const blot = mx_fractal_noise_float( pw.mul( 7 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	// 腐烂：从叶缘开始的黄褐，程度按实例
	const decayAmt = smoothstep( 0.55, 1.0, h2 );
	const decay = smoothstep( float( 1.05 ).sub( decayAmt.mul( 0.8 ) ), float( 0.95 ).sub( decayAmt.mul( 0.8 ) ), r.add( blot.mul( 0.35 ) ).sub( 0.1 ) );
	let col = mix( base, vec3( 0.1, 0.05, 0.025 ), smoothstep( 0.86, 1.0, r ).mul( 0.7 ) );
	col = mix( col, mix( vec3( 0.16, 0.13, 0.04 ), vec3( 0.09, 0.055, 0.025 ), blot ), decay.mul( 0.9 ) );
	const spots = smoothstep( 0.66, 0.72, mx_fractal_noise_float( pw.mul( 14 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) );
	col = mix( col, col.mul( 0.4 ), spots );
	m.colorNode = col.mul( float( 1 ).add( vein ) );
	// 腐烂孔洞（只出现在腐烂程度高的叶片上）
	const holeN = mx_fractal_noise_float( pw.mul( 11 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	m.opacityNode = select( h3.greaterThan( 0.82 ).and( holeN.greaterThan( 0.68 ) ).and( r.greaterThan( 0.25 ) ), float( 0 ), float( 1 ) );
	m.alphaTest = 0.5;
	m.roughnessNode = mix( float( 0.25 ), float( 0.6 ), decay.add( spots.mul( 0.5 ) ).clamp() );
	m.clearcoatNode = mix( float( 0.7 ), float( 0.1 ), decay );
	m.clearcoatRoughnessNode = float( 0.22 );
	return m;

}

// 睡莲花：两层杯状花瓣 + 黄色花心（顶点颜色）
function flowerGeometry() {

	const geos = [];
	const petal = ( len, wid, tilt, a, col ) => {

		const g = new THREE.PlaneGeometry( wid, len, 2, 4 );
		const p = g.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {

			const x = p.getX( i ), y = p.getY( i ) + len / 2;
			const t = y / len;
			p.setXYZ( i, x * Math.sin( Math.PI * Math.min( 1, t * 0.9 + 0.15 ) ), y, - x * x * 3 + t * t * 0.01 );

		}

		g.rotateX( - tilt );
		g.rotateY( a );
		const colors = new Float32Array( p.count * 3 );
		for ( let i = 0; i < p.count; i ++ ) colors.set( col, i * 3 );
		g.setAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
		g.deleteAttribute( 'uv' );
		return g;

	};

	for ( let i = 0; i < 9; i ++ ) geos.push( petal( 0.07, 0.03, 1.15, ( i / 9 ) * Math.PI * 2, [ 0.62, 0.56, 0.52 ] ) );
	for ( let i = 0; i < 7; i ++ ) geos.push( petal( 0.055, 0.025, 0.6, ( ( i + 0.5 ) / 7 ) * Math.PI * 2, [ 0.7, 0.62, 0.58 ] ) );
	const ctr = new THREE.SphereGeometry( 0.016, 8, 5 );
	ctr.scale( 1, 0.6, 1 ); ctr.translate( 0, 0.012, 0 );
	const cc = new Float32Array( ctr.attributes.position.count * 3 );
	for ( let i = 0; i < cc.length; i += 3 ) cc.set( [ 0.5, 0.36, 0.05 ], i );
	ctr.setAttribute( 'color', new THREE.BufferAttribute( cc, 3 ) );
	ctr.deleteAttribute( 'uv' );
	const list = [ ...geos, ctr ].map( ( g ) => ( g.index ? g.toNonIndexed() : g ) );
	return mergeKeepColor( list );

}

function mergeKeepColor( list ) {

	let n = 0;
	for ( const g of list ) n += g.attributes.position.count;
	const pos = new Float32Array( n * 3 ), col = new Float32Array( n * 3 );
	let o = 0;
	for ( const g of list ) {

		pos.set( g.attributes.position.array, o * 3 );
		col.set( g.attributes.color.array, o * 3 );
		o += g.attributes.position.count;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	g.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	g.computeVertexNormals();
	return g;

}

/**
 * 睡莲布点：泊松圆盘（可变半径飞镖法 + 空间哈希）× 低频密度场
 * blockers(x,z) → true 时不放（柱子、种植池、船）；attract(x,z) → 0..1 额外的吸附项（墙、柱、航道边）
 */
export function scatterLilies( { H, rng, blockers, attract, count = 2400, tries = 60000 } ) {

	const noise = makeNoise2( 9 );
	const noiseB = makeNoise2( 21 );
	const cell = 0.5;
	const grid = new Map();
	const key = ( i, j ) => i * 10007 + j;
	const out = [];
	for ( let t = 0; t < tries && out.length < count; t ++ ) {

		const x = H.x0 + 0.15 + rng() * ( H.x1 - H.x0 - 0.3 );
		const z = H.zFront + 0.4 + rng() * ( H.zBack - H.zFront - 0.6 );
		if ( blockers( x, z ) ) continue;
		// 密度：低频噪声（大片空水面与成片的叶毯）+ 吸附项
		const f = noise( x * 0.28, z * 0.28 ) * 0.65 + noiseB( x * 0.9 + 3, z * 0.9 ) * 0.35;
		const dens = Math.min( 1, Math.max( 0, ( f - 0.42 ) * 2.2 ) + attract( x, z ) );
		if ( rng() > dens * dens ) continue;
		const r = 0.07 + Math.pow( rng(), 1.7 ) * 0.17;
		const ci = Math.floor( x / cell ), cj = Math.floor( z / cell );
		let ok = true;
		for ( let di = - 1; di <= 1 && ok; di ++ ) for ( let dj = - 1; dj <= 1 && ok; dj ++ ) {

			const list = grid.get( key( ci + di, cj + dj ) );
			if ( ! list ) continue;
			for ( const q of list ) {

				const dx = q.x - x, dz = q.z - z;
				if ( dx * dx + dz * dz < Math.pow( ( q.r + r ) * 0.86, 2 ) ) { ok = false; break; }

			}

		}

		if ( ! ok ) continue;
		const it = { x, z, r };
		out.push( it );
		const k = key( ci, cj );
		if ( ! grid.has( k ) ) grid.set( k, [] );
		grid.get( k ).push( it );

	}

	return out;

}

export function buildLilies( pads, rng ) {

	const group = new THREE.Group();
	const mesh = new THREE.InstancedMesh( lilyGeometry(), lilyMaterial(), pads.length );
	const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
	pads.forEach( ( p, i ) => {

		_q.setFromEuler( _e.set( ( rng() - 0.5 ) * 0.04, rng() * Math.PI * 2, ( rng() - 0.5 ) * 0.04 ) );
		_m.compose( new THREE.Vector3( p.x, WATER_Y - 0.004, p.z ), _q, new THREE.Vector3( p.r, p.r * ( 0.8 + rng() * 0.5 ), p.r ) );
		mesh.setMatrixAt( i, _m );

	} );
	mesh.receiveShadow = true;
	mesh.castShadow = false;
	mesh.computeBoundingSphere();
	group.add( mesh );

	// 花：约 20 朵，在叶毯中间
	const fm = new THREE.MeshStandardNodeMaterial( { vertexColors: true, side: THREE.DoubleSide, roughness: 0.55 } );
	fm.colorNode = attribute( 'color', 'vec3' ).mul( mix( float( 0.75 ), float( 1.05 ), hash( instanceIndex ) ) ).mul( mix( vec3( 1 ), vec3( 1.0, 0.82, 0.85 ), hash( instanceIndex.add( 5 ) ).greaterThan( 0.6 ).select( float( 1 ), float( 0 ) ) ) );
	const big = pads.filter( ( p ) => p.r > 0.12 );
	const nF = Math.min( 20, big.length );
	const flowers = new THREE.InstancedMesh( flowerGeometry(), fm, nF );
	for ( let i = 0; i < nF; i ++ ) {

		const p = big[ Math.floor( ( i / nF ) * big.length + rng() * 3 ) % big.length ];
		const s = 0.8 + rng() * 0.6;
		_q.setFromEuler( _e.set( ( rng() - 0.5 ) * 0.2, rng() * 6.28, ( rng() - 0.5 ) * 0.2 ) );
		_m.compose( new THREE.Vector3( p.x + p.r * 0.7, WATER_Y + 0.005, p.z + p.r * 0.3 ), _q, new THREE.Vector3( s, s, s ) );
		flowers.setMatrixAt( i, _m );

	}

	flowers.computeBoundingSphere();
	group.add( flowers );
	return group;

}

// ---------- 漂浮杂物 ----------
// 纸张（浸湿下垂的弯曲薄片）、塑料瓶（车削体）、落叶；返回 Group
export function buildFloatingDebris( { H, rng, blockers, leafGeo, nearWall } ) {

	const group = new THREE.Group();
	const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

	// 纸张：细分平面，按噪声起伏（湿纸贴在水面上，边缘略翘）
	const paperG = new THREE.PlaneGeometry( 0.21, 0.297, 6, 8 );
	paperG.rotateX( - Math.PI / 2 );
	{

		const p = paperG.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {

			const x = p.getX( i ), z = p.getZ( i );
			p.setY( i, 0.003 + Math.pow( Math.abs( x ) * 8, 3 ) * 0.004 + Math.sin( z * 30 + x * 9 ) * 0.003 );

		}

		paperG.computeVertexNormals();

	}

	const paperM = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide } );
	{

		const h = hash( instanceIndex );
		const n = mx_fractal_noise_float( positionWorld.mul( 18 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
		const lines = smoothstep( 0.9, 1.0, sin( uv().y.mul( 120 ) ).abs() ).mul( step01( uv().x, 0.12, 0.88 ) ).mul( 0.25 ).mul( h.greaterThan( 0.4 ).select( float( 1 ), float( 0 ) ) );
		const paper = mix( vec3( 0.42, 0.4, 0.33 ), vec3( 0.3, 0.27, 0.19 ), n ).mul( mix( 0.6, 1.0, h ) );
		paperM.colorNode = paper.mul( float( 1 ).sub( lines ) ).mul( mix( float( 1 ), float( 0.55 ), smoothstep( 0.45, 0.8, n ) ) );
		paperM.roughnessNode = mix( float( 0.35 ), float( 0.8 ), n );

	}

	const papers = [];
	for ( let i = 0; i < 400 && papers.length < 46; i ++ ) {

		const x = H.x0 + 0.3 + rng() * ( H.x1 - H.x0 - 0.6 ), z = H.zFront + 0.6 + rng() * ( H.zBack - H.zFront - 1 );
		if ( blockers( x, z ) ) continue;
		if ( rng() > 0.25 + nearWall( x, z ) * 0.75 ) continue;
		_q.setFromEuler( _e.set( 0, rng() * 6.28, 0 ) );
		const s = 0.8 + rng() * 0.5;
		papers.push( _m.compose( new THREE.Vector3( x, WATER_Y, z ), _q, new THREE.Vector3( s, 1, s ) ).clone() );

	}

	const pm = new THREE.InstancedMesh( paperG, paperM, papers.length );
	papers.forEach( ( m, i ) => pm.setMatrixAt( i, m ) );
	pm.receiveShadow = true;
	pm.computeBoundingSphere();
	group.add( pm );

	// 塑料瓶：车削体，横躺在水面，一半在水下
	const prof = [ [ 0, 0 ], [ 0.032, 0 ], [ 0.034, 0.01 ], [ 0.034, 0.16 ], [ 0.028, 0.19 ], [ 0.013, 0.215 ], [ 0.013, 0.235 ], [ 0.0, 0.235 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) );
	const bottleG = new THREE.LatheGeometry( prof, 16 );
	bottleG.translate( 0, - 0.12, 0 );
	bottleG.rotateZ( Math.PI / 2 );
	const bottleM = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.25, metalness: 0, transparent: false } );
	bottleM.colorNode = mix( vec3( 0.16, 0.2, 0.18 ), vec3( 0.32, 0.33, 0.3 ), hash( instanceIndex ) ).mul( mix( 0.5, 1, mx_noise_float( positionWorld.mul( 20 ) ).mul( 0.5 ).add( 0.5 ) ) );
	bottleM.clearcoat = 0.8;
	const bottles = [];
	for ( let i = 0; i < 200 && bottles.length < 9; i ++ ) {

		const x = H.x0 + 0.4 + rng() * ( H.x1 - H.x0 - 0.8 ), z = H.zFront + 1 + rng() * ( H.zBack - H.zFront - 2 );
		if ( blockers( x, z ) || rng() > 0.2 + nearWall( x, z ) ) continue;
		_q.setFromEuler( _e.set( ( rng() - 0.5 ) * 0.2, rng() * 6.28, 0 ) );
		bottles.push( _m.compose( new THREE.Vector3( x, WATER_Y + 0.012, z ), _q, new THREE.Vector3( 1, 1, 1 ) ).clone() );

	}

	const bm = new THREE.InstancedMesh( bottleG, bottleM, bottles.length );
	bottles.forEach( ( m, i ) => bm.setMatrixAt( i, m ) );
	bm.computeBoundingSphere();
	group.add( bm );

	// 落叶：褐色枯叶贴在水面，靠墙聚集（实例化）
	if ( leafGeo ) {

		const leafM = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide } );
		const h = hash( instanceIndex );
		leafM.colorNode = mix( vec3( 0.11, 0.07, 0.03 ), vec3( 0.2, 0.14, 0.05 ), h ).mul( mix( 0.5, 1.0, hash( instanceIndex.add( 3 ) ) ) );
		leafM.roughnessNode = float( 0.45 );
		const leaves = [];
		for ( let i = 0; i < 20000 && leaves.length < 1400; i ++ ) {

			const x = H.x0 + 0.1 + rng() * ( H.x1 - H.x0 - 0.2 ), z = H.zFront + 0.3 + rng() * ( H.zBack - H.zFront - 0.4 );
			if ( blockers( x, z ) ) continue;
			if ( rng() > 0.04 + nearWall( x, z ) * 0.9 ) continue;
			_q.setFromEuler( _e.set( - Math.PI / 2 + ( rng() - 0.5 ) * 0.25, 0, rng() * 6.28, 'XYZ' ) );
			const s = 0.05 + rng() * 0.05;
			leaves.push( _m.compose( new THREE.Vector3( x, WATER_Y - 0.012, z ), _q, new THREE.Vector3( s, s, s * 0.4 ) ).clone() );

		}

		const lm = new THREE.InstancedMesh( leafGeo, leafM, leaves.length );
		leaves.forEach( ( m, i ) => lm.setMatrixAt( i, m ) );
		lm.receiveShadow = true;
		lm.computeBoundingSphere();
		group.add( lm );

	}

	return group;

}

function step01( x, a, b ) {

	return smoothstep( a, a + 0.01, x ).mul( smoothstep( b, b - 0.01, x ) );

}
