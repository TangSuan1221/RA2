// 植被（第 2 轮重写）
//  - 常春藤：茎干沿表面生长（每步把生长点投影回表面 = 「射线吸附」），分叉、向上攀爬或受重力下垂；
//    叶片 4~9cm，实例化，带实例属性（色相、假 AO：越贴墙越暗、老叶程度），透光材质
//  - 茎：合并的细管几何（4 边形截面，锥形）
//  - 草：程序化弯曲草叶实例（成簇分布），根部暗、叶尖亮
import * as THREE from 'three/webgpu';
import { rng } from './kit.js';
import { leafMaterial, grassMaterial } from './materials.js';

const V = ( x = 0, y = 0, z = 0 ) => new THREE.Vector3( x, y, z );
const UP = V( 0, 1, 0 );

// 常春藤叶：五裂掌状轮廓（极坐标生成），沿中脉轻微对折，叶柄在原点、叶片沿 +Y、法线 +Z
export function leafGeometry() {

	const N = 20, cx = 0, cy = 0.5;
	const pos = [ cx, cy, 0.05 ], uvs = [ 0.5, 0.5 ], idx = [];
	for ( let i = 0; i < N; i ++ ) {

		const a = - Math.PI / 2 + ( i / N ) * Math.PI * 2; // 从底部（叶柄处）开始
		const t = a + Math.PI / 2; // 0..2π，0 = 底部
		// 五裂：顶裂最大，两侧裂次之，底部有缺刻（心形基部）
		const lobes = 0.62 + 0.38 * Math.pow( Math.abs( Math.cos( t * 2.5 ) ), 0.7 );
		const top = 1.0 + 0.25 * Math.max( 0, - Math.cos( t ) );
		const notch = 1 - 0.55 * Math.exp( - Math.pow( ( ( t + Math.PI ) % ( 2 * Math.PI ) - Math.PI ) / 0.35, 2 ) );
		const r = 0.5 * lobes * top * notch;
		const x = Math.cos( a ) * r * 0.95, y = cy + Math.sin( a ) * r;
		pos.push( x, y, - Math.abs( x ) * 0.28 + Math.sin( y * 3.1 ) * 0.03 );
		uvs.push( x + 0.5, y );

	}

	for ( let i = 0; i < N; i ++ ) idx.push( 0, 1 + i, 1 + ( i + 1 ) % N );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

/**
 * 叶片放置器：收集变换 + 实例属性，最后生成一个 InstancedMesh
 */
export class LeafField {

	constructor( seed = 3 ) {

		this.m = [];
		this.info = [];
		this.r = rng( seed );

	}

	/**
	 * @param p 叶柄位置  @param n 叶面朝向（附着面法线） @param size 叶长（米）
	 * @param o { hang: 叶尖下垂程度, ao: 假 AO（0 暗~1 亮）, age: 老叶 }
	 */
	put( p, n, size = 0.07, o = {} ) {

		const r = this.r;
		const hang = o.hang ?? 0.3;
		// 叶尖方向：在附着面内偏下垂 + 随机
		const tip = V( ( r() - 0.5 ) * 1.4, 0.6 - hang * 1.6 + ( r() - 0.5 ) * 0.8, ( r() - 0.5 ) * 1.4 );
		const z = n.clone().add( V( r() - 0.5, r() - 0.3, r() - 0.5 ).multiplyScalar( 0.8 ) ).normalize();
		tip.addScaledVector( z, - tip.dot( z ) );
		if ( tip.lengthSq() < 1e-4 ) tip.set( 0, 1, 0 );
		const y = tip.normalize();
		const x = V().crossVectors( y, z ).normalize();
		const zz = V().crossVectors( x, y );
		const s = size * ( 0.7 + r() * 0.6 );
		const mat = new THREE.Matrix4().makeBasis( x.multiplyScalar( s ), y.multiplyScalar( s ), zz.multiplyScalar( s ) );
		mat.setPosition( p );
		this.m.push( mat );
		this.info.push( r(), o.ao ?? ( 0.6 + r() * 0.4 ), o.age ?? r() * r() );

	}

	build( color = 0x2f4a12, opt = {} ) {

		const geo = leafGeometry();
		geo.setAttribute( 'aLeaf', new THREE.InstancedBufferAttribute( new Float32Array( this.info ), 3 ) );
		const mesh = new THREE.InstancedMesh( geo, opt.material ?? leafMaterial( color, opt ), this.m.length );
		this.m.forEach( ( m, i ) => mesh.setMatrixAt( i, m ) );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		return mesh;

	}

}

/**
 * 茎干收集器：折线 → 锥形细管（4 边截面），合并为一个网格
 */
export class StemField {

	constructor() {

		this.pos = [];
		this.nor = [];
		this.idx = [];

	}

	add( pts, r0 = 0.008, r1 = 0.003 ) {

		if ( pts.length < 2 ) return;
		const S = 4, base = this.pos.length / 3;
		let prevN = null;
		for ( let i = 0; i < pts.length; i ++ ) {

			const t = pts[ Math.min( i + 1, pts.length - 1 ) ].clone().sub( pts[ Math.max( i - 1, 0 ) ] ).normalize();
			let n = prevN ? prevN.clone().addScaledVector( t, - prevN.dot( t ) ) : V( t.y, - t.x, 0.3 ).addScaledVector( t, - 0.3 * t.z );
			if ( n.lengthSq() < 1e-6 ) n = V( 1, 0, 0 ).addScaledVector( t, - t.x );
			n.normalize();
			prevN = n;
			const b = V().crossVectors( t, n );
			const rr = r0 + ( r1 - r0 ) * ( i / ( pts.length - 1 ) );
			for ( let k = 0; k < S; k ++ ) {

				const a = ( k / S ) * Math.PI * 2;
				const d = n.clone().multiplyScalar( Math.cos( a ) ).addScaledVector( b, Math.sin( a ) );
				this.pos.push( pts[ i ].x + d.x * rr, pts[ i ].y + d.y * rr, pts[ i ].z + d.z * rr );
				this.nor.push( d.x, d.y, d.z );

			}

			if ( i > 0 ) for ( let k = 0; k < S; k ++ ) {

				const a = base + ( i - 1 ) * S + k, b2 = base + ( i - 1 ) * S + ( k + 1 ) % S;
				const c = a + S, d = b2 + S;
				this.idx.push( a, c, b2, b2, c, d );

			}

		}

	}

	build( material ) {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setIndex( this.idx );
		const m = new THREE.Mesh( g, material );
		m.castShadow = m.receiveShadow = true;
		return m;

	}

}

// —— 可附着表面 ——
// 平面墙：p0 为墙面上一点，n 为朝外法线，inside(p) 判断是否在墙面有效区域内（排除门洞等）
export function planeSurface( p0, n, inside ) {

	return {
		project( p ) {

			const d = p.clone().sub( p0 ).dot( n );
			return { p: p.clone().addScaledVector( n, - d ), n: n.clone() };

		},
		inside,
	};

}

// 树干：竖直、半径随高度变化
export function trunkSurface( base, radius, height ) {

	return {
		project( p ) {

			const h = p.y - base.y;
			const d = V( p.x - base.x, 0, p.z - base.z );
			if ( d.lengthSq() < 1e-6 ) d.set( 1, 0, 0 );
			d.normalize();
			const r = radius( h ) + 0.012;
			return { p: V( base.x + d.x * r, p.y, base.z + d.z * r ), n: d };

		},
		inside: ( p ) => p.y > base.y && p.y < base.y + height,
	};

}

/**
 * 沿表面生长常春藤
 * seeds: [{ p, dir }]，opt: { climb 向上趋势, maxLen 单茎长度, branch 分叉概率, leafEvery 叶距, size 叶长, droop 下垂 }
 */
export function growIvy( leaves, stems, surf, seeds, opt = {} ) {

	const { climb = 0.55, maxLen = 3, branch = 0.035, leafEvery = 0.035, size = 0.07, step = 0.04, wander = 0.55, maxDepth = 3, aoBase = 0.5, droop = 0 } = opt;
	const r = leaves.r;
	const queue = seeds.map( ( s ) => ( { p: surf.project( s.p ).p, dir: ( s.dir ?? UP ).clone().normalize(), len: maxLen * ( 0.6 + r() * 0.6 ), depth: 0 } ) );
	let guard = 0;
	while ( queue.length && guard ++ < 5000 ) {

		const s = queue.pop();
		const pts = [ s.p.clone() ];
		let p = s.p.clone(), d = s.dir.clone(), n = surf.project( p ).n;
		let walked = 0, sinceLeaf = 0;
		while ( walked < s.len ) {

			// 方向：惯性 + 向上（或下垂）+ 随机游走，然后投影到切平面
			const rnd = V( r() - 0.5, r() - 0.5, r() - 0.5 ).multiplyScalar( wander * 2 );
			d.multiplyScalar( 0.8 ).addScaledVector( UP, climb - droop ).add( rnd );
			d.addScaledVector( n, - d.dot( n ) );
			if ( d.lengthSq() < 1e-6 ) break;
			d.normalize();
			const q = surf.project( p.clone().addScaledVector( d, step ) );
			if ( ! surf.inside( q.p ) ) break;
			p = q.p; n = q.n;
			walked += step; sinceLeaf += step;
			pts.push( p.clone() );
			// 叶：贴墙由叶柄撑开 1~6cm，越外层越亮（假 AO）
			while ( sinceLeaf > leafEvery ) {

				sinceLeaf -= leafEvery * ( 0.6 + r() * 0.8 );
				const off = 0.01 + r() * 0.06;
				const side = V( r() - 0.5, r() - 0.5, r() - 0.5 ).multiplyScalar( 0.07 );
				side.addScaledVector( n, - side.dot( n ) );
				const lp = p.clone().add( side ).addScaledVector( n, off );
				const ao = Math.min( 1, aoBase + ( off / 0.07 ) * ( 1 - aoBase ) * ( 0.7 + r() * 0.5 ) );
				leaves.put( lp, n, size * ( 0.75 + 0.5 * ( 1 - walked / s.len ) ), { hang: 0.35 + r() * 0.3, ao, age: r() * r() } );

			}

			if ( s.depth < maxDepth && r() < branch ) {

				const bd = d.clone().applyAxisAngle( n, ( r() < 0.5 ? - 1 : 1 ) * ( 0.5 + r() * 0.8 ) );
				queue.push( { p: p.clone(), dir: bd, len: ( s.len - walked ) * ( 0.4 + r() * 0.5 ), depth: s.depth + 1 } );

			}

		}

		stems.add( pts, s.depth === 0 ? 0.009 : 0.005, 0.0025 );

	}

}

/**
 * 从高处垂下的常春藤（无附着面，受重力下垂、轻微摆动），叶片环绕茎干
 * face: 叶片总体朝向（朝向光/相机的一侧更多）
 */
export function hangIvy( leaves, stems, top, opt = {} ) {

	const { len = 2, size = 0.075, leafEvery = 0.028, face = V( 1, 0, 0 ), spread = 0.1, aoBase = 0.45 } = opt;
	const r = leaves.r;
	const pts = [];
	let p = top.clone(), d = V( ( r() - 0.5 ) * 0.4, - 1, ( r() - 0.5 ) * 0.4 ).normalize();
	const step = 0.05;
	let walked = 0, since = 0;
	while ( walked < len ) {

		d.multiplyScalar( 0.85 ).add( V( ( r() - 0.5 ) * 0.25, - 0.35, ( r() - 0.5 ) * 0.25 ) ).normalize();
		p = p.clone().addScaledVector( d, step );
		pts.push( p );
		walked += step; since += step;
		const f = walked / len;
		while ( since > leafEvery ) {

			since -= leafEvery * ( 0.6 + r() * 0.8 ) * ( 1 + f * 0.8 ); // 末端稀疏
			const a = r() * Math.PI * 2;
			const out = V( Math.cos( a ), ( r() - 0.5 ) * 0.4, Math.sin( a ) ).add( face.clone().multiplyScalar( 0.9 ) ).normalize();
			const lp = p.clone().addScaledVector( out, 0.01 + r() * spread * ( 1 - f * 0.5 ) );
			leaves.put( lp, out, size * ( 0.8 + 0.4 * ( 1 - f ) ), { hang: 0.75, ao: Math.min( 1, aoBase + r() * ( 1 - aoBase ) ), age: r() * r() } );

		}

	}

	stems.add( [ top.clone(), ...pts ], 0.006, 0.002 );

}

// —— 草：弯曲草叶（5 段，锥形），高度 1、根部在原点，沿 +Z 弯曲 ——
export function bladeGeometry() {

	const S = 5, pos = [], idx = [];
	for ( let i = 0; i <= S; i ++ ) {

		const t = i / S, w = 0.5 * ( 1 - t * 0.92 );
		const z = t * t * 0.35;
		pos.push( - w, t, z, w, t, z );
		if ( i < S ) {

			const a = i * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// 法线略向上弯（草地整体受光更柔和）
	const n = g.attributes.normal;
	for ( let i = 0; i < n.count; i ++ ) { const v = V( n.getX( i ), n.getY( i ) + 0.6, n.getZ( i ) ).normalize(); n.setXYZ( i, v.x, v.y, v.z ); }
	return g;

}

export class GrassField {

	constructor( seed = 5 ) {

		this.m = [];
		this.info = [];
		this.r = rng( seed );
		this._o = new THREE.Object3D();

	}

	/**
	 * 在区域内按「簇」撒草：density(x,z) 返回 0~1，height(x,z) 返回高度系数
	 * groundY(x,z) 返回地面高度
	 */
	scatter( { x0, x1, z0, z1, count, clumps = 60, density = () => 1, groundY = () => 0, hMin = 0.12, hMax = 0.45, dry = 0.15, width = 0.014 } ) {

		const r = this.r, o = this._o;
		const centers = [];
		for ( let i = 0; i < clumps; i ++ ) centers.push( [ x0 + r() * ( x1 - x0 ), z0 + r() * ( z1 - z0 ), 0.08 + r() * 0.35, 0.6 + r() * 0.6 ] );
		let placed = 0, guard = 0;
		while ( placed < count && guard ++ < count * 6 ) {

			const c = centers[ Math.floor( r() * centers.length ) ];
			const a = r() * Math.PI * 2, rr = c[ 2 ] * Math.sqrt( r() ) * 1.6;
			const x = c[ 0 ] + Math.cos( a ) * rr, z = c[ 1 ] + Math.sin( a ) * rr;
			if ( x < x0 || x > x1 || z < z0 || z > z1 ) continue;
			const dn = density( x, z );
			if ( r() > dn ) continue;
			const centerK = 1 - rr / ( c[ 2 ] * 1.6 + 1e-3 ); // 簇中心更高
			const h = ( hMin + ( hMax - hMin ) * ( 0.3 + 0.7 * r() ) * ( 0.6 + 0.4 * centerK ) ) * c[ 3 ] * ( 0.5 + 0.5 * dn );
			o.position.set( x, groundY( x, z ), z );
			o.rotation.set( ( r() - 0.5 ) * 0.5, r() * Math.PI * 2, ( r() - 0.5 ) * 0.5 );
			o.scale.set( width * ( 0.7 + r() * 0.6 ), h, h * ( 0.6 + r() * 0.8 ) );
			o.updateMatrix();
			this.m.push( o.matrix.clone() );
			this.info.push( r(), 0.55 + 0.45 * ( 1 - centerK * 0.6 ) * ( 0.7 + r() * 0.3 ), r() < dry ? 0.5 + r() * 0.5 : r() * 0.15 );
			placed ++;

		}

	}

	build( color = 0x5d7a2a ) {

		const geo = bladeGeometry();
		geo.setAttribute( 'aGrass', new THREE.InstancedBufferAttribute( new Float32Array( this.info ), 3 ) );
		const mesh = new THREE.InstancedMesh( geo, grassMaterial( color ), this.m.length );
		this.m.forEach( ( m, i ) => mesh.setMatrixAt( i, m ) );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		return mesh;

	}

}
