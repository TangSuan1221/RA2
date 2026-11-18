// 资产加载工具：glTF 模型 → 节点材质，附加 Alpha 贴图，按模块名取几何体
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE = '/assets/';
const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

const COPY_KEYS = [ 'name', 'color', 'map', 'normalMap', 'normalScale', 'roughness', 'roughnessMap', 'metalness',
	'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveMap', 'emissiveIntensity', 'side', 'vertexColors' ];

function toNodeMaterial( src ) {

	const m = new THREE.MeshStandardNodeMaterial();
	for ( const k of COPY_KEYS ) if ( src[ k ] !== undefined ) m[ k ] = src[ k ];
	return m;

}

export function loadTexture( path, { srgb = false, repeat = 1 } = {} ) {

	const t = texLoader.load( BASE + path );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set( repeat, repeat );
	t.anisotropy = 8;
	if ( srgb ) t.colorSpace = THREE.SRGBColorSpace;
	return t;

}

// 加载 Poly Haven 的 PBR 贴图组（diff / nor_gl / arm），返回节点材质
export function pbrMaterial( id, res = '2k', repeat = 1 ) {

	const p = `textures/${id}/${id}_`;
	const arm = loadTexture( `${p}arm_${res}.jpg`, { repeat } );
	return new THREE.MeshStandardNodeMaterial( {
		map: loadTexture( `${p}diff_${res}.jpg`, { srgb: true, repeat } ),
		normalMap: loadTexture( `${p}nor_gl_${res}.jpg`, { repeat } ),
		aoMap: arm, roughnessMap: arm, metalnessMap: arm,
		roughness: 1, metalness: 1,
	} );

}

export async function loadHDR( path ) {

	const t = await new HDRLoader().loadAsync( BASE + path );
	t.mapping = THREE.EquirectangularReflectionMapping;
	return t;

}

/**
 * 加载一个 Poly Haven 模型。
 * 返回 { scene, parts }：parts[节点名] = [{ geometry, material }]，几何体位于节点本地空间
 * （忽略 glTF 里为了展示而摆开的节点位置），可直接用于实例化。
 */
export async function loadModel( id ) {

	const gltf = await gltfLoader.loadAsync( `${BASE}models/${id}/${id}.gltf` );
	const converted = new Map();
	const parts = {};

	const convert = ( src ) => {

		if ( converted.has( src ) ) return converted.get( src );
		const m = toNodeMaterial( src );
		if ( /glass/i.test( src.name ) ) {

			// 玻璃：脏污、半透明，废弃建筑里大部分窗户都是暗的
			m.transparent = true;
			m.opacity = 0.55;
			m.color = new THREE.Color( 0x1a2022 );
			m.roughness = 0.15;
			m.metalness = 0;
			m.depthWrite = false;
			converted.set( src, m );
			return m;

		}

		// glTF 内漫反射为 JPG，镂空材质需要外挂独立的 Alpha 贴图
		if ( src.alphaTest > 0 || src.transparent ) {

			const suffix = src.name.startsWith( id + '_' ) ? src.name.slice( id.length + 1 ) + '_' : '';
			m.alphaMap = loadTexture( `models/${id}/textures/${id}_${suffix}alpha_1k.jpg` );
			m.alphaMap.wrapS = m.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
			m.alphaMap.repeat.set( 1, 1 );
			m.alphaTest = 0.5;
			m.transparent = false;
			m.side = THREE.DoubleSide;

		}

		converted.set( src, m );
		return m;

	};

	gltf.scene.traverse( ( o ) => {

		if ( ! o.isMesh ) return;
		o.material = convert( o.material );
		o.castShadow = o.receiveShadow = true;
		// 找到所属的「模块节点」（场景根下的直接子节点）
		let node = o;
		while ( node.parent && node.parent !== gltf.scene ) node = node.parent;
		const local = new THREE.Matrix4();
		if ( node !== o ) {

			o.updateWorldMatrix( true, false );
			node.updateWorldMatrix( true, false );
			local.copy( node.matrixWorld ).invert().multiply( o.matrixWorld );

		}

		( parts[ node.name ] ||= [] ).push( { geometry: o.geometry, material: o.material, local } );

	} );

	const offsets = {};
	for ( const c of gltf.scene.children ) offsets[ c.name ] = c.position.toArray();
	return { scene: gltf.scene, parts, offsets };

}

/**
 * 实例化放置器：收集每个模块的变换，最后一次性生成 InstancedMesh。
 */
export class InstanceBatch {

	constructor() {

		this.items = new Map(); // key -> { part, matrices: [], colors: [] }

	}

	add( parts, name, matrix, color = null, filter = null ) {

		const list = parts[ name ];
		if ( ! list ) throw new Error( `找不到模块：${name}` );
		list.forEach( ( part, i ) => {

			if ( filter && ! filter( part ) ) return;
			const key = `${name}#${i}#${part.material.uuid}`;
			if ( ! this.items.has( key ) ) this.items.set( key, { part, matrices: [], colors: [] } );
			const it = this.items.get( key );
			it.matrices.push( matrix.clone().multiply( part.local ) );
			it.colors.push( color );

		} );

	}

	build( { castShadow = true, receiveShadow = true } = {} ) {

		const group = new THREE.Group();
		for ( const { part, matrices, colors } of this.items.values() ) {

			const mesh = new THREE.InstancedMesh( part.geometry, part.material, matrices.length );
			matrices.forEach( ( m, i ) => mesh.setMatrixAt( i, m ) );
			if ( colors.some( Boolean ) ) colors.forEach( ( c, i ) => mesh.setColorAt( i, c || new THREE.Color( 1, 1, 1 ) ) );
			mesh.castShadow = castShadow;
			mesh.receiveShadow = receiveShadow;
			mesh.computeBoundingSphere();
			group.add( mesh );

		}

		return group;

	}

}

// 便捷：由位置/朝向/缩放生成矩阵
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function trs( x, y, z, ry = 0, s = 1, rx = 0, rz = 0 ) {

	_q.setFromEuler( _e.set( rx, ry, rz ) );
	return new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), _q, new THREE.Vector3( s, s, s ) );

}
