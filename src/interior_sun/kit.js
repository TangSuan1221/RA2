// 几何拼装工具：按真实尺寸生成盒子 UV（不拉伸），按材质合并成少量网格（控制绘制调用）
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 可复现的随机数
export function rng( seed = 1 ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6D2B79F5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/**
 * 盒投影 UV：按每个面的主法线轴，取本地坐标作为 UV（单位：米 / texMeters），保证贴图密度一致、不拉伸。
 * grain：木纹方向所在的本地轴（'x'|'y'|'z'），贴图的 u 方向会对齐到这个轴（木板贴图的纹理是横向的）
 */
export function boxUV( geo, texMeters = 2, grain = 'x', offset = [ 0, 0 ] ) {

	const p = geo.attributes.position, n = geo.attributes.normal;
	const uv = new Float32Array( p.count * 2 );
	const ax = { x: 0, y: 1, z: 2 };
	for ( let i = 0; i < p.count; i ++ ) {

		const v = [ p.getX( i ), p.getY( i ), p.getZ( i ) ];
		const nn = [ Math.abs( n.getX( i ) ), Math.abs( n.getY( i ) ), Math.abs( n.getZ( i ) ) ];
		const dom = nn[ 0 ] > nn[ 1 ] && nn[ 0 ] > nn[ 2 ] ? 0 : ( nn[ 1 ] > nn[ 2 ] ? 1 : 2 );
		// 两个切向轴
		let t = [ 0, 1, 2 ].filter( ( k ) => k !== dom );
		const g = ax[ grain ];
		if ( t[ 1 ] === g ) t = [ t[ 1 ], t[ 0 ] ];
		uv[ i * 2 ] = v[ t[ 0 ] ] / texMeters + offset[ 0 ];
		uv[ i * 2 + 1 ] = v[ t[ 1 ] ] / texMeters + offset[ 1 ];

	}

	geo.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	return geo;

}

// 收集器：同材质的几何体最后合并为一个网格
export class Kit {

	constructor( seed = 7 ) {

		this.lists = new Map();
		this.rand = rng( seed );

	}

	/**
	 * 加一个盒子
	 * @param mat 材质（需带 userData.texMeters / userData.grainAxis 可选）
	 * @param size [w,h,d]
	 * @param pos  [x,y,z]（盒子中心）
	 * @param rot  [rx,ry,rz]
	 * @param opt  { grain:'x'|'y'|'z', bevel: 倒角半径 }
	 */
	box( mat, size, pos, rot = [ 0, 0, 0 ], opt = {} ) {

		const [ w, h, d ] = size;
		const bevel = opt.bevel ?? 0;
		const geo = bevel > 0 ? new RoundedBoxGeometry( w, h, d, 1, Math.min( bevel, w / 2.1, h / 2.1, d / 2.1 ) ) : new THREE.BoxGeometry( w, h, d );
		// 默认木纹沿最长轴
		const grain = opt.grain ?? ( w >= h && w >= d ? 'x' : ( h >= d ? 'y' : 'z' ) );
		boxUV( geo, mat.userData.texMeters ?? 2, mat.userData.vGrain ? ( { x: 'y', y: 'x', z: 'y' }[ grain ] ) : grain, [ this.rand() * 7, this.rand() * 7 ] );
		const m = new THREE.Matrix4().compose(
			new THREE.Vector3( ...pos ),
			new THREE.Quaternion().setFromEuler( new THREE.Euler( ...rot ) ),
			new THREE.Vector3( 1, 1, 1 ),
		);
		if ( opt.parent ) m.premultiply( opt.parent );
		geo.applyMatrix4( m );
		this.add( mat, geo );
		return geo;

	}

	add( mat, geo ) {

		// 统一属性集合（position/normal/uv），合并时要求一致
		for ( const k of Object.keys( geo.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( k ) ) geo.deleteAttribute( k );
		const g = geo.index ? geo.toNonIndexed() : geo;
		if ( ! this.lists.has( mat ) ) this.lists.set( mat, [] );
		this.lists.get( mat ).push( g );

	}

	build( { castShadow = true, receiveShadow = true, layer = null } = {} ) {

		const group = new THREE.Group();
		for ( const [ mat, geos ] of this.lists ) {

			const mesh = new THREE.Mesh( mergeGeometries( geos, false ), mat );
			mesh.castShadow = castShadow;
			mesh.receiveShadow = receiveShadow;
			if ( layer !== null ) { mesh.layers.set( layer ); }
			group.add( mesh );

		}

		return group;

	}

}
