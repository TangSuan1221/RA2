// 苔藓小巷：通用工具（确定性随机数、CPU 噪声、几何拼接、世界空间 UV）
import * as THREE from 'three/webgpu';

// 确定性随机数（mulberry32），保证每次截图完全一致
export function rng( seed = 1 ) {

	let a = seed >>> 0;
	const f = () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

	f.range = ( a, b ) => a + ( b - a ) * f();
	f.pick = ( arr ) => arr[ Math.floor( f() * arr.length ) ];
	f.gauss = () => ( f() + f() + f() - 1.5 ) / 1.5;
	return f;

}

// —— CPU 值噪声（用于烘焙遮罩贴图与摆放植被）——
function hash2( x, y ) {

	let h = ( x * 374761393 + y * 668265263 ) | 0;
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}

export function noise2( x, y ) {

	const xi = Math.floor( x ), yi = Math.floor( y );
	const xf = x - xi, yf = y - yi;
	const u = xf * xf * ( 3 - 2 * xf ), v = yf * yf * ( 3 - 2 * yf );
	const a = hash2( xi, yi ), b = hash2( xi + 1, yi ), c = hash2( xi, yi + 1 ), d = hash2( xi + 1, yi + 1 );
	return a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v;

}

export function fbm2( x, y, oct = 4, lac = 2.03, gain = 0.5 ) {

	let s = 0, amp = 0.5, norm = 0;
	for ( let i = 0; i < oct; i ++ ) {

		s += noise2( x, y ) * amp;
		norm += amp;
		x = x * lac + 17.13; y = y * lac + 9.71;
		amp *= gain;

	}

	return s / norm;

}

export const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// 合并若干 BufferGeometry（position/normal/uv，若全部带 color 也保留；全部转为非索引再合并）
export function merge( list ) {

	let n = 0;
	const prepared = list.map( ( g ) => {

		const ng = g.index ? g.toNonIndexed() : g;
		if ( ! ng.attributes.normal ) ng.computeVertexNormals();
		n += ng.attributes.position.count;
		return ng;

	} );
	const hasColor = prepared.every( ( g ) => g.attributes.color );
	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), uv = new Float32Array( n * 2 );
	const col = hasColor ? new Float32Array( n * 3 ) : null;
	let o = 0;
	for ( const g of prepared ) {

		const c = g.attributes.position.count;
		pos.set( g.attributes.position.array, o * 3 );
		nor.set( g.attributes.normal.array, o * 3 );
		if ( g.attributes.uv ) uv.set( g.attributes.uv.array, o * 2 );
		if ( col ) col.set( g.attributes.color.array, o * 3 );
		o += c;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	if ( col ) out.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	out.computeBoundingSphere();
	out.computeBoundingBox();
	return out;

}

// 给几何体写入常量顶点色（用作逐物体随机参数）
export function paint( g, r, gr, b ) {

	const n = g.attributes.position.count, a = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) { a[ i * 3 ] = r; a[ i * 3 + 1 ] = gr; a[ i * 3 + 2 ] = b; }
	g.setAttribute( 'color', new THREE.BufferAttribute( a, 3 ) );
	return g;

}

// 合并带索引的几何体（保留 position/normal/uv，若全部带 color 也保留）
export function mergeIndexed( list ) {

	let nv = 0, ni = 0;
	list = list.map( ( g ) => g.index ? g : indexify( g ) );
	for ( const g of list ) { nv += g.attributes.position.count; ni += g.index.count; }
	const hasColor = list.every( ( g ) => g.attributes.color );
	const pos = new Float32Array( nv * 3 ), nor = new Float32Array( nv * 3 ), uv = new Float32Array( nv * 2 ), idx = new Uint32Array( ni );
	const col = hasColor ? new Float32Array( nv * 3 ) : null;
	let ov = 0, oi = 0;
	for ( const g of list ) {

		if ( ! g.attributes.normal ) g.computeVertexNormals();
		pos.set( g.attributes.position.array, ov * 3 );
		nor.set( g.attributes.normal.array, ov * 3 );
		if ( g.attributes.uv ) uv.set( g.attributes.uv.array, ov * 2 );
		if ( col ) col.set( g.attributes.color.array, ov * 3 );
		const ix = g.index.array;
		for ( let i = 0; i < ix.length; i ++ ) idx[ oi + i ] = ix[ i ] + ov;
		ov += g.attributes.position.count; oi += ix.length;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	if ( col ) out.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	out.setIndex( new THREE.BufferAttribute( idx, 1 ) );
	out.computeBoundingSphere();
	out.computeBoundingBox();
	return out;

}

function indexify( g ) {

	const n = g.attributes.position.count, a = new Uint32Array( n );
	for ( let i = 0; i < n; i ++ ) a[ i ] = i;
	g.setIndex( new THREE.BufferAttribute( a, 1 ) );
	return g;

}

// 变径管（藤茎、电缆、枝干）：沿折线生成，半径从 r0 线性渐变到 r1
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3();
export function taperTube( pts, r0, r1, radial = 5 ) {

	const pos = [], uvs = [], idx = [];
	const n = pts.length;
	let prevN = null;
	for ( let i = 0; i < n; i ++ ) {

		const a = pts[ Math.max( 0, i - 1 ) ], b = pts[ Math.min( n - 1, i + 1 ) ];
		_t.subVectors( b, a ).normalize();
		if ( ! prevN ) {

			_up.set( 0, 1, 0 );
			if ( Math.abs( _t.y ) > 0.9 ) _up.set( 1, 0, 0 );
			prevN = new THREE.Vector3().crossVectors( _t, _up ).normalize();

		}

		// 平行移动标架，避免扭转
		_b.crossVectors( _t, prevN ).normalize();
		_n.crossVectors( _b, _t ).normalize();
		prevN.copy( _n );
		const f = i / ( n - 1 );
		const r = r0 + ( r1 - r0 ) * f;
		for ( let k = 0; k <= radial; k ++ ) {

			const ang = k / radial * Math.PI * 2;
			const c = Math.cos( ang ), s = Math.sin( ang );
			pos.push( pts[ i ].x + ( _n.x * c + _b.x * s ) * r, pts[ i ].y + ( _n.y * c + _b.y * s ) * r, pts[ i ].z + ( _n.z * c + _b.z * s ) * r );
			uvs.push( k / radial, f );

		}

	}

	for ( let i = 0; i < n - 1; i ++ ) for ( let k = 0; k < radial; k ++ ) {

		const a = i * ( radial + 1 ) + k, b = a + 1, c = a + radial + 1, d = c + 1;
		idx.push( a, c, b, b, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 不规则团块（苔藓垫、石子）：二十面体顶点按噪声扰动，底部压平
export function lumpGeometry( seed = 1, detail = 1, flat = 0.55 ) {

	const g = new THREE.IcosahedronGeometry( 1, detail );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const k = 0.75 + 0.5 * noise2( x * 2.1 + seed * 7.1, z * 2.1 + y * 1.7 + seed );
		x *= k; y *= k; z *= k;
		if ( y < 0 ) y *= 0.15;
		p.setXYZ( i, x, y * flat, z );

	}

	g.deleteAttribute( 'normal' );
	const m = mergeVerts( g );
	m.computeVertexNormals();
	return m;

}

function mergeVerts( g ) {

	// Icosahedron 为非索引几何：按位置合并顶点，得到平滑法线
	const p = g.attributes.position, map = new Map(), pos = [], idx = [];
	for ( let i = 0; i < p.count; i ++ ) {

		const key = `${p.getX( i ).toFixed( 4 )},${p.getY( i ).toFixed( 4 )},${p.getZ( i ).toFixed( 4 )}`;
		if ( ! map.has( key ) ) { map.set( key, pos.length / 3 ); pos.push( p.getX( i ), p.getY( i ), p.getZ( i ) ); }
		idx.push( map.get( key ) );

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	const uv = new Float32Array( pos.length / 3 * 2 );
	for ( let i = 0; i < pos.length / 3; i ++ ) { uv[ i * 2 ] = pos[ i * 3 ]; uv[ i * 2 + 1 ] = pos[ i * 3 + 2 ]; }
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	out.setIndex( idx );
	return out;

}

// 实例化网格的便捷构造
export function instanced( geo, mat, mats4, cols = null, { cast = true, receive = true } = {} ) {

	const m = new THREE.InstancedMesh( geo, mat, Math.max( 1, mats4.length ) );
	m.count = mats4.length;
	mats4.forEach( ( x, i ) => m.setMatrixAt( i, x ) );
	if ( cols ) cols.forEach( ( c, i ) => m.setColorAt( i, c ) );
	m.castShadow = cast; m.receiveShadow = receive;
	m.computeBoundingSphere();
	return m;

}

// 按世界坐标重写 UV（盒状投影：按法线主轴选平面），tile = 每个贴图周期的米数
export function worldUV( g, tile = 1, offset = [ 0, 0 ] ) {

	const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const ax = Math.abs( nn.getX( i ) ), ay = Math.abs( nn.getY( i ) ), az = Math.abs( nn.getZ( i ) );
		if ( ay >= ax && ay >= az ) uv.setXY( i, x / tile + offset[ 0 ], z / tile + offset[ 1 ] );
		else if ( ax >= az ) uv.setXY( i, z / tile + offset[ 0 ], y / tile + offset[ 1 ] );
		else uv.setXY( i, x / tile + offset[ 0 ], y / tile + offset[ 1 ] );

	}

	uv.needsUpdate = true;
	return g;

}

// 带小倒角的盒子（倒角 = 在边缘切一圈 45° 斜面，阳光下边缘有高光，避免「CG 方块」）
export function bevelBox( w, h, d, b = 0.01 ) {

	const shape = new THREE.Shape();
	const x = w / 2 - b, y = h / 2 - b;
	shape.moveTo( - x, - h / 2 );
	shape.lineTo( x, - h / 2 ); shape.lineTo( w / 2, - y );
	shape.lineTo( w / 2, y ); shape.lineTo( x, h / 2 );
	shape.lineTo( - x, h / 2 ); shape.lineTo( - w / 2, y );
	shape.lineTo( - w / 2, - y ); shape.lineTo( - x, - h / 2 );
	const g = new THREE.ExtrudeGeometry( shape, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: 0, bevelSegments: 1, steps: 1 } );
	g.translate( 0, 0, - ( d - 2 * b ) / 2 );
	g.computeVertexNormals();
	return ( g.index ? g.toNonIndexed() : g );

}

// 应用矩阵后返回（链式）
export const xf = ( g, m ) => { g.applyMatrix4( m ); return g; };
export const T = ( x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx ) =>
	new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz ) ), new THREE.Vector3( sx, sy, sz ) );

// 把 Float 数据写成 RGBA8 数据纹理（线性、带 mipmap）
export function dataTex( w, h, fill ) {

	const data = new Uint8Array( w * h * 4 );
	fill( data );
	const t = new THREE.DataTexture( data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType );
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.magFilter = THREE.LinearFilter;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.anisotropy = 8;
	t.needsUpdate = true;
	return t;

}

// 从 TSL 高度场求扰动法线（Mikkelsen 屏幕导数法，避免需要切线）
import { Fn, positionView, normalView, faceDirection } from 'three/tsl';
export const bumpFromHeight = Fn( ( [ h, scale, n ] ) => {

	const dHx = h.dFdx().mul( scale ), dHy = h.dFdy().mul( scale );
	const sx = positionView.dFdx(), sy = positionView.dFdy();
	const nn = n ?? normalView;
	const r1 = sy.cross( nn ), r2 = nn.cross( sx );
	const det = sx.dot( r1 ).mul( faceDirection );
	const grad = det.sign().mul( dHx.mul( r1 ).add( dHy.mul( r2 ) ) );
	// 亚像素几何时 det≈0 → 结果为零向量，normalize 得 NaN（渲染成黑块）：退回几何法线
	const v = det.abs().mul( nn ).sub( grad );
	return v.dot( v ).greaterThan( 1e-12 ).select( v.normalize(), nn );

} );
