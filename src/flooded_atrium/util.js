// 淹水中庭：通用工具（随机数、几何合并、世界空间盒投影 UV、贴图组）
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = '/assets/';
const texLoader = new THREE.TextureLoader();

// 可复现的伪随机（mulberry32）
export function mulberry( seed ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

export function tex( path, { srgb = false } = {} ) {

	const t = texLoader.load( BASE + path );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	if ( srgb ) t.colorSpace = THREE.SRGBColorSpace;
	return t;

}

// Poly Haven 贴图组：diff / nor_gl / arm
const _sets = new Map();
export function texSet( id, res = '1k' ) {

	const key = id + res;
	if ( ! _sets.has( key ) ) {

		const p = `textures/${id}/${id}_`;
		_sets.set( key, {
			map: tex( `${p}diff_${res}.jpg`, { srgb: true } ),
			normalMap: tex( `${p}nor_gl_${res}.jpg` ),
			arm: tex( `${p}arm_${res}.jpg` ),
		} );

	}

	return _sets.get( key );

}

/**
 * 世界空间（或几何所在空间）盒投影 UV：按每个三角面的主法线轴选择投影平面，单位 = 米 × scale。
 * 先把几何体放到最终位置再调用，可保证所有构件贴图密度一致、不拉伸。
 */
export function boxUV( geo, scale = 1 ) {

	const g = geo.index ? geo.toNonIndexed() : geo;
	g.computeVertexNormals();
	const p = g.attributes.position, n = g.attributes.normal;
	const uv = new Float32Array( p.count * 2 );
	for ( let i = 0; i < p.count; i += 3 ) {

		// 用三角面平均法线决定投影轴，避免同一面内跳轴
		let nx = 0, ny = 0, nz = 0;
		for ( let k = 0; k < 3; k ++ ) { nx += n.getX( i + k ); ny += n.getY( i + k ); nz += n.getZ( i + k ); }
		const ax = Math.abs( nx ), ay = Math.abs( ny ), az = Math.abs( nz );
		for ( let k = 0; k < 3; k ++ ) {

			const x = p.getX( i + k ), y = p.getY( i + k ), z = p.getZ( i + k );
			let u, v;
			if ( ay >= ax && ay >= az ) { u = x; v = z; } else if ( ax >= az ) { u = z * Math.sign( nx ); v = y; } else { u = - x * Math.sign( nz ); v = y; }
			uv[ ( i + k ) * 2 ] = u * scale;
			uv[ ( i + k ) * 2 + 1 ] = v * scale;

		}

	}

	g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	return g;

}

// 合并：统一成非索引 + 仅保留 position/normal/uv
export function merge( geos ) {

	const list = geos.map( ( g ) => {

		let h = g.index ? g.toNonIndexed() : g;
		if ( ! h.attributes.normal ) h.computeVertexNormals();
		if ( ! h.attributes.uv ) h.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( h.attributes.position.count * 2 ), 2 ) );
		for ( const k of Object.keys( h.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( k ) ) h.deleteAttribute( k );
		h.morphAttributes = {};
		h.clearGroups();
		return h;

	} );
	return mergeGeometries( list, false );

}

// 生成一个放置好的盒子几何（真实尺寸，可选倒角）
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export function box( w, h, d, x, y, z, { ry = 0, rx = 0, rz = 0, bevel = 0 } = {} ) {

	const g = bevel > 0 ? new RoundedBoxGeometry( w, h, d, 2, Math.min( bevel, w / 2.01, h / 2.01, d / 2.01 ) ) : new THREE.BoxGeometry( w, h, d );
	g.applyMatrix4( new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz ) ), new THREE.Vector3( 1, 1, 1 ) ) );
	return g;

}

export function meshOf( geo, mat, { cast = true, receive = true } = {} ) {

	const m = new THREE.Mesh( geo, mat );
	m.castShadow = cast; m.receiveShadow = receive;
	return m;

}
