// 苔藓小巷：步道地面（第三轮重写）
//   · 现浇混凝土大板（约 1.65 × 2.6–3.2m）+ 伸缩缝；每块板内用 Voronoi 碎裂成 0–7 块，
//     碎块之间 0.6–2cm 的真实裂缝（几何缝隙，露出下面的泥土），碎块各自轻微翘起/下沉
//   · 地面遮罩（1.3cm 精度）：R = 到裂缝/伸缩缝的距离场（SDF），A = 发丝裂纹距离场，G = 潮湿，B = 泥污
//     材质里苔藓从裂缝 SDF 长出（缝内最厚，5–15cm 衰减），发丝裂纹做成带法线的细槽
//   · 草：按裂缝 SDF + 噪声密度撒（缝里短草、伸缩缝/缺块处高草、墙根高草带），两级 LOD
//   · 积水：下沉碎块 + 不规则水面多边形（反射），周围湿晕
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, noise2, smooth, merge, xf, T, dataTex, paint, lumpGeometry, instanced, lodInstanced, voronoiCells, insetPoly, clipHalf } from './util.js';

export const G = { X0: - 2.3, X1: 2.0, Z0: - 44, Z1: 10, RX: 320, RZ: 4096 };
export const WALK = { x0: - 2.05, x1: L.SOIL_X };
const CS = ( G.X1 - G.X0 ) / G.RX; // 每格米数（x）
const CZ = ( G.Z1 - G.Z0 ) / G.RZ;

// 积水坑：中心、半径、拉长、旋转
export const PUDDLES = [
	{ x: 0.1, z: - 2.6, r: 0.75, e: 1.6, a: 0.3 },
	{ x: - 0.7, z: - 8.6, r: 1.05, e: 1.9, a: - 0.15 },
	{ x: 0.5, z: - 14.5, r: 0.7, e: 1.4, a: 0.6 },
	{ x: - 1.0, z: - 20.5, r: 0.9, e: 1.7, a: 0.1 },
	{ x: 0.2, z: - 27.5, r: 1.1, e: 1.6, a: - 0.4 },
	{ x: - 0.4, z: - 35.5, r: 1.3, e: 1.5, a: 0.2 },
	{ x: 0.75, z: 2.6, r: 0.45, e: 1.3, a: 0.9 },
];
const puddleR = ( P, x, z ) => {

	const dx = x - P.x, dz = z - P.z;
	const c = Math.cos( P.a ), s = Math.sin( P.a );
	const u = dx * c - dz * s, v = ( dx * s + dz * c ) / P.e;
	const th = Math.atan2( v, u );
	const rr = P.r * ( 0.72 + 0.55 * fbm2( Math.cos( th ) * 1.3 + P.x * 3, Math.sin( th ) * 1.3 + P.z, 3 ) );
	return Math.hypot( u, v ) / rr;

};

const pointIn = ( poly, x, z ) => {

	let inside = false;
	for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

		const xi = poly[ i ][ 0 ], zi = poly[ i ][ 1 ], xj = poly[ j ][ 0 ], zj = poly[ j ][ 1 ];
		if ( ( zi > z ) !== ( zj > z ) && x < ( xj - xi ) * ( z - zi ) / ( zj - zi ) + xi ) inside = ! inside;

	}

	return inside;

};

// 两遍 3-4 倒角距离变换（单位：米）
function distanceTransform( src, W, H ) {

	const d = src;
	const a = CS, b = Math.hypot( CS, CZ ), c = CZ;
	for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) {

		const k = j * W + i;
		let v = d[ k ];
		if ( v === 0 ) continue;
		if ( i > 0 ) v = Math.min( v, d[ k - 1 ] + a );
		if ( j > 0 ) {

			v = Math.min( v, d[ k - W ] + c );
			if ( i > 0 ) v = Math.min( v, d[ k - W - 1 ] + b );
			if ( i < W - 1 ) v = Math.min( v, d[ k - W + 1 ] + b );

		}

		d[ k ] = v;

	}

	for ( let j = H - 1; j >= 0; j -- ) for ( let i = W - 1; i >= 0; i -- ) {

		const k = j * W + i;
		let v = d[ k ];
		if ( v === 0 ) continue;
		if ( i < W - 1 ) v = Math.min( v, d[ k + 1 ] + a );
		if ( j < H - 1 ) {

			v = Math.min( v, d[ k + W ] + c );
			if ( i < W - 1 ) v = Math.min( v, d[ k + W + 1 ] + b );
			if ( i > 0 ) v = Math.min( v, d[ k + W - 1 ] + b );

		}

		d[ k ] = v;

	}

	return d;

}

export function buildGround( mats ) {

	const r = rng( 7 );
	const BT = 0.01, DEPTH = 0.1;
	const gx = ( x ) => ( x - G.X0 ) / ( G.X1 - G.X0 ) * G.RX, gz = ( z ) => ( z - G.Z0 ) / ( G.Z1 - G.Z0 ) * G.RZ;
	const sunk = ( x, z ) => {

		let best = 9;
		for ( const P of PUDDLES ) best = Math.min( best, puddleR( P, x, z ) );
		return best;

	};

	// —— 1. 现浇大板：两列，行长 2.6–3.2m ——
	const SPLIT = - 0.38;
	const slabsRect = [];
	let z = G.Z1 - 0.1;
	while ( z > - 41.5 ) {

		const d = 2.6 + r() * 0.6;
		const cols = [ [ WALK.x0, SPLIT + ( r() - 0.5 ) * 0.06 ], [ SPLIT, WALK.x1 ] ];
		for ( const [ x0, x1 ] of cols ) slabsRect.push( [ x0, z - d, x1, z ] );
		z -= d;

	}

	// —— 2. 每块板 Voronoi 碎裂 ——
	const pieces = []; // { poly, h, tx, tz, tone, mossy }
	const missing = []; // 缺失碎块（露土）
	for ( const R of slabsRect ) {

		const [ x0, z0, x1, z1 ] = R;
		const J = 0.009 + r() * 0.008; // 伸缩缝半宽
		const rect = [ x0 + J, z0 + J, x1 - J, z1 - J ];
		const w = rect[ 2 ] - rect[ 0 ], dd = rect[ 3 ] - rect[ 1 ];
		const cx = ( x0 + x1 ) / 2, czz = ( z0 + z1 ) / 2;
		const nearCam = czz > 3.5;
		// 碎裂程度：靠墙/靠远处更碎；近机位相对完整
		const k = r();
		let ns = k < 0.18 ? 1 : k < 0.45 ? 3 + Math.floor( r() * 2 ) : 5 + Math.floor( r() * 4 );
		if ( nearCam ) ns = Math.min( ns, 4 );
		const seeds = [];
		if ( r() < 0.4 ) {

			// 冲击点：围绕一点放射状碎裂
			const ix = rect[ 0 ] + w * ( 0.25 + r() * 0.5 ), iz = rect[ 1 ] + dd * ( 0.25 + r() * 0.5 );
			for ( let i = 0; i < ns; i ++ ) { const a = i / ns * 6.28 + r() * 0.5, rr = 0.3 + r() * 0.9; seeds.push( [ ix + Math.cos( a ) * rr * w * 0.5, iz + Math.sin( a ) * rr * dd * 0.4 ] ); }
			seeds.push( [ ix, iz ] );

		} else for ( let i = 0; i < ns; i ++ ) seeds.push( [ rect[ 0 ] + r() * w, rect[ 1 ] + r() * dd ] );

		const cells = ns <= 1 ? [ [ [ rect[ 0 ], rect[ 1 ] ], [ rect[ 2 ], rect[ 1 ] ], [ rect[ 2 ], rect[ 3 ] ], [ rect[ 0 ], rect[ 3 ] ] ] ] : voronoiCells( rect, seeds );
		const tone = r();
		for ( let poly of cells ) {

			const gap = 0.006 + r() * 0.01; // 裂缝半宽
			poly = insetPoly( poly, ns <= 1 ? 0 : gap );
			// 随机崩角：在某个顶点附近切一刀
			if ( r() < 0.45 ) {

				const i = Math.floor( r() * poly.length );
				const p = poly[ i ];
				let mx = 0, mz = 0; for ( const q of poly ) { mx += q[ 0 ]; mz += q[ 1 ]; }
				mx /= poly.length; mz /= poly.length;
				let nx = p[ 0 ] - mx, nz = p[ 1 ] - mz; const l = Math.hypot( nx, nz ); nx /= l; nz /= l;
				const a = r() * 0.7 - 0.35; const cx2 = Math.cos( a ) * nx - Math.sin( a ) * nz, cz2 = Math.sin( a ) * nx + Math.cos( a ) * nz;
				const cut = 0.03 + r() * 0.08;
				const np = clipHalf( poly, cx2, cz2, p[ 0 ] * cx2 + p[ 1 ] * cz2 - cut );
				if ( np.length >= 3 ) poly = np;

			}

			if ( poly.length < 3 ) continue;
			let mx = 0, mz = 0; for ( const q of poly ) { mx += q[ 0 ]; mz += q[ 1 ]; }
			mx /= poly.length; mz /= poly.length;
			// 缺失：靠墙一侧、远处更多；近机位不缺
			const pMiss = ( mx > 0.6 ? 0.1 : 0.03 ) + ( mz < - 25 ? 0.04 : 0 );
			if ( ! nearCam && ns > 2 && r() < pMiss ) { missing.push( poly ); continue; }
			const sR = sunk( mx, mz );
			let h = ( r() - 0.5 ) * 0.02 * ( ns > 1 ? 1.5 : 0.6 );
			let tx = ( r() - 0.5 ) * 0.045 * ( ns > 1 ? 1 : 0.3 ), tz = ( r() - 0.5 ) * 0.045 * ( ns > 1 ? 1 : 0.3 );
			if ( mx > 0.6 ) { h += r() * 0.02; tz -= r() * 0.02; } // 墙根树根顶起
			if ( sR < 1.15 ) { h = - 0.026 - r() * 0.008 + Math.max( 0, sR - 0.85 ) * 0.04; tx *= 0.2; tz *= 0.2; }
			if ( nearCam ) { tx *= 0.5; tz *= 0.5; }
			const mossy = Math.min( 1, ( mx > 0.6 ? 0.55 : mx < - 1.5 ? 0.45 : 0.12 ) + r() * 0.35 + ( mz < - 30 ? 0.2 : 0 ) );
			pieces.push( { poly, h, tx, tz, tone: tone * 0.7 + r() * 0.3, mossy } );

		}

	}

	// —— 3. 碎块几何（挤出 + 倒角）+ 光栅化高度场 / 碎块 ID ——
	const HF = new Float32Array( G.RX * G.RZ ).fill( 0.065 );
	const PID = new Int32Array( G.RX * G.RZ ).fill( - 1 );
	const slabs = [];
	pieces.forEach( ( pc, pi ) => {

		let cx = 0, cz = 0;
		for ( const p of pc.poly ) { cx += p[ 0 ]; cz += p[ 1 ]; }
		cx /= pc.poly.length; cz /= pc.poly.length;
		pc.cx = cx; pc.cz = cz;
		const shape = new THREE.Shape( pc.poly.map( ( p ) => new THREE.Vector2( p[ 0 ] - cx, - ( p[ 1 ] - cz ) ) ) );
		const g = new THREE.ExtrudeGeometry( shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: 0.008, bevelSegments: 2, steps: 1, curveSegments: 1 } );
		g.rotateX( - Math.PI / 2 );
		const yBase = L.SLAB_TOP + pc.h - ( DEPTH + BT );
		xf( g, T( cx, yBase, cz, pc.tx, 0, pc.tz ) );
		const ng = g.index ? g.toNonIndexed() : g;
		ng.computeVertexNormals();
		paint( ng, pc.tone, pc.mossy, ( pi * 0.6180339 ) % 1 );
		slabs.push( ng );
		const xs = pc.poly.map( ( p ) => p[ 0 ] ), zs = pc.poly.map( ( p ) => p[ 1 ] );
		const i0 = Math.max( 0, Math.floor( gx( Math.min( ...xs ) ) ) ), i1 = Math.min( G.RX - 1, Math.ceil( gx( Math.max( ...xs ) ) ) );
		const j0 = Math.max( 0, Math.floor( gz( Math.min( ...zs ) ) ) ), j1 = Math.min( G.RZ - 1, Math.ceil( gz( Math.max( ...zs ) ) ) );
		const ttx = Math.tan( pc.tx ), ttz = Math.tan( pc.tz );
		for ( let j = j0; j <= j1; j ++ ) {

			const zz = G.Z0 + ( j + 0.5 ) * CZ;
			for ( let i = i0; i <= i1; i ++ ) {

				const x = G.X0 + ( i + 0.5 ) * CS;
				if ( ! pointIn( pc.poly, x, zz ) ) continue;
				HF[ j * G.RX + i ] = L.SLAB_TOP + pc.h + ( zz - cz ) * ttx - ( x - cx ) * ttz;
				PID[ j * G.RX + i ] = pi;

			}

		}

	} );

	const idx = ( x, z ) => Math.min( G.RZ - 1, Math.max( 0, Math.floor( gz( z ) ) ) ) * G.RX + Math.min( G.RX - 1, Math.max( 0, Math.floor( gx( x ) ) ) );
	const heightAt = ( x, z ) => HF[ idx( x, z ) ];
	const onSlab = ( x, z ) => PID[ idx( x, z ) ] >= 0;

	// —— 4. 裂缝距离场（缝 = 非板面）——
	const seamD = new Float32Array( G.RX * G.RZ );
	for ( let k = 0; k < seamD.length; k ++ ) seamD[ k ] = PID[ k ] < 0 ? 0 : 1e3;
	distanceTransform( seamD, G.RX, G.RZ );
	const seamAt = ( x, z ) => seamD[ idx( x, z ) ];

	// —— 5. 发丝裂纹：从缝边出发的随机折线（只在材质里表现）——
	const hair = new Float32Array( G.RX * G.RZ ).fill( 1e3 );
	const mark = ( x, z ) => { const i = Math.floor( gx( x ) ), j = Math.floor( gz( z ) ); if ( i >= 0 && i < G.RX && j >= 0 && j < G.RZ && PID[ j * G.RX + i ] >= 0 ) hair[ j * G.RX + i ] = 0; };
	const walk = ( x, z, a, len, gen ) => {

		for ( let s = 0; s < len; s += 0.008 ) {

			a += ( noise2( x * 9 + gen * 3, z * 9 ) - 0.5 ) * 0.35 + ( r() - 0.5 ) * 0.25;
			x += Math.cos( a ) * 0.008; z += Math.sin( a ) * 0.008;
			if ( x < WALK.x0 || x > WALK.x1 ) return;
			mark( x, z );
			if ( gen < 2 && r() < 0.006 ) walk( x, z, a + ( r() < 0.5 ? 1 : - 1 ) * ( 0.5 + r() * 0.7 ), len * 0.4, gen + 1 );

		}

	};

	for ( let i = 0; i < 260; i ++ ) {

		const x = WALK.x0 + r() * ( WALK.x1 - WALK.x0 ), z = - 41 + r() * 50;
		if ( seamAt( x, z ) > 0.05 ) continue;
		walk( x, z, r() * 6.28, 0.3 + r() * 1.1, 0 );

	}

	distanceTransform( hair, G.RX, G.RZ );

	// —— 6. 地面遮罩贴图 ——
	const mask = dataTex( G.RX, G.RZ, ( d ) => {

		for ( let j = 0; j < G.RZ; j ++ ) for ( let i = 0; i < G.RX; i ++ ) {

			const x = G.X0 + ( i + 0.5 ) * CS, zz = G.Z0 + ( j + 0.5 ) * CZ;
			const k = j * G.RX + i;
			const s = sunk( x, zz );
			// 潮湿：积水周边湿晕 + 低频噪声阈值得到的湿斑 + 缝隙附近吸水
			const damp = smooth( 0.6, 0.7, fbm2( x * 0.55 + 7, zz * 0.3, 4 ) );
			const wet = Math.max( smooth( 1.6, 0.98, s ), damp * 0.85, smooth( 0.04, 0.0, seamD[ k ] ) * 0.4 );
			d[ k * 4 ] = Math.min( 1, seamD[ k ] / 0.25 ) * 255;
			d[ k * 4 + 1 ] = wet * 255;
			d[ k * 4 + 2 ] = Math.min( 1, smooth( 0.45, 0.7, fbm2( x * 1.7 + 30, zz * 1.1, 4 ) ) + smooth( - 1.6, - 2.05, x ) * 0.5 + smooth( 0.7, 1.25, x ) * 0.5 ) * 255;
			d[ k * 4 + 3 ] = Math.min( 1, hair[ k ] / 0.06 ) * 255;

		}

	} );
	mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
	mask.generateMipmaps = true;

	const group = new THREE.Group();
	const slabMesh = new THREE.Mesh( merge( slabs ), mats.slab( mask ) );
	slabMesh.receiveShadow = slabMesh.castShadow = true;
	group.add( slabMesh );

	// 板下泥土层（缝隙与缺块处露出），延伸到两侧墙根
	const soil = new THREE.PlaneGeometry( 30, 70, 1, 1 );
	soil.rotateX( - Math.PI / 2 );
	soil.translate( - 4, 0.055, - 18 );
	const soilMesh = new THREE.Mesh( soil, mats.soil );
	soilMesh.receiveShadow = true;
	group.add( soilMesh );

	// —— 7. 积水水面 ——
	const water = [];
	for ( const P of PUDDLES ) {

		const pts = [];
		const N = 56;
		for ( let k = 0; k < N; k ++ ) {

			const th = k / N * Math.PI * 2;
			const rr = P.r * ( 0.72 + 0.55 * fbm2( Math.cos( th ) * 1.3 + P.x * 3, Math.sin( th ) * 1.3 + P.z, 3 ) );
			const u = Math.cos( th ) * rr, v = Math.sin( th ) * rr * P.e;
			const c = Math.cos( P.a ), s = Math.sin( P.a );
			pts.push( new THREE.Vector2( P.x + u * c + v * s, - ( P.z - u * s + v * c ) ) );

		}

		const g = new THREE.ShapeGeometry( new THREE.Shape( pts ) );
		g.rotateX( - Math.PI / 2 );
		water.push( g );

	}

	const waterMesh = new THREE.Mesh( merge( water ), mats.water );
	waterMesh.position.y = L.WATER_Y;
	waterMesh.receiveShadow = true;
	waterMesh.renderOrder = 1;
	group.add( waterMesh );

	return { group, pieces, missing, heightAt, onSlab, seamAt, hairAt: ( x, z ) => hair[ idx( x, z ) ], mask, sunk, r };

}

// ———————————————————————— 草（叶片几何）————————————————————————
// seedOrRng：数字种子（LOD 各级共用同一布局）或随机函数；seg：每片草叶段数
function grassClump( seedOrRng, blades = 9, tall = 1, seg = 4, spread = 0.1 ) {

	const r = typeof seedOrRng === 'function' ? seedOrRng : rng( seedOrRng );
	const pos = [], uvs = [], idx = [];
	for ( let b = 0; b < blades; b ++ ) {

		const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.6;
		const h = ( 0.45 + r() * 0.65 ) * tall, w = 0.006 + r() * 0.007;
		const ox = ( r() - 0.5 ) * spread, oz = ( r() - 0.5 ) * spread;
		const dx = Math.cos( a ), dz = Math.sin( a );
		const tw = r() * 1.2; // 叶面扭转
		const base = pos.length / 3;
		for ( let s = 0; s <= seg; s ++ ) {

			const t = s / seg;
			const bend = lean * t * t;
			const cx = ox + dx * bend * h, cz = oz + dz * bend * h, cy = h * t * ( 1 - 0.3 * lean * t );
			const ww = w * ( 1 - t * 0.9 );
			const ang = a + Math.PI / 2 + tw * t;
			const px = Math.cos( ang ) * ww, pz = Math.sin( ang ) * ww;
			pos.push( cx - px, cy, cz - pz, cx + px, cy, cz + pz );
			uvs.push( 0, t, 1, t );

		}

		for ( let s = 0; s < seg; s ++ ) {

			const i0 = base + s * 2;
			idx.push( i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// 法线上偏（草丛整体受天光，避免侧面全黑）
	const n = g.attributes.normal;
	for ( let i = 0; i < n.count; i ++ ) n.setY( i, n.getY( i ) + 0.9 );
	return g;

}

export { grassClump };

// 平躺落叶（单位大小，叶面朝 +Y）
function litterLeaf( curl = 0.12 ) {

	const g = new THREE.PlaneGeometry( 0.6, 1, 2, 3 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i );
		const w = Math.sin( Math.PI * ( y + 0.5 ) ) * 0.95 + 0.05;
		p.setX( i, x * w );
		p.setZ( i, Math.abs( x ) * curl * 2 + ( y * y ) * curl );

	}

	g.rotateX( - Math.PI / 2 );
	g.computeVertexNormals();
	return g;

}

export function buildGroundCover( mats, ground, ivy ) {

	const { heightAt, seamAt, sunk, missing } = ground;
	const r = rng( 303 );
	const group = new THREE.Group();
	const M = ( x, y, z, ry, s, sy = s, rx = 0, rz = 0 ) => new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz ) ), new THREE.Vector3( s, sy, s ) );

	// —— 草：3 种草丛 × 两级 LOD ——
	const SPEC = [ { n: 9, tall: 1, sp: 0.08 }, { n: 14, tall: 1.15, sp: 0.12 }, { n: 6, tall: 0.7, sp: 0.05 } ];
	const lists = SPEC.map( () => ( { m: [], c: [] } ) );
	let blades = 0;
	const grassCol = ( dry ) => {

		const c = new THREE.Color().setRGB( 0.05 + r() * 0.03, 0.068 + r() * 0.03, 0.022 + r() * 0.012 );
		if ( r() < dry ) c.setRGB( 0.1 + r() * 0.03, 0.085, 0.045 ); // 枯草
		return c;

	};

	const addGrass = ( x, z, s, k, dry = 0.15 ) => {

		if ( sunk( x, z ) < 0.97 ) return;
		const y = Math.min( heightAt( x, z ), L.SLAB_TOP ) - 0.015;
		lists[ k ].m.push( M( x, y, z, r() * 6.28, s, s * ( 0.7 + r() * 0.6 ), ( r() - 0.5 ) * 0.2, ( r() - 0.5 ) * 0.2 ) );
		lists[ k ].c.push( grassCol( dry ) );
		blades += SPEC[ k ].n;

	};

	// 裂缝里：按 SDF 拒绝采样，密度 = 噪声 × 中央踩踏衰减
	const trample = ( x ) => 1 - 0.75 * smooth( 0.85, 0.0, Math.abs( x + 0.4 ) );
	for ( let i = 0; i < 2600000; i ++ ) {

		const x = WALK.x0 + r() * ( WALK.x1 - WALK.x0 ), z = - 41.5 + r() * 51;
		const sd = seamAt( x, z );
		if ( sd > 0.02 ) continue;
		const dens = Math.pow( fbm2( x * 0.9 + 3, z * 0.5, 3 ), 1.5 ) * 1.6 * trample( x ) + ( x > 0.8 || x < - 1.7 ? 0.35 : 0 );
		if ( r() > dens * 0.11 ) continue;
		const big = sd < 0.004 && r() < dens * 0.4;
		addGrass( x, z, big ? 0.28 + r() * 0.35 : 0.12 + r() * 0.2, big ? 1 : r() < 0.6 ? 2 : 0 );

	}

	// 缺块露土：一丛丛高草
	for ( const poly of missing ) {

		let mx = 0, mz = 0; for ( const q of poly ) { mx += q[ 0 ]; mz += q[ 1 ]; }
		mx /= poly.length; mz /= poly.length;
		for ( let i = 0; i < 40; i ++ ) {

			const x = mx + ( r() - 0.5 ) * 0.9, z = mz + ( r() - 0.5 ) * 0.9;
			if ( seamAt( x, z ) > 0 ) continue;
			addGrass( x, z, 0.35 + r() * 0.5, r() < 0.5 ? 1 : 0, 0.25 );

		}

	}

	// 两侧墙根高草带（堆积体前缘 + 温室矮墙脚）
	for ( let z = G.Z1; z > - 42; z -= 0.035 ) {

		const fx = ivy ? Math.min( ivy.moundFront( z ), L.SOIL_X + 0.4 ) : L.SOIL_X;
		if ( r() < 0.85 ) addGrass( fx - 0.12 + r() * 0.3, z, 0.45 + r() * 0.55, r() < 0.6 ? 1 : 0, 0.2 );
		if ( r() < 1.2 * fbm2( z * 0.3, 1, 2 ) ) addGrass( L.GH_X + 0.06 + Math.pow( r(), 2 ) * 0.35, z, 0.35 + r() * 0.55, r() < 0.5 ? 1 : 0, 0.2 );

	}

	SPEC.forEach( ( sp, k ) => {

		const { m, c } = lists[ k ];
		if ( ! m.length ) return;
		const seed = 900 + k;
		const geos = [ grassClump( seed, sp.n, sp.tall, 4, sp.sp ), grassClump( seed, sp.n, sp.tall, 2, sp.sp ), grassClump( seed, Math.ceil( sp.n * 0.6 ), sp.tall, 1, sp.sp ) ];
		group.add( lodInstanced( geos, mats.grass, m, c, { chunk: 6, dists: [ 0, 7, 16 ], cast: false } ) );

	} );

	// —— 缝隙苔藓垫：嵌在裂缝里的低矮垫状苔藓（贴着板面边缘）——
	const lumps = [ lumpGeometry( 1, 1, 0.5 ), lumpGeometry( 2, 1, 0.6 ), lumpGeometry( 3, 1, 0.45 ) ];
	const ml = lumps.map( () => ( { m: [], c: [] } ) );
	const mossColor = ( k = 1 ) => new THREE.Color().setRGB( ( 0.04 + r() * 0.025 ) * k, ( 0.062 + r() * 0.03 ) * k, ( 0.016 + r() * 0.01 ) * k );
	for ( let i = 0; i < 260000; i ++ ) {

		const x = WALK.x0 + r() * ( WALK.x1 - WALK.x0 ), z = - 41.5 + r() * 51;
		if ( seamAt( x, z ) > 0.0 ) continue;
		if ( sunk( x, z ) < 0.95 || r() > 0.5 * trample( x ) + 0.1 ) continue;
		const k = Math.floor( r() * lumps.length );
		const h = Math.min( heightAt( x + 0.03, z + 0.03 ), heightAt( x - 0.03, z - 0.03 ), L.SLAB_TOP + 0.01 );
		const s = 0.02 + r() * 0.03;
		ml[ k ].m.push( M( x, h - 0.008, z, r() * 6.28, s, s * ( 0.6 + r() * 0.6 ) ) );
		ml[ k ].c.push( mossColor( 0.8 + r() * 0.5 ) );

	}

	ground.mossLumps = { lumps, ml };
	lumps.forEach( ( g, k ) => ml[ k ].m.length && group.add( instanced( g, mats.mossClump, ml[ k ].m, ml[ k ].c, { cast: false } ) ) );

	// —— 落叶与碎屑 ——
	const leafGeos = [ litterLeaf( 0.1 ), litterLeaf( 0.22 ) ];
	const ll = leafGeos.map( () => ( { m: [], c: [] } ) );
	const gm = ground.mask.image.data;
	const dirtAt = ( x, z ) => {

		const i = Math.min( G.RX - 1, Math.max( 0, Math.floor( ( x - G.X0 ) / ( G.X1 - G.X0 ) * G.RX ) ) ), j = Math.min( G.RZ - 1, Math.max( 0, Math.floor( ( z - G.Z0 ) / ( G.Z1 - G.Z0 ) * G.RZ ) ) );
		return gm[ ( j * G.RX + i ) * 4 + 2 ] / 255;

	};

	let leaves = 0;
	for ( let i = 0; i < 80000 && leaves < 14000; i ++ ) {

		const x = G.X0 + 0.05 + r() * ( G.X1 - G.X0 - 0.1 ), z = - 42 + r() * 51;
		const dd = dirtAt( x, z );
		const sd = seamAt( x, z );
		const s = sunk( x, z );
		const p = dd * 0.5 + smooth( 0.06, 0.0, sd ) * 0.4 + smooth( 1.3, 1.0, s ) * 0.4 + ( x > 1.2 || x < - 2.0 ? 0.4 : 0 );
		if ( r() > p * 0.85 ) continue;
		if ( s < 0.95 && r() > smooth( 0.6, 0.95, s ) * 0.5 ) continue;
		const k = r() < 0.6 ? 0 : 1;
		const inWater = s < 0.95;
		const y = inWater ? L.WATER_Y + 0.002 : heightAt( x, z ) + 0.004;
		const sz = 0.04 + r() * 0.06;
		ll[ k ].m.push( M( x, y, z, r() * 6.28, sz, sz, inWater ? 0 : ( r() - 0.5 ) * 0.5, ( r() - 0.5 ) * 0.4 ) );
		const c = new THREE.Color();
		const q = r();
		if ( q < 0.45 ) c.setRGB( 0.16, 0.1, 0.05 );
		else if ( q < 0.7 ) c.setRGB( 0.11, 0.08, 0.045 );
		else if ( q < 0.85 ) c.setRGB( 0.2, 0.15, 0.07 );
		else c.setRGB( 0.07, 0.09, 0.035 );
		ll[ k ].c.push( c.multiplyScalar( ( 0.7 + r() * 0.5 ) * ( inWater ? 0.6 : 1 ) ) );
		leaves ++;

	}

	leafGeos.forEach( ( g, k ) => group.add( instanced( g, mats.litter, ll[ k ].m, ll[ k ].c, { cast: false } ) ) );

	// 碎石、混凝土碎渣（集中在裂缝边）
	const pebble = lumpGeometry( 9, 1, 0.7 );
	const pm = [], pc = [];
	for ( let i = 0; i < 6000; i ++ ) {

		const x = G.X0 + 0.05 + r() * ( G.X1 - G.X0 - 0.1 ), z = - 42 + r() * 51;
		const sd = seamAt( x, z );
		if ( r() > 0.12 + smooth( 0.05, 0.0, sd ) * 0.7 + dirtAt( x, z ) * 0.2 ) continue;
		const s = 0.006 + Math.pow( r(), 3 ) * 0.035;
		pm.push( M( x, heightAt( x, z ) - s * 0.2, z, r() * 6.28, s, s * ( 0.6 + r() * 0.5 ) ) );
		const v = 0.1 + r() * 0.12;
		pc.push( new THREE.Color().setRGB( v, v * 0.98, v * 0.93 ) );

	}

	group.add( instanced( pebble, mats.pebble, pm, pc, { cast: false } ) );

	ground.counts = { blades, leaves };
	return group;

}
