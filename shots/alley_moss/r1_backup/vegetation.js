// 苔藓小巷：程序化植被
//   1. 常春藤/阔叶藤蔓：墙根堆积体 + 沿墙攀爬的藤茎（实例化叶片，带卷曲与折痕的真实几何）
//   2. 裂缝杂草：沿混凝土板缝隙生长的草丛
//   3. 蕨类（Poly Haven fern_02）
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, smooth } from './util.js';

// ———— 叶片几何：心形阔叶，中脉折痕 + 纵向卷曲 + 叶柄（单位长度 1，原点在叶柄根部）————
export function leafGeometry( { across = 4, along = 6, lobe = 0.35, fold = 0.18, curl = 0.22 } = {} ) {

	const pos = [], uvs = [], idx = [];
	const PET = 0.22; // 叶柄长度
	for ( let j = 0; j <= along; j ++ ) {

		const v = j / along;
		// 叶宽轮廓：基部心形内凹（lobe），尖端收尖
		const w = Math.sin( Math.PI * Math.pow( v, 0.75 ) ) * ( 1 + lobe * ( 1 - v ) * ( 1 - v ) ) * 0.42;
		for ( let i = 0; i <= across; i ++ ) {

			const u = i / across * 2 - 1;
			const x = u * w;
			let y = PET + v * ( 1 - PET );
			// 心形基部：两侧叶耳向下延伸
			y -= lobe * 0.25 * Math.abs( u ) * Math.pow( 1 - v, 3 );
			const z = Math.abs( u ) * fold * w + curl * v * v - 0.05 * Math.sin( Math.PI * v );
			pos.push( x, y, z );
			uvs.push( u, v );

		}

	}

	for ( let j = 0; j < along; j ++ ) for ( let i = 0; i < across; i ++ ) {

		const a = j * ( across + 1 ) + i, b = a + 1, c = a + across + 1, d = c + 1;
		idx.push( a, b, c, b, d, c );

	}

	// 叶柄（细三棱柱，从原点到叶片基部）
	const base = pos.length / 3;
	const pr = 0.012;
	for ( let k = 0; k < 3; k ++ ) {

		const a = k / 3 * Math.PI * 2;
		pos.push( Math.cos( a ) * pr, 0, Math.sin( a ) * pr, Math.cos( a ) * pr * 0.6, PET + 0.02, Math.sin( a ) * pr * 0.6 );
		uvs.push( 0, 0, 0, 0 );

	}

	for ( let k = 0; k < 3; k ++ ) {

		const a = base + k * 2, b = base + ( ( k + 1 ) % 3 ) * 2;
		idx.push( a, b, a + 1, b, b + 1, a + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 叶片朝向：法线 n（叶面朝向）、叶尖方向 t（大致）
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

// 叶色：暗、略去饱和的绿；少量偏黄/偏褐的老叶
function leafColor( r, shade = 1 ) {

	const c = new THREE.Color();
	const k = r();
	if ( k < 0.05 ) c.setRGB( 0.085, 0.065, 0.025 ); // 枯黄
	else if ( k < 0.18 ) c.setRGB( 0.055, 0.08, 0.02 ); // 黄绿嫩叶
	else c.setRGB( 0.02 + r() * 0.016, 0.042 + r() * 0.026, 0.01 + r() * 0.01 );
	return c.multiplyScalar( shade * ( 0.8 + r() * 0.4 ) );

}

export function buildIvy( mats, mossSample ) {

	const r = rng( 101 );
	const mats4 = [], cols = [];
	const P = new THREE.Vector3(), N = new THREE.Vector3(), Tt = new THREE.Vector3();
	const WX = L.WALL_X;

	const push = ( p, n, t, size, shade ) => {

		const m = new THREE.Matrix4();
		leafMatrix( p, n, t, size, m );
		mats4.push( m );
		cols.push( leafColor( r, shade ) );

	};

	// —— 1. 墙根堆积体：包络高度 h(z)、厚度 d(z) 随噪声起伏，偶有缺口 ——
	const pileH = ( z ) => {

		const n = fbm2( z * 0.23, 3.7, 4 );
		const gap = smooth( 0.32, 0.42, fbm2( z * 0.11, 9.1, 3 ) );
		return ( 0.25 + 1.9 * Math.pow( n, 1.6 ) ) * gap;

	};

	const pileD = ( z ) => ( 0.25 + 0.75 * fbm2( z * 0.31, 1.3, 3 ) ) * Math.min( 1, pileH( z ) / 0.5 + 0.2 );
	for ( let z = L.Z1 + 1; z > L.Z0; z -= 0.012 ) {

		const H = pileH( z ), D = pileD( z );
		if ( H < 0.08 ) continue;
		const n = Math.round( 1 + H * 2.2 );
		for ( let k = 0; k < n; k ++ ) {

			// 在包络剖面上取点（椭圆四分之一：d∈[0,D]，y∈[0,H]）
			const a = r() * Math.PI / 2;
			const e = 0.78 + r() * 0.26; // 偏向表面（内部的叶子看不见）
			const d = Math.cos( a ) * D * e, y = Math.sin( a ) * H * e + 0.08;
			const zz = z + ( r() - 0.5 ) * 0.03;
			P.set( WX - 0.02 - d, y, zz );
			// 包络外法线 + 向上偏（叶片朝向天光）+ 随机
			N.set( - Math.cos( a ) / D, Math.sin( a ) / H, 0 ).normalize();
			N.y += 0.6; N.x += ( r() - 0.5 ) * 1.1; N.z += ( r() - 0.5 ) * 1.4; N.y += r() * 0.4;
			Tt.set( - Math.cos( a ) * 0.6 + ( r() - 0.5 ), 0.6 + r() * 0.5, ( r() - 0.5 ) * 1.5 );
			const size = 0.085 + r() * 0.08 + H * 0.02;
			push( P.clone(), N.clone(), Tt.clone(), size, 0.75 + 0.35 * Math.sin( a ) );

		}

	}

	// —— 2. 攀爬藤茎：从墙根出发向上，随机摆动，沿途长叶 ——
	const stems = [];
	for ( let z = L.Z1 - 0.5; z > L.Z0 + 1; z -= 0.35 + r() * 0.9 ) {

		const H0 = pileH( z );
		if ( H0 < 0.15 && r() < 0.7 ) continue;
		const maxH = Math.min( L.WALL_H - 0.4, H0 + 0.5 + Math.pow( r(), 1.5 ) * 4.2 * ( fbm2( z * 0.15, 4.2, 2 ) + 0.3 ) );
		let y = H0 * 0.6, zz = z, dz = ( r() - 0.5 ) * 0.4;
		const stemW = 0.4 + r() * 0.8;
		const pts = [];
		while ( y < maxH ) {

			pts.push( new THREE.Vector3( WX - 0.025, y, zz ) );
			y += 0.06;
			dz += ( r() - 0.5 ) * 0.12; dz *= 0.92;
			zz += dz * 0.06;
			// 分枝：沿途长叶，越往上越稀疏
			// 叶团宽度：靠下宽、靠上窄，形成从墙根往上「流」的藤蔓瀑布
			const f = ( y - H0 ) / ( maxH - H0 + 0.01 );
			const spread = 0.12 + 0.45 * ( 1 - f ) * stemW;
			const m = Math.floor( ( 2.5 + 5 * ( 1 - f ) ) * stemW + r() );
			for ( let k = 0; k < m; k ++ ) {

				const off = r.gauss() * spread;
				const dep = r() * 0.12 * ( 1 - Math.abs( off ) / ( spread * 2 + 0.01 ) );
				P.set( WX - 0.03 - dep, y + ( r() - 0.5 ) * 0.08, zz + off );
				N.set( - 1, 0.35 + r() * 0.5, ( r() - 0.5 ) * 0.9 + off );
				Tt.set( ( r() - 0.5 ) * 0.4, 1, off * 2 + ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), 0.06 + r() * 0.06, 0.8 + dep * 2 );

			}

		}

		if ( pts.length > 2 ) stems.push( pts );

	}

	// —— 2b. 从墙顶垂下的藤蔓帘（屋顶上的植物翻过压顶向下生长）——
	for ( let z = L.Z1 - 1; z > L.Z0 + 1; z -= 0.6 + r() * 1.6 ) {

		const k = fbm2( z * 0.17, 12.3, 3 );
		if ( k < 0.48 ) continue;
		const len = 0.6 + ( k - 0.48 ) * 9 * r();
		const w0 = 0.25 + r() * 0.5;
		for ( let y = L.WALL_H + 0.2; y > L.WALL_H - len; y -= 0.03 ) {

			const f = ( L.WALL_H + 0.2 - y ) / len;
			const n = Math.floor( 3 * ( 1 - f * 0.7 ) + r() );
			for ( let q = 0; q < n; q ++ ) {

				const off = r.gauss() * w0 * ( 1 - f * 0.6 );
				P.set( WX - 0.04 - r() * 0.08 * ( 1 - f ), y, z + off );
				N.set( - 1, 0.2 + r() * 0.5, ( r() - 0.5 ) * 1.0 );
				Tt.set( ( r() - 0.5 ) * 0.5, - 1, ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), 0.06 + r() * 0.05, 0.85 );

			}

		}

	}

	// 压顶上方的植物（翻越墙顶的蓬松轮廓）
	for ( let z = L.Z1; z > L.Z0; z -= 0.03 ) {

		const h = 0.5 * Math.pow( fbm2( z * 0.21, 5.5, 3 ), 2 );
		if ( h < 0.05 ) continue;
		P.set( WX + 0.2 + ( r() - 0.5 ) * 0.5, L.WALL_H + 0.22 + r() * h, z );
		N.set( ( r() - 0.5 ), 1, ( r() - 0.5 ) );
		Tt.set( - 1, 0.3, r() - 0.5 );
		push( P.clone(), N.clone(), Tt.clone(), 0.08 + r() * 0.06, 0.9 );

	}

	// —— 3. 苔藓区域边缘的零星攀爬叶（与苔藓共生）——
	for ( let i = 0; i < 1400; i ++ ) {

		const z = L.Z0 + r() * ( L.Z1 - L.Z0 ), y = 0.5 + r() * 3.5;
		if ( mossSample( z, y ) < 0.5 || r() < 0.6 ) continue;
		P.set( WX - 0.05 - r() * 0.05, y, z );
		N.set( - 1, 0.4 + r() * 0.5, ( r() - 0.5 ) * 0.8 );
		Tt.set( 0, 1, ( r() - 0.5 ) * 1.6 );
		push( P.clone(), N.clone(), Tt.clone(), 0.05 + r() * 0.05, 0.9 );

	}

	// —— 3b. 温室屋檐垂下的藤蔓帘（缠绕钢梁向下）——
	for ( let z = L.Z1 - 0.8; z > L.Z0 + 1; z -= 0.4 + r() * 1.2 ) {

		const k = fbm2( z * 0.19, 21.7, 3 );
		if ( k < 0.5 ) continue;
		const top = 4.6, len = 0.8 + ( k - 0.5 ) * 12 * ( 0.4 + r() * 0.6 );
		const w0 = 0.15 + r() * 0.35;
		for ( let y = top + 0.1; y > Math.max( 0.9, top - len ); y -= 0.035 ) {

			const f = ( top + 0.1 - y ) / len;
			const n = Math.floor( 2.5 * ( 1 - f * 0.6 ) + r() );
			for ( let q = 0; q < n; q ++ ) {

				const off = r.gauss() * w0 * ( 1 - f * 0.5 );
				P.set( L.GH_X + 0.03 + r() * 0.1, y, z + off );
				N.set( 1, 0.2 + r() * 0.5, ( r() - 0.5 ) * 1.0 );
				Tt.set( ( r() - 0.5 ) * 0.5, - 1, ( r() - 0.5 ) );
				push( P.clone(), N.clone(), Tt.clone(), 0.06 + r() * 0.05, 0.8 );

			}

		}

	}

	// —— 4. 温室矮墙脚的小片藤叶 ——
	for ( let z = L.Z1; z > L.Z0; z -= 0.02 ) {

		const h = 0.6 * Math.pow( fbm2( z * 0.4, 7.7, 3 ), 2.5 ) * smooth( 0.4, 0.5, fbm2( z * 0.2, 2.2, 2 ) );
		if ( h < 0.06 ) continue;
		const a = r() * Math.PI / 2, D = h * 0.9;
		P.set( L.GH_X + 0.02 + Math.cos( a ) * D * ( 0.8 + r() * 0.2 ), Math.sin( a ) * h + 0.08, z );
		N.set( Math.cos( a ) + ( r() - 0.5 ), 1 + r() * 0.5, ( r() - 0.5 ) * 1.4 );
		Tt.set( 1, 0.5, r() - 0.5 );
		push( P.clone(), N.clone(), Tt.clone(), 0.07 + r() * 0.06, 0.85 );

	}

	const geo = leafGeometry();
	const mesh = new THREE.InstancedMesh( geo, mats.leaf, mats4.length );
	mats4.forEach( ( m, i ) => { mesh.setMatrixAt( i, m ); mesh.setColorAt( i, cols[ i ] ); } );
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.computeBoundingSphere();

	// 藤茎管道
	const tubes = [];
	for ( const pts of stems ) {

		const curve = new THREE.CatmullRomCurve3( pts );
		tubes.push( new THREE.TubeGeometry( curve, Math.min( 120, pts.length * 2 ), 0.008, 4, false ) );

	}

	const group = new THREE.Group();
	group.add( mesh );
	if ( tubes.length ) {

		const sg = mergeIndexed( tubes );
		const sm = new THREE.Mesh( sg, mats.stem );
		sm.castShadow = true;
		group.add( sm );

	}

	return { group, count: mats4.length };

}

function mergeIndexed( list ) {

	let nv = 0, ni = 0;
	for ( const g of list ) { nv += g.attributes.position.count; ni += g.index.count; }
	const pos = new Float32Array( nv * 3 ), nor = new Float32Array( nv * 3 ), uv = new Float32Array( nv * 2 ), idx = new Uint32Array( ni );
	let ov = 0, oi = 0;
	for ( const g of list ) {

		pos.set( g.attributes.position.array, ov * 3 );
		nor.set( g.attributes.normal.array, ov * 3 );
		uv.set( g.attributes.uv.array, ov * 2 );
		const ix = g.index.array;
		for ( let i = 0; i < ix.length; i ++ ) idx[ oi + i ] = ix[ i ] + ov;
		ov += g.attributes.position.count; oi += ix.length;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	out.setIndex( new THREE.BufferAttribute( idx, 1 ) );
	return out;

}

// ———— 草丛几何：若干弯曲草叶（每片 4 段），uv.y 为高度 ————
function grassClump( r, blades = 9 ) {

	const pos = [], uvs = [], idx = [];
	for ( let b = 0; b < blades; b ++ ) {

		const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.5;
		const h = 0.5 + r() * 0.6, w = 0.012 + r() * 0.01;
		const ox = ( r() - 0.5 ) * 0.08, oz = ( r() - 0.5 ) * 0.08;
		const dx = Math.cos( a ), dz = Math.sin( a );
		const base = pos.length / 3;
		const SEG = 4;
		for ( let s = 0; s <= SEG; s ++ ) {

			const t = s / SEG;
			const bend = lean * t * t;
			const cx = ox + dx * bend * h, cz = oz + dz * bend * h, cy = h * t * ( 1 - 0.3 * lean * t );
			const ww = w * ( 1 - t * 0.9 );
			// 叶片横向方向（垂直于倾倒方向）
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
	// 草叶法线统一偏上：避免薄片背面发黑
	const n = g.attributes.normal;
	for ( let i = 0; i < n.count; i ++ ) { n.setY( i, n.getY( i ) + 0.8 ); }
	g.normalizeNormals?.();
	return g;

}

export function buildGrass( mats, ground ) {

	const r = rng( 303 );
	const variants = [ grassClump( r, 7 ), grassClump( r, 11 ), grassClump( r, 5 ) ];
	const lists = variants.map( () => ( { m: [], c: [] } ) );
	const add = ( x, z, s, dense = 1 ) => {

		const k = Math.floor( r() * variants.length );
		const m = new THREE.Matrix4().compose( new THREE.Vector3( x, 0.07, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, r() * 6.28, 0 ) ), new THREE.Vector3( s, s * ( 0.7 + r() * 0.6 ) * dense, s ) );
		const c = new THREE.Color().setRGB( 0.045 + r() * 0.03, 0.06 + r() * 0.03, 0.02 + r() * 0.01 );
		if ( r() < 0.15 ) c.setRGB( 0.1, 0.09, 0.045 ); // 枯草
		lists[ k ].m.push( m ); lists[ k ].c.push( c );

	};

	const { cells, slabW } = ground;
	for ( const c of cells ) {

		if ( c.missing ) {

			for ( let i = 0; i < 26; i ++ ) add( c.cx + ( r() - 0.5 ) * c.w, c.cz + ( r() - 0.5 ) * c.d, 0.4 + r() * 0.5 );
			continue;

		}

		// 板缝（沿 z 的横缝 + 沿 x 的纵缝），密度随噪声变化
		const dens = fbm2( c.cx * 0.5, c.cz * 0.5, 3 );
		const nGap = Math.floor( dens * dens * 14 );
		for ( let i = 0; i < nGap; i ++ ) {

			if ( r() < 0.5 ) add( c.cx + ( r() - 0.5 ) * c.w, c.cz + c.d / 2, 0.18 + r() * 0.3 );
			else add( c.cx + c.w / 2, c.cz + ( r() - 0.5 ) * c.d, 0.18 + r() * 0.3 );

		}

	}

	// 两侧墙根的高草带
	for ( let z = L.Z1; z > L.Z0; z -= 0.09 ) {

		if ( r() < 0.75 ) add( L.SOIL_X - 0.05 + r() * 0.15, z, 0.35 + r() * 0.5 );
		if ( r() < 0.6 * fbm2( z * 0.3, 1, 2 ) * 2 ) add( L.GH_X + 0.06 + r() * 0.25, z, 0.3 + r() * 0.6 );

	}

	const group = new THREE.Group();
	variants.forEach( ( g, k ) => {

		const { m, c } = lists[ k ];
		if ( ! m.length ) return;
		const mesh = new THREE.InstancedMesh( g, mats.grass, m.length );
		m.forEach( ( mm, i ) => { mesh.setMatrixAt( i, mm ); mesh.setColorAt( i, c[ i ] ); } );
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		group.add( mesh );

	} );
	return group;

}
