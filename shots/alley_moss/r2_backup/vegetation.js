// 苔藓小巷：程序化常春藤
//   1. 墙根堆积体：沿墙根的椭球团块并集（高 0.6–1.2m，轮廓起伏、偶有缺口），叶片铺在团块表面，内部叶片更暗
//   2. 攀爬藤蔓：随机游走（约束在墙面，离墙 2–5cm）从墙根、裂缝出发向上生长并分枝，
//      生成变径藤茎管道，并沿藤蔓交替长叶（叶片向藤梢逐渐变小）
//   3. 墙顶垂挂帘、温室檐口垂挂帘、压顶上的蓬松轮廓
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, noise2, smooth, mergeIndexed, taperTube, instanced } from './util.js';

// ———— 叶片几何：心形阔叶，中脉折痕 + 纵向卷曲 + 叶柄（单位长度 1，原点在叶柄根部）————
export function leafGeometry( { across = 2, along = 5, lobe = 0.38, fold = 0.22, curl = 0.2 } = {} ) {

	const pos = [], uvs = [], idx = [];
	const PET = 0.2;
	for ( let j = 0; j <= along; j ++ ) {

		const v = j / along;
		const w = Math.sin( Math.PI * Math.pow( v, 0.72 ) ) * ( 1 + lobe * ( 1 - v ) * ( 1 - v ) ) * 0.46;
		for ( let i = 0; i <= across; i ++ ) {

			const u = i / across * 2 - 1;
			const x = u * w;
			let y = PET + v * ( 1 - PET );
			y -= lobe * 0.3 * Math.abs( u ) * Math.pow( 1 - v, 3 );
			const z = Math.abs( u ) * fold * w + curl * v * v - 0.05 * Math.sin( Math.PI * v );
			pos.push( x, y, z );
			uvs.push( u, v );

		}

	}

	for ( let j = 0; j < along; j ++ ) for ( let i = 0; i < across; i ++ ) {

		const a = j * ( across + 1 ) + i, b = a + 1, c = a + across + 1, d = c + 1;
		idx.push( a, b, c, b, d, c );

	}

	// 叶柄：一条细带
	const base = pos.length / 3;
	pos.push( - 0.012, 0, 0, 0.012, 0, 0, - 0.008, PET + 0.02, 0, 0.008, PET + 0.02, 0 );
	uvs.push( 0, 0, 0, 0, 0, 0.02, 0, 0.02 );
	idx.push( base, base + 1, base + 2, base + 1, base + 3, base + 2 );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function leafMatrix( p, n, t, size, out ) {

	_z.copy( n ).normalize();
	_y.copy( t ).addScaledVector( _z, - t.dot( _z ) ).normalize();
	_x.crossVectors( _y, _z );
	_m.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _m );
	_s.set( size, size, size );
	return out.compose( p, _q, _s );

}

// 叶色：暗、略去饱和的绿；逐叶 ±8% 色相/明度抖动；少量黄绿嫩叶与枯叶
const _hsl = {};
function leafColor( r, shade = 1 ) {

	const c = new THREE.Color();
	const k = r();
	if ( k < 0.04 ) c.setRGB( 0.11, 0.075, 0.03 ); // 枯黄
	else if ( k < 0.16 ) c.setRGB( 0.075, 0.11, 0.025 ); // 黄绿嫩叶
	else c.setRGB( 0.035, 0.07, 0.018 );
	c.getHSL( _hsl );
	c.setHSL( _hsl.h + ( r() - 0.5 ) * 0.035, _hsl.s * ( 0.85 + r() * 0.2 ), _hsl.l * ( 0.92 + r() * 0.16 ) );
	return c.multiplyScalar( shade * 1.5 );

}

export function buildIvy( mats, mossSample ) {

	const r = rng( 101 );
	const mats4 = [], cols = [];
	const P = new THREE.Vector3(), N = new THREE.Vector3(), Tt = new THREE.Vector3();
	const WX = L.WALL_X;
	const stems = []; // { pts, r0, r1 }

	const push = ( p, n, t, size, shade ) => {

		const m = new THREE.Matrix4();
		leafMatrix( p, n, t, size, m );
		mats4.push( m );
		cols.push( leafColor( r, shade ) );

	};

	// —— 1. 墙根堆积体：椭球团块并集 ——
	const blobs = [];
	for ( let z = L.Z1 + 1.5; z > L.Z0 - 1; ) {

		const gapN = fbm2( z * 0.09, 9.1, 3 );
		const big = fbm2( z * 0.21, 3.7, 4 );
		const H = gapN < 0.36 ? 0.18 + r() * 0.15 : 0.45 + 0.9 * Math.pow( big, 1.3 ) + r() * 0.25; // 0.6–1.2m 为主，偶有低矮缺口
		const R = 0.25 + r() * 0.45;
		blobs.push( { z, y: 0.05, x: WX - 0.04 - r() * 0.12, rz: R, ry: H, rx: Math.min( 0.75, 0.3 + H * 0.45 + r() * 0.15 ) } );
		// 次级小团：叠在上面形成不规则轮廓
		if ( H > 0.5 && r() < 0.6 ) blobs.push( { z: z + ( r() - 0.5 ) * R, y: H * 0.5, x: WX - 0.06, rz: R * 0.5, ry: H * 0.55 + r() * 0.2, rx: 0.25 + r() * 0.15 } );
		z -= R * ( 0.9 + r() * 0.5 );

	}

	const inside = ( x, y, z, skip ) => {

		let best = 0;
		for ( let i = 0; i < blobs.length; i ++ ) {

			if ( i === skip ) continue;
			const b = blobs[ i ];
			if ( Math.abs( z - b.z ) > b.rz ) continue;
			const d = Math.pow( ( x - b.x ) / b.rx, 2 ) + Math.pow( ( y - b.y ) / b.ry, 2 ) + Math.pow( ( z - b.z ) / b.rz, 2 );
			best = Math.max( best, 1 - d );

		}

		return best; // >0 表示在其他团块内部

	};

	blobs.forEach( ( b, bi ) => {

		const area = b.ry * b.rz * ( b.rx + 0.3 );
		const n = Math.floor( area * 520 );
		for ( let k = 0; k < n; k ++ ) {

			// 半椭球面（墙一侧与地下不要）
			const th = r() * Math.PI * 2, ph = Math.acos( 1 - r() * 1.0 ); // 上半球
			let ux = Math.sin( ph ) * Math.cos( th ), uy = Math.cos( ph ), uz = Math.sin( ph ) * Math.sin( th );
			ux = - Math.abs( ux ); // 朝巷子
			const depth = 0.82 + r() * 0.24; // 一部分叶片在表层下面（体积感）
			const x = b.x + ux * b.rx * depth, y = b.y + uy * b.ry * depth, z = b.z + uz * b.rz * depth;
			if ( y < 0.06 ) continue;
			const ins = inside( x, y, z, bi );
			if ( ins > 0.12 ) continue; // 被别的团块包住：看不见
			P.set( x + ( r() - 0.5 ) * 0.03, y, z );
			N.set( ux / b.rx, uy / b.ry, uz / b.rz ).normalize();
			N.y += 0.5; N.x += ( r() - 0.5 ) * 1.0; N.z += ( r() - 0.5 ) * 1.2;
			Tt.set( ux * 0.6 + ( r() - 0.5 ), 0.5 + r() * 0.6, uz * 0.8 + ( r() - 0.5 ) );
			// 明暗：表层、上方亮；凹处、低处、内部暗（体积自遮蔽）
			const occ = 0.35 + 0.65 * smooth( 0.75, 1.05, depth ) * ( 0.55 + 0.45 * uy ) * ( 1 - ins * 3 ) * smooth( 0.0, 0.5, y );
			const size = 0.075 + r() * 0.07 + ( r() < 0.12 ? 0.05 : 0 );
			push( P.clone(), N.clone(), Tt.clone(), size, Math.max( 0.25, occ ) * 1.05 );

		}

	} );

	const moundH = ( z ) => {

		let h = 0;
		for ( const b of blobs ) if ( Math.abs( z - b.z ) < b.rz ) h = Math.max( h, b.y + b.ry * Math.sqrt( 1 - Math.pow( ( z - b.z ) / b.rz, 2 ) ) );
		return h;

	};

	// —— 2. 攀爬藤蔓：随机游走 + 分枝 ——
	const leafAlong = ( pts, sizeBase, shade ) => {

		const n = pts.length;
		let side = 1;
		for ( let i = 1; i < n; i += 1 ) {

			const f = i / n;
			if ( r() > 0.82 ) continue;
			const p = pts[ i ];
			const t = pts[ Math.min( n - 1, i + 1 ) ].clone().sub( pts[ i - 1 ] ).normalize();
			side = - side;
			const sz = sizeBase * ( 1 - 0.6 * f ) * ( 0.75 + r() * 0.5 );
			// 叶柄从藤茎侧向伸出，叶面朝外略朝上
			P.set( p.x - 0.01 - r() * 0.03, p.y, p.z );
			N.set( - 1, 0.3 + r() * 0.5, ( r() - 0.5 ) * 0.7 );
			Tt.set( - 0.2, t.y * 0.3 + 0.4, side * ( 0.7 + r() * 0.5 ) );
			push( P.clone(), N.clone(), Tt.clone(), sz, shade * ( 0.85 + r() * 0.3 ) );

		}

	};

	const grow = ( z0, y0, maxH, gen, r0 ) => {

		const pts = [];
		let z = z0, y = y0, dz = ( r() - 0.5 ) * 0.5, dy = 1;
		const step = 0.045;
		const maxLen = ( maxH - y0 ) * ( gen ? 0.7 : 1.25 );
		let len = 0;
		while ( len < maxLen && y < L.WALL_H - 0.2 && y > 0.05 ) {

			// 离墙 2–5cm（随噪声），沿凹槽时略陷入
			const off = 0.02 + 0.03 * noise2( z * 4, y * 4 );
			pts.push( new THREE.Vector3( WX - off, y, z ) );
			// 游走：偏好向上，有横向漂移；苔藓区域更容易横向蔓延
			const m = mossSample( z, y );
			dz += ( r() - 0.5 ) * 0.5 + ( noise2( z * 1.5 + 9, y * 1.5 ) - 0.5 ) * 0.3;
			dz *= 0.85;
			dy = 0.75 + 0.25 * ( 1 - m ) + ( r() - 0.5 ) * 0.2;
			const l = Math.hypot( dz, dy );
			z += dz / l * step; y += dy / l * step;
			len += step;
			// 分枝
			if ( gen < 2 && r() < 0.035 && pts.length > 6 ) grow( z, y, Math.min( L.WALL_H - 0.3, y + ( maxH - y ) * ( 0.4 + r() * 0.6 ) ), gen + 1, r0 * 0.6 );

		}

		if ( pts.length > 3 ) {

			stems.push( { pts, r0, r1: r0 * 0.25 } );
			leafAlong( pts, gen ? 0.1 : 0.13, 0.95 );
			// 叶簇：藤蔓下部两侧额外的叶片（藤蔓瀑布）
			const nn = Math.floor( pts.length * 0.45 );
			for ( let i = 0; i < nn; i ++ ) {

				const p = pts[ Math.floor( r() * pts.length * 0.7 ) ];
				const off = r.gauss() * 0.14;
				P.set( WX - 0.03 - r() * 0.07, p.y + ( r() - 0.5 ) * 0.1, p.z + off );
				N.set( - 1, 0.35 + r() * 0.5, ( r() - 0.5 ) * 0.9 + off );
				Tt.set( ( r() - 0.5 ) * 0.4, 1, off * 2 + ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), 0.06 + r() * 0.06, 0.8 + r() * 0.3 );

			}

		}

	};

	for ( let z = L.Z1 - 0.3; z > L.Z0 + 0.5; z -= 0.3 + r() * 0.8 ) {

		const H0 = moundH( z );
		const k = fbm2( z * 0.15, 4.2, 2 );
		const maxH = Math.min( L.WALL_H - 0.3, H0 + 0.4 + Math.pow( r(), 1.3 ) * 5.5 * ( k + 0.15 ) );
		grow( z, Math.max( 0.15, H0 * 0.7 ), maxH, 0, 0.011 + r() * 0.006 );

	}

	// 从墙面裂缝/凹槽中直接长出的藤（不连墙根）
	for ( let i = 0; i < 14; i ++ ) {

		const z = L.Z0 + 2 + r() * ( L.Z1 - L.Z0 - 4 ), y = 2 + r() * 3;
		grow( z, y, y + 1 + r() * 2, 1, 0.007 );

	}

	// —— 3. 墙顶垂挂帘（屋顶植物翻过压顶向下）——
	for ( let z = L.Z1 - 1; z > L.Z0 + 1; z -= 0.5 + r() * 1.4 ) {

		const k = fbm2( z * 0.17, 12.3, 3 );
		if ( k < 0.47 ) continue;
		const len = 0.6 + ( k - 0.47 ) * 10 * r();
		const w0 = 0.2 + r() * 0.45;
		for ( let s = 0; s < 3; s ++ ) {

			const pts = [];
			let zz = z + ( r() - 0.5 ) * w0;
			pts.push( new THREE.Vector3( WX + 0.25, L.WALL_H + 0.24, zz ) );
			for ( let y = L.WALL_H + 0.1; y > L.WALL_H - len * ( 0.6 + r() * 0.4 ); y -= 0.05 ) {

				zz += ( r() - 0.5 ) * 0.03;
				pts.push( new THREE.Vector3( WX - 0.06, y, zz ) );

			}

			if ( pts.length > 3 ) stems.push( { pts, r0: 0.008, r1: 0.003 } );

		}

		for ( let y = L.WALL_H + 0.2; y > L.WALL_H - len; y -= 0.028 ) {

			const f = ( L.WALL_H + 0.2 - y ) / len;
			const n = Math.floor( 3.2 * ( 1 - f * 0.7 ) + r() );
			for ( let q = 0; q < n; q ++ ) {

				const off = r.gauss() * w0 * ( 1 - f * 0.6 );
				P.set( WX - 0.05 - r() * 0.1 * ( 1 - f ), y, z + off );
				N.set( - 1, 0.25 + r() * 0.5, ( r() - 0.5 ) * 1.0 );
				Tt.set( ( r() - 0.5 ) * 0.5, - 1, ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), ( 0.06 + r() * 0.05 ) * ( 1 - f * 0.4 ), 0.9 - f * 0.25 );

			}

		}

	}

	// 压顶上方的植物（翻越墙顶的蓬松轮廓，俯视镜头可见）
	for ( let z = L.Z1 + 1; z > L.Z0 - 1; z -= 0.012 ) {

		const h = 0.45 * Math.pow( fbm2( z * 0.21, 5.5, 3 ), 2 );
		if ( h < 0.05 ) continue;
		// 叶团：压顶上铺开并向屋面略溢出
		P.set( WX + 0.18 + ( r() - 0.5 ) * 0.55 + Math.pow( r(), 3 ) * 0.5, L.WALL_H + 0.22 + r() * h, z + ( r() - 0.5 ) * 0.02 );
		N.set( ( r() - 0.5 ) * 0.8, 1, ( r() - 0.5 ) * 0.8 );
		Tt.set( - 1, 0.3, r() - 0.5 );
		push( P.clone(), N.clone(), Tt.clone(), 0.045 + r() * 0.045, 0.8 + r() * 0.4 );

	}

	// 苔藓边缘零星的攀爬叶
	for ( let i = 0; i < 2500; i ++ ) {

		const z = L.Z0 + r() * ( L.Z1 - L.Z0 ), y = 0.5 + r() * 5;
		if ( mossSample( z, y ) < 0.5 || r() < 0.6 ) continue;
		P.set( WX - 0.06 - r() * 0.05, y, z );
		N.set( - 1, 0.4 + r() * 0.5, ( r() - 0.5 ) * 0.8 );
		Tt.set( 0, 1, ( r() - 0.5 ) * 1.6 );
		push( P.clone(), N.clone(), Tt.clone(), 0.05 + r() * 0.05, 0.9 );

	}

	// —— 4. 温室檐口垂下的藤蔓帘（缠绕钢梁向下）——
	for ( let z = L.Z1 - 0.8; z > L.Z0 + 1; z -= 0.4 + r() * 1.2 ) {

		const k = fbm2( z * 0.19, 21.7, 3 );
		if ( k < 0.5 ) continue;
		const top = L.GH_H, len = 0.8 + ( k - 0.5 ) * 12 * ( 0.4 + r() * 0.6 );
		const w0 = 0.15 + r() * 0.35;
		for ( let s = 0; s < 2; s ++ ) {

			const pts = [];
			let zz = z + ( r() - 0.5 ) * w0;
			for ( let y = top + 0.12; y > Math.max( 0.9, top - len ); y -= 0.05 ) { zz += ( r() - 0.5 ) * 0.025; pts.push( new THREE.Vector3( L.GH_X + 0.06, y, zz ) ); }
			if ( pts.length > 3 ) stems.push( { pts, r0: 0.008, r1: 0.003 } );

		}

		for ( let y = top + 0.1; y > Math.max( 0.9, top - len ); y -= 0.032 ) {

			const f = ( top + 0.1 - y ) / len;
			const n = Math.floor( 2.6 * ( 1 - f * 0.6 ) + r() );
			for ( let q = 0; q < n; q ++ ) {

				const off = r.gauss() * w0 * ( 1 - f * 0.5 );
				P.set( L.GH_X + 0.05 + r() * 0.1, y, z + off );
				N.set( 1, 0.2 + r() * 0.5, ( r() - 0.5 ) * 1.0 );
				Tt.set( ( r() - 0.5 ) * 0.5, - 1, ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), 0.06 + r() * 0.05, 0.75 );

			}

		}

	}

	// —— 5. 温室矮墙脚的小片藤叶 ——
	for ( let z = L.Z1; z > L.Z0; z -= 0.02 ) {

		const h = 0.6 * Math.pow( fbm2( z * 0.4, 7.7, 3 ), 2.5 ) * smooth( 0.4, 0.5, fbm2( z * 0.2, 2.2, 2 ) );
		if ( h < 0.06 ) continue;
		const a = r() * Math.PI / 2, D = h * 0.9;
		P.set( L.GH_X + 0.02 + Math.cos( a ) * D * ( 0.8 + r() * 0.2 ), Math.sin( a ) * h + 0.1, z );
		N.set( Math.cos( a ) + ( r() - 0.5 ), 1 + r() * 0.5, ( r() - 0.5 ) * 1.4 );
		Tt.set( 1, 0.5, r() - 0.5 );
		push( P.clone(), N.clone(), Tt.clone(), 0.07 + r() * 0.06, 0.6 + 0.4 * Math.sin( a ) );

	}

	const geo = leafGeometry();
	const mesh = instanced( geo, mats.leaf, mats4, cols, { cast: true } );

	// 藤茎管道（变径）
	const tubes = stems.map( ( s ) => taperTube( s.pts, s.r0, s.r1, 4 ) );
	const group = new THREE.Group();
	group.add( mesh );
	if ( tubes.length ) {

		const sm = new THREE.Mesh( mergeIndexed( tubes ), mats.stem );
		sm.castShadow = true; sm.receiveShadow = true;
		group.add( sm );

	}

	return { group, count: mats4.length, stems: stems.length, moundH };

}
