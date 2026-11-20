// 黑暗积水室内：材质库（TSL）
// 全部使用世界空间 UV（几何体 UV 以米为单位），多张贴图按大尺度噪声混合，避免平铺重复
import * as THREE from 'three/webgpu';
import {
	Fn, texture, uv, vec2, vec3, float, mix, smoothstep, positionWorld, positionView, mx_fractal_noise_float, mx_noise_float,
	luminance, normalMap, materialColor, materialRoughness, materialMetalness, clamp, uniform, max, min, abs, fract, normalWorldGeometry, cross, dot,
	normalView, faceDirection, sin, mx_worley_noise_float, pow,
} from 'three/tsl';

const BASE = '/assets/';
const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex( path, srgb = false ) {

	const key = path + srgb;
	if ( cache.has( key ) ) return cache.get( key );
	const t = loader.load( BASE + path );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 16; // 掠射角下的墙面/地面必须各向异性过滤，避免糊与摩尔纹
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	if ( srgb ) t.colorSpace = THREE.SRGBColorSpace;
	cache.set( key, t );
	return t;

}

// Poly Haven 贴图组
export function texSet( id, res = '1k' ) {

	return {
		diff: tex( `textures/${id}/${id}_diff_${res}.jpg`, true ),
		nor: tex( `textures/${id}/${id}_nor_gl_${res}.jpg` ),
		arm: tex( `textures/${id}/${id}_arm_${res}.jpg` ),
	};

}

// 水面高度（米）—— 没过小腿
export const WATER_Y = 0.36;

// 场景级可调参数
export const look = {
	wallDark: uniform( 0.5 ),
	stainColor: uniform( new THREE.Color( 0x2c2a1f ) ),
	mold: uniform( new THREE.Color( 0x1a2214 ) ),
};

// 去饱和
export const desat = ( c, k ) => mix( vec3( luminance( c ) ), c, k );
// 十六进制颜色 → vec3 常量（逐分量，避免 Color 对象的转换歧义）
export const col3 = ( hex ) => { const c = new THREE.Color( hex ); return vec3( c.r, c.g, c.b ); };
const n01 = ( p, o = 3 ) => mx_fractal_noise_float( p, o, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

/**
 * 由任意 TSL 高度场（单位：米）求屏幕空间导数扰动法线（Mikkelsen 无参数化凹凸）。
 * 未归一化的位置导数 → 高度以真实米为单位，剥落边缘的台阶有正确的明暗。
 */
export const heightBump = Fn( ( [ h, nV ] ) => {

	const sX = positionView.dFdx(), sY = positionView.dFdy();
	const R1 = cross( sY, nV ), R2 = cross( nV, sX );
	const det = dot( sX, R1 ).mul( faceDirection );
	const dHx = h.dFdx(), dHy = h.dFdy();
	const grad = det.sign().mul( R1.mul( dHx ).add( R2.mul( dHy ) ) );
	return det.abs().mul( nV ).sub( grad ).normalize();

} );

/**
 * 三层墙面：旧油漆（壁纸纹理）→ 剥落处露出灰泥 → 灰泥掉块处露出红砖（带台阶凹凸）
 * + 水位线以上 40cm 的吸水带（压暗、粗糙度降低、霉斑）+ 自天花板向下的水渍流痕 + 顶角霉变
 * @param {object} o tint: 漆色；tile: 贴图周期（米）；seed: 噪声偏移；peel: 剥落程度 0~1
 */
export function wallMaterial( { tint = 0x7d8a84, tile = 2.4, seed = 0, peel = 0.5 } = {} ) {

	const A = texSet( 'painted_plaster_wall', '2k' ); // 真实刷漆灰泥（2k，约 2m 一次重复）
	const B = texSet( 'damaged_plaster' );
	const C = texSet( 'worn_mossy_plasterwall' );
	const K = texSet( 'red_brick_03' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );

	const p = positionWorld.add( vec3( seed * 13.1, 0, seed * 7.7 ) );
	const u = uv();
	const uvA = u.div( tile );
	const uvB = u.div( tile * 1.37 ).add( vec2( 0.31, 0.17 ) );
	const uvC = u.div( tile * 1.6 ).add( vec2( 0.73, 0.41 ) );
	const uvK = u.div( 1.6 ).add( vec2( 0.13, 0.0 ) );

	// 剥落遮罩：中尺度斑块（20~60cm）+ 高频碎边；水位线附近与顶部更容易剥落
	const big = n01( p.mul( 0.9 ), 4 );
	const fine = n01( p.mul( 7.0 ), 3 );
	const moistBoost = smoothstep( WATER_Y + 1.2, WATER_Y + 0.1, p.y ).mul( 0.12 ).add( smoothstep( 2.6, 3.3, p.y ).mul( 0.08 ) );
	const pv = big.add( fine.sub( 0.5 ).mul( 0.16 ) ).add( moistBoost );
	const t0 = float( 0.69 - peel * 0.14 );
	const paint = smoothstep( t0.add( 0.012 ), t0, pv ); // 1 = 漆面完好
	// 灰泥层也掉块（在剥落区中心更深处露出砖）
	const plaster = smoothstep( t0.add( 0.11 ), t0.add( 0.085 ), pv ); // 1 = 有灰泥

	const ta = texture( A.diff, uvA ).rgb;
	const tc = texture( C.diff, uvC ).rgb;
	const tb = texture( B.diff, uvB ).rgb;
	const tk = texture( K.diff, uvK ).rgb;

	const mid = n01( p.mul( 1.7 ), 3 );
	// 漆面：两张贴图取亮度细节，乘美术指定漆色
	const detail = mix( luminance( ta ).mul( 1.0 ), luminance( tc ).mul( 1.5 ), smoothstep( 0.45, 0.8, mid ).mul( 0.6 ) );
	const paintCol = col3( tint ).mul( detail ).mul( mix( 0.8, 1.1, big ) );
	// 灰泥：偏暖的浅灰；剥落边缘有一圈翘起的漆皮（略亮）
	const plasterCol = desat( tb, 0.35 ).mul( vec3( 0.95, 0.9, 0.82 ) ).mul( 0.6 );
	const brickCol = desat( tk, 0.55 ).mul( 0.55 );
	let col = mix( brickCol, plasterCol, plaster );
	col = mix( col, paintCol, paint );
	const lip = smoothstep( t0.sub( 0.02 ), t0, pv ).mul( paint ); // 漆皮翘边
	col = col.mul( float( 1 ).add( lip.mul( 0.25 ) ) );

	// 自天花板向下的水渍流痕：竖向拉伸噪声，顶部浓、向下逐渐消失
	const hz = p.x.add( p.z );
	const sn = n01( vec3( hz.mul( 5.0 ), p.y.mul( 0.25 ), 0.5 ), 3 );
	const streak = smoothstep( 0.55, 0.8, sn ).mul( smoothstep( 0.6, 3.2, p.y ) );
	col = col.mul( float( 1 ).sub( streak.mul( 0.55 ) ) ).mul( mix( vec3( 1 ), vec3( 0.85, 0.8, 0.65 ), streak ) );

	// 水位线以上 40cm 吸水带：压暗 ×0.5，顶端潮线
	const wick = float( WATER_Y + 0.4 ).add( mx_noise_float( vec3( hz.mul( 1.1 ), 0, 0 ) ).mul( 0.12 ) );
	const wet = smoothstep( wick, wick.sub( 0.12 ), p.y );
	const tide = smoothstep( 0.035, 0.0, abs( p.y.sub( wick ).add( 0.02 ) ) );
	col = col.mul( mix( float( 1 ), float( 0.5 ), wet ) ).mul( float( 1 ).sub( tide.mul( 0.35 ) ) );

	// 霉斑：吸水带内与顶角，绿黑色团块（Worley 斑点 + fbm 边缘）
	const wor = mx_worley_noise_float( vec3( hz.mul( 3.0 ), p.y.mul( 3.0 ), 0.0 ) );
	const moldZone = wet.add( smoothstep( 2.7, 3.35, p.y ).mul( 0.8 ) ).add( streak.mul( 0.3 ) ).clamp();
	const mold = smoothstep( 0.42, 0.18, wor.add( fine.sub( 0.5 ).mul( 0.3 ) ) ).mul( moldZone ).mul( smoothstep( 0.35, 0.6, mid ) );
	col = mix( col, vec3( look.mold ).mul( luminance( tb ).mul( 2.0 ) ), mold.mul( 0.85 ) );

	// 水线处的藻膜/苔藓带（紧贴水面 0~12cm，向上渐隐，边缘破碎）
	const algae = smoothstep( WATER_Y + 0.16, WATER_Y + 0.01, p.y.add( fine.sub( 0.5 ).mul( 0.1 ) ) );
	col = mix( col, vec3( 0.018, 0.024, 0.012 ).mul( luminance( tc ).mul( 3.0 ) ), algae.mul( 0.85 ) );
	// 墙根与顶角的积尘/烟熏
	col = col.mul( float( 1 ).sub( smoothstep( 2.7, 3.4, p.y ).mul( 0.35 ) ) );
	m.colorNode = col.mul( look.wallDark );

	const armP = texture( A.arm, uvA );
	const armK = texture( K.arm, uvK );
	m.aoNode = mix( armK.r.mul( 0.8 ), armP.r, plaster );
	m.roughnessNode = clamp( mix( mix( armK.g, armP.g.mul( 0.8 ).add( 0.15 ), plaster ), float( 0.4 ), wet.add( mold.mul( 0.3 ) ).clamp() ), 0.25, 1 );

	// 法线：贴图法线 + 剥落台阶高度（漆 3mm、灰泥 14mm）
	const nTex = mix( texture( K.nor, uvK ).rgb, mix( texture( B.nor, uvB ).rgb, mix( texture( A.nor, uvA ).rgb, texture( C.nor, uvC ).rgb, smoothstep( 0.45, 0.8, mid ).mul( 0.5 ) ), paint ), plaster );
	const height = paint.mul( 0.003 ).add( plaster.mul( 0.014 ) ).add( lip.mul( 0.0015 ) );
	m.normalNode = heightBump( height, normalMap( nTex, vec2( 1.1, 1.1 ) ) );
	return m;

}

// 木材（护墙木板、门框、柱子包木）：剥落油漆的木纹，偏暖棕
export function woodMaterial( { tint = 0x6a4a30, tile = 1.2, seed = 0 } = {} ) {

	const W = texSet( 'wood_peeling_paint_weathered' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld.add( vec3( seed * 5.3, 0, seed * 3.1 ) );
	const uvW = uv().div( tile );
	const t = texture( W.diff, uvW ).rgb;
	const n = n01( p.mul( 0.8 ), 3 );
	const woodMask = smoothstep( 0.18, 0.32, t.r.sub( t.b ) );
	const paint = vec3( 0.12, 0.13, 0.12 ).mul( luminance( t ).mul( 3.0 ) );
	const wood = col3( tint ).mul( luminance( t ).mul( 2.6 ) );
	let col = mix( paint, wood, woodMask.max( smoothstep( 0.4, 0.7, n ) ) );
	const wet = smoothstep( WATER_Y + 0.4, WATER_Y, p.y );
	col = col.mul( mix( 1.0, 0.45, wet ) );
	m.colorNode = col;
	const arm = texture( W.arm, uvW );
	m.aoNode = arm.r;
	m.roughnessNode = mix( arm.g, float( 0.4 ), wet );
	m.normalNode = normalMap( texture( W.nor, uvW ).rgb );
	return m;

}

// 天花板：石膏吊顶纹理 + 水渍晕圈 + 霉斑
export function ceilingMaterial() {

	const B = texSet( 'damaged_plaster' );
	const T = texSet( 'ceiling_interior' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const uvA = uv().div( 2.0 );
	const n = n01( p.mul( 0.5 ), 4 );
	const ring = fract( n.mul( 6.0 ) ); // 水渍晕圈
	let col = vec3( 0.2, 0.2, 0.185 ).mul( luminance( texture( T.diff, uvA ).rgb ).mul( 3.0 ) );
	col = col.mul( mix( 1.0, 0.3, smoothstep( 0.5, 0.75, n ) ) );
	col = col.mul( float( 1 ).sub( smoothstep( 0.9, 1.0, ring ).mul( smoothstep( 0.45, 0.6, n ) ).mul( 0.4 ) ) );
	m.colorNode = col;
	m.normalNode = normalMap( texture( B.nor, uvA ).rgb );
	return m;

}

// 金属：深色锈蚀
export function metalMaterial( { color = 0x2a2723, rust = 0.5, side = THREE.FrontSide } = {} ) {

	const R = texSet( 'rusty_painted_metal' );
	const m = new THREE.MeshStandardNodeMaterial( { color, roughness: 0.6, metalness: 0.7, side } );
	const p = positionWorld;
	const n = n01( p.mul( 6.0 ), 3 );
	const r = smoothstep( 0.55 - rust * 0.2, 0.75, n );
	const tr = texture( R.diff, p.xz.add( p.y ).mul( 0.7 ) ).rgb;
	m.colorNode = mix( materialColor.rgb.mul( luminance( tr ).mul( 2.0 ).add( 0.5 ) ), vec3( 0.09, 0.055, 0.035 ).mul( luminance( tr ).mul( 3 ) ), r );
	m.metalnessNode = mix( float( 0.7 ), float( 0.1 ), r );
	m.roughnessNode = mix( float( 0.45 ), float( 0.95 ), r );
	return m;

}

// 黄铜/金属门框（被手电照到时会出一道暖金边）
export function brassMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { color: 0x5a4524, roughness: 0.45, metalness: 0.85 } );
	const n = n01( positionWorld.mul( 9.0 ), 3 );
	m.colorNode = mix( materialColor.rgb, vec3( 0.1, 0.085, 0.06 ), smoothstep( 0.5, 0.8, n ).mul( 0.8 ) );
	m.roughnessNode = mix( float( 0.3 ), float( 0.8 ), smoothstep( 0.45, 0.8, n ) );
	return m;

}

// 门板漆面：深灰绿的旧漆，边缘磨损露出底漆、下半截水渍
export function doorPaintMaterial() {

	const C = texSet( 'peeling_painted_wall' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.7, metalness: 0 } );
	const p = positionWorld;
	const uvD = uv().div( 1.3 );
	const t = texture( C.diff, uvD ).rgb;
	const n = n01( p.mul( 3.0 ), 3 );
	let col = vec3( 0.07, 0.085, 0.078 ).mul( luminance( t ).mul( 2.6 ) );
	// 磨损露出底漆：细碎斑点（随贴图明暗），只在边缘与高频噪声处
	const wear = smoothstep( 0.66, 0.72, n01( p.mul( 11.0 ), 3 ).add( n.sub( 0.5 ).mul( 0.2 ) ) );
	col = mix( col, vec3( 0.075, 0.062, 0.05 ).mul( luminance( t ).mul( 2.4 ) ), wear );
	const wet = smoothstep( WATER_Y + 0.5, WATER_Y, p.y );
	col = col.mul( mix( float( 1 ), float( 0.5 ), wet ) );
	const sn = n01( vec3( p.x.mul( 9 ), p.y.mul( 0.4 ), 0 ), 2 );
	col = col.mul( float( 1 ).sub( smoothstep( 0.55, 0.8, sn ).mul( 0.4 ) ) );
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.55 ), float( 0.85 ), n ).mul( mix( float( 1 ), float( 0.6 ), wet ) );
	m.normalNode = normalMap( texture( C.nor, uvD ).rgb, vec2( 0.6 ) );
	return m;

}

/**
 * 夹丝磨砂玻璃：门后暖光透过磨砂层的漫射辉光 + 菱形铁丝网 + 污渍
 * glow：暖光亮度（线性，保持在 bloom 阈值以下）
 */
export function wiredGlassMaterial( { glow = 0.5, color = 0xffa860, uniformGlow = false } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.25, metalness: 0 } );
	const p = positionWorld;
	const hz = p.x.add( p.z ); // 墙面水平坐标（适用于沿 x 或 z 的墙）
	// 铁丝网改为 5cm 方格、用 fwidth 做抗锯齿，且只在暖光门玻璃上使用（冷光大玻璃无丝）
	const q = vec2( hz, p.y ).mul( 1 / 0.05 );
	const g = abs( fract( q ).sub( 0.5 ) );
	const aa = q.fwidth().max( 0.0001 );
	const wire = uniformGlow ? float( 0 ) : smoothstep( float( 0.5 ).sub( aa.x.mul( 1.5 ) ).sub( 0.03 ), 0.5, max( g.x, g.y ) ).mul( smoothstep( 0.6, 0.25, aa.x ) );
	const streakG = n01( vec3( hz.mul( 18.0 ), p.y.mul( 0.6 ), 2.0 ), 3 ); // 竖向水痕
	const dirt = n01( p.mul( 2.5 ), 4 ).mul( 0.6 ).add( n01( p.mul( 14 ), 2 ).mul( 0.2 ) ).add( smoothstep( 0.55, 0.85, streakG ).mul( 0.3 ) )
		.add( smoothstep( 1.0, 0.4, p.y ).mul( 0.35 ) ); // 下半截泥水溅痕
	// 光从下方门缝和上方吊灯照进来：越靠下越亮的竖向梯度 + 污渍遮挡
	const grad = uniformGlow ? smoothstep( 2.9, 1.2, p.y ).mul( 0.35 ).add( 0.65 ) : smoothstep( 2.1, 0.9, p.y ).mul( 0.6 ).add( 0.4 );
	const cc = new THREE.Color( color );
	const g0 = vec3( cc.r * glow, cc.g * glow, cc.b * glow ).mul( grad ).mul( smoothstep( 0.75, 0.35, dirt ).mul( 0.75 ).add( 0.25 ) );
	m.colorNode = vec3( 0.05, 0.05, 0.045 );
	m.emissiveNode = g0.mul( float( 1 ).sub( wire.mul( 0.85 ) ) );
	m.roughnessNode = mix( float( 0.12 ), float( 0.7 ), dirt );
	return m;

}

/**
 * glTF 道具的「泡水 + 年久」处理（weathering.js 的思路，本地化）：
 * 去饱和压暗 + 污垢斑驳 + 朝上面积灰 + 金属锈斑 + 水位线以上的吸水深色带（×0.45、粗糙度降低）
 */
const _wetted = new WeakSet();
export function weatherProp( mat, { dark = 0.6, sat = 0.6, dust = 0.5, rust = 0.0 } = {} ) {

	if ( _wetted.has( mat ) ) return mat;
	_wetted.add( mat );
	const p = positionWorld;
	const y = p.y;
	const n = n01( p.mul( 2.5 ), 3 );
	const n2 = n01( p.mul( 11.0 ), 2 );
	let base = desat( materialColor.rgb, sat ).mul( dark ).mul( mix( 0.7, 1.1, n ) );
	// 污垢：低频斑驳偏褐
	base = mix( base, base.mul( vec3( 0.55, 0.5, 0.42 ) ), smoothstep( 0.5, 0.75, n2.mul( 0.5 ).add( n.mul( 0.5 ) ) ) );
	// 积灰：朝上的表面，灰绿色细尘
	const up = smoothstep( 0.6, 0.95, normalWorldGeometry.y );
	base = mix( base, vec3( 0.045, 0.048, 0.04 ), up.mul( dust ).mul( smoothstep( 0.3, 0.7, n2 ) ) );
	// 锈斑（金属）
	if ( rust > 0 ) base = mix( base, vec3( 0.075, 0.04, 0.022 ).mul( n2.add( 0.5 ) ), smoothstep( 0.62 - rust * 0.25, 0.8, n ).mul( materialMetalness.add( 0.3 ).clamp() ) );
	// 吸水带：水面以上 0~30cm 深色、略亮
	const wick = float( WATER_Y + 0.3 ).add( n.sub( 0.5 ).mul( 0.12 ) );
	const wet = smoothstep( wick, WATER_Y + 0.02, y );
	mat.colorNode = base.mul( mix( float( 1 ), float( 0.45 ), wet ) );
	mat.roughnessNode = mix( materialRoughness.max( 0.55 ), float( 0.3 ), wet );
	return mat;

}
export const wetProp = weatherProp;

// 盒子几何体：各面 UV 按世界尺寸（米）展开，配合材质里的 tile 参数
export function boxUV( x0, y0, z0, x1, y1, z1 ) {

	const g = new THREE.BoxGeometry( x1 - x0, y1 - y0, z1 - z0 );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	const pos = g.attributes.position, nor = g.attributes.normal, uvs = g.attributes.uv;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		const ax = Math.abs( nor.getX( i ) ), ay = Math.abs( nor.getY( i ) );
		if ( ay > 0.5 ) uvs.setXY( i, x, - z );
		else if ( ax > 0.5 ) uvs.setXY( i, z, y );
		else uvs.setXY( i, x, y );

	}

	return g;

}

export { min, max, sin, pow };
