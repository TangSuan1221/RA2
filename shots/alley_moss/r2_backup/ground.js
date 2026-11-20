// 苔藓小巷：步道地面
//   · 不规则 0.6–0.9m 混凝土板（缺角倒角、逐块倾斜 ±1.5°、高差 ±2cm、碎裂、缺失露土）
//   · 光栅化得到地面高度场 → 草、苔藓条、落叶、碎屑都贴地摆放（不悬空）
//   · 积水：下沉板 + 不规则水面多边形（反射）+ 地面遮罩里的湿晕
//   · 缝隙：实例化苔藓条 + 按缝隙距离分布的草丛（约 4 万草叶）
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, noise2, smooth, merge, worldUV, xf, T, dataTex, paint, lumpGeometry, instanced } from './util.js';

export const G = { X0: - 2.3, X1: 2.0, Z0: - 44, Z1: 10, RX: 128, RZ: 1600 };
export const WALK = { x0: - 2.05, x1: L.SOIL_X };

// 积水坑：中心、半径、拉长、旋转
export const PUDDLES = [
	{ x: 0.1, z: - 2.6, r: 0.9, e: 1.5, a: 0.3 },
	{ x: - 0.6, z: - 8.6, r: 1.25, e: 1.9, a: - 0.15 },
	{ x: 0.5, z: - 14.5, r: 0.8, e: 1.4, a: 0.6 },
	{ x: - 1.0, z: - 20.5, r: 1.0, e: 1.7, a: 0.1 },
	{ x: 0.2, z: - 27.5, r: 1.2, e: 1.6, a: - 0.4 },
	{ x: - 0.4, z: - 35.5, r: 1.4, e: 1.5, a: 0.2 },
	{ x: 0.9, z: 3.2, r: 0.55, e: 1.3, a: 0.9 },
];
const puddleR = ( P, x, z ) => {

	// 返回归一化距离（<1 为水内），边缘带噪声
	const dx = x - P.x, dz = z - P.z;
	const c = Math.cos( P.a ), s = Math.sin( P.a );
	const u = dx * c - dz * s, v = ( dx * s + dz * c ) / P.e;
	const th = Math.atan2( v, u );
	const rr = P.r * ( 0.72 + 0.55 * fbm2( Math.cos( th ) * 1.3 + P.x * 3, Math.sin( th ) * 1.3 + P.z, 3 ) );
	return Math.hypot( u, v ) / rr;

};

// 凸多边形按直线切割（返回两侧）
function clip( poly, nx, nz, d ) {

	const A = [], B = [];
	for ( let i = 0; i < poly.length; i ++ ) {

		const p = poly[ i ], q = poly[ ( i + 1 ) % poly.length ];
		const sp = p[ 0 ] * nx + p[ 1 ] * nz - d, sq = q[ 0 ] * nx + q[ 1 ] * nz - d;
		( sp >= 0 ? A : B ).push( p );
		if ( ( sp >= 0 ) !== ( sq >= 0 ) ) {

			const t = sp / ( sp - sq );
			const m = [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t ];
			A.push( m ); B.push( m );

		}

	}

	return [ A, B ];

}

function shrink( poly, k ) {

	let cx = 0, cz = 0;
	for ( const p of poly ) { cx += p[ 0 ]; cz += p[ 1 ]; }
	cx /= poly.length; cz /= poly.length;
	return poly.map( ( p ) => {

		const dx = p[ 0 ] - cx, dz = p[ 1 ] - cz, l = Math.hypot( dx, dz ) || 1;
		return [ p[ 0 ] - dx / l * k, p[ 1 ] - dz / l * k ];

	} );

}

const pointIn = ( poly, x, z ) => {

	let inside = false;
	for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

		const xi = poly[ i ][ 0 ], zi = poly[ i ][ 1 ], xj = poly[ j ][ 0 ], zj = poly[ j ][ 1 ];
		if ( ( zi > z ) !== ( zj > z ) && x < ( xj - xi ) * ( z - zi ) / ( zj - zi ) + xi ) inside = ! inside;

	}

	return inside;

};

export function buildGround( mats ) {

	const r = rng( 7 );
	const pieces = []; // { poly(世界 xz), h, tx, tz, cx, cz }
	const cells = [];
	const BT = 0.012, DEPTH = 0.1;

	// —— 1. 排板：逐行随机行深，行内随机板宽（自然错缝）——
	let z = G.Z1 - 0.2;
	let row = 0;
	while ( z > - 41.5 ) {

		const d = 0.6 + r() * 0.3;
		let x = WALK.x0;
		while ( x < WALK.x1 - 0.05 ) {

			let w = 0.6 + r() * 0.3;
			if ( WALK.x1 - ( x + w ) < 0.55 ) w = WALK.x1 - x;
			cells.push( { x0: x, x1: x + w, z0: z - d, z1: z, row } );
			x += w;

		}

		z -= d; row ++;

	}

	const sunk = ( x, z ) => {

		let best = 9;
		for ( const P of PUDDLES ) best = Math.min( best, puddleR( P, x, z ) );
		return best;

	};

	for ( const c of cells ) {

		const cx = ( c.x0 + c.x1 ) / 2, cz = ( c.z0 + c.z1 ) / 2;
		c.cx = cx; c.cz = cz; c.w = c.x1 - c.x0; c.d = c.z1 - c.z0;
		const nearCam = cz > 3.5;
		// 缺失（露出泥土与杂草）：近机位不缺，靠墙更多
		const pMiss = 0.035 + ( cx > 0.5 ? 0.04 : 0 ) + ( cx < - 1.5 ? 0.03 : 0 );
		if ( ! nearCam && r() < pMiss ) { c.missing = true; continue; }
		const gap = 0.012 + r() * 0.012;
		// 轮廓：矩形 + 边中点抖动 + 随机缺角
		const x0 = c.x0 + gap, x1 = c.x1 - gap, z0 = c.z0 + gap, z1 = c.z1 - gap;
		const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
		let poly = [];
		for ( let i = 0; i < 4; i ++ ) {

			const p = corners[ i ], q = corners[ ( i + 1 ) % 4 ], o = corners[ ( i + 3 ) % 4 ];
			if ( r() < 0.38 ) {

				// 缺角：两点切掉一个三角
				const a = 0.025 + r() * 0.07, b = 0.025 + r() * 0.07;
				const dq = [ q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ], dl = Math.hypot( ...dq );
				const doo = [ o[ 0 ] - p[ 0 ], o[ 1 ] - p[ 1 ] ], ol = Math.hypot( ...doo );
				poly.push( [ p[ 0 ] + doo[ 0 ] / ol * a, p[ 1 ] + doo[ 1 ] / ol * a ] );
				poly.push( [ p[ 0 ] + dq[ 0 ] / dl * b, p[ 1 ] + dq[ 1 ] / dl * b ] );

			} else poly.push( p );

			// 边中点抖动 ±7mm（打破激光般笔直的接缝）
			const m = 1 + Math.floor( r() * 2 );
			for ( let k = 1; k <= m; k ++ ) {

				const t = k / ( m + 1 ) + ( r() - 0.5 ) * 0.15;
				const nx = - ( q[ 1 ] - p[ 1 ] ), nz = q[ 0 ] - p[ 0 ], nl = Math.hypot( nx, nz );
				const j = ( r() - 0.5 ) * 0.014;
				poly.push( [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t + nx / nl * j, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t + nz / nl * j ] );

			}

		}

		// 碎裂：切成 2–3 块，各自独立倾斜
		let polys = [ poly ];
		if ( r() < 0.2 ) {

			const cut = ( P ) => {

				const a = r() * Math.PI, nx = Math.cos( a ), nz = Math.sin( a );
				let mx = 0, mz = 0; for ( const p of P ) { mx += p[ 0 ]; mz += p[ 1 ]; }
				mx /= P.length; mz /= P.length;
				const d = mx * nx + mz * nz + ( r() - 0.5 ) * 0.2;
				const [ A, B ] = clip( P, nx, nz, d );
				return [ shrink( A, 0.006 ), shrink( B, 0.006 ) ].filter( ( q ) => q.length >= 3 );

			};

			polys = cut( poly );
			if ( r() < 0.35 && polys.length === 2 ) polys = [ ...cut( polys[ 0 ] ), polys[ 1 ] ];

		}

		const sR = sunk( cx, cz );
		const inPuddle = sR < 1.25;
		const tone = r(), mossy = Math.min( 1, ( cx > 0.6 ? 0.55 : cx < - 1.4 ? 0.45 : 0.1 ) + r() * 0.4 + ( cz < - 30 ? 0.2 : 0 ) );
		for ( const P of polys ) {

			let h = ( r() - 0.5 ) * 0.04;
			let tx = ( r() - 0.5 ) * 0.052, tz = ( r() - 0.5 ) * 0.052;
			if ( cx > 0.7 ) h += r() * 0.025; // 墙根树根顶起
			if ( polys.length > 1 ) { tx *= 1.5; tz *= 1.5; h += ( r() - 0.5 ) * 0.02; }
			if ( inPuddle ) { h = - 0.03 - r() * 0.008 + Math.max( 0, sR - 0.9 ) * 0.05; tx *= 0.25; tz *= 0.25; }
			if ( nearCam ) { tx *= 0.6; tz *= 0.6; }
			pieces.push( { poly: P, h, tx, tz, tone, mossy } );

		}

	}

	// —— 2. 生成板几何（挤出 + 倒角），并光栅化地面高度场 ——
	const HF = new Float32Array( G.RX * G.RZ ).fill( 0.065 );
	const PID = new Int32Array( G.RX * G.RZ ).fill( - 1 );
	const gx = ( x ) => ( x - G.X0 ) / ( G.X1 - G.X0 ) * G.RX, gz = ( z ) => ( z - G.Z0 ) / ( G.Z1 - G.Z0 ) * G.RZ;
	const slabs = [];
	pieces.forEach( ( pc, pi ) => {

		let cx = 0, cz = 0;
		for ( const p of pc.poly ) { cx += p[ 0 ]; cz += p[ 1 ]; }
		cx /= pc.poly.length; cz /= pc.poly.length;
		pc.cx = cx; pc.cz = cz;
		const shape = new THREE.Shape( pc.poly.map( ( p ) => new THREE.Vector2( p[ 0 ] - cx, - ( p[ 1 ] - cz ) ) ) );
		const g = new THREE.ExtrudeGeometry( shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: 0.01, bevelSegments: 2, steps: 1, curveSegments: 1 } );
		g.rotateX( - Math.PI / 2 );
		const top = DEPTH + BT;
		const yBase = L.SLAB_TOP + pc.h - top;
		xf( g, T( cx, yBase, cz, pc.tx, 0, pc.tz ) );
		const ng = g.index ? g.toNonIndexed() : g;
		ng.computeVertexNormals();
		worldUV( ng, 2.4, [ r() * 9, r() * 9 ] );
		paint( ng, pc.tone, pc.mossy, 0 );
		slabs.push( ng );
		// 高度场：板面平面方程（近似：小角度）
		const xs = pc.poly.map( ( p ) => p[ 0 ] ), zs = pc.poly.map( ( p ) => p[ 1 ] );
		const i0 = Math.max( 0, Math.floor( gx( Math.min( ...xs ) ) ) ), i1 = Math.min( G.RX - 1, Math.ceil( gx( Math.max( ...xs ) ) ) );
		const j0 = Math.max( 0, Math.floor( gz( Math.min( ...zs ) ) ) ), j1 = Math.min( G.RZ - 1, Math.ceil( gz( Math.max( ...zs ) ) ) );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

			const x = G.X0 + ( i + 0.5 ) / G.RX * ( G.X1 - G.X0 ), z = G.Z0 + ( j + 0.5 ) / G.RZ * ( G.Z1 - G.Z0 );
			if ( ! pointIn( pc.poly, x, z ) ) continue;
			// 绕 X 轴转 tx：z 方向坡度 -tan(tx)... Euler XYZ 下顶面高度近似
			HF[ j * G.RX + i ] = L.SLAB_TOP + pc.h + ( z - cz ) * Math.tan( pc.tx ) - ( x - cx ) * Math.tan( pc.tz );
			PID[ j * G.RX + i ] = pi;

		}

	} );

	const heightAt = ( x, z ) => {

		const i = Math.min( G.RX - 1, Math.max( 0, Math.floor( gx( x ) ) ) ), j = Math.min( G.RZ - 1, Math.max( 0, Math.floor( gz( z ) ) ) );
		return HF[ j * G.RX + i ];

	};

	const onSlab = ( x, z ) => {

		const i = Math.min( G.RX - 1, Math.max( 0, Math.floor( gx( x ) ) ) ), j = Math.min( G.RZ - 1, Math.max( 0, Math.floor( gz( z ) ) ) );
		return PID[ j * G.RX + i ] >= 0;

	};

	// 到最近缝隙的距离（在高度场网格上做距离变换，单位 m）
	const seamD = new Float32Array( G.RX * G.RZ );
	{

		const cs = ( G.X1 - G.X0 ) / G.RX;
		for ( let k = 0; k < seamD.length; k ++ ) seamD[ k ] = PID[ k ] < 0 ? 0 : 1e3;
		for ( let pass = 0; pass < 2; pass ++ ) {

			const s = pass ? - 1 : 1;
			const jr = pass ? [ G.RZ - 1, - 1 ] : [ 0, G.RZ ];
			const ir = pass ? [ G.RX - 1, - 1 ] : [ 0, G.RX ];
			for ( let j = jr[ 0 ]; j !== jr[ 1 ]; j += s ) for ( let i = ir[ 0 ]; i !== ir[ 1 ]; i += s ) {

				const k = j * G.RX + i;
				let v = seamD[ k ];
				const pi = i - s, pj = j - s;
				if ( pi >= 0 && pi < G.RX ) v = Math.min( v, seamD[ j * G.RX + pi ] + cs );
				if ( pj >= 0 && pj < G.RZ ) v = Math.min( v, seamD[ pj * G.RX + i ] + cs );
				seamD[ k ] = v;

			}

		}

	}

	const seamAt = ( x, z ) => {

		const i = Math.min( G.RX - 1, Math.max( 0, Math.floor( gx( x ) ) ) ), j = Math.min( G.RZ - 1, Math.max( 0, Math.floor( gz( z ) ) ) );
		return seamD[ j * G.RX + i ];

	};

	// —— 3. 地面遮罩：R=湿晕（积水周围 + 随机潮湿斑）G=泥污/落叶密度 ——
	const mask = dataTex( G.RX, G.RZ, ( d ) => {

		for ( let j = 0; j < G.RZ; j ++ ) for ( let i = 0; i < G.RX; i ++ ) {

			const x = G.X0 + ( i + 0.5 ) / G.RX * ( G.X1 - G.X0 ), z = G.Z0 + ( j + 0.5 ) / G.RZ * ( G.Z1 - G.Z0 );
			const s = sunk( x, z );
			const wet = Math.max( smooth( 1.7, 0.95, s ), 0.55 * smooth( 0.56, 0.66, fbm2( x * 0.9, z * 0.45, 4 ) ) );
			const k = j * G.RX + i;
			d[ k * 4 ] = wet * 255;
			d[ k * 4 + 1 ] = Math.min( 1, smooth( 0.45, 0.7, fbm2( x * 1.7 + 30, z * 1.1, 4 ) ) + smooth( - 0.9, - 1.9, x ) * 0.4 + smooth( 0.7, 1.3, x ) * 0.4 ) * 255;
			d[ k * 4 + 2 ] = 0; d[ k * 4 + 3 ] = 255;

		}

	} );
	mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;

	const group = new THREE.Group();
	const slabMesh = new THREE.Mesh( merge( slabs ), mats.slab( mask ) );
	slabMesh.receiveShadow = slabMesh.castShadow = true;
	group.add( slabMesh );

	// 板下的泥土层（从缝隙与缺失处露出），并延伸到墙根与温室墙根
	const soil = new THREE.PlaneGeometry( 30, 70, 1, 1 );
	soil.rotateX( - Math.PI / 2 );
	soil.translate( - 4, 0.065, - 18 );
	const soilMesh = new THREE.Mesh( soil, mats.soil );
	soilMesh.receiveShadow = true;
	group.add( soilMesh );

	// —— 4. 积水水面：不规则多边形 ——
	const water = [];
	for ( const P of PUDDLES ) {

		const pts = [];
		const N = 48;
		for ( let k = 0; k < N; k ++ ) {

			const th = k / N * Math.PI * 2;
			const rr = P.r * ( 0.72 + 0.55 * fbm2( Math.cos( th ) * 1.3 + P.x * 3, Math.sin( th ) * 1.3 + P.z, 3 ) );
			const u = Math.cos( th ) * rr, v = Math.sin( th ) * rr * P.e;
			const c = Math.cos( P.a ), s = Math.sin( P.a );
			// 逆旋转回世界
			const x = P.x + u * c + v * s, z = P.z - u * s + v * c;
			pts.push( new THREE.Vector2( x, - z ) );

		}

		const g = new THREE.ShapeGeometry( new THREE.Shape( pts ) );
		g.rotateX( - Math.PI / 2 );
		water.push( g );

	}

	const wg = merge( water );
	const waterMesh = new THREE.Mesh( wg, mats.water );
	waterMesh.position.y = L.WATER_Y;
	waterMesh.receiveShadow = true;
	waterMesh.renderOrder = 1;
	group.add( waterMesh );

	return { group, cells, pieces, heightAt, onSlab, seamAt, mask, sunk, r };

}

// ———————————————————————— 缝隙苔藓条 + 草丛 + 落叶碎屑 ————————————————————————
function grassClump( r, blades = 9, tall = 1 ) {

	const pos = [], uvs = [], idx = [];
	for ( let b = 0; b < blades; b ++ ) {

		const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.55;
		const h = ( 0.45 + r() * 0.65 ) * tall, w = 0.01 + r() * 0.009;
		const ox = ( r() - 0.5 ) * 0.1, oz = ( r() - 0.5 ) * 0.1;
		const dx = Math.cos( a ), dz = Math.sin( a );
		const base = pos.length / 3;
		const SEG = 4;
		for ( let s = 0; s <= SEG; s ++ ) {

			const t = s / SEG;
			const bend = lean * t * t;
			const cx = ox + dx * bend * h, cz = oz + dz * bend * h, cy = h * t * ( 1 - 0.3 * lean * t );
			const ww = w * ( 1 - t * 0.92 );
			pos.push( cx - dz * ww, cy, cz + dx * ww, cx + dz * ww, cy, cz - dx * ww );
			uvs.push( 0, t, 1, t );

		}

		for ( let s = 0; s < SEG; s ++ ) {

			const i0 = base + s * 2;
			idx.push( i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	const n = g.attributes.normal;
	for ( let i = 0; i < n.count; i ++ ) n.setY( i, n.getY( i ) + 0.9 );
	return g;

}

export { grassClump };

// 平躺的落叶（单位大小，叶面朝 +Y）
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

export function buildGroundCover( mats, ground ) {

	const { cells, heightAt, onSlab, seamAt, sunk } = ground;
	const r = rng( 303 );
	const group = new THREE.Group();
	const M = ( x, y, z, ry, s, sy = s, rx = 0, rz = 0 ) => new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz ) ), new THREE.Vector3( s, sy, s ) );

	// —— 草丛：沿缝隙分布（密度 = 噪声 × 靠墙增益 × 中央被踩踏衰减）——
	const variants = [ grassClump( r, 7 ), grassClump( r, 11 ), grassClump( r, 5, 0.7 ), grassClump( r, 14, 1.2 ) ];
	const lists = variants.map( () => ( { m: [], c: [] } ) );
	let blades = 0;
	const addGrass = ( x, z, s, k = Math.floor( r() * variants.length ) ) => {

		if ( sunk( x, z ) < 0.95 ) return; // 水里不长
		const y = Math.min( heightAt( x, z ), L.SLAB_TOP ) - 0.02;
		lists[ k ].m.push( M( x, y, z, r() * 6.28, s, s * ( 0.7 + r() * 0.6 ) ) );
		const c = new THREE.Color().setRGB( 0.034 + r() * 0.025, 0.046 + r() * 0.026, 0.016 + r() * 0.01 );
		if ( r() < 0.2 ) c.setRGB( 0.075, 0.066, 0.036 ); // 枯草
		lists[ k ].c.push( c );
		blades += [ 7, 11, 5, 14 ][ k ];

	};

	const trample = ( x ) => 1 - 0.7 * smooth( 0.9, 0.0, Math.abs( x + 0.35 ) );
	// 沿每个格子的边（即缝隙）采样
	for ( const c of cells ) {

		if ( c.missing ) {

			for ( let i = 0; i < 30; i ++ ) addGrass( c.cx + ( r() - 0.5 ) * c.w, c.cz + ( r() - 0.5 ) * c.d, 0.45 + r() * 0.6 );
			continue;

		}

		const edges = [ [ c.x0, c.z0, c.x1, c.z0 ], [ c.x1, c.z0, c.x1, c.z1 ] ];
		for ( const [ ax, az, bx, bz ] of edges ) {

			const len = Math.hypot( bx - ax, bz - az );
			const mx = ( ax + bx ) / 2, mz = ( az + bz ) / 2;
			const dens = Math.pow( fbm2( mx * 0.9 + 3, mz * 0.6, 3 ), 1.6 ) * 2.4 * trample( mx ) + ( mx > 0.8 || mx < - 1.6 ? 0.6 : 0 );
			const n = Math.floor( len * dens * 9 + r() );
			for ( let i = 0; i < n; i ++ ) {

				const t = r();
				const x = ax + ( bx - ax ) * t + ( r() - 0.5 ) * 0.02, z = az + ( bz - az ) * t + ( r() - 0.5 ) * 0.02;
				addGrass( x, z, 0.14 + r() * 0.3 * ( 0.5 + dens * 0.4 ), r() < 0.5 ? 2 : Math.floor( r() * 4 ) );

			}

		}

	}

	// 两侧墙根的高草带
	for ( let z = G.Z1; z > - 42; z -= 0.07 ) {

		if ( r() < 0.8 ) addGrass( L.SOIL_X - 0.08 + r() * 0.25, z, 0.4 + r() * 0.55, 3 );
		if ( r() < 0.9 * fbm2( z * 0.3, 1, 2 ) * 1.6 ) addGrass( L.GH_X + 0.06 + r() * 0.28, z, 0.35 + r() * 0.65 );

	}

	variants.forEach( ( g, k ) => {

		const { m, c } = lists[ k ];
		if ( m.length ) group.add( instanced( g, mats.grass, m, c, { cast: false } ) );

	} );

	// —— 苔藓条：嵌在缝隙里的低矮垫状苔藓（高度贴着板面）——
	const lumps = [ lumpGeometry( 1, 1, 0.5 ), lumpGeometry( 2, 1, 0.6 ), lumpGeometry( 3, 1, 0.45 ) ];
	const ml = lumps.map( () => ( { m: [], c: [] } ) );
	const mossColor = ( k = 1 ) => new THREE.Color().setRGB( ( 0.045 + r() * 0.035 ) * k, ( 0.065 + r() * 0.04 ) * k, ( 0.016 + r() * 0.01 ) * k );
	for ( const c of cells ) {

		const edges = [ [ c.x0, c.z0, c.x1, c.z0 ], [ c.x1, c.z0, c.x1, c.z1 ] ];
		for ( const [ ax, az, bx, bz ] of edges ) {

			const len = Math.hypot( bx - ax, bz - az );
			const along = Math.atan2( bx - ax, bz - az );
			const mx = ( ax + bx ) / 2;
			const n = Math.floor( len * ( 7 + 9 * fbm2( mx * 1.3, az * 0.9 + 5, 3 ) ) * trample( mx ) );
			for ( let i = 0; i < n; i ++ ) {

				const t = r();
				const x = ax + ( bx - ax ) * t, z = az + ( bz - az ) * t;
				if ( sunk( x, z ) < 0.9 ) continue;
				const k = Math.floor( r() * lumps.length );
				const l = 0.05 + r() * 0.1;
				const h = Math.min( heightAt( x + 0.04, z + 0.04 ), heightAt( x - 0.04, z - 0.04 ), L.SLAB_TOP + 0.01 );
				ml[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, h - 0.012, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, along, 0 ) ), new THREE.Vector3( 0.022 + r() * 0.016, 0.03 + r() * 0.025, l ) ) );
				ml[ k ].c.push( mossColor( 1 + r() * 0.5 ) );

			}

		}

	}

	// 板面上零星的苔藓垫（靠墙一侧更多）
	for ( let i = 0; i < 1400; i ++ ) {

		const x = WALK.x0 + r() * ( WALK.x1 - WALK.x0 ), z = - 41 + r() * 50;
		const w = smooth( 0.2, 1.2, x ) + smooth( - 1.2, - 2.0, x ) * 0.8;
		if ( r() > w * 0.8 + 0.06 || sunk( x, z ) < 1.0 ) continue;
		const k = Math.floor( r() * lumps.length );
		const s = 0.03 + r() * 0.07;
		ml[ k ].m.push( M( x, heightAt( x, z ) - 0.005, z, r() * 6.28, s, s * 0.45 ) );
		ml[ k ].c.push( mossColor( 1.2 ) );

	}

	ground.mossLumps = { lumps, ml };
	lumps.forEach( ( g, k ) => ml[ k ].m.length && group.add( instanced( g, mats.mossClump, ml[ k ].m, ml[ k ].c, { cast: false } ) ) );

	// —— 落叶与碎屑：约 1.5 万片落叶 + 碎石 + 纸片 ——
	const leafGeos = [ litterLeaf( 0.1 ), litterLeaf( 0.22 ) ];
	const ll = leafGeos.map( () => ( { m: [], c: [] } ) );
	const gm = ground.mask.image.data;
	const dirtAt = ( x, z ) => {

		const i = Math.min( G.RX - 1, Math.max( 0, Math.floor( ( x - G.X0 ) / ( G.X1 - G.X0 ) * G.RX ) ) ), j = Math.min( G.RZ - 1, Math.max( 0, Math.floor( ( z - G.Z0 ) / ( G.Z1 - G.Z0 ) * G.RZ ) ) );
		return gm[ ( j * G.RX + i ) * 4 + 1 ] / 255;

	};

	let leaves = 0;
	for ( let i = 0; i < 60000 && leaves < 16000; i ++ ) {

		const x = G.X0 + 0.05 + r() * ( G.X1 - G.X0 - 0.1 ), z = - 42 + r() * 51;
		const dd = dirtAt( x, z );
		// 落叶堆积在缝隙、墙根、积水边
		const sd = seamAt( x, z );
		const s = sunk( x, z );
		const p = dd * 0.6 + smooth( 0.08, 0.0, sd ) * 0.35 + smooth( 1.3, 1.0, s ) * 0.4 + ( x > 1.2 || x < - 2.0 ? 0.4 : 0 );
		if ( r() > p * 0.9 ) continue;
		// 水面上只在边缘漂少量落叶
		if ( s < 0.95 && r() > smooth( 0.6, 0.95, s ) * 0.5 ) continue;
		const k = r() < 0.6 ? 0 : 1;
		const inWater = s < 0.95;
		const y = inWater ? L.WATER_Y + 0.002 : heightAt( x, z ) + 0.004;
		const sz = 0.045 + r() * 0.06;
		const tilt = inWater ? 0 : ( r() - 0.5 ) * 0.5;
		ll[ k ].m.push( M( x, y, z, r() * 6.28, sz, sz, tilt, ( r() - 0.5 ) * 0.4 ) );
		const c = new THREE.Color();
		const q = r();
		if ( q < 0.45 ) c.setRGB( 0.07, 0.045, 0.02 ); // 褐色枯叶
		else if ( q < 0.7 ) c.setRGB( 0.05, 0.038, 0.02 );
		else if ( q < 0.85 ) c.setRGB( 0.09, 0.07, 0.03 ); // 黄褐
		else c.setRGB( 0.03, 0.04, 0.015 ); // 绿叶
		ll[ k ].c.push( c.multiplyScalar( ( 0.7 + r() * 0.5 ) * ( inWater ? 0.6 : 1 ) ) );
		leaves ++;

	}

	leafGeos.forEach( ( g, k ) => group.add( instanced( g, mats.litter, ll[ k ].m, ll[ k ].c, { cast: false } ) ) );

	// 碎石、混凝土碎块
	const pebble = lumpGeometry( 9, 1, 0.7 );
	const pm = [], pc = [];
	for ( let i = 0; i < 2600; i ++ ) {

		const x = G.X0 + 0.05 + r() * ( G.X1 - G.X0 - 0.1 ), z = - 42 + r() * 51;
		const sd = seamAt( x, z );
		if ( r() > 0.25 + smooth( 0.06, 0.0, sd ) * 0.6 + dirtAt( x, z ) * 0.3 ) continue;
		const s = 0.008 + Math.pow( r(), 3 ) * 0.04;
		pm.push( M( x, heightAt( x, z ) - s * 0.2, z, r() * 6.28, s, s * ( 0.6 + r() * 0.5 ) ) );
		const v = 0.08 + r() * 0.1;
		pc.push( new THREE.Color().setRGB( v, v * 0.98, v * 0.93 ) );

	}

	group.add( instanced( pebble, mats.pebble, pm, pc, { cast: false } ) );

	ground.counts = { blades, leaves };
	return group;

}
