// 城市远景：落叶乔木（@dgreenheck/ez-tree 程序化生成 → 自定义 TSL 材质 → 实例化）
//   · 每种树生成一次几何体，按实例矩阵摆放（每种树 2 次绘制调用：枝干 + 叶片）
//   · 远景树使用简化参数（更少的枝级与分段、更大的叶片卡片）
//   · 叶片法线：以树冠中心为球心的「球面法线」与原始法线混合 → 树冠成团块受光，不会碎成纸片
//   · 叶片逆光透射 + 风摆
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, texture, uv, attribute, positionLocal, positionWorld,
	mx_noise_float, time, sin, transformNormalToView, normalize, max, dot, pow, cameraPosition, instanceColor, luminance,
} from 'three/tsl';
import { Tree } from '@dgreenheck/ez-tree';
import { loadTexture } from '../world/assets.js';
import { air } from './atmos.js';

export const treeLook = {
	leafA: uniform( new THREE.Color( 0.075, 0.115, 0.03 ) ),
	leafB: uniform( new THREE.Color( 0.16, 0.2, 0.06 ) ),
	bark: uniform( new THREE.Color( 0.16, 0.14, 0.12 ) ),
	wind: uniform( 0.12 ),
	translucency: uniform( 0.7 ),
};

// 预设基础参数（单位：ez-tree 内部单位，生成后整体缩放到米）
const VARIANTS = {
	// targetH：生成后统一缩放到的树高（米）
	ash: { preset: 'Ash Large', seed: 4127, leaves: { count: 14, size: 5.6 }, targetH: 16 },
	oak: { preset: 'Oak Large', seed: 2731, leaves: { count: 14, size: 5.4 }, targetH: 15 },
	aspen: { preset: 'Aspen Medium', seed: 911, leaves: { count: 16, size: 4.4, type: 'ash' }, targetH: 13 },
	bush: { preset: 'Bush 1', seed: 77, leaves: { count: 14, size: 3.4 }, targetH: 3.8 },
	// 远景简化版
	farA: { preset: 'Ash Large', seed: 5521, leaves: { count: 8, size: 9 }, targetH: 13, simple: true },
	farB: { preset: 'Oak Large', seed: 3301, leaves: { count: 8, size: 8.5 }, targetH: 12, simple: true },
};

function generate( v ) {

	const t = new Tree();
	t.loadPreset( v.preset );
	t.options.seed = v.seed;
	Object.assign( t.options.leaves, v.leaves );
	t.options.leaves.billboard = 'double';
	if ( v.simple ) {

		t.options.branch.sections = { 0: 6, 1: 4, 2: 3, 3: 2 };
		t.options.branch.segments = { 0: 5, 1: 3, 2: 3, 3: 3 };
		t.options.branch.children[ 2 ] = Math.max( 2, t.options.branch.children[ 2 ] - 1 );

	} else {

		t.options.branch.sections[ 0 ] = Math.min( t.options.branch.sections[ 0 ], 12 );
		t.options.branch.segments[ 0 ] = Math.min( t.options.branch.segments[ 0 ], 8 );

	}

	t.generate();
	const bg = t.branchesMesh.geometry, lg = t.leavesMesh.geometry;
	lg.computeBoundingBox();
	const k = v.targetH / lg.boundingBox.max.y;
	bg.scale( k, k, k );
	lg.scale( k, k, k );
	// 树冠中心与包围盒（用于球面法线、风摆权重）
	lg.computeBoundingBox();
	const bb = lg.boundingBox, c = bb.getCenter( new THREE.Vector3() ), sz = bb.getSize( new THREE.Vector3() );
	// 叶片：球面法线 + 每片叶子随机数（取叶片四边形第一个顶点位置哈希）
	const pos = lg.attributes.position, n = lg.attributes.normal;
	const sph = new Float32Array( pos.count * 3 ), rnd = new Float32Array( pos.count );
	const p = new THREE.Vector3(), d = new THREE.Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		p.fromBufferAttribute( pos, i );
		d.subVectors( p, c ).multiply( new THREE.Vector3( 1 / sz.x, 1.4 / sz.y, 1 / sz.z ) ).normalize();
		d.y += 0.35; d.normalize();
		const on = new THREE.Vector3().fromBufferAttribute( n, i );
		d.lerp( on, 0.25 ).normalize();
		sph.set( [ d.x, d.y, d.z ], i * 3 );
		const q = Math.floor( i / 4 ) * 4;
		rnd[ i ] = ( Math.sin( pos.getX( q ) * 12.9898 + pos.getZ( q ) * 78.233 + pos.getY( q ) * 37.7 ) * 43758.5453 ) % 1;

	}

	lg.setAttribute( 'sphNormal', new THREE.BufferAttribute( sph, 3 ) );
	lg.setAttribute( 'leafRnd', new THREE.BufferAttribute( rnd.map( Math.abs ), 1 ) );
	const leafMap = t.leavesMesh.material.map;
	return { bg, lg, leafMap, height: bb.max.y, crown: c, crownSize: sz, tris: t.triangleCount };

}

let _barkMat = null;
function barkMaterial() {

	if ( _barkMat ) return _barkMat;
	const id = 'bark_platanus';
	const d = loadTexture( `textures/${id}/${id}_diff_1k.jpg`, { srgb: true } );
	const nn = loadTexture( `textures/${id}/${id}_nor_gl_1k.jpg` );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0, normalMap: nn } );
	const q = uv().mul( vec2( 1, 3 ) );
	m.colorNode = vec3( treeLook.bark ).mul( luminance( texture( d, q ).rgb ).mul( 3.2 ) );
	m.normalMap.repeat.set( 1, 3 );
	_barkMat = m;
	return m;

}

function leafMaterial( leafMap, height ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.7, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false } );
	m.map = leafMap;
	const tx = texture( leafMap, uv() );
	const lr = attribute( 'leafRnd', 'float' );
	// 风：越高的叶片摆幅越大，阵风由世界坐标噪声驱动
	const hK = positionLocal.y.div( height ).clamp( 0, 1 );
	const wp = positionWorld;
	const gust = mx_noise_float( vec3( time.mul( 0.25 ), lr.mul( 3 ), 0.5 ) ).mul( 0.5 ).add( 0.6 );
	const sway = sin( time.mul( 1.7 ).add( lr.mul( 20 ) ) ).mul( 0.06 ).mul( hK ).mul( gust );
	m.positionNode = positionLocal.add( vec3( sway, sway.mul( 0.3 ), sway.mul( 0.7 ) ).mul( treeLook.wind.mul( 8 ) ) );
	void wp;
	// 叶色：贴图亮度细节 × 两种绿色随机混合；实例色调整整棵树色相
	const l = luminance( tx.rgb ).mul( 2.6 );
	const col = mix( vec3( treeLook.leafA ), vec3( treeLook.leafB ), smoothstep( 0.2, 0.9, lr ) ).mul( l.add( 0.25 ) );
	m.colorNode = vec4( col, tx.a );
	m.normalNode = transformNormalToView( attribute( 'sphNormal', 'vec3' ) ).normalize();
	// 逆光透射
	const viewDir = normalize( positionWorld.sub( cameraPosition ) );
	const back = pow( max( dot( viewDir, vec3( air.sunDir ).negate() ), 0 ), 4 ).add( 0.08 );
	m.emissiveNode = col.mul( vec3( 1.0, 0.95, 0.65 ) ).mul( back.mul( treeLook.translucency ) );
	// 树冠内部更暗（自遮蔽）
	const sphN = attribute( 'sphNormal', 'vec3' );
	m.aoNode = mix( float( 0.45 ), float( 1 ), smoothstep( - 0.3, 0.6, sphN.y ).mul( 0.5 ).add( hK.mul( 0.5 ) ) );
	void instanceColor; void Fn;
	return m;

}

/**
 * @param {Array<{type, x, y, z, s, ry}>} list 树的位置列表
 */
export function buildTrees( list ) {

	const group = new THREE.Group();
	const byType = {};
	for ( const t of list ) ( byType[ t.type ] ||= [] ).push( t );
	let tris = 0;
	const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
	const info = {};
	for ( const [ type, items ] of Object.entries( byType ) ) {

		const v = generate( VARIANTS[ type ] );
		info[ type ] = { height: v.height, tris: v.tris };
		const bark = new THREE.InstancedMesh( v.bg, barkMaterial(), items.length );
		const leaves = new THREE.InstancedMesh( v.lg, leafMaterial( v.leafMap, v.height ), items.length );
		const C = new THREE.Color();
		items.forEach( ( it, i ) => {

			Q.setFromEuler( E.set( ( it.tilt || 0 ), it.ry ?? i * 2.4, 0 ) );
			M4.compose( new THREE.Vector3( it.x, it.y ?? 0, it.z ), Q, new THREE.Vector3( it.s, it.s * ( it.sy || 1 ), it.s ) );
			bark.setMatrixAt( i, M4 );
			leaves.setMatrixAt( i, M4 );
			C.setHSL( 0.22 + ( ( i * 0.37 ) % 1 - 0.5 ) * 0.04, 0.5, 0.5 );

		} );
		bark.castShadow = leaves.castShadow = true;
		bark.receiveShadow = leaves.receiveShadow = true;
		bark.computeBoundingSphere(); leaves.computeBoundingSphere();
		group.add( bark, leaves );
		tris += v.tris * items.length;

	}

	group.userData = { tris, info };
	return group;

}
