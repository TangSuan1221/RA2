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

// 合并若干 BufferGeometry（只保留 position/normal/uv，全部转为非索引再合并）
export function merge( list ) {

	let n = 0;
	const prepared = list.map( ( g ) => {

		const ng = g.index ? ( g.index ? g.toNonIndexed() : g ) : g;
		if ( ! ng.attributes.normal ) ng.computeVertexNormals();
		n += ng.attributes.position.count;
		return ng;

	} );
	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), uv = new Float32Array( n * 2 );
	let o = 0;
	for ( const g of prepared ) {

		const c = g.attributes.position.count;
		pos.set( g.attributes.position.array, o * 3 );
		nor.set( g.attributes.normal.array, o * 3 );
		if ( g.attributes.uv ) uv.set( g.attributes.uv.array, o * 2 );
		o += c;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	out.computeBoundingSphere();
	out.computeBoundingBox();
	return out;

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
	return det.abs().mul( nn ).sub( grad ).normalize();

} );
