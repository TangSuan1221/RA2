// 几何工具：统一属性（position/normal/uv/color）后合并，减少绘制调用
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function prep( g, color = null ) {

	color = color || [ 1, 1, 1 ];
	const q = g.index ? g.toNonIndexed() : g;
	if ( ! q.attributes.normal ) q.computeVertexNormals();
	if ( ! q.attributes.uv ) q.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( q.attributes.position.count * 2 ), 2 ) );
	const n = q.attributes.position.count;
	const c = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) c.set( color, i * 3 );
	q.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
	for ( const k of Object.keys( q.attributes ) ) if ( ! [ 'position', 'normal', 'uv', 'color' ].includes( k ) ) q.deleteAttribute( k );
	return q;

}

// 收集器：add(geometry, matrix?, color?) → build(material) 生成单个网格
export class GeoBin {

	constructor() {

		this.list = [];

	}

	add( g, m = null, color = null ) {

		if ( m ) g.applyMatrix4( m );
		this.list.push( prep( g, color ) );
		return this;

	}

	box( sx, sy, sz, m, color = null ) {

		return this.add( new THREE.BoxGeometry( sx, sy, sz ), m, color );

	}

	build( mat, { shadow = true } = {} ) {

		if ( ! this.list.length ) return new THREE.Group();
		const g = mergeGeometries( this.list );
		g.computeBoundingSphere();
		const mesh = new THREE.Mesh( g, mat );
		mesh.castShadow = shadow; mesh.receiveShadow = true;
		return mesh;

	}

}

// 由位置 + 欧拉角构造矩阵
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function M4( x, y, z, rx = 0, ry = 0, rz = 0, order = 'YXZ', sx = 1, sy = 1, sz = 1 ) {

	_q.setFromEuler( _e.set( rx, ry, rz, order ) );
	return new THREE.Matrix4().compose( _v.set( x, y, z ), _q, _s.set( sx, sy, sz ) );

}
