// 苔藓小巷：程序化常春藤（第三轮重写）
//   1. 叶片：真实网格常春藤叶（5 裂掌状、叶面杯状下凹、叶柄），三级 LOD：52 / 13 / 4 三角面
//   2. 墙面藤蔓：空间殖民算法（space colonization）——在墙面「覆盖遮罩」内撒吸引点，
//      从墙根（土堆里）与墙顶（屋面翻下来）的根节点向吸引点生长，自然分叉；
//      藤茎按管道模型（后代数量）变粗；叶片只长在藤茎节点上（不再有悬空/漂在压顶上的叶子）
//   3. 墙根堆积体：椭球团块并集 + 表层常春藤叶 + 阔叶杂草（真实叶片贴图卡片）+ 蕨类 + 高草
//   4. 温室檐口垂挂帘
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, noise2, smooth, mergeIndexed, taperTube, instanced, lodInstanced } from './util.js';

// ———————————————————————— 叶片几何 ————————————————————————
// 常春藤叶轮廓：极坐标控制点（角度：从叶尖方向起算，度；半径：相对叶长）
const IVY_OUTLINE = [ [ 0, 1.0 ], [ 16, 0.62 ], [ 30, 0.5 ], [ 48, 0.74 ], [ 62, 0.6 ], [ 80, 0.45 ], [ 100, 0.58 ], [ 116, 0.56 ], [ 135, 0.38 ], [ 152, 0.3 ], [ 168, 0.14 ], [ 180, 0.08 ] ];
function ivyR( deg, lobe ) {

	const a = Math.abs( deg );
	for ( let i = 0; i < IVY_OUTLINE.length - 1; i ++ ) {

		const [ a0, r0 ] = IVY_OUTLINE[ i ], [ a1, r1 ] = IVY_OUTLINE[ i + 1 ];
		if ( a <= a1 ) {

			const t = ( a - a0 ) / ( a1 - a0 );
			const r = r0 + ( r1 - r0 ) * ( 0.5 - 0.5 * Math.cos( Math.PI * t ) );
			// lobe：0 = 心形全缘（成熟叶），1 = 深裂（幼叶）
			const flat = 0.55 + 0.45 * Math.cos( a / 180 * Math.PI * 0.5 );
			return r * lobe + flat * 0.62 * ( 1 - lobe );

		}

	}

	return 0.08;

}

// 叶片中心（叶柄着生点）位于叶片「基部」上方 0.32 处；叶长方向 +Y，叶面法线 +Z
// detail：2 = 外圈全部控制点 + 中圈（52 面），1 = 隔点取样扇形（13 面），0 = 菱形（4 面）
export function ivyLeafGeometry( detail = 2, lobe = 0.8, cup = 0.22, droop = 0.18 ) {

	const C = [ 0, 0.32 ]; // 着生点（叶片坐标）
	const angs = [];
	for ( const [ a ] of IVY_OUTLINE ) { angs.push( a ); if ( a > 0 && a < 180 ) angs.push( - a ); }
	angs.sort( ( x, y ) => x - y );
	let ring = angs.filter( ( a ) => a > - 180 ); // -168..180
	if ( detail === 1 ) ring = ring.filter( ( _, i ) => i % 2 === 0 );
	if ( detail === 0 ) ring = [ 0, 62, 180, - 62 ];
	const pos = [], uvs = [], idx = [];
	const S = 0.68; // 半径缩放：叶尖到着生点 0.68 → 总叶长约 1
	const P = ( x, y ) => {

		// 杯状下凹（离中线越远越翘起）+ 叶尖下垂
		const z = cup * x * x * 1.6 + droop * Math.max( 0, y - 0.3 ) * Math.max( 0, y - 0.3 ) * 1.5 - 0.02 * Math.sin( Math.PI * Math.min( 1, Math.max( 0, y ) ) );
		pos.push( x, y, z );
		uvs.push( x / 0.62, y );

	};

	P( C[ 0 ], C[ 1 ] );
	const outer = [], mid = [];
	for ( const a of ring ) {

		const r = ivyR( a, lobe ) * S;
		const t = a / 180 * Math.PI;
		outer.push( pos.length / 3 ); P( C[ 0 ] + Math.sin( t ) * r, C[ 1 ] + Math.cos( t ) * r );

	}

	const n = ring.length;
	if ( detail === 2 ) {

		// 中圈：每隔一个外圈点放一个（半径 0.5）
		for ( let i = 0; i < n; i += 2 ) {

			const a = ring[ i ];
			const r = ivyR( a, lobe ) * S * 0.5;
			const t = a / 180 * Math.PI;
			mid.push( pos.length / 3 ); P( C[ 0 ] + Math.sin( t ) * r, C[ 1 ] + Math.cos( t ) * r );

		}

		const m = mid.length;
		for ( let k = 0; k < m; k ++ ) {

			const a = mid[ k ], b = mid[ ( k + 1 ) % m ];
			idx.push( 0, a, b );
			const o0 = outer[ ( 2 * k ) % n ], o1 = outer[ ( 2 * k + 1 ) % n ], o2 = outer[ ( 2 * k + 2 ) % n ];
			idx.push( a, o0, o1, a, o1, b, b, o1, o2 );

		}

	} else for ( let k = 0; k < n; k ++ ) idx.push( 0, outer[ k ], outer[ ( k + 1 ) % n ] );

	// 叶柄（细三角带，从 0,0 到着生点）
	if ( detail > 0 ) {

		const b = pos.length / 3;
		pos.push( - 0.012, - 0.02, 0.01, 0.012, - 0.02, 0.01, 0, C[ 1 ] + 0.02, 0 );
		uvs.push( 0, 0, 0, 0, 0, 0.05 );
		idx.push( b, b + 1, b + 2 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// 让法线朝 +Z（顶点顺序决定），若相反则翻转索引
	if ( g.attributes.normal.getZ( 0 ) < 0 ) {

		const ix = g.index.array;
		for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; }
		g.computeVertexNormals();

	}

	g.computeBoundingSphere();
	return g;

}

// —— 阔叶杂草卡片（weed_plant_02 叶片图集，像素坐标 1024²）：叶基 B、叶尖 T、半宽 W ——
export const WEED_LEAVES = [
	{ B: [ 704, 160 ], T: [ 248, 104 ], W: 140 },
	{ B: [ 704, 376 ], T: [ 275, 392 ], W: 72 },
	{ B: [ 888, 528 ], T: [ 896, 176 ], W: 118 },
	{ B: [ 672, 640 ], T: [ 155, 704 ], W: 140 },
	{ B: [ 936, 912 ], T: [ 352, 968 ], W: 110 },
];
export function weedLeafGeometry( k, detail = 1 ) {

	const { B, T, W } = WEED_LEAVES[ k ];
	const ax = T[ 0 ] - B[ 0 ], ay = T[ 1 ] - B[ 1 ];
	const len = Math.hypot( ax, ay );
	const px = - ay / len, py = ax / len;
	const NX = detail ? 3 : 1, NY = detail ? 5 : 2;
	const aspect = 2 * W / len;
	const pos = [], uvs = [], idx = [];
	for ( let j = 0; j <= NY; j ++ ) for ( let i = 0; i <= NX; i ++ ) {

		const v = j / NY, u = i / NX - 0.5;
		// 叶片：长 1，宽 aspect；中脉折起 + 沿长度拱起再下垂
		const x = u * aspect;
		const y = v;
		const z = Math.abs( u ) * aspect * 0.35 + Math.sin( v * Math.PI ) * 0.12 - v * v * 0.25;
		pos.push( x, y, z );
		const sx = B[ 0 ] + ax * v + px * u * 2 * W, sy = B[ 1 ] + ay * v + py * u * 2 * W;
		uvs.push( sx / 1024, 1 - sy / 1024 );

	}

	for ( let j = 0; j < NY; j ++ ) for ( let i = 0; i < NX; i ++ ) {

		const a = j * ( NX + 1 ) + i, b = a + 1, c = a + NX + 1, d = c + 1;
		idx.push( a, b, c, b, d, c );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 叶片矩阵：p 着生点，n 叶面法线，t 叶轴（叶基→叶尖）方向，size 叶长，roll 绕叶轴翻滚
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _r = new THREE.Quaternion();
export function leafMatrix( p, n, t, size, roll = 0 ) {

	_z.copy( n ).normalize();
	_y.copy( t ).addScaledVector( _z, - t.dot( _z ) );
	if ( _y.lengthSq() < 1e-6 ) _y.set( 0, 1, 0 ).addScaledVector( _z, - _z.y );
	_y.normalize();
	_x.crossVectors( _y, _z );
	_m.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _m );
	if ( roll ) _q.multiply( _r.setFromAxisAngle( _y.set( 0, 1, 0 ), roll ) );
	_s.set( size, size, size );
	return new THREE.Matrix4().compose( p, _q, _s );

}

// 叶色：线性反照率约 0.08~0.15 的灰绿；逐叶色相/明度抖动；少量嫩叶与枯叶
const _hsl = {};
export function ivyColor( r, shade = 1 ) {

	const c = new THREE.Color();
	const k = r();
	if ( k < 0.035 ) c.setRGB( 0.15, 0.1, 0.045 ); // 枯黄
	else if ( k < 0.12 ) c.setRGB( 0.11, 0.145, 0.05 ); // 嫩叶
	else if ( k < 0.45 ) c.setRGB( 0.055, 0.085, 0.036 ); // 老叶（深）
	else c.setRGB( 0.075, 0.11, 0.045 );
	c.getHSL( _hsl );
	c.setHSL( _hsl.h + ( r() - 0.5 ) * 0.04, _hsl.s * ( 0.8 + r() * 0.25 ), _hsl.l * ( 0.85 + r() * 0.3 ) );
	return c.multiplyScalar( shade );

}

// ———————————————————————— 墙面覆盖遮罩 ————————————————————————
function makeCoverage( moundH ) {

	const H = L.WALL_H;
	const baseH = ( z ) => {

		const tongue = smooth( 0.55, 0.75, fbm2( z * 0.85, 4.4, 3 ) ) * ( 1.2 + 2.0 * fbm2( z * 0.3, 8.1, 2 ) );
		const body = 0.5 + 2.4 * Math.pow( smooth( 0.3, 0.75, fbm2( z * 0.22, 3.3, 4 ) ), 1.2 );
		const full = smooth( 0.62, 0.7, fbm2( z * 0.07, 9.9, 2 ) ) * 6;
		return moundH( z ) + body + tongue + full;

	};

	const dropH = ( z ) => 2.6 * smooth( 0.48, 0.78, fbm2( z * 0.21, 12.3, 3 ) );
	const cov = ( z, y ) => {

		const e = ( fbm2( z * 2.2, y * 2.2 + 3, 3 ) - 0.5 ) * 0.9;
		const up = y < baseH( z ) + e;
		const down = y > H - dropH( z ) + e * 0.8;
		// 覆盖区内部的小空洞（露出苔藓/墙面）
		const hole = fbm2( z * 1.4 + 20, y * 1.4, 3 ) < 0.3;
		return ( up || down ) && ! hole;

	};

	return { cov, baseH, dropH };

}

// ———————————————————————— 空间殖民生长 ————————————————————————
function colonize( r, attractors, roots, { Di = 0.42, Dk = 0.075, step = 0.045, maxIter = 420 } = {} ) {

	// 节点：{ z, y, parent, dz, dy, bias }
	const nodes = roots.map( ( o ) => ( { z: o.z, y: o.y, parent: - 1, dz: 0, dy: o.bias > 0 ? 1 : - 1, bias: o.bias } ) );
	const cs = Di;
	const grid = new Map();
	const key = ( z, y ) => Math.floor( z / cs ) * 100003 + Math.floor( y / cs );
	const addGrid = ( i ) => { const k = key( nodes[ i ].z, nodes[ i ].y ); let a = grid.get( k ); if ( ! a ) grid.set( k, a = [] ); a.push( i ); };
	nodes.forEach( ( _, i ) => addGrid( i ) );
	let alive = attractors.map( ( a ) => ( { z: a[ 0 ], y: a[ 1 ] } ) );
	const acc = new Map();
	for ( let it = 0; it < maxIter && alive.length; it ++ ) {

		acc.clear();
		for ( const a of alive ) {

			const cz = Math.floor( a.z / cs ), cy = Math.floor( a.y / cs );
			let best = - 1, bd = Di * Di;
			for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) {

				const list = grid.get( ( cz + dz ) * 100003 + cy + dy );
				if ( ! list ) continue;
				for ( const i of list ) {

					const n = nodes[ i ];
					const d = ( n.z - a.z ) ** 2 + ( n.y - a.y ) ** 2;
					if ( d < bd ) { bd = d; best = i; }

				}

			}

			if ( best < 0 ) continue;
			const n = nodes[ best ], l = Math.sqrt( bd ) || 1;
			let v = acc.get( best );
			if ( ! v ) acc.set( best, v = [ 0, 0, 0 ] );
			v[ 0 ] += ( a.z - n.z ) / l; v[ 1 ] += ( a.y - n.y ) / l; v[ 2 ] ++;

		}

		if ( ! acc.size ) break;
		const fresh = [];
		for ( const [ i, v ] of acc ) {

			const n = nodes[ i ];
			let dz = v[ 0 ] / v[ 2 ] + n.dz * 0.35 + ( r() - 0.5 ) * 0.35;
			let dy = v[ 1 ] / v[ 2 ] + n.dy * 0.35 + n.bias * 0.25;
			const l = Math.hypot( dz, dy ) || 1;
			dz /= l; dy /= l;
			const nn = { z: n.z + dz * step, y: n.y + dy * step, parent: i, dz, dy, bias: n.bias };
			if ( nn.y < 0.02 || nn.y > L.WALL_H - 0.03 ) continue;
			nodes.push( nn );
			addGrid( nodes.length - 1 );
			fresh.push( nn );

		}

		if ( ! fresh.length ) break;
		// 杀死被到达的吸引点
		const kg = new Map();
		for ( const f of fresh ) { const k = key( f.z, f.y ); let a = kg.get( k ); if ( ! a ) kg.set( k, a = [] ); a.push( f ); }
		alive = alive.filter( ( a ) => {

			const cz = Math.floor( a.z / cs ), cy = Math.floor( a.y / cs );
			for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) {

				const list = kg.get( ( cz + dz ) * 100003 + cy + dy );
				if ( list ) for ( const f of list ) if ( ( f.z - a.z ) ** 2 + ( f.y - a.y ) ** 2 < Dk * Dk ) return false;

			}

			return true;

		} );

	}

	// 后代数量（管道模型）
	const desc = new Float32Array( nodes.length ).fill( 1 );
	for ( let i = nodes.length - 1; i >= 0; i -- ) if ( nodes[ i ].parent >= 0 ) desc[ nodes[ i ].parent ] += desc[ i ];
	const kids = new Int32Array( nodes.length );
	for ( const n of nodes ) if ( n.parent >= 0 ) kids[ n.parent ] ++;
	return { nodes, desc, kids };

}

// ———————————————————————— 主函数 ————————————————————————
export function buildIvy( mats, mossSample ) {

	const r = rng( 101 );
	const WX = L.WALL_X;
	const H = L.WALL_H;
	const ivyM = [], ivyC = []; // 常春藤叶实例
	const weedM = WEED_LEAVES.map( () => [] ), weedC = WEED_LEAVES.map( () => [] );
	const stems = [];
	const P = new THREE.Vector3(), N = new THREE.Vector3(), Tt = new THREE.Vector3();

	const pushIvy = ( p, n, t, size, shade, roll = 0 ) => {

		ivyM.push( leafMatrix( p.clone(), n, t, size, roll ) );
		ivyC.push( ivyColor( r, shade ) );

	};

	// —— 1. 墙根堆积体（0.4–1.2m 高，边缘圆滑滚落）——
	const blobs = [];
	for ( let z = L.Z1 + 1.5; z > L.Z0 - 1; ) {

		const gapN = fbm2( z * 0.09, 9.1, 3 );
		const big = fbm2( z * 0.21, 3.7, 4 );
		const Hh = gapN < 0.34 ? 0.22 + r() * 0.15 : 0.4 + 0.75 * Math.pow( big, 1.2 ) + r() * 0.2;
		const R = 0.3 + r() * 0.45;
		blobs.push( { z, y: 0.04, x: WX - 0.04 - r() * 0.1, rz: R, ry: Hh, rx: Math.min( 0.85, 0.35 + Hh * 0.5 + r() * 0.15 ) } );
		if ( Hh > 0.5 && r() < 0.6 ) blobs.push( { z: z + ( r() - 0.5 ) * R, y: Hh * 0.45, x: WX - 0.06, rz: R * 0.55, ry: Hh * 0.6 + r() * 0.2, rx: 0.25 + r() * 0.15 } );
		z -= R * ( 0.9 + r() * 0.5 );

	}

	const inside = ( x, y, z, skip ) => {

		let best = 0;
		for ( let i = 0; i < blobs.length; i ++ ) {

			if ( i === skip ) continue;
			const b = blobs[ i ];
			if ( Math.abs( z - b.z ) > b.rz ) continue;
			const d = ( ( x - b.x ) / b.rx ) ** 2 + ( ( y - b.y ) / b.ry ) ** 2 + ( ( z - b.z ) / b.rz ) ** 2;
			best = Math.max( best, 1 - d );

		}

		return best;

	};

	const moundH = ( z ) => {

		let h = 0;
		for ( const b of blobs ) if ( Math.abs( z - b.z ) < b.rz ) h = Math.max( h, b.y + b.ry * Math.sqrt( 1 - ( ( z - b.z ) / b.rz ) ** 2 ) );
		return h;

	};

	// 堆积体最外缘（巷子一侧）x：用于布置阔叶杂草与草
	const moundFront = ( z ) => {

		let x = WX;
		for ( const b of blobs ) if ( Math.abs( z - b.z ) < b.rz ) x = Math.min( x, b.x - b.rx * Math.sqrt( 1 - ( ( z - b.z ) / b.rz ) ** 2 ) );
		return x;

	};

	blobs.forEach( ( b, bi ) => {

		const area = b.ry * b.rz * ( b.rx + 0.3 );
		const n = Math.floor( area * 560 );
		for ( let k = 0; k < n; k ++ ) {

			const th = r() * Math.PI * 2, ph = Math.acos( 1 - r() );
			let ux = Math.sin( ph ) * Math.cos( th ), uy = Math.cos( ph ), uz = Math.sin( ph ) * Math.sin( th );
			ux = - Math.abs( ux );
			const depth = 0.8 + r() * 0.26;
			const x = b.x + ux * b.rx * depth, y = b.y + uy * b.ry * depth, z = b.z + uz * b.rz * depth;
			if ( y < 0.07 ) continue;
			const ins = inside( x, y, z, bi );
			if ( ins > 0.1 ) continue;
			P.set( x, y, z );
			// 叶面朝外且朝天（叶片趋光）
			N.set( ux / b.rx, uy / b.ry, uz / b.rz ).normalize();
			N.y += 0.7 + r() * 0.4; N.x += ( r() - 0.5 ) * 0.8; N.z += ( r() - 0.5 ) * 0.8;
			N.normalize();
			Tt.set( ux * 0.8 + ( r() - 0.5 ), - 0.2 + ( r() - 0.5 ) * 0.6, uz + ( r() - 0.5 ) * 1.4 );
			const occ = 0.45 + 0.55 * smooth( 0.78, 1.05, depth ) * ( 0.6 + 0.4 * uy ) * ( 1 - ins * 3 ) * smooth( 0.0, 0.45, y );
			const size = 0.06 + r() * 0.06 + ( r() < 0.15 ? 0.03 : 0 );
			pushIvy( P, N, Tt, size, Math.max( 0.4, occ ), ( r() - 0.5 ) * 0.6 );

		}

	} );

	// —— 2. 墙面藤蔓：空间殖民 ——
	const { cov, dropH } = makeCoverage( moundH );
	const attractors = [];
	const DENS = 75;
	const nA = Math.floor( ( L.Z1 - L.Z0 ) * H * DENS );
	for ( let i = 0; i < nA; i ++ ) {

		const z = L.Z0 + r() * ( L.Z1 - L.Z0 ), y = 0.1 + r() * ( H - 0.2 );
		if ( cov( z, y ) ) attractors.push( [ z, y ] );

	}

	const roots = [];
	for ( let z = L.Z1 - 0.2; z > L.Z0 + 0.2; z -= 0.3 + r() * 0.5 ) roots.push( { z, y: Math.max( 0.1, moundH( z ) * 0.6 ), bias: 0.55 } );
	for ( let z = L.Z1 - 0.3; z > L.Z0 + 0.3; z -= 0.35 + r() * 0.6 ) if ( dropH( z ) > 0.25 ) roots.push( { z, y: H - 0.06, bias: - 0.7 } );
	const tree = colonize( r, attractors, roots );
	const { nodes, desc, kids } = tree;
	const rad = ( i ) => Math.min( 0.024, 0.0035 + 0.0011 * Math.sqrt( desc[ i ] ) );
	const off = ( i ) => 0.014 + rad( i ) + 0.012 * noise2( nodes[ i ].z * 3, nodes[ i ].y * 3 );

	// 藤茎：从每个「分叉点/根」出发沿单子链收集折线（隔一个节点取样）
	const children = new Map();
	nodes.forEach( ( n, i ) => { if ( n.parent >= 0 ) { let a = children.get( n.parent ); if ( ! a ) children.set( n.parent, a = [] ); a.push( i ); } } );
	const starts = [];
	nodes.forEach( ( n, i ) => { if ( n.parent < 0 ) starts.push( i ); } );
	while ( starts.length ) {

		const s = starts.pop();
		const ch = children.get( s ) || [];
		for ( const c0 of ch ) {

			const chain = [ s ];
			let c = c0;
			for ( ;; ) {

				chain.push( c );
				const cc = children.get( c ) || [];
				if ( cc.length !== 1 ) { if ( cc.length > 1 ) starts.push( c ); break; }
				c = cc[ 0 ];

			}

			if ( desc[ chain[ 0 ] ] < 5 || chain.length < 3 ) continue; // 末梢细枝藏在叶下，不建管
			const pts = chain.filter( ( _, k ) => k % 2 === 0 || k === chain.length - 1 ).map( ( i ) => new THREE.Vector3( WX - off( i ), nodes[ i ].y, nodes[ i ].z ) );
			if ( pts.length >= 2 ) stems.push( { pts, r0: rad( chain[ 0 ] ), r1: rad( chain[ chain.length - 1 ] ) } );

		}

	}

	// 叶片：每个藤茎节点 0~3 片（互生），老茎上叶大、梢部叶小；藏在土堆里的不长
	let side = 1;
	nodes.forEach( ( n, i ) => {

		if ( n.y < moundH( n.z ) - 0.12 ) return;
		const d = desc[ i ];
		const tip = d < 6; // 生长点附近
		const k = tip ? ( r() < 0.75 ? 1 : 2 ) : ( r() < 0.35 ? 0 : r() < 0.75 ? 1 : 2 );
		for ( let q = 0; q < k; q ++ ) {

			side = - side;
			const lift = 0.02 + r() * 0.06; // 叶柄把叶片推离墙面 2~8cm
			P.set( WX - off( i ) - lift, n.y + ( r() - 0.5 ) * 0.02, n.z + side * ( 0.01 + r() * 0.03 ) );
			// 叶面：朝巷子并上仰 15°~55°；叶轴：大致向下/侧向
			const up = 0.25 + r() * 0.9;
			N.set( - 1, up, ( r() - 0.5 ) * 0.7 ).normalize();
			Tt.set( 0, - 0.6 - r() * 0.6, side * ( 0.5 + r() * 0.8 ) );
			if ( n.bias < 0 ) Tt.y -= 0.5; // 垂挂帘：叶尖向下
			const size = ( tip ? 0.04 + r() * 0.04 : 0.06 + r() * 0.05 ) + Math.min( 0.02, d * 0.0004 );
			const shade = 0.8 + r() * 0.35 - ( 1 - smooth( 0, 1.5, n.y ) ) * 0.15;
			pushIvy( P, N, Tt, size, shade, ( r() - 0.5 ) * 0.8 );

		}

	} );

	// —— 3. 墙顶压顶：从屋面翻过来的藤叶团（全部连在下垂藤茎的根部附近）——
	for ( let z = L.Z1 - 0.3; z > L.Z0 + 0.3; z -= 0.02 ) {

		const dh = dropH( z );
		if ( dh < 0.25 ) continue;
		for ( let q = 0; q < 2; q ++ ) {

			const x = WX + 0.02 + r() * 0.42, y = H + 0.22 + r() * 0.06 * dh;
			P.set( x, y, z + ( r() - 0.5 ) * 0.03 );
			N.set( ( r() - 0.5 ) * 0.6, 1, ( r() - 0.5 ) * 0.6 ).normalize();
			Tt.set( - 1 + ( r() - 0.5 ), 0, ( r() - 0.5 ) * 1.5 );
			pushIvy( P, N, Tt, 0.05 + r() * 0.05, 0.95 + r() * 0.25 );

		}

		// 翻越压顶外沿的弯折处
		if ( r() < 0.6 ) {

			P.set( WX - 0.08 - r() * 0.04, H + 0.12 + r() * 0.1, z );
			N.set( - 1, 0.6 + r() * 0.6, ( r() - 0.5 ) ).normalize();
			Tt.set( - 0.3, - 1, ( r() - 0.5 ) );
			pushIvy( P, N, Tt, 0.05 + r() * 0.05, 0.9 );

		}

	}

	// 墙顶下垂藤茎从屋面翻过压顶的那一段
	for ( const rt of roots ) if ( rt.bias < 0 ) stems.push( { pts: [ new THREE.Vector3( WX + 0.4, H + 0.24, rt.z + 0.05 ), new THREE.Vector3( WX - 0.05, H + 0.25, rt.z ), new THREE.Vector3( WX - 0.06, H + 0.05, rt.z ), new THREE.Vector3( WX - 0.03, H - 0.06, rt.z ) ], r0: 0.009, r1: 0.007 } );

	// —— 4. 温室檐口垂挂帘 ——
	for ( let z = L.Z1 - 0.8; z > L.Z0 + 1; z -= 0.4 + r() * 1.2 ) {

		const k = fbm2( z * 0.19, 21.7, 3 );
		if ( k < 0.5 ) continue;
		const top = L.GH_H, len = 0.8 + ( k - 0.5 ) * 12 * ( 0.4 + r() * 0.6 );
		const w0 = 0.15 + r() * 0.35;
		const strands = [];
		for ( let s = 0; s < 3; s ++ ) {

			const pts = [];
			let zz = z + ( r() - 0.5 ) * w0 * 1.6;
			const bottom = Math.max( 0.9, top - len * ( 0.6 + r() * 0.4 ) );
			for ( let y = top + 0.12; y > bottom; y -= 0.05 ) { zz += ( r() - 0.5 ) * 0.025; pts.push( new THREE.Vector3( L.GH_X + 0.06, y, zz ) ); }
			if ( pts.length > 3 ) { stems.push( { pts, r0: 0.007, r1: 0.003 } ); strands.push( pts ); }

		}

		for ( const pts of strands ) for ( let i = 0; i < pts.length; i ++ ) {

			const f = i / pts.length;
			const n = Math.floor( 2.2 * ( 1 - f * 0.5 ) + r() );
			for ( let q = 0; q < n; q ++ ) {

				const p = pts[ i ];
				P.set( p.x + 0.02 + r() * 0.06, p.y + ( r() - 0.5 ) * 0.04, p.z + ( r() - 0.5 ) * 0.08 );
				N.set( 1, 0.25 + r() * 0.6, ( r() - 0.5 ) * 1.0 ).normalize();
				Tt.set( ( r() - 0.5 ) * 0.5, - 1, ( r() - 0.5 ) );
				pushIvy( P, N, Tt, 0.05 + r() * 0.05, 0.85 );

			}

		}

	}

	// —— 5. 阔叶杂草（牛蒡/车前状叶簇）：堆积体前缘、温室墙根、裂缝 ——
	const rosette = ( x, y, z, s, n, shade = 1 ) => {

		const a0 = r() * 6.28;
		for ( let i = 0; i < n; i ++ ) {

			const a = a0 + i / n * 6.28 + ( r() - 0.5 ) * 0.5;
			const k = Math.floor( r() * WEED_LEAVES.length );
			const dir = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
			// 叶片向外拱出：叶轴朝外、上仰 25°~65°
			const tilt = 0.45 + r() * 0.7;
			const t = dir.clone().multiplyScalar( Math.cos( tilt ) ).setY( Math.sin( tilt ) );
			const nrm = dir.clone().multiplyScalar( - Math.sin( tilt ) ).setY( Math.cos( tilt ) );
			const size = s * ( 0.7 + r() * 0.5 );
			weedM[ k ].push( leafMatrix( new THREE.Vector3( x, y, z ), nrm, t, size, ( r() - 0.5 ) * 0.5 ) );
			const c = new THREE.Color( 1, 1, 1 ).multiplyScalar( shade * ( 0.8 + r() * 0.4 ) );
			if ( r() < 0.08 ) c.setRGB( 1.4, 1.05, 0.55 ); // 少量发黄
			weedC[ k ].push( c );

		}

	};

	// 堆积体前缘：密集
	for ( let z = L.Z1 + 0.5; z > L.Z0; z -= 0.08 + r() * 0.12 ) {

		const fx = moundFront( z );
		const dens = fbm2( z * 0.4, 6.6, 3 );
		if ( r() > 0.35 + dens * 0.6 ) continue;
		const x = fx - 0.05 + r() * 0.2, y = L.SLAB_TOP - 0.01;
		rosette( x, y, z, 0.16 + r() * 0.2, 5 + Math.floor( r() * 5 ), 0.9 );
		// 堆积体中层：更高的叶子（从堆里探出来）
		if ( r() < 0.5 ) rosette( fx + 0.1 + r() * 0.15, 0.2 + r() * moundH( z ) * 0.6, z + ( r() - 0.5 ) * 0.2, 0.18 + r() * 0.15, 4, 0.75 );

	}

	// 温室矮墙脚
	for ( let z = L.Z1; z > L.Z0; z -= 0.15 + r() * 0.35 ) {

		if ( fbm2( z * 0.3, 2.2, 2 ) < 0.42 ) continue;
		rosette( L.GH_X + 0.1 + r() * 0.3, L.SLAB_TOP - 0.01, z, 0.13 + r() * 0.15, 4 + Math.floor( r() * 4 ), 0.85 );

	}

	// —— 构建网格 ——
	const group = new THREE.Group();
	const ivyGeos = [ ivyLeafGeometry( 2, 0.85 ), ivyLeafGeometry( 1, 0.85 ), ivyLeafGeometry( 0, 0.85 ) ];
	group.add( lodInstanced( ivyGeos, mats.leaf, ivyM, ivyC, { chunk: 5, dists: [ 0, 8, 18 ], cast: true } ) );
	WEED_LEAVES.forEach( ( _, k ) => {

		if ( ! weedM[ k ].length ) return;
		group.add( lodInstanced( [ weedLeafGeometry( k, 1 ), weedLeafGeometry( k, 0 ) ], mats.weed, weedM[ k ], weedC[ k ], { chunk: 16, dists: [ 0, 12 ], cast: false } ) );

	} );
	const tubes = stems.map( ( s ) => taperTube( s.pts, s.r0, s.r1, 4 ) );
	if ( tubes.length ) {

		const sm = new THREE.Mesh( mergeIndexed( tubes ), mats.stem );
		sm.castShadow = true; sm.receiveShadow = true;
		group.add( sm );

	}

	const weedCount = weedM.reduce( ( s, a ) => s + a.length, 0 );
	return { group, count: ivyM.length, weeds: weedCount, stems: stems.length, nodes: nodes.length, moundH, moundFront };

}
