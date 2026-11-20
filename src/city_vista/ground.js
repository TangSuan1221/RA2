// 城市远景：地面（公园草地/泥地/小径/道路）与前景高台
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, max, texture, normalMap, uv,
	positionWorld, mx_fractal_noise_float, luminance, cameraPosition, length,
} from 'three/tsl';
import { loadTexture } from '../world/assets.js';
import { MASK, fieldAt, ledgeEdge } from './layout.js';
import { fbm2, rng } from './util.js';

const tex = ( id, res, name, srgb = false ) => loadTexture( `textures/${id}/${id}_${name}_${res}.jpg`, { srgb } );
const n01 = ( p, oct = 3 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

export const groundLook = {
	grassDark: uniform( new THREE.Color( 0.012, 0.022, 0.004 ) ), // 草根部/茂密区（线性）
	grassMid: uniform( new THREE.Color( 0.035, 0.055, 0.012 ) ),
	grassDry: uniform( new THREE.Color( 0.08, 0.075, 0.03 ) ),
	dirt: uniform( new THREE.Color( 0.09, 0.07, 0.045 ) ),
	concrete: uniform( new THREE.Color( 0.19, 0.185, 0.17 ) ),
	asphalt: uniform( new THREE.Color( 0.11, 0.11, 0.105 ) ),
};

// 地面起伏（米）：小径、道路处压平
export function terrainH( x, z ) {

	const f = fieldAt( x, z );
	const h = ( fbm2( x * 0.025, z * 0.025, 3 ) - 0.5 ) * 1.4 + ( fbm2( x * 0.15, z * 0.15, 2 ) - 0.5 ) * 0.18;
	return h * ( 1 - f.path * 0.8 ) * ( 1 - f.road );

}

// 防平铺采样：两种尺度 + 旋转偏移，按低频噪声混合
function antiTile( t, p, s1, s2 ) {

	const a = texture( t, p.mul( s1 ) );
	const b = texture( t, vec2( p.y.negate(), p.x ).mul( s2 ).add( 0.37 ) );
	const k = smoothstep( 0.35, 0.65, n01( vec3( p.mul( 0.04 ), 2.3 ), 2 ) );
	return mix( a, b, k );

}

export function buildGround( maskTex ) {

	const W = MASK.x1 - MASK.x0, D = MASK.z1 - MASK.z0;
	const g = new THREE.PlaneGeometry( W, D, 220, 170 );
	g.rotateX( - Math.PI / 2 );
	g.translate( ( MASK.x0 + MASK.x1 ) / 2, 0, ( MASK.z0 + MASK.z1 ) / 2 );
	const pos = g.attributes.position;
	for ( let i = 0; i < pos.count; i ++ ) pos.setY( i, terrainH( pos.getX( i ), pos.getZ( i ) ) );
	g.computeVertexNormals();

	const grassD = tex( 'leafy_grass', '1k', 'diff', true ), grassN = tex( 'leafy_grass', '1k', 'nor_gl' );
	const mudD = tex( 'brown_mud_leaves_01', '1k', 'diff', true ), mudN = tex( 'brown_mud_leaves_01', '1k', 'nor_gl' );
	const conD = tex( 'cracked_concrete', '2k', 'diff', true ), conN = tex( 'cracked_concrete', '2k', 'nor_gl' );
	const asD = tex( 'asphalt_02', '2k', 'diff', true ), asN = tex( 'asphalt_02', '2k', 'nor_gl' );

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.92, metalness: 0 } );
	const p = positionWorld.xz;
	const muv = vec2( p.x.sub( MASK.x0 ).div( W ), p.y.sub( MASK.z0 ).div( D ) );
	const mk = texture( maskTex, muv );
	const path = mk.r, dirt = mk.g, lush = mk.b, road = mk.a;

	const gT = antiTile( grassD, p, 0.45, 0.17 );
	const mT = antiTile( mudD, p, 0.35, 0.13 );
	const cT = antiTile( conD, p, 0.25, 0.11 );
	const aT = antiTile( asD, p, 0.12, 0.05 );
	// 草：亮度细节 × 美术色，按茂密度/大尺度噪声在深绿与枯黄之间变化
	const dryN = n01( vec3( p.mul( 0.018 ), 4.1 ), 3 );
	const gl = luminance( gT.rgb ).mul( 3.4 );
	const gCol = mix( mix( vec3( groundLook.grassMid ), vec3( groundLook.grassDry ), smoothstep( 0.45, 0.75, dryN ) ), vec3( groundLook.grassDark ), lush.mul( 0.55 ) ).mul( gl );
	const mCol = vec3( groundLook.dirt ).mul( luminance( mT.rgb ).mul( 8.5 ) );
	const cCol = vec3( groundLook.concrete ).mul( luminance( cT.rgb ).mul( 5.5 ) );
	const aCol = vec3( groundLook.asphalt ).mul( luminance( aT.rgb ).mul( 7 ) );
	// 小径裂缝里长草：混凝土上叠一层噪声草斑
	const crackGrass = smoothstep( 0.55, 0.75, n01( vec3( p.mul( 0.6 ), 9.1 ), 3 ) );
	// 茂密草丛下的地面几乎被遮住：整体压暗，让草叶本身的颜色主导
	let col = mix( gCol.mul( mix( float( 1 ), float( 0.55 ), lush ) ), mCol, dirt );
	col = mix( col, mix( cCol, gCol.mul( 0.9 ), crackGrass.mul( 0.7 ) ), path );
	col = mix( col, mix( aCol, gCol, crackGrass.mul( 0.5 ) ), road );
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.95 ), float( 0.8 ), path.max( road ) );
	const nG = mix( gT, mT, dirt );
	const nP = mix( nG, cT, path );
	m.normalNode = normalMap( mix( mix( texture( grassN, p.mul( 0.45 ) ), texture( mudN, p.mul( 0.35 ) ), dirt ), texture( conN, p.mul( 0.25 ) ), path.max( road ) ), vec2( 0.8 ) );
	void nP;

	const mesh = new THREE.Mesh( g, m );
	mesh.receiveShadow = true;
	mesh.name = 'ground';
	return mesh;

}

// —— 前景高台：长满苔藓与地衣的混凝土/岩石平台（顶面 y = LEDGE_Y）——
export const LEDGE_Y = 4.6;

export function ledgeHeight( x, z ) {

	// 顶面：边缘略微下塌，表面起伏（裂开的混凝土块）
	const e = ledgeEdge( x );
	const toEdge = z - e;
	const slump = Math.max( 0, 1.2 - toEdge ) * 0.18;
	const bumps = ( fbm2( x * 0.6, z * 0.6, 3 ) - 0.5 ) * 0.22 + ( fbm2( x * 2.2, z * 2.2, 2 ) - 0.5 ) * 0.05;
	return LEDGE_Y - slump + bumps;

}

export function buildLedge() {

	const group = new THREE.Group();
	const X0 = - 40, X1 = 40, Z1 = 30;
	const NX = 200, NZ = 90;
	// 顶面网格：前缘按 ledgeEdge 弯曲
	const pos = [], uvs = [], idx = [];
	for ( let j = 0; j <= NZ; j ++ ) {

		const t = j / NZ;
		for ( let i = 0; i <= NX; i ++ ) {

			const x = X0 + ( X1 - X0 ) * i / NX;
			const e = ledgeEdge( x );
			const z = e + ( Z1 - e ) * Math.pow( t, 1.6 );
			pos.push( x, ledgeHeight( x, z ), z );
			uvs.push( x, z );

		}

	}

	for ( let j = 0; j < NZ; j ++ ) for ( let i = 0; i < NX; i ++ ) {

		const a = j * ( NX + 1 ) + i, b = a + 1, c = a + NX + 1, d = c + 1;
		idx.push( a, c, b, b, c, d );

	}

	// 前立面（向下到地面），带不规则破损轮廓
	const base = pos.length / 3;
	for ( let i = 0; i <= NX; i ++ ) {

		const x = X0 + ( X1 - X0 ) * i / NX;
		const e = ledgeEdge( x );
		const top = ledgeHeight( x, e );
		pos.push( x, top, e, x, - 0.5, e - 0.4 - fbm2( x * 0.3, 1 ) * 0.6 );
		uvs.push( x, top, x, - 0.5 );

	}

	for ( let i = 0; i < NX; i ++ ) {

		const a = base + i * 2, b = a + 2;
		idx.push( a, b, a + 1, b, b + 1, a + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();

	const cD = tex( 'concrete_moss', '2k', 'diff', true ), cN = tex( 'concrete_moss', '2k', 'nor_gl' ), cA = tex( 'concrete_moss', '2k', 'arm' );
	const rD = tex( 'cracked_concrete', '2k', 'diff', true ), rN = tex( 'cracked_concrete', '2k', 'nor_gl' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0 } );
	const p = positionWorld;
	const q = uv();
	const mossN = n01( vec3( p.x.mul( 0.35 ), p.z.mul( 0.35 ), 1.3 ), 4 );
	const moss = smoothstep( 0.22, 0.42, mossN.add( n01( p.mul( 2.5 ), 2 ).sub( 0.5 ).mul( 0.25 ) ) );
	const concrete = texture( rD, q.mul( 0.28 ) ).rgb;
	const mossT = texture( cD, q.mul( 0.22 ) ).rgb;
	// 地衣：灰白斑点
	const lichen = smoothstep( 0.68, 0.74, n01( p.mul( 3.1 ), 2 ) ).mul( 0.5 );
	const conCol = vec3( 0.11, 0.11, 0.105 ).mul( luminance( concrete ).mul( 3.6 ) ).mul( mix( float( 1 ), float( 1.35 ), lichen ) );
	const mossCol = mix( vec3( 0.022, 0.034, 0.01 ), vec3( 0.09, 0.12, 0.03 ), smoothstep( 0.35, 0.85, n01( p.mul( 0.9 ), 2 ) ) ).mul( luminance( mossT ).mul( 6.0 ) );
	// 背光/潮湿处偏暗的黑色水渍
	const stain = smoothstep( 0.55, 0.8, n01( vec3( p.x.mul( 0.8 ), p.z.mul( 0.8 ), 6.0 ), 3 ) ).mul( 0.35 );
	m.colorNode = mix( conCol, mossCol, moss ).mul( float( 1 ).sub( stain ) );
	m.roughnessNode = mix( texture( cA, q.mul( 0.22 ) ).g.mul( 1.1 ), float( 0.95 ), moss ).clamp( 0.4, 1 );
	m.normalNode = normalMap( mix( texture( rN, q.mul( 0.28 ) ), texture( cN, q.mul( 0.22 ) ), moss ), vec2( 1.3 ) );

	const mesh = new THREE.Mesh( g, m );
	mesh.receiveShadow = mesh.castShadow = true;
	mesh.name = 'ledge';
	group.add( mesh );

	// 散落的混凝土碎块（实例化，坐在高台表面）
	const r = rng( 91 );
	const rock = new THREE.IcosahedronGeometry( 1, 0 );
	const rp = rock.attributes.position;
	for ( let i = 0; i < rp.count; i ++ ) {

		const x = rp.getX( i ), y = rp.getY( i ), z = rp.getZ( i );
		const k = 0.8 + fbm2( x * 2 + 3, z * 2 + y ) * 0.5;
		rp.setXYZ( i, x * k, y * k * 0.55, z * k );

	}

	rock.computeVertexNormals();
	const NR = 26;
	const rocks = new THREE.InstancedMesh( rock, m, NR );
	const M4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler();
	for ( let i = 0; i < NR; i ++ ) {

		const x = r.range( - 14, 14 ), z = ledgeEdge( x ) + r.range( 0.4, 9 );
		const s = r.range( 0.06, 0.22 );
		q4.setFromEuler( e.set( r() * 0.4, r() * 6.28, r() * 0.4 ) );
		M4.compose( new THREE.Vector3( x, ledgeHeight( x, z ) + s * 0.15, z ), q4, new THREE.Vector3( s, s, s ) );
		rocks.setMatrixAt( i, M4 );

	}

	rocks.castShadow = rocks.receiveShadow = true;
	group.add( rocks );
	return group;

}

void Fn; void vec4; void clamp; void max; void cameraPosition; void length;
