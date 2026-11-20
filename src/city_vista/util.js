// 城市远景：通用工具（确定性随机数、CPU 噪声、折线距离、几何辅助）
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

	f.range = ( lo, hi ) => lo + ( hi - lo ) * f();
	f.pick = ( arr ) => arr[ Math.floor( f() * arr.length ) ];
	return f;

}

// —— CPU 值噪声 ——
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

export function fbm2( x, y, oct = 4 ) {

	let s = 0, amp = 0.5, f = 1, n = 0;
	for ( let i = 0; i < oct; i ++ ) {

		s += noise2( x * f + i * 17.3, y * f - i * 9.1 ) * amp;
		n += amp; amp *= 0.5; f *= 2.03;

	}

	return s / n;

}

export const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// 点到折线的最短距离（xz 平面）
export function distToPolyline( x, z, pts ) {

	let best = 1e9;
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ];
		const dx = bx - ax, dz = bz - az;
		const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( z - az ) * dz ) / ( dx * dx + dz * dz ) ) );
		const ex = ax + dx * t - x, ez = az + dz * t - z;
		best = Math.min( best, Math.hypot( ex, ez ) );

	}

	return best;

}

// 折线 Catmull-Rom 平滑（用于道路/小径）
export function smoothPolyline( pts, steps = 6 ) {

	const v = pts.map( ( [ x, z ] ) => new THREE.Vector3( x, 0, z ) );
	const c = new THREE.CatmullRomCurve3( v, false, 'centripetal' );
	return c.getPoints( pts.length * steps ).map( ( p ) => [ p.x, p.z ] );

}

// 盒子：各面 UV 以米为单位（u 沿立面水平方向，v 竖直），顶面 uv 为世界 xz
export function boxMeters( w, h, d ) {

	const g = new THREE.BoxGeometry( w, h, d );
	g.translate( 0, h / 2, 0 );
	const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		const nx = nor.getX( i ), ny = nor.getY( i ), nz = nor.getZ( i );
		if ( Math.abs( ny ) > 0.5 ) uv.setXY( i, x, z );
		else if ( Math.abs( nx ) > 0.5 ) uv.setXY( i, ( nx > 0 ? - z : z ) + d / 2, y );
		else uv.setXY( i, ( nz > 0 ? x : - x ) + w / 2, y );

	}

	return g;

}

// 给几何体追加一个常量 float 属性（合批后在着色器里区分每栋楼）
export function addConstAttr( g, name, value, size = 1 ) {

	const n = g.attributes.position.count;
	const arr = new Float32Array( n * size );
	for ( let i = 0; i < n; i ++ ) for ( let k = 0; k < size; k ++ ) arr[ i * size + k ] = Array.isArray( value ) ? value[ k ] : value;
	g.setAttribute( name, new THREE.BufferAttribute( arr, size ) );
	return g;

}

// Canvas 纹理（标牌、广告牌）
export function canvasTexture( w, h, draw ) {

	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	draw( c.getContext( '2d' ), w, h );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	t.generateMipmaps = true;
	return t;

}
