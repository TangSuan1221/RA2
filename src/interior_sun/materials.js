// 室内阳光场景的材质（第 2 轮重写）
//  - 木地板：世界空间逐板拼装（每块板随机选贴图行、随机长度/端接缝、逐板色相/明度），彻底消除平铺感
//  - 通用旧木：防平铺 + 去饱和 + 积灰 + 倒角边缘磨损 + 墙根污垢
//  - 常春藤 / 草：MeshSSSNodeMaterial 透光（逆光时叶片发亮），实例色差 + 假 AO（实例属性）
import * as THREE from 'three/webgpu';
import {
	Fn, texture, uv, vec2, vec3, float, mix, smoothstep, positionWorld, normalWorld, normalLocal,
	mx_fractal_noise_float, mx_noise_float, normalMap, uniform, instanceIndex, hash, luminance,
	dFdx, dFdy, attribute, positionGeometry, max, min,
} from 'three/tsl';
import { loadTexture } from '../world/assets.js';

// 全局可调
export const look = {
	dust: uniform( 0.7 ), // 朝上表面灰尘量
	dustColor: uniform( new THREE.Color( 0x8a8072 ) ),
	woodSat: uniform( 0.78 ), // 木材整体饱和度（参考图木色偏灰褐，不是橙色）
};

const texCache = new Map();
function tex( path, srgb ) {

	const k = path + srgb;
	if ( ! texCache.has( k ) ) texCache.set( k, loadTexture( path, { srgb } ) );
	return texCache.get( k );

}

const desat = ( c, s ) => mix( vec3( luminance( c ) ), c, s );
const n01 = ( p ) => mx_noise_float( p ).mul( 0.5 ).add( 0.5 );
const f01 = ( p, o = 3 ) => mx_fractal_noise_float( p, o, 2, 0.5 ).mul( 0.5 ).add( 0.5 );

// 防平铺：同一贴图按两套偏移/镜像采样，用低频噪声混合
const antiTile = ( map, uvn, scale = 0.23 ) => {

	const n = n01( positionWorld.mul( scale ) );
	const a = texture( map, uvn );
	const b = texture( map, uvn.mul( vec2( - 1, 1 ) ).add( vec2( 0.37, 0.61 ) ) );
	return { col: mix( a, b, smoothstep( 0.4, 0.6, n ) ), n };

};

// 房间内的「离墙距离」污垢遮罩（墙角、墙根积灰发黑）——由场景设置房间范围
export const room = { x0: uniform( - 8 ), x1: uniform( 8 ), z0: uniform( - 12 ), z1: uniform( 4 ) };
const wallDist = () => {

	const p = positionWorld;
	return min( min( p.x.sub( room.x0 ), room.x1.sub( p.x ) ), min( p.z.sub( room.z0 ), room.z1.sub( p.z ) ) );

};

/**
 * 通用旧木 / PBR（Poly Haven diff / nor_gl / arm）
 * opt: tint, texMeters, dust, rough, res, vGrain, variation, sat, edgeWear, grime
 */
export function woodMaterial( id, opt = {} ) {

	const { tint = 0xffffff, texMeters = 2, dust = 1, res = '1k', rough = 1, vGrain = false, variation = 0.35, sat = 1, edgeWear = 0.0, grime = 0.5 } = opt;
	const p = `textures/${id}/${id}_`;
	const diff = tex( `${p}diff_${res}.jpg`, true );
	const nor = tex( `${p}nor_gl_${res}.jpg`, false );
	const arm = tex( `${p}arm_${res}.jpg`, false );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	m.userData.texMeters = texMeters;
	m.userData.vGrain = vGrain;
	const tintU = uniform( new THREE.Color( tint ) );
	m.userData.tint = tintU;

	const { col, n } = antiTile( diff, uv() );
	// 世界空间低频色差：木板深浅不一、受潮发黑
	const macro = f01( positionWorld.mul( 0.6 ) );
	let c = col.rgb.mul( tintU ).mul( mix( float( 1 - variation ), float( 1 + variation * 0.6 ), macro ) );
	c = desat( c, look.woodSat.mul( sat ) );
	// 墙根污垢：离地 0~0.5m 发暗（泥水、潮气）
	const lowDirt = smoothstep( 0.6, 0.0, positionWorld.y ).mul( f01( positionWorld.mul( 2.3 ) ).mul( 0.8 ).add( 0.3 ) ).mul( grime );
	c = c.mul( float( 1 ).sub( lowDirt.mul( 0.45 ) ) );
	// 倒角边缘磨损：倒角处的法线不再贴近坐标轴 → 露出浅色木芯
	if ( edgeWear > 0 ) {

		const an = normalLocal.abs();
		const edge = smoothstep( 0.97, 0.8, max( an.x, max( an.y, an.z ) ) );
		const wn = smoothstep( 0.45, 0.7, f01( positionWorld.mul( 7.0 ) ) );
		c = mix( c, desat( c.mul( 1.7 ).add( 0.03 ), 0.6 ), edge.mul( wn ).mul( edgeWear ) );

	}

	// 朝上表面积灰：提亮去饱和
	const up = smoothstep( 0.55, 0.95, normalWorld.y );
	const dn = f01( positionWorld.mul( 3.1 ) );
	const dustK = up.mul( look.dust ).mul( dust ).mul( smoothstep( 0.25, 0.8, dn ) ).mul( 0.6 );
	c = mix( c, vec3( look.dustColor ).mul( luminance( c ).mul( 1.3 ).add( 0.1 ) ), dustK );
	m.colorNode = c;
	m.normalNode = normalMap( texture( nor, uv() ), vec2( 1, 1 ) );
	const a = texture( arm, uv() );
	m.roughnessNode = a.g.mul( rough ).add( dustK.mul( 0.5 ) ).clamp( 0.35, 1 );
	m.aoNode = mix( float( 1 ), a.r, 0.8 );
	m.userData.noise = n;
	return m;

}

// 通用 PBR（混凝土、树皮等）
export function pbr( id, opt = {} ) {

	return woodMaterial( id, { variation: 0.25, grime: 0.3, ...opt } );

}

/**
 * 逐板木地板：wood_floor_worn（2k，13 行木板，行距 156.3px，首行偏移 70px）
 * 木纹沿 +Z，板宽 = 行高对应的世界尺寸。几何体 UV 需为 (z, x)/texMeters（boxUV grain:'z'）以匹配切线空间。
 */
export function plankFloor( opt = {} ) {

	const { texMeters = 2.4, tint = 0xffffff, sat = 0.8 } = opt;
	const id = 'wood_floor_worn', p = `textures/${id}/${id}_`;
	const diff = tex( `${p}diff_2k.jpg`, true ), nor = tex( `${p}nor_gl_2k.jpg`, false ), arm = tex( `${p}arm_2k.jpg`, false );
	const ROWS = 13, ROWH = 156.3 / 2048, ROW0 = 70 / 2048;
	const plankW = ROWH * texMeters;
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	m.userData.texMeters = texMeters;

	const P = positionWorld;
	const px = P.x.div( plankW ).add( 1000 );
	const pid = px.floor(), fx = px.fract();
	const h0 = hash( pid );
	// 端接缝：每块板随机长度 1.3~3.4m，相邻板错缝
	const L = mix( float( 1.3 ), float( 3.4 ), h0 );
	const pz = P.z.add( 500 ).add( hash( pid.add( 71 ) ).mul( L ) ).div( L );
	const seg = pz.floor(), fz = pz.fract();
	const bid = pid.mul( 131 ).add( seg );
	const hA = hash( bid ), hB = hash( bid.add( 17 ) ), hC = hash( bid.add( 33 ) ), hD = hash( bid.add( 59 ) );
	const row = hA.mul( ROWS ).floor();
	// 贴图坐标：v 随 x 增大（与几何 UV 的切线方向一致）
	const vImg = row.mul( ROWH ).add( ROW0 ).add( float( 1 ).sub( fx ).mul( ROWH ) );
	const tuv = vec2( P.z.div( texMeters ).add( hB.mul( 9 ) ), float( 1 ).sub( vImg ) );
	// 连续导数（避免板缝处 mip 跳变）
	const cont = vec2( P.z.div( texMeters ), P.x.div( texMeters ) );
	const gx = dFdx( cont ), gy = dFdy( cont );
	const s = ( t ) => texture( t, tuv ).grad( gx, gy );

	let c = s( diff ).rgb.mul( vec3( ...new THREE.Color( tint ).toArray() ) );
	// 逐板色差：明度 ±、偏灰/偏红褐
	c = c.mul( mix( float( 0.62 ), float( 1.18 ), hC ) );
	c = mix( c, c.mul( vec3( 1.08, 0.94, 0.8 ) ), smoothstep( 0.55, 1.0, hD ) );
	c = mix( c, vec3( luminance( c ) ).mul( vec3( 1.0, 0.97, 0.92 ) ), smoothstep( 0.6, 0.0, hD ).mul( 0.45 ) );
	c = desat( c, look.woodSat.mul( sat ) );
	// 端接缝暗线 + 侧缝补强
	const endSeam = smoothstep( 0.006, 0.0, fz.mul( L ) ).max( smoothstep( L.sub( 0.006 ), L, fz.mul( L ) ) );
	const sideSeam = smoothstep( 0.012, 0.0, fx.mul( plankW ) ).max( smoothstep( plankW - 0.006, plankW, fx.mul( plankW ) ) );
	c = c.mul( float( 1 ).sub( endSeam.max( sideSeam ).mul( 0.7 ) ) );
	// 大面积世界空间深浅（受潮/日晒）
	const macro = f01( P.mul( 0.35 ), 4 );
	c = c.mul( mix( float( 0.72 ), float( 1.12 ), macro ) );
	// 墙角/墙根污垢：离墙 0~0.9m 渐暗、去饱和
	const wd = wallDist();
	const corner = smoothstep( 0.9, 0.0, wd ).mul( f01( P.mul( 1.7 ) ).mul( 0.6 ).add( 0.5 ) );
	c = mix( c, desat( c, 0.4 ).mul( 0.5 ), corner.clamp( 0, 1 ).mul( 0.8 ) );
	// 积灰：世界噪声 × (离走道远) → 粗糙度 0.9、去饱和、提亮
	const traffic = smoothstep( 1.6, 0.4, P.x.sub( 1.2 ).abs().mul( 0.6 ).add( P.z.add( 3 ).abs().mul( 0.15 ) ) );
	const dn = f01( P.mul( 1.2 ), 4 ).mul( 0.7 ).add( n01( P.mul( 9 ) ).mul( 0.3 ) );
	const dustK = smoothstep( 0.35, 0.75, dn ).mul( float( 1 ).sub( traffic.mul( 0.7 ) ) ).add( corner.mul( 0.5 ) ).clamp( 0, 1 ).mul( look.dust );
	c = mix( c, vec3( look.dustColor ).mul( luminance( c ).mul( 1.1 ).add( 0.08 ) ), dustK.mul( 0.6 ) );
	m.colorNode = c;
	const n = s( nor );
	m.normalNode = normalMap( n, vec2( 1, 1 ) );
	const a = s( arm );
	m.roughnessNode = mix( a.g.mul( 0.9 ), float( 0.92 ), dustK ).clamp( 0.4, 1 );
	m.aoNode = mix( float( 1 ), a.r, 0.9 ).mul( float( 1 ).sub( endSeam.max( sideSeam ).mul( 0.5 ) ) );
	return m;

}

/**
 * 叶片（常春藤/树冠）：透光 SSS，实例属性 aLeaf = (色相随机, 假 AO, 老叶程度)
 */
export function leafMaterial( base = 0x2f4a12, { sss = 1 } = {} ) {

	const m = new THREE.MeshSSSNodeMaterial( { side: THREE.DoubleSide, roughness: 0.6, metalness: 0 } );
	const b = uniform( new THREE.Color( base ) );
	const info = attribute( 'aLeaf', 'vec3' );
	const h = info.x, ao = info.y, age = info.z;
	const u = uv();
	// 叶脉：主脉 + 两条侧脉；边缘略暗
	const vein = smoothstep( 0.035, 0.0, u.x.sub( 0.5 ).abs() ).mul( smoothstep( 1.0, 0.2, u.y ) ).mul( 0.35 );
	const edge = smoothstep( 0.25, 0.55, u.sub( vec2( 0.5, 0.45 ) ).length() ).mul( 0.3 );
	let c = vec3( b ).mul( mix( float( 0.6 ), float( 1.3 ), h ) );
	// 色相偏移：嫩叶偏黄绿，老叶深绿/偏棕
	c = mix( c, c.mul( vec3( 1.25, 1.15, 0.55 ) ), smoothstep( 0.6, 1.0, h ).mul( 0.6 ) );
	c = mix( c, vec3( 0.2, 0.17, 0.07 ), smoothstep( 0.7, 1.0, age ).mul( 0.75 ) );
	c = c.mul( float( 1 ).add( vein ).sub( edge ) ).mul( ao );
	m.colorNode = c;
	m.roughnessNode = mix( float( 0.42 ), float( 0.8 ), age );
	// 透光：逆光时叶片发亮（阴影已包含在光源颜色里）
	m.thicknessColorNode = c.mul( vec3( 1.1, 1.25, 0.45 ) ).mul( 1.6 * sss );
	m.thicknessDistortionNode = float( 0.25 );
	m.thicknessAmbientNode = float( 0.0 );
	m.thicknessAttenuationNode = float( 0.9 );
	m.thicknessPowerNode = float( 3.0 );
	m.thicknessScaleNode = float( 3.0 );
	return m;

}

/**
 * 草叶：实例属性 aGrass = (色相随机, 假 AO, 枯黄程度)，根部暗、叶尖亮，透光
 */
export function grassMaterial( base = 0x5d7a2a ) {

	const m = new THREE.MeshSSSNodeMaterial( { side: THREE.DoubleSide, roughness: 0.7, metalness: 0 } );
	const info = attribute( 'aGrass', 'vec3' );
	const t = positionGeometry.y; // 0 根 → 1 尖
	let c = vec3( ...new THREE.Color( base ).toArray() ).mul( mix( float( 0.65 ), float( 1.25 ), info.x ) );
	c = mix( c, vec3( 0.42, 0.38, 0.17 ), info.z ); // 枯草
	c = c.mul( mix( float( 0.22 ), float( 1.0 ), smoothstep( 0.0, 0.7, t ) ) ).mul( info.y );
	m.colorNode = c;
	m.thicknessColorNode = c.mul( vec3( 1.0, 1.2, 0.5 ) ).mul( 1.2 );
	m.thicknessDistortionNode = float( 0.3 );
	m.thicknessAttenuationNode = float( 0.8 );
	m.thicknessPowerNode = float( 2.5 );
	m.thicknessScaleNode = float( 2.5 );
	return m;

}

export { tex, desat, n01, f01 };

