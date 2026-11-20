// 苔藓小巷：材质库（TSL）
// 原则：所有大面积表面都由「贴图细节 × 美术指定色 × 世界空间遮罩」组合，避免塑料感与平铺重复
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, max, min, abs, uv, texture, normalMap,
	positionWorld, normalWorldGeometry, mx_fractal_noise_float, mx_noise_float, luminance, materialColor,
	instanceColor, normalView, sin, pow,
} from 'three/tsl';
import { loadTexture } from '../world/assets.js';
import { bumpFromHeight } from './util.js';

// 场景尺寸（与 geometry.js 共享）
export const L = {
	WALL_X: 2.0, // 右侧苔藓墙面 x
	WALL_H: 7.2,
	Z0: - 40, Z1: 8, // 巷子范围（-Z 为纵深方向）
	GH_X: - 2.3, // 左侧温室立面 x
	SOIL_X: 1.35, // 墙根土带起点
	SLAB_TOP: 0.12,
};

// 美术参数（uniform，可实时调节）
export const look = {
	mossDeep: uniform( new THREE.Color( 0.022, 0.034, 0.010 ) ),
	mossLight: uniform( new THREE.Color( 0.075, 0.095, 0.024 ) ),
	wallTint: uniform( new THREE.Color( 0.40, 0.425, 0.41 ) ),
	streak: uniform( 1.0 ),
	wet: uniform( 0.6 ),
	puddle: uniform( 0.8 ),
};

const tex = ( id, res, name, srgb = false ) => loadTexture( `textures/${id}/${id}_${name}_${res}.jpg`, { srgb } );
const n01 = ( p, oct = 3 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

// —— 右侧护墙板：横向凹槽混凝土 + 竖向水渍流痕 + 苔藓晕染 ——
export function wallMaterial( mossMaskTex ) {

	const id = 'concrete_slab_wall';
	const diff = tex( id, '2k', 'diff', true ), nor = tex( id, '2k', 'nor_gl' ), arm = tex( id, '2k', 'arm' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	// 几何 UV 为世界 (z, y)/2.4；两层不同偏移采样，用低频噪声混合以打破平铺
	const uvA = uv();
	const uvB = uv().mul( 0.83 ).add( vec2( 0.31, 0.5 ) );
	const blend = smoothstep( 0.4, 0.6, n01( vec3( p.z.mul( 0.13 ), p.y.mul( 0.2 ), 1.7 ), 2 ) );
	const albedoTex = mix( texture( diff, uvA ).rgb, texture( diff, uvB ).rgb, blend );
	const armT = mix( texture( arm, uvA ).rgb, texture( arm, uvB ).rgb, blend );
	m.normalNode = normalMap( mix( texture( nor, uvA ), texture( nor, uvB ), blend ) );

	// 苔藓遮罩（CPU 烘焙，与苔藓网格同源）
	const H = L.WALL_H;
	const mUV = vec2( p.z.sub( L.Z0 ).div( L.Z1 - L.Z0 ), p.y.div( H ) );
	const mossM = texture( mossMaskTex, mUV ).r;
	const mossHalo = texture( mossMaskTex, mUV ).g; // 模糊版本：苔藓周围的绿色晕染

	// 竖向流痕：x 方向高频、y 方向拉长的噪声脊线，从墙顶向下，长度随机
	const ridge = ( f, s ) => float( 1 ).sub( abs( mx_noise_float( vec3( p.z.mul( f ), p.y.mul( 0.04 * f ), s ) ) ).mul( 2.2 ) ).clamp();
	const lines = pow( ridge( 1.6, 0.5 ), 3 ).mul( 0.7 ).add( pow( ridge( 5.1, 3.3 ), 6 ).mul( 0.6 ) ).add( n01( vec3( p.z.mul( 1.3 ), p.y.mul( 0.08 ), 7 ), 2 ).sub( 0.5 ).mul( 0.9 ) ).clamp();
	const len = n01( vec3( p.z.mul( 0.7 ), 2.0, 5.0 ), 2 ).mul( 7.0 ).add( 1.0 );
	const fromTop = smoothstep( float( H ).sub( len ), float( H ).sub( len.mul( 0.35 ) ), p.y );
	// 苔藓下方也会拖出深色水痕
	const belowMoss = texture( mossMaskTex, mUV.add( vec2( 0, 0.06 ) ) ).g.mul( smoothstep( 0.3, 0.8, lines ) );
	const streak = max( lines.mul( fromTop ), belowMoss.mul( 0.8 ) ).mul( look.streak ).clamp();
	const topGrime = smoothstep( H - 2.6, H, p.y ).mul( 0.45 );

	// 墙根：泥水溅痕 + 吸水潮湿
	const baseWet = smoothstep( 1.4, 0.0, p.y ).mul( n01( vec3( p.z.mul( 1.7 ), p.y.mul( 2.5 ), 9 ), 3 ).mul( 0.6 ).add( 0.5 ) ).clamp();

	let col = albedoTex.mul( look.wallTint );
	const lum = luminance( col );
	col = mix( vec3( lum ), col, 0.55 ); // 去饱和：混凝土偏灰
	col = col.mul( float( 1 ).sub( streak.mul( 0.72 ) ) ).mul( mix( vec3( 1 ), vec3( 0.85, 0.9, 0.8 ), streak ) );
	col = col.mul( float( 1 ).sub( topGrime ) );
	col = mix( col, col.mul( vec3( 0.55, 0.62, 0.42 ) ), mossHalo.mul( 0.85 ) ); // 苔藓旁的藻类绿染
	col = mix( col, col.mul( vec3( 0.48, 0.45, 0.4 ) ), baseWet );
	// 大尺度明暗变化（板与板之间色差）
	col = col.mul( n01( vec3( p.z.mul( 0.21 ), p.y.mul( 0.33 ), 4 ), 3 ).mul( 0.5 ).add( 0.75 ) );
	m.colorNode = col;
	m.roughnessNode = clamp( armT.g.mul( 0.9 ).sub( streak.mul( 0.25 ) ).sub( baseWet.mul( 0.35 ) ), 0.25, 1 );
	m.metalnessNode = float( 0 );
	// 大尺度天光遮蔽：越靠墙根越暗（巷子底部天空可见度低）
	m.aoNode = smoothstep( - 0.5, 4.0, p.y ).mul( 0.55 ).add( 0.45 ).mul( armT.r );
	m.userData.mossM = mossM;
	return m;

}

// —— 厚苔藓：位移网格表面，绒毛感（物理材质的 sheen）——
export function mossMaterial( maskTex ) {

	const detail = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.92, metalness: 0, sheen: 0.8, sheenRoughness: 0.5 } );
	const p = positionWorld;
	// 边缘：遮罩值与细噪声比较后镂空，得到毛绒状的不规则边缘（不是硬切边）
	const mk = texture( maskTex, vec2( p.z.sub( L.Z0 ).div( L.Z1 - L.Z0 ), p.y.div( L.WALL_H ) ) ).r;
	const fz = n01( vec3( p.z.mul( 22 ), p.y.mul( 22 ), 0.5 ), 3 );
	m.opacityNode = mk.mul( 2.3 ).sub( fz.mul( 0.75 ) );
	m.alphaTest = 0.35;
	const d = luminance( texture( detail, vec2( p.z, p.y ).mul( 0.9 ) ).rgb ).mul( 11.0 ); // 亮度归一化
	const v = n01( vec3( p.z.mul( 0.9 ), p.y.mul( 0.9 ), 2 ), 3 );
	const fine = n01( p.mul( 38 ), 2 );
	let col = mix( vec3( look.mossDeep ), vec3( look.mossLight ), smoothstep( 0.3, 0.75, v ) );
	// 朝上的面受光更多、偏黄绿
	col = mix( col, col.mul( vec3( 1.35, 1.25, 0.8 ) ), smoothstep( 0.0, 0.8, normalWorldGeometry.y ).mul( 0.6 ) );
	m.colorNode = col.mul( d.mul( 0.6 ).add( 0.45 ) ).mul( fine.mul( 0.5 ).add( 0.75 ) );
	m.sheenColorNode = col.mul( 2.2 );
	m.normalNode = bumpFromHeight( n01( p.mul( 55 ), 2 ).add( fine ), float( 0.004 ) );
	m.aoNode = smoothstep( - 0.5, 4.0, p.y ).mul( 0.5 ).add( 0.5 );
	return m;

}

// —— 步道混凝土板：裂缝里填满苔藓，潮湿斑块与积水 ——
export function slabMaterial() {

	const id = 'cracked_concrete';
	const diff = tex( id, '2k', 'diff', true ), nor = tex( id, '2k', 'nor_gl' ), arm = tex( id, '2k', 'arm' );
	const moss = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	const t = texture( diff, uv() ).rgb;
	const a = texture( arm, uv() ).rgb;
	const tl = luminance( t );
	// 裂缝：贴图中最暗的线条
	const crack = smoothstep( 0.09, 0.04, tl );
	// 苔藓斑块：靠墙与靠温室一侧更多 + 噪声
	const edge = max( smoothstep( 0.2, 1.4, p.x ), smoothstep( - 1.2, - 2.3, p.x ) );
	const mn = n01( vec3( p.x.mul( 0.8 ), 0, p.z.mul( 0.8 ) ), 4 );
	const mossPatch = smoothstep( 0.58, 0.7, mn.add( edge.mul( 0.3 ) ).add( n01( p.mul( 6 ), 2 ).mul( 0.12 ) ) );
	const mossAmt = max( crack.mul( 0.9 ), mossPatch );
	const md = luminance( texture( moss, uv().mul( 1.7 ) ).rgb ).mul( 11.0 );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 2.3 ), 2 ) ).mul( md.mul( 0.6 ).add( 0.45 ) );

	// 积水与湿痕
	const pn = n01( vec3( p.x.mul( 0.33 ), 0, p.z.mul( 0.2 ) ), 4 ).add( smoothstep( 1.0, 0.0, abs( p.x.add( 0.3 ) ) ).mul( 0.06 ) ).add( n01( vec3( p.x.mul( 2.1 ), 0, p.z.mul( 2.1 ) ), 2 ).mul( 0.08 ) );
	const damp = smoothstep( float( 0.42 ), float( 0.55 ), pn.add( look.puddle.mul( 0.1 ) ) );
	const water = smoothstep( float( 0.6 ), float( 0.63 ), pn.add( look.puddle.mul( 0.1 ) ) ).mul( float( 1 ).sub( crack ) );

	let col = mix( vec3( tl ), t, 0.35 ).mul( vec3( 0.86, 0.9, 0.88 ) ).mul( 0.95 );
	col = col.mul( n01( vec3( p.x.mul( 0.5 ), 1, p.z.mul( 0.5 ) ), 3 ).mul( 0.4 ).add( 0.8 ) );
	col = mix( col, mossCol, mossAmt );
	col = col.mul( mix( float( 1 ), float( 0.55 ), max( damp, look.wet.mul( 0.4 ) ) ) );
	col = mix( col, col.mul( 0.35 ), water );
	m.colorNode = col;
	const r = mix( a.g, float( 0.95 ), mossAmt );
	m.roughnessNode = mix( mix( r, r.mul( 0.45 ), damp ), float( 0.04 ), water );
	m.normalNode = mix( normalMap( texture( nor, uv() ) ), normalView, water );
	// 靠两侧墙体的天空遮蔽
	const occ = float( 0.85 ).mul( smoothstep( L.WALL_X + 0.3, L.WALL_X - 1.6, p.x ).mul( 0.3 ).add( 0.7 ) );
	m.aoNode = occ.mul( a.r );
	return m;

}

// 接缝/土带底面：深色苔藓泥土
export function soilMaterial() {

	const id = 'brown_mud_leaves_01';
	const diff = tex( id, '1k', 'diff', true );
	const moss = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const t = texture( diff, vec2( p.x, p.z ).mul( 0.6 ) ).rgb;
	const md = luminance( texture( moss, vec2( p.x, p.z ).mul( 1.1 ) ).rgb ).mul( 11.0 );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 1.7 ), 2 ) ).mul( md.mul( 0.6 ).add( 0.45 ) );
	const mm = smoothstep( 0.4, 0.6, n01( p.mul( 1.2 ), 3 ) );
	m.colorNode = mix( t.mul( 0.45 ), mossCol, mm.mul( 0.7 ).add( 0.2 ) );
	m.aoNode = float( 0.6 );
	return m;

}

// —— 钢构：深色油漆 + 锈蚀（rusty_metal_02 的锈斑作遮罩）——
export function steelMaterial( paint = new THREE.Color( 0.03, 0.038, 0.034 ) ) {

	const id = 'rusty_metal_02';
	const diff = tex( id, '1k', 'diff', true ), nor = tex( id, '1k', 'nor_gl' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.4 } );
	const p = positionWorld;
	// 三平面式的世界空间采样（细长构件 UV 不可靠）
	const n = normalWorldGeometry.abs();
	const tx = ( s ) => texture( diff, vec2( p.z, p.y ).mul( s ) ).rgb.mul( n.x ).add( texture( diff, vec2( p.x, p.z ).mul( s ) ).rgb.mul( n.y ) ).add( texture( diff, vec2( p.x, p.y ).mul( s ) ).rgb.mul( n.z ) );
	const t = tx( 0.7 );
	// 锈斑：贴图的「橙色程度」
	// 锈斑只出现在噪声区域（油漆剥落处）与构件底部（积水处）
	const region = smoothstep( 0.5, 0.68, n01( p.mul( 1.4 ), 3 ).add( smoothstep( 1.2, 0.0, p.y ).mul( 0.2 ) ) );
	const rust = smoothstep( 0.18, 0.32, t.r.sub( t.b ) ).mul( region );
	const rustCol = t.mul( vec3( 0.2, 0.135, 0.09 ) );
	const drip = smoothstep( 0.62, 0.85, n01( vec3( p.x.mul( 6 ), p.y.mul( 0.4 ), p.z.mul( 6 ) ), 3 ) );
	const rr = max( rust, drip.mul( 0.45 ) );
	m.colorNode = mix( vec3( paint ).mul( n01( p.mul( 3 ), 2 ).mul( 0.6 ).add( 0.7 ) ), rustCol, rr );
	m.roughnessNode = mix( float( 0.55 ), float( 0.9 ), rr );
	m.metalnessNode = mix( float( 0.35 ), float( 0.0 ), rr );
	return m;

}

// —— 脏玻璃：半透明，噪声控制污渍（不透明度与粗糙度）——
export function glassMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { color: 0x1c2421, roughness: 0.08, metalness: 0, transparent: true, side: THREE.DoubleSide, depthWrite: false } );
	const p = positionWorld;
	const dirt = n01( p.mul( 1.3 ), 4 ).add( smoothstep( 1.5, 0.0, p.y.mod( 2.0 ) ).mul( 0.15 ) );
	const grime = smoothstep( 0.45, 0.8, dirt );
	m.opacityNode = mix( float( 0.22 ), float( 0.72 ), grime );
	m.colorNode = mix( vec3( 0.04, 0.05, 0.045 ), vec3( 0.09, 0.095, 0.08 ), grime );
	m.roughnessNode = mix( float( 0.05 ), float( 0.7 ), grime );
	return m;

}

// —— 常春藤叶片：叶脉 + 实例色；蜡质表面略有高光 ——
export function leafMaterial() {

	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.55, metalness: 0, side: THREE.DoubleSide, specularIntensity: 0.45 } );
	const u = uv();
	const mid = smoothstep( 0.07, 0.0, abs( u.x ) );
	const side = smoothstep( 0.86, 1.0, sin( u.y.mul( 22 ).sub( abs( u.x ).mul( 9 ) ) ) ).mul( 0.5 );
	const vein = max( mid, side );
	const edge = smoothstep( 0.6, 1.0, abs( u.x ) );
	m.colorNode = vec3( 1 ).mul( mix( float( 1 ), float( 1.45 ), vein ) ).mul( float( 1 ).sub( edge.mul( 0.2 ) ) );
	m.roughnessNode = mix( float( 0.5 ), float( 0.75 ), vein );
	// 简易透光：叶片薄，背光面也有一点绿色
	m.emissiveNode = instanceColor.mul( 0.06 );
	return m;

}

// 草叶：根部暗、尖端偏黄
export function grassMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.75, metalness: 0, side: THREE.DoubleSide } );
	const t = uv().y;
	m.colorNode = mix( vec3( 0.35, 0.4, 0.3 ), vec3( 1.25, 1.2, 0.85 ), smoothstep( 0.0, 1.0, t ) );
	m.aoNode = smoothstep( 0.0, 0.6, t ).mul( 0.7 ).add( 0.3 );
	return m;

}

// 藤蔓茎
export function stemMaterial() {

	return new THREE.MeshStandardNodeMaterial( { color: new THREE.Color( 0.05, 0.04, 0.028 ), roughness: 0.85 } );

}

// 普通混凝土（温室矮墙、尽头建筑）：带苔藓与雨痕
export function concreteMaterial( { tint = new THREE.Color( 0.55, 0.56, 0.54 ), moss = 0.5, tile = 2.0 } = {} ) {

	const id = 'concrete_wall_008';
	const diff = tex( id, '2k', 'diff', true ), nor = tex( id, '2k', 'nor_gl' ), arm = tex( id, '2k', 'arm' );
	const md = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	const t = texture( diff, uv() ).rgb;
	const l = luminance( t );
	let col = mix( vec3( l ), t, 0.4 ).mul( vec3( tint ) );
	const sn = n01( vec3( p.x.mul( 4 ), p.y.mul( 0.15 ), p.z.mul( 4 ) ), 3 );
	col = col.mul( float( 1 ).sub( smoothstep( 0.5, 0.8, sn ).mul( 0.5 ) ) );
	const up = normalWorldGeometry.y;
	const mm = smoothstep( 0.55, 0.7, n01( p.mul( 0.9 ), 4 ).add( smoothstep( 0.3, 0.9, up ).mul( 0.3 ) ).add( smoothstep( 1.2, 0, p.y ).mul( 0.2 ) ) ).mul( moss );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 2 ), 2 ) ).mul( luminance( texture( md, uv().mul( 1.3 ) ).rgb ).mul( 7 ).add( 0.3 ) );
	m.colorNode = mix( col, mossCol, mm ).mul( n01( p.mul( 0.3 ), 3 ).mul( 0.4 ).add( 0.8 ) );
	m.normalNode = normalMap( texture( nor, uv() ) );
	m.roughnessNode = mix( texture( arm, uv() ).g, float( 0.95 ), mm );
	m.aoNode = texture( arm, uv() ).r;
	return m;

}

// 暗色内部（窗洞后面）
export function darkMaterial( c = 0x050605 ) {

	return new THREE.MeshStandardNodeMaterial( { color: c, roughness: 1 } );

}

// 屋面：粗糙混凝土 + 大片苔藓 + 积水（俯视镜头可见）
export function roofMaterial() {

	const id = 'brushed_concrete';
	const diff = tex( id, '1k', 'diff', true ), nor = tex( id, '1k', 'nor_gl' );
	const md = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0 } );
	const p = positionWorld;
	const q = vec2( p.x, p.z );
	const t = texture( diff, q.mul( 0.33 ) ).rgb;
	const base = mix( vec3( luminance( t ) ), t, 0.3 ).mul( 0.8 ).mul( n01( p.mul( 0.8 ), 3 ).mul( 0.6 ).add( 0.6 ) );
	const mn = n01( vec3( p.x.mul( 0.35 ), 0, p.z.mul( 0.35 ) ), 4 ).add( n01( p.mul( 3 ), 2 ).mul( 0.1 ) );
	const mm = smoothstep( 0.42, 0.62, mn );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 1.3 ), 3 ) ).mul( luminance( texture( md, q.mul( 0.5 ) ).rgb ).mul( 7 ).add( 0.3 ) );
	const wn = n01( vec3( p.x.mul( 0.45 ), 3, p.z.mul( 0.45 ) ), 3 );
	const water = smoothstep( 0.66, 0.68, wn ).mul( float( 1 ).sub( mm ) );
	m.colorNode = mix( mix( base, mossCol, mm ), base.mul( 0.25 ), water );
	m.roughnessNode = mix( mix( float( 0.85 ), float( 0.95 ), mm ), float( 0.05 ), water );
	m.normalNode = mix( normalMap( texture( nor, q.mul( 0.33 ) ) ), normalView, water );
	return m;

}
