// 苔藓小巷：材质库（TSL）· 第二轮重写
// 原则：
//   1. 所有大面积表面 = 贴图细节（六边形随机平铺，消除重复）× 美术指定色 × 世界空间遮罩
//   2. 每个材质都乘「巷道天空可见度」skyOcc —— 两侧高墙之间，地面中央约 60%、墙根约 25% 的天光
//   3. 颜色压暗、去饱和（参考：TLOU2 阴天，暗部深、绿色灰）
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, max, min, abs, uv, texture, normalMap,
	positionWorld, normalWorldGeometry, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, luminance,
	instanceColor, normalView, sin, cos, pow, atan, select, fract, floor, dot, attribute, step, cameraPosition,
	normalize, faceDirection, length, exp, positionLocal,
} from 'three/tsl';
import { loadTexture } from '../world/assets.js';
import { bumpFromHeight } from './util.js';

// 场景尺寸（各模块共享）
export const L = {
	WALL_X: 2.0, // 右侧苔藓墙面 x
	WALL_H: 7.2,
	Z0: - 40, Z1: 8, // 巷子范围（-Z 为纵深方向）
	GH_X: - 2.3, // 左侧温室立面 x
	GH_H: 4.6, // 温室檐口高度
	SOIL_X: 1.25, // 墙根土带起点
	SLAB_TOP: 0.12,
	WATER_Y: 0.118, // 积水水面高度（低于它的板面被水淹）
	PIPES: [ - 3.2, - 15.6, - 27.4 ], // 落水管 z 坐标（墙面流痕的来源之一）
	ROWS: [ 0.72, 2.3, 3.55, 4.6 ], // 温室横梁高度
	BAY: 1.6,
};

// 美术参数（uniform，可实时调节）
export const look = {
	mossDeep: uniform( new THREE.Color( 0.036, 0.058, 0.016 ) ),
	mossLight: uniform( new THREE.Color( 0.12, 0.165, 0.042 ) ),
	wallTint: uniform( new THREE.Color( 0.34, 0.36, 0.35 ) ),
	streak: uniform( 1.0 ),
	wet: uniform( 0.6 ),
	sunDir: uniform( new THREE.Vector3( - 0.45, 0.82, - 0.3 ).normalize() ),
	sunI: uniform( 1.0 ),
};

const tex = ( id, res, name, srgb = false ) => loadTexture( `textures/${id}/${id}_${name}_${res}.jpg`, { srgb } );
export const n01 = ( p, oct = 3 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

// —— 巷道天空可见度（解析解）——
// 无限长缝隙的截面内，余弦加权可见天空 = (sin(hi-φ) - sin(lo-φ)) / 2（交叉弦法则）
// 右墙顶 (WALL_X, WALL_H) 遮挡 θ∈[0,aR]，左侧温室檐 (GH_X, GH_H) 遮挡 θ∈[π-aL, π]
export const skyOcc = Fn( ( [ p, n ] ) => {

	const HALF = Math.PI / 2;
	const aR = atan( max( float( L.WALL_H + 0.25 ).sub( p.y ), 0 ), max( float( L.WALL_X ).sub( p.x ), 0.03 ) );
	const aRr = select( p.x.lessThan( L.WALL_X + 0.05 ), aR, float( 0 ) );
	const aL0 = atan( max( float( L.GH_H + 0.6 ).sub( p.y ), 0 ), max( p.x.sub( L.GH_X ), 0.03 ) );
	const aL = select( p.x.greaterThan( L.GH_X - 0.05 ), aL0, float( 0 ) );
	const phi = atan( n.y, n.x );
	const lo = max( aRr, phi.sub( HALF ) );
	const hi = min( float( Math.PI ).sub( aL ), phi.add( HALF ) );
	const vis = max( sin( hi.sub( phi ) ).sub( sin( lo.sub( phi ) ) ), 0 ).mul( 0.5 );
	// 法线沿巷道方向时截面法不适用：退化为半开
	const v = mix( vis, float( 0.45 ), abs( n.z ) );
	let ao = pow( clamp( v.mul( 1.7 ), 0, 1 ), 0.8 );
	// 温室内部（玻璃屋顶下）、巷子两端以外：更开敞
	ao = select( p.x.lessThan( L.GH_X - 0.05 ), float( 0.5 ).add( smoothstep( 0, 6, p.y ).mul( 0.3 ) ), ao );
	ao = mix( ao, float( 1 ), smoothstep( L.Z0 + 1, L.Z0 - 5, p.z ).max( smoothstep( L.Z1 - 1, L.Z1 + 4, p.z ) ) );
	return ao;

} );

export const skyAO = () => skyOcc( positionWorld, normalWorldGeometry );

// —— 六边形随机平铺采样（Mikkelsen 2022「Practical Real-Time Hex-Tiling」简化版）——
// 三角网格的三个顶点各取一个随机偏移采样，按重心权重（锐化）混合 —— 打破贴图重复
const hash22 = ( v ) => fract( sin( vec2( dot( v, vec2( 127.1, 311.7 ) ), dot( v, vec2( 269.5, 183.3 ) ) ) ).mul( 43758.5453 ) );
export function hexCoords( uvIn, cell = 1.6 ) {

	const st = uvIn.mul( cell );
	const sk = vec2( st.x, st.x.mul( - 0.57735027 ).add( st.y.mul( 1.15470054 ) ) );
	const base = floor( sk );
	const t = fract( sk );
	const tz = float( 1 ).sub( t.x ).sub( t.y );
	const up = tz.greaterThan( 0 );
	let w1 = select( up, tz, tz.negate() ), w2 = select( up, t.y, float( 1 ).sub( t.y ) ), w3 = select( up, t.x, float( 1 ).sub( t.x ) );
	const v1 = base.add( select( up, vec2( 0, 0 ), vec2( 1, 1 ) ) );
	const v2 = base.add( select( up, vec2( 0, 1 ), vec2( 1, 0 ) ) );
	const v3 = base.add( select( up, vec2( 1, 0 ), vec2( 0, 1 ) ) );
	w1 = pow( w1, 5 ); w2 = pow( w2, 5 ); w3 = pow( w3, 5 );
	const s = w1.add( w2 ).add( w3 );
	return {
		uvs: [ uvIn.add( hash22( v1 ) ), uvIn.add( hash22( v2 ) ), uvIn.add( hash22( v3 ) ) ],
		w: [ w1.div( s ), w2.div( s ), w3.div( s ) ],
		dx: uvIn.dFdx(), dy: uvIn.dFdy(),
	};

}

export function hexTex( t, hc ) {

	let acc = null;
	for ( let i = 0; i < 3; i ++ ) {

		const s = texture( t, hc.uvs[ i ] ).grad( hc.dx, hc.dy ).mul( hc.w[ i ] );
		acc = acc ? acc.add( s ) : s;

	}

	return acc;

}

// —— 右侧护墙板：横向凹槽混凝土 + 竖向水渍流痕 + 苔藓晕染 + 墙根 1.2m 潮湿 ——
export function wallMaterial( mossMaskTex ) {

	const id = 'concrete_slab_wall';
	const diff = tex( id, '2k', 'diff', true ), nor = tex( id, '2k', 'nor_gl' ), arm = tex( id, '2k', 'arm' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	const hc = hexCoords( uv(), 1.3 );
	const albedoTex = hexTex( diff, hc ).rgb;
	const armT = hexTex( arm, hc ).rgb;
	m.normalNode = normalMap( hexTex( nor, hc ) );

	// 苔藓遮罩（CPU 烘焙，与苔藓网格同源）：r=苔藓垫，g=晕染，b=苔藓下方水痕
	const H = L.WALL_H;
	const mUV = vec2( p.z.sub( L.Z0 ).div( L.Z1 - L.Z0 ), p.y.div( H ) );
	const mk = texture( mossMaskTex, mUV );
	const mossHalo = mk.g;

	// 竖向流痕：拉伸噪声（V 方向拉长约 40 倍），起点为墙顶压顶、面板接缝、落水管
	const zN = p.z;
	const fine = n01( vec3( zN.mul( 11.0 ), p.y.mul( 0.25 ), 1.3 ), 3 );
	const mid = n01( vec3( zN.mul( 3.1 ), p.y.mul( 0.09 ), 7.1 ), 3 );
	const lines = smoothstep( 0.36, 0.62, fine.mul( 0.5 ).add( mid.mul( 0.7 ) ).sub( 0.1 ) );
	const len = n01( vec3( zN.mul( 0.9 ), 2.0, 5.0 ), 2 ).mul( 7.5 ).add( 1.5 );
	const fromTop = smoothstep( float( H ).sub( len ), float( H ).sub( len.mul( 0.25 ) ), p.y );
	const seamD = abs( fract( p.z.sub( L.Z1 ).div( 2.4 ).add( 0.5 ) ).sub( 0.5 ) ).mul( 2.4 );
	const seam = smoothstep( 0.32, 0.0, seamD.add( fine.sub( 0.5 ).mul( 0.25 ) ) ).mul( smoothstep( 0.0, 3.0, p.y ).mul( 0.6 ).add( 0.4 ) );
	let pipeS = float( 0 );
	for ( const z of L.PIPES ) pipeS = max( pipeS, smoothstep( 0.55, 0.05, abs( p.z.sub( z ) ).add( fine.sub( 0.5 ).mul( 0.3 ) ) ) );
	const below = mk.b;
	const streak = clamp( lines.mul( fromTop ).add( seam.mul( lines.mul( 0.6 ).add( 0.35 ) ) ).add( pipeS.mul( 0.8 ) ).add( below.mul( lines.mul( 0.5 ).add( 0.5 ) ) ), 0, 1 ).mul( look.streak );
	const topGrime = smoothstep( H - 1.6, H, p.y ).mul( 0.5 );

	// 墙根 1.2m：吸水潮湿 + 泥水溅痕（上沿不规则）
	const wetEdge = float( 1.2 ).add( n01( vec3( p.z.mul( 1.3 ), 0, 3 ), 3 ).sub( 0.5 ).mul( 0.7 ) );
	const baseWet = smoothstep( wetEdge, wetEdge.sub( 0.5 ), p.y );
	const splash = smoothstep( 0.45, 0.0, p.y ).mul( n01( p.mul( 9 ), 2 ) );

	let col = albedoTex.mul( look.wallTint );
	col = mix( vec3( luminance( col ) ), col, 0.45 );
	// 逐面板色差：面板 id = (2.4m 竖向分块, 0.34m 横板)，每块明度 ±12%、色相微偏（冷灰/暖灰）
	const panelId = vec2( floor( p.z.sub( L.Z1 ).div( 2.4 ) ), floor( p.y.div( 0.34 ) ) );
	const ph = hash22( panelId );
	col = col.mul( ph.x.mul( 0.26 ).add( 0.87 ) ).mul( mix( vec3( 0.97, 1.0, 1.03 ), vec3( 1.04, 1.0, 0.95 ), ph.y ) );
	// 板与板之间的大尺度色差（低频宏观变化）
	col = col.mul( n01( vec3( p.z.mul( 0.12 ), p.y.mul( 0.2 ), 4 ), 3 ).mul( 0.5 ).add( 0.75 ) );
	// 横板下沿的积灰/藻痕（每块板底部 4cm 暗带，水沿凹槽流）
	const inBoard = fract( p.y.div( 0.34 ) );
	col = col.mul( float( 1 ).sub( smoothstep( 0.2, 0.0, inBoard ).mul( 0.25 ) ) );
	// 竖向流痕：压暗 40~60%，略偏绿褐（藻类）
	col = col.mul( float( 1 ).sub( streak.mul( 0.62 ) ) ).mul( mix( vec3( 1 ), vec3( 0.8, 0.9, 0.68 ), streak ) );
	col = col.mul( float( 1 ).sub( topGrime ) );
	col = mix( col, col.mul( vec3( 0.42, 0.5, 0.3 ) ), mossHalo.mul( 0.9 ) ); // 苔藓旁的藻类绿染
	col = mix( col, col.mul( vec3( 0.42, 0.42, 0.38 ) ), baseWet );
	col = mix( col, vec3( 0.025, 0.022, 0.018 ), splash.mul( 0.5 ) );
	m.colorNode = col;
	m.roughnessNode = clamp( armT.g.mul( 0.85 ).sub( streak.mul( 0.25 ) ).sub( baseWet.mul( 0.45 ) ), 0.22, 1 );
	m.metalnessNode = float( 0 );
	m.aoNode = skyAO().mul( armT.r.mul( 0.5 ).add( 0.5 ) );
	return m;

}

// —— 厚苔藓：位移网格表面 + 胞状起伏法线 + 绒毛（sheen）+ 天光捕捉的亮边 ——
export function mossMaterial( maskTex ) {

	const detail = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.95, metalness: 0, sheen: 1.0, sheenRoughness: 0.45 } );
	const p = positionWorld;
	const mk = texture( maskTex, vec2( p.z.sub( L.Z0 ).div( L.Z1 - L.Z0 ), p.y.div( L.WALL_H ) ) ).r;
	const fz = n01( vec3( p.z.mul( 30 ), p.y.mul( 30 ), 0.5 ), 3 );
	m.opacityNode = mk.mul( 2.6 ).sub( fz.mul( 0.9 ) );
	m.alphaTest = 0.3;
	const hc = hexCoords( vec2( p.z, p.y ).mul( 0.8 ), 1.4 );
	const d = luminance( hexTex( detail, hc ).rgb ).mul( 9.0 );
	// 胞状苔藓垫：Worley 距离场 → 每团中心鼓、团间凹（自阴影）
	const cell = mx_worley_noise_float( vec3( p.z.mul( 14 ), p.y.mul( 14 ), p.x.mul( 14 ) ) );
	const cell2 = mx_worley_noise_float( vec3( p.z.mul( 45 ), p.y.mul( 45 ), 1.7 ) );
	const h = float( 1 ).sub( cell.mul( 0.8 ) ).sub( cell2.mul( 0.35 ) );
	const v = n01( vec3( p.z.mul( 0.7 ), p.y.mul( 0.7 ), 2 ), 3 );
	const hue = n01( vec3( p.z.mul( 2.3 ), p.y.mul( 2.3 ), 8 ), 2 );
	let col = mix( vec3( look.mossDeep ), vec3( look.mossLight ), smoothstep( 0.25, 0.8, v ) );
	col = mix( col, col.mul( vec3( 1.35, 1.2, 0.6 ) ), smoothstep( 0.55, 0.8, hue ) );
	col = mix( col, vec3( 0.04, 0.032, 0.018 ), smoothstep( 0.78, 0.9, n01( vec3( p.z.mul( 1.1 ), p.y.mul( 1.1 ), 3 ), 3 ) ).mul( 0.6 ) );
	col = col.mul( mix( float( 1 ), float( 1.7 ), smoothstep( 0.05, 0.7, normalWorldGeometry.y ) ) );
	col = col.mul( smoothstep( 0.0, 0.9, h ).mul( 0.7 ).add( 0.5 ) );
	m.colorNode = col.mul( d.mul( 0.4 ).add( 0.65 ) );
	m.sheenColorNode = col.mul( 2.5 );
	m.normalNode = bumpFromHeight( h.mul( 0.016 ).add( n01( p.mul( 90 ), 2 ).mul( 0.003 ) ), float( 1.0 ) );
	m.aoNode = skyAO().mul( smoothstep( 0.0, 0.8, h ).mul( 0.6 ).add( 0.4 ) );
	m.userData.col = col;
	return m;

}

// 苔藓壳层：按高频绒毛噪声镂空，外层更稀；颜色逐层变亮（茸毛尖端受光）
export function mossShellMaterial( maskTex ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0, side: THREE.DoubleSide } );
	const p = positionWorld;
	const layer = attribute( 'color', 'vec3' ).x; // 0.5 / 1.0
	const mk = texture( maskTex, vec2( p.z.sub( L.Z0 ).div( L.Z1 - L.Z0 ), p.y.div( L.WALL_H ) ) ).r;
	const fuzz = n01( vec3( p.z.mul( 260 ), p.y.mul( 260 ), p.x.mul( 260 ) ), 2 );
	const cell = mx_worley_noise_float( vec3( p.z.mul( 14 ), p.y.mul( 14 ), p.x.mul( 14 ) ) );
	const thick = mk.mul( float( 1 ).sub( cell.mul( 0.9 ) ) );
	m.opacityNode = fuzz.add( thick.mul( 0.7 ) ).sub( layer.mul( 0.55 ) );
	m.alphaTest = 0.5;
	const hue = n01( vec3( p.z.mul( 2.3 ), p.y.mul( 2.3 ), 8 ), 2 );
	let col = mix( vec3( look.mossDeep ), vec3( look.mossLight ), smoothstep( 0.2, 0.8, n01( vec3( p.z.mul( 0.7 ), p.y.mul( 0.7 ), 2 ), 3 ) ) );
	col = mix( col, col.mul( vec3( 1.35, 1.2, 0.6 ) ), smoothstep( 0.55, 0.8, hue ) );
	m.colorNode = col.mul( layer.mul( 0.6 ).add( 0.9 ) ).mul( fuzz.mul( 0.5 ).add( 0.75 ) );
	m.aoNode = skyAO().mul( layer.mul( 0.4 ).add( 0.55 ) );
	return m;

}

// 苔藓团（墙面凹槽/压顶/缝隙里的立体垫状苔藓实例）：标准材质 + 掠射角绒毛亮边（代替 sheen）
export function mossClumpMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const cell = mx_worley_noise_float( p.mul( 60 ) );
	const fine = n01( p.mul( 140 ), 2 );
	const col = instanceColor.mul( float( 1 ).sub( cell.mul( 0.45 ) ) ).mul( fine.mul( 0.4 ).add( 0.8 ) );
	const up = smoothstep( 0.0, 0.9, normalWorldGeometry.y );
	m.colorNode = col.mul( mix( float( 0.85 ), float( 1.4 ), up ) );
	const V = normalize( cameraPosition.sub( p ) );
	const rim = pow( float( 1 ).sub( abs( dot( normalWorldGeometry, V ) ) ), 3 );
	const sky = skyAO();
	m.emissiveNode = instanceColor.mul( rim ).mul( sky ).mul( 0.15 );
	m.aoNode = sky;
	return m;

}

// —— 步道混凝土板（第三轮）：世界空间六边形随机平铺（消除重复）+ 逐碎块色差
// 地面遮罩：R = 到裂缝距离（0~25cm），G = 潮湿，B = 泥污，A = 到发丝裂纹距离（0~6cm）
// 苔藓从裂缝 SDF 长出：缝边最厚，5~15cm 内衰减（衰减距离随噪声变化），深绿而非黄绿
// 顶点色：r = 整板色调，g = 该块苔藓倾向，b = 碎块随机种子
export function slabMaterial( mask ) {

	const id = 'brushed_concrete';
	const diff = tex( id, '1k', 'diff', true ), nor = tex( id, '1k', 'nor_gl' ), arm = tex( id, '1k', 'arm' );
	const stain = tex( 'concrete_layers_02', '1k', 'diff', true );
	const moss = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	const q = vec2( p.x, p.z );
	const hc = hexCoords( q.mul( 0.55 ), 1.3 );
	const t = hexTex( diff, hc ).rgb;
	const a = hexTex( arm, hc ).rgb;
	const tl = luminance( t );
	const vc = attribute( 'color', 'vec3' );
	const muv = vec2( p.x.sub( - 2.3 ).div( 4.3 ), p.z.sub( - 44 ).div( 54 ) );
	const mk = texture( mask, muv );
	const seamD = mk.r.mul( 0.25 );
	const hairD = mk.a.mul( 0.06 );
	const damp = mk.g;
	// 宏观：低频污渍（另一张贴图的亮度，极低频）+ 逐碎块明度
	const macro = luminance( texture( stain, q.mul( 0.11 ).add( vc.b ) ).rgb ).mul( 2.2 ).mul( n01( vec3( p.x.mul( 0.35 ), 2, p.z.mul( 0.35 ) ), 3 ).mul( 0.5 ).add( 0.75 ) );
	const pieceV = vc.b.mul( 0.22 ).add( 0.89 ).mul( vc.r.mul( 0.2 ).add( 0.9 ) );
	// 苔藓：裂缝 SDF + 噪声扰动的衰减距离 + 碎块倾向
	const nM = n01( vec3( p.x.mul( 3.1 ), 0, p.z.mul( 3.1 ) ), 4 );
	const reach = mix( float( 0.03 ), float( 0.16 ), nM.mul( vc.g.mul( 0.6 ).add( 0.6 ) ) );
	const fromCrack = smoothstep( reach, reach.mul( 0.2 ), seamD.add( n01( p.mul( 40 ), 2 ).sub( 0.5 ).mul( 0.025 ) ) );
	const patch = smoothstep( 0.78, 0.9, nM.add( vc.g.mul( 0.12 ) ) ).mul( 0.8 );
	const fromHair = smoothstep( 0.012, 0.0, hairD ).mul( 0.6 ).mul( nM.add( 0.3 ) );
	const mossAmt = clamp( max( max( fromCrack, patch ), fromHair ), 0, 1 );
	const md = luminance( hexTex( moss, hexCoords( q.mul( 1.1 ), 1.4 ) ).rgb ).mul( 7.5 );
	const mossCol = mix( vec3( look.mossDeep ).mul( 0.8 ), vec3( look.mossLight ).mul( 0.6 ), n01( p.mul( 2.3 ), 2 ).mul( 0.6 ) ).mul( md.mul( 0.6 ).add( 0.4 ) ).mul( mix( float( 0.6 ), float( 1.0 ), smoothstep( 0.0, 0.06, seamD ) ) );
	const dirt = mk.b.mul( smoothstep( 0.4, 0.7, n01( vec3( p.x.mul( 4.3 ), 1, p.z.mul( 4.3 ) ), 3 ) ) );
	// 发丝裂纹：暗线 + 法线槽
	const hairLine = smoothstep( 0.004, 0.0, hairD );
	const edgeDark = smoothstep( 0.035, 0.0, seamD ).mul( 0.5 );

	let col = mix( vec3( tl ), t, 0.25 ).mul( vec3( 0.56, 0.58, 0.565 ) ).mul( macro ).mul( pieceV );
	col = mix( col, col.mul( vec3( 0.5, 0.44, 0.36 ) ), dirt.mul( 0.8 ) );
	col = col.mul( float( 1 ).sub( hairLine.mul( 0.6 ) ) ).mul( float( 1 ).sub( edgeDark ) );
	col = mix( col, mossCol, mossAmt );
	// 潮湿：多孔混凝土吸水变暗；积水边缘近镜面
	const wetK = max( damp, look.wet.mul( 0.25 ) );
	col = col.mul( mix( float( 1 ), float( 0.45 ), wetK.mul( float( 1 ).sub( mossAmt.mul( 0.5 ) ) ) ) );
	m.colorNode = col;
	const rr = mix( a.g.mul( 0.9 ).add( 0.1 ), float( 0.95 ), mossAmt );
	m.roughnessNode = clamp( mix( rr, float( 0.12 ), smoothstep( 0.3, 0.95, damp ).mul( float( 1 ).sub( mossAmt.mul( 0.8 ) ) ) ), 0.06, 1 );
	// 法线：贴图细节 + 发丝裂纹槽 + 苔藓起伏；湿处压平
	const hgt = hairLine.mul( - 0.0015 ).add( mossAmt.mul( n01( p.mul( 60 ), 2 ) ).mul( 0.002 ) );
	const nTex = normalMap( hexTex( nor, hc ), vec2( mix( float( 1.2 ), float( 0.25 ), damp ) ) );
	m.normalNode = bumpFromHeight( hgt, float( 1 ), nTex );
	m.aoNode = skyAO().mul( a.r ).mul( smoothstep( 0.0, 0.05, seamD ).mul( 0.3 ).add( 0.7 ) );
	return m;

}

// 落叶（实例色）：薄、略有光泽、潮湿
export function litterMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.55, metalness: 0, side: THREE.DoubleSide } );
	const u = uv();
	const vein = smoothstep( 0.05, 0.0, abs( u.x.sub( 0.5 ) ) );
	m.colorNode = instanceColor.mul( float( 1 ).sub( vein.mul( 0.3 ) ) ).mul( n01( positionWorld.mul( 40 ), 2 ).mul( 0.5 ).add( 0.75 ) );
	m.aoNode = skyAO().mul( 0.85 );
	return m;

}

// 碎石
export function pebbleMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.8, metalness: 0 } );
	m.colorNode = instanceColor.mul( n01( positionWorld.mul( 90 ), 2 ).mul( 0.6 ).add( 0.6 ) );
	m.aoNode = skyAO();
	return m;

}

// 接缝/缺板处的泥土：深色腐殖土 + 苔藓
export function soilMaterial() {

	const id = 'brown_mud_leaves_01';
	const diff = tex( id, '1k', 'diff', true ), nor = tex( id, '1k', 'nor_gl' );
	const moss = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const hc = hexCoords( vec2( p.x, p.z ).mul( 0.6 ), 1.3 );
	const t = hexTex( diff, hc ).rgb;
	const md = luminance( texture( moss, vec2( p.x, p.z ).mul( 1.1 ) ).rgb ).mul( 9.0 );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 1.7 ), 2 ) ).mul( md.mul( 0.55 ).add( 0.5 ) );
	const mm = smoothstep( 0.4, 0.6, n01( p.mul( 1.2 ), 3 ) );
	m.colorNode = mix( t.mul( 0.32 ), mossCol, mm.mul( 0.7 ).add( 0.15 ) );
	m.normalNode = normalMap( hexTex( nor, hc ) );
	m.roughnessNode = float( 0.8 );
	m.aoNode = skyAO().mul( 0.75 );
	return m;

}

// —— 钢构：深色油漆 + 锈蚀集中在节点/螺栓下方的流锈 ——
export function steelMaterial( paint = new THREE.Color( 0.03, 0.036, 0.033 ) ) {

	const id = 'rusty_metal_02';
	const diff = tex( id, '1k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.4 } );
	const p = positionWorld;
	const n = normalWorldGeometry.abs();
	const tx = ( s ) => texture( diff, vec2( p.z, p.y ).mul( s ) ).rgb.mul( n.x ).add( texture( diff, vec2( p.x, p.z ).mul( s ) ).rgb.mul( n.y ) ).add( texture( diff, vec2( p.x, p.y ).mul( s ) ).rgb.mul( n.z ) );
	const t = tx( 0.9 );
	// 节点：靠近横梁高度 且 靠近立柱（每 1.6m）
	const dz = abs( fract( float( L.Z1 ).sub( p.z ).div( L.BAY ) ).sub( 0.5 ).abs().sub( 0.5 ) ).mul( L.BAY );
	let dy = float( 9 );
	let drip = float( 0 );
	const nz = n01( vec3( p.x.mul( 9 ), p.y.mul( 0.5 ), p.z.mul( 9 ) ), 2 );
	for ( const y of L.ROWS ) {

		dy = min( dy, abs( p.y.sub( y ) ) );
		// 螺栓下方的流锈：节点下方 0~1.2m
		const dl = smoothstep( 0.0, 0.05, float( y ).sub( p.y ) ).mul( smoothstep( 1.3, 0.1, float( y ).sub( p.y ).add( nz.mul( 0.5 ) ) ) );
		drip = max( drip, dl.mul( smoothstep( 0.07, 0.0, dz.add( nz.sub( 0.5 ).mul( 0.05 ) ) ) ) );

	}

	const joint = smoothstep( 0.35, 0.0, dy.add( nz.mul( 0.15 ) ) ).mul( smoothstep( 0.4, 0.0, dz ) ).add( smoothstep( 0.18, 0.0, dy ).mul( 0.5 ) );
	const region = smoothstep( 0.55, 0.7, n01( p.mul( 1.6 ), 3 ).add( smoothstep( 1.2, 0.0, p.y ).mul( 0.25 ) ) );
	const tex01 = smoothstep( 0.12, 0.3, t.r.sub( t.b ) );
	const rr = clamp( tex01.mul( max( joint, region.mul( 0.7 ) ) ).add( drip.mul( 0.8 ) ), 0, 1 );
	// 锈色：去掉橙色，偏暗褐
	const rustCol = mix( vec3( luminance( t ) ), t, 0.55 ).mul( vec3( 0.17, 0.11, 0.075 ) );
	const paintCol = vec3( paint ).mul( n01( p.mul( 3 ), 2 ).mul( 0.6 ).add( 0.7 ) );
	m.colorNode = mix( paintCol, rustCol, rr );
	m.roughnessNode = mix( float( 0.5 ), float( 0.92 ), rr );
	m.metalnessNode = mix( float( 0.4 ), float( 0.0 ), rr );
	m.aoNode = skyAO();
	return m;

}

// —— 温室玻璃（第三轮）：薄玻璃 —— 透过率高（不透明度 0.1~0.3），菲涅尔反射，污垢 = 自下而上渐变 × 噪声 + 窗框四周积灰
// 顶点色：r = 随机种子，g = 是否为碎片（1 = 残留尖片，边缘更脏），b = 屋顶
// 不再使用大块迷彩斑；粗糙度 0.05~0.3 随污垢变化；锈水从上方横梁流下的竖向锈痕
export function glassMaterial() {

	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.1, metalness: 0, transparent: true, side: THREE.DoubleSide, depthWrite: false, ior: 1.5 } );
	const p = positionWorld;
	const a = attribute( 'color', 'vec3' );
	const seed = a.r, shard = a.g, roof = a.b;
	const u = uv(); // 0~1 窗格局部坐标（碎片保留原窗格坐标），v=0 为下沿
	// 边框积灰：距四边的距离
	const ed = min( min( u.x, float( 1 ).sub( u.x ) ), min( u.y, float( 1 ).sub( u.y ) ) );
	const edge = smoothstep( 0.12, 0.0, ed );
	const gN = n01( vec3( p.x.mul( 3.5 ), p.y.mul( 3.5 ), p.z.mul( 3.5 ) ).add( seed.mul( 13 ) ), 3 );
	const grimeV = pow( float( 1 ).sub( u.y ), mix( float( 2.2 ), float( 2.5 ), roof ) );
	const grime = clamp( grimeV.mul( 0.75 ).add( edge.mul( 0.55 ) ).mul( gN.mul( 0.8 ).add( 0.45 ) ).add( shard.mul( 0.15 ) ), 0, 1 );
	// 雨水冲刷出的干净竖条
	const wash = smoothstep( 0.58, 0.78, n01( vec3( p.z.mul( 18 ).add( p.x.mul( 18 ) ), p.y.mul( 0.7 ), seed.mul( 7 ) ), 2 ) ).mul( float( 1 ).sub( roof ) );
	const g2 = clamp( grime.sub( wash.mul( 0.45 ) ), 0, 1 );
	// 锈痕：从横梁节点（上沿）向下
	const rustS = smoothstep( 0.72, 0.9, n01( vec3( p.z.mul( 11 ).add( p.x.mul( 11 ) ), p.y.mul( 0.35 ), seed.mul( 3 ) ), 2 ) ).mul( smoothstep( 0.35, 1.0, u.y ) ).mul( float( 1 ).sub( roof ) );
	// 屋顶：落叶/苔藓堆积在下沿与窗框边（俯视可见）
	const roofMoss = roof.mul( smoothstep( 0.55, 0.8, edge.mul( 0.7 ).add( pow( float( 1 ).sub( u.y ), 4 ).mul( 0.8 ) ).add( n01( p.mul( 5 ), 3 ).mul( 0.45 ) ).sub( 0.15 ) ) );
	const V = normalize( cameraPosition.sub( p ) );
	const NdV = abs( dot( normalWorldGeometry, V ) );
	const F = float( 0.04 ).add( float( 0.96 ).mul( pow( float( 1 ).sub( NdV ), 5 ) ) );
	const dirtCol = mix( vec3( 0.075, 0.072, 0.06 ), vec3( 0.055, 0.052, 0.042 ), roof );
	let col = mix( vec3( 0.02, 0.024, 0.023 ), dirtCol, g2 );
	col = mix( col, vec3( 0.09, 0.05, 0.028 ), rustS.mul( 0.7 ) );
	col = mix( col, vec3( look.mossDeep ).mul( mix( float( 0.5 ), float( 0.9 ), gN ) ), roofMoss );
	m.colorNode = col;
	m.roughnessNode = clamp( mix( float( 0.05 ), float( 0.32 ), g2 ).add( roofMoss.mul( 0.6 ) ).max( roof.mul( 0.45 ) ), 0.04, 1 );
	m.metalnessNode = float( 0 );
	m.opacityNode = clamp( float( 0.08 ).add( F.mul( mix( float( 0.85 ), float( 0.5 ), roof ) ) ).add( g2.mul( mix( float( 0.5 ), float( 0.4 ), roof ) ) ).add( rustS.mul( 0.25 ) ).add( roofMoss ), 0, 0.97 );
	m.aoNode = skyAO();
	return m;

}

// —— 常春藤叶片（真实网格叶，第三轮重写）——
// · 反照率线性 0.08~0.15 的灰绿（实例色），叶脉由 uv 生成并同时驱动法线扰动
// · 背光透射：mix(albedo, albedo*vec3(0.9,1.1,0.5), saturate(dot(-N,L))*0.6) + 天光包裹项
// · 接受 GTAO 与巷道天空遮蔽；粗糙度 0.55
export const leafLook = { trans: uniform( 0.6 ), wrap: uniform( 0.35 ), skyTint: uniform( new THREE.Color( 0.55, 0.62, 0.66 ) ) };
export function leafMaterial() {

	const m = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.55, metalness: 0, side: THREE.DoubleSide, specularIntensity: 0.45, specularColor: new THREE.Color( 0.8, 1.0, 0.7 ) } );
	const u = uv(); // x：横向 -1~1，y：沿主脉 0（叶柄）~1（叶尖）
	const p = positionWorld;
	// 掌状叶脉：从叶基放射的 5 条主脉 + 细网脉
	const ang = atan( u.x, u.y.add( 0.15 ) );
	const rays = abs( sin( ang.mul( 2.5 ) ) ); // 5 条
	const vMain = smoothstep( 0.07, 0.0, rays.mul( length( vec2( u.x, u.y.add( 0.15 ) ) ).add( 0.05 ) ) );
	const net = smoothstep( 0.82, 1.0, mx_worley_noise_float( vec3( u.mul( 9 ), 1.3 ) ).oneMinus() ).mul( 0.35 );
	const vein = clamp( vMain.add( net ), 0, 1 );
	const base = instanceColor;
	// 叶缘略黄、叶面斑驳（低频）
	const blot = n01( p.mul( 18 ), 2 );
	let col = base.mul( mix( float( 1 ), float( 1.35 ), vein ) ).mul( blot.mul( 0.3 ).add( 0.85 ) );
	const edge = smoothstep( 0.55, 0.95, length( u.mul( vec2( 1.1, 1.0 ) ).sub( vec2( 0, 0.45 ) ) ) );
	col = mix( col, col.mul( vec3( 1.25, 1.1, 0.6 ) ), edge.mul( 0.35 ) );
	m.colorNode = col;
	// 法线：叶脉凹陷 + 叶肉鼓起
	m.normalNode = bumpFromHeight( vein.mul( - 0.0012 ).add( blot.mul( 0.0004 ) ), float( 1.0 ) );
	m.roughnessNode = mix( float( 0.5 ), float( 0.7 ), vein );
	m.metalnessNode = float( 0 );
	// 透射（正面/背面都算）：主光从背面透过叶片 + 天光从背面包裹
	const N = normalWorldGeometry.mul( faceDirection );
	const sky = skyAO();
	const backSun = clamp( dot( N, look.sunDir ).negate(), 0, 1 ).mul( leafLook.trans );
	const backSky = clamp( N.y.negate().add( leafLook.wrap ).div( float( 1 ).add( leafLook.wrap ) ), 0, 1 ).mul( 0.5 ).add( 0.25 );
	const transCol = col.mul( vec3( 0.9, 1.1, 0.5 ) );
	m.emissiveNode = transCol.mul( backSun.mul( look.sunI ).mul( 0.6 ).add( backSky.mul( vec3( leafLook.skyTint ) ).mul( 0.22 ) ) ).mul( sky );
	m.aoNode = sky;
	return m;

}

// 草叶：根部暗 → 叶尖浅黄绿；视角相关光泽 + 透射 + 风摆（顶点位移按 uv.y² 加权）
export const windT = uniform( 0 );
export function grassMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0, side: THREE.DoubleSide } );
	const t = uv().y;
	const p = positionWorld;
	const tip = smoothstep( 0.0, 1.0, t );
	const col = instanceColor.mul( mix( vec3( 0.32, 0.38, 0.28 ), vec3( 1.35, 1.3, 0.8 ), tip ) );
	m.colorNode = col;
	const V = normalize( cameraPosition.sub( p ) );
	const N = normalWorldGeometry.mul( faceDirection );
	const sheen = pow( float( 1 ).sub( abs( dot( N, V ) ) ), 4 ).mul( 0.5 ).mul( tip );
	const sky = skyAO();
	const back = clamp( dot( N, look.sunDir ).negate(), 0, 1 ).mul( 0.4 ).add( 0.15 );
	m.emissiveNode = col.mul( vec3( 0.9, 1.1, 0.5 ) ).mul( back.mul( tip ) ).mul( 0.35 ).mul( sky ).add( vec3( leafLook.skyTint ).mul( sheen ).mul( 0.05 ).mul( sky ) );
	// 风：低频世界噪声驱动的摆动（只动顶部）
	const w = mx_noise_float( vec3( p.x.mul( 0.6 ).add( windT.mul( 0.7 ) ), p.z.mul( 0.6 ), windT.mul( 0.3 ) ) );
	m.positionNode = positionLocal.add( vec3( w.mul( 0.06 ), 0, w.mul( 0.035 ) ).mul( t.mul( t ) ) );
	m.roughnessNode = mix( float( 0.75 ), float( 0.5 ), tip );
	m.aoNode = smoothstep( 0.0, 0.6, t ).mul( 0.7 ).add( 0.3 ).mul( sky );
	return m;

}

// 实景植物贴图（weed_plant_02 / fern_02 / nettle 等 Poly Haven 叶片图集）：
// 取贴图亮度细节重新着色（去掉偏黄），背光透射，alphaTest 镂空
export function atlasFoliageMaterial( id, tint = new THREE.Color( 0.07, 0.1, 0.035 ), { tex: texId = id, alphaTest = 0.5 } = {} ) {

	const diff = loadTexture( `models/${id}/textures/${texId}_diff_1k.jpg`, { srgb: true } );
	const alpha = loadTexture( `models/${id}/textures/${texId}_alpha_1k.jpg` );
	const nor = loadTexture( `models/${id}/textures/${texId}_nor_gl_1k.jpg` );
	for ( const t of [ diff, alpha, nor ] ) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set( 1, 1 ); }
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0, side: THREE.DoubleSide } );
	const tx = texture( diff, uv() );
	const l = luminance( tx.rgb );
	// 原贴图里的枯黄斑保留为偏褐，绿色重新映射到指定灰绿
	const warm = smoothstep( 0.02, 0.12, tx.r.sub( tx.g.mul( 0.85 ) ) );
	const c = mix( vec3( tint ), vec3( tint ).mul( vec3( 1.6, 1.05, 0.55 ) ), warm ).mul( l.mul( 4.0 ) );
	m.colorNode = c.mul( instanceColor );
	m.opacityNode = texture( alpha, uv() ).r;
	m.alphaTest = alphaTest;
	m.normalNode = normalMap( texture( nor, uv() ), vec2( 0.8 ) );
	const N = normalWorldGeometry.mul( faceDirection );
	const sky = skyAO();
	const back = clamp( dot( N, look.sunDir ).negate(), 0, 1 ).mul( 0.6 ).add( 0.2 );
	m.emissiveNode = c.mul( instanceColor ).mul( vec3( 0.9, 1.1, 0.5 ) ).mul( back ).mul( 0.3 ).mul( sky );
	m.aoNode = sky;
	return m;

}

// 程序化蕨叶卡片：羽状小叶由 alpha 生成（uv.x 横向 -1~1，uv.y 沿叶轴）
export function fernMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.65, metalness: 0, side: THREE.DoubleSide } );
	const u = uv();
	const ax = abs( u.x );
	const k = fract( u.y.mul( 16 ) );
	const width = sin( u.y.mul( Math.PI ) ).mul( 0.95 ).mul( float( 1 ).sub( u.y.mul( 0.35 ) ) );
	const leaflet = smoothstep( 0.5, 0.3, abs( k.sub( 0.5 ).add( ax.mul( 0.35 ) ) ) ).mul( step( ax, width ) );
	const rachis = step( ax, 0.04 );
	m.opacityNode = max( leaflet, rachis );
	m.alphaTest = 0.5;
	m.colorNode = instanceColor.mul( mix( float( 0.6 ), float( 1.1 ), smoothstep( 0.0, 0.5, u.y ) ) ).mul( mix( float( 1 ), float( 0.7 ), rachis ) );
	m.aoNode = skyAO().mul( smoothstep( 0.0, 0.4, u.y ).mul( 0.5 ).add( 0.5 ) );
	return m;

}

// 藤蔓茎 / 电缆
export function stemMaterial( c = new THREE.Color( 0.04, 0.032, 0.022 ) ) {

	const m = new THREE.MeshStandardNodeMaterial( { color: c, roughness: 0.8 } );
	m.aoNode = skyAO();
	return m;

}

// 普通混凝土（温室矮墙、压顶、女儿墙等）：带苔藓、雨痕与锈迹流痕
export function concreteMaterial( { tint = new THREE.Color( 0.42, 0.43, 0.41 ), moss = 0.5, rustDrips = false } = {} ) {

	const id = 'concrete_wall_008';
	const diff = tex( id, '2k', 'diff', true ), nor = tex( id, '2k', 'nor_gl' ), arm = tex( id, '2k', 'arm' );
	const md = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0 } );
	const p = positionWorld;
	const hc = hexCoords( uv(), 1.3 );
	const t = hexTex( diff, hc ).rgb;
	const armT = hexTex( arm, hc ).rgb;
	const l = luminance( t );
	let col = mix( vec3( l ), t, 0.35 ).mul( vec3( tint ) );
	const sn = n01( vec3( p.x.mul( 4 ), p.y.mul( 0.12 ), p.z.mul( 4 ) ), 3 );
	col = col.mul( float( 1 ).sub( smoothstep( 0.5, 0.8, sn ).mul( 0.5 ) ) );
	if ( rustDrips ) {

		// 立柱底座下方的锈迹流痕
		const dz = abs( fract( float( L.Z1 ).sub( p.z ).div( L.BAY ) ).sub( 0.5 ).abs().sub( 0.5 ) ).mul( L.BAY );
		const rd = smoothstep( 0.1, 0.0, dz.add( n01( vec3( p.z.mul( 30 ), p.y.mul( 2 ), 1 ), 2 ).sub( 0.5 ).mul( 0.08 ) ) ).mul( smoothstep( 0.0, 0.7, p.y ) );
		col = mix( col, vec3( 0.07, 0.04, 0.025 ), rd.mul( 0.75 ) );

	}

	const up = normalWorldGeometry.y;
	const mm = smoothstep( 0.55, 0.7, n01( p.mul( 0.9 ), 4 ).add( smoothstep( 0.3, 0.9, up ).mul( 0.3 ) ).add( smoothstep( 1.2, 0, p.y ).mul( 0.2 ) ) ).mul( moss );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 2 ), 2 ) ).mul( luminance( texture( md, uv().mul( 1.3 ) ).rgb ).mul( 4 ).add( 0.25 ) );
	m.colorNode = mix( col, mossCol, mm ).mul( n01( p.mul( 0.3 ), 3 ).mul( 0.4 ).add( 0.8 ) );
	m.normalNode = normalMap( hexTex( nor, hc ) );
	m.roughnessNode = mix( armT.g, float( 0.95 ), mm );
	m.aoNode = armT.r.mul( skyAO() );
	return m;

}

// 暗色内部（窗洞后面）
export function darkMaterial( c = 0x050605 ) {

	return new THREE.MeshStandardNodeMaterial( { color: c, roughness: 1 } );

}

// —— 屋面：沥青防水卷材（分幅接缝、补丁）+ 砾石 + 积水 + 角落苔藓（遮罩由顶点色 g 给出）——
export function roofMaterial() {

	const asphalt = tex( 'asphalt_02', '2k', 'diff', true ), anor = tex( 'asphalt_02', '2k', 'nor_gl' );
	const gravel = tex( 'aerial_grass_rock', '1k', 'diff', true );
	const md = tex( 'concrete_moss', '2k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0 } );
	const p = positionWorld;
	const q = vec2( p.x, p.z );
	const hc = hexCoords( q.mul( 0.35 ), 1.2 );
	const t = hexTex( asphalt, hc ).rgb;
	// 卷材分幅（沿 x 每 1m 一幅，搭接处深色接缝）+ 补丁块
	const sx = fract( p.x.sub( L.WALL_X ).add( 0.3 ) );
	const lap = smoothstep( 0.04, 0.0, abs( sx.sub( 0.02 ) ) );
	const patch = smoothstep( 0.6, 0.62, n01( vec3( p.x.mul( 0.5 ), 0, p.z.mul( 0.5 ) ).floor().add( 0.37 ), 1 ) );
	let base = mix( vec3( luminance( t ) ), t, 0.2 ).mul( 0.3 ).mul( n01( vec3( p.x.mul( 0.25 ), 1, p.z.mul( 0.25 ) ), 3 ).mul( 0.5 ).add( 0.7 ) );
	base = mix( base, base.mul( 0.6 ), patch.mul( 0.5 ) ).mul( float( 1 ).sub( lap.mul( 0.4 ) ) );
	// 压载砾石区域
	const gv = smoothstep( 0.45, 0.6, n01( vec3( p.x.mul( 0.3 ), 3, p.z.mul( 0.3 ) ), 3 ) );
	const gcol = mix( vec3( luminance( texture( gravel, q.mul( 0.7 ) ).rgb ) ), texture( gravel, q.mul( 0.7 ) ).rgb, 0.2 ).mul( 0.5 );
	base = mix( base, gcol, gv );
	// 角落/女儿墙根的苔藓（顶点色 g = 距女儿墙的近度），以及积水
	const corner = attribute( 'color', 'vec3' ).g;
	const mm = smoothstep( 0.45, 0.65, corner.mul( 0.8 ).add( n01( p.mul( 1.4 ), 3 ).mul( 0.5 ) ) );
	const mossCol = mix( vec3( look.mossDeep ), vec3( look.mossLight ), n01( p.mul( 1.3 ), 3 ) ).mul( luminance( texture( md, q.mul( 0.6 ) ).rgb ).mul( 7 ).add( 0.3 ) );
	const wn = n01( vec3( p.x.mul( 0.4 ), 3, p.z.mul( 0.4 ) ), 3 ).add( n01( p.mul( 3 ), 2 ).mul( 0.05 ) );
	const water = smoothstep( 0.6, 0.62, wn ).mul( float( 1 ).sub( mm ) ).mul( float( 1 ).sub( gv ) );
	const wetHalo = smoothstep( 0.48, 0.58, wn ).mul( float( 1 ).sub( mm ) );
	let col = mix( base, mossCol, mm );
	col = col.mul( float( 1 ).sub( wetHalo.mul( 0.4 ) ) );
	m.colorNode = mix( col, col.mul( 0.3 ), water );
	m.roughnessNode = mix( mix( mix( float( 0.8 ), float( 0.95 ), mm ), float( 0.35 ), wetHalo ), float( 0.04 ), water );
	m.normalNode = mix( normalMap( hexTex( anor, hc ) ), normalView, water );
	return m;

}

// 金属设备外壳（空调机组、通风帽）：漆面 + 锈斑 + 流痕 + 顶面苔藓
export function hvacMaterial( paint = new THREE.Color( 0.18, 0.19, 0.18 ) ) {

	const rt = tex( 'rusty_painted_metal', '1k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.5 } );
	const p = positionWorld;
	const n = normalWorldGeometry.abs();
	const t = texture( rt, vec2( p.z, p.y ).mul( 0.8 ) ).rgb.mul( n.x ).add( texture( rt, vec2( p.x, p.z ).mul( 0.8 ) ).rgb.mul( n.y ) ).add( texture( rt, vec2( p.x, p.y ).mul( 0.8 ) ).rgb.mul( n.z ) );
	const rust = smoothstep( 0.1, 0.25, t.r.sub( t.b ) );
	const streak = smoothstep( 0.6, 0.8, n01( vec3( p.x.mul( 12 ), p.y.mul( 0.6 ), p.z.mul( 12 ) ), 2 ) );
	let col = mix( vec3( paint ).mul( luminance( t ).mul( 1.5 ).add( 0.4 ) ), t.mul( vec3( 0.35, 0.25, 0.18 ) ), rust );
	col = col.mul( float( 1 ).sub( streak.mul( 0.35 ) ) );
	const mossTop = smoothstep( 0.6, 0.95, normalWorldGeometry.y ).mul( smoothstep( 0.5, 0.7, n01( p.mul( 2.5 ), 3 ) ) );
	m.colorNode = mix( col, vec3( look.mossLight ).mul( 0.8 ), mossTop );
	m.roughnessNode = mix( float( 0.55 ), float( 0.9 ), max( rust, mossTop ) );
	m.metalnessNode = mix( float( 0.5 ), float( 0 ), max( rust, mossTop ) );
	return m;

}

// 积水水面：反射全部由反射节点给出（PBR 部分粗糙度 1，避免与环境高光重复计算天空）+ 浮膜区域减弱
export function waterMaterial( refl ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1, metalness: 0, transparent: true } );
	const p = positionWorld;
	const rip = mx_noise_float( vec3( p.x.mul( 9 ), p.z.mul( 9 ), 1.0 ) ).mul( 0.5 ).add( mx_noise_float( vec3( p.x.mul( 30 ), p.z.mul( 30 ), 3 ) ).mul( 0.2 ) );
	const film = smoothstep( 0.62, 0.8, n01( vec3( p.x.mul( 2 ), 0, p.z.mul( 2 ) ), 3 ) );
	const V = normalize( cameraPosition.sub( p ) );
	const F = float( 0.02 ).add( float( 0.98 ).mul( pow( float( 1 ).sub( max( V.y, 0 ) ), 5 ) ) );
	if ( refl ) refl.uvNode = refl.uvNode.add( vec2( rip, rip.mul( 0.7 ) ).mul( 0.003 ) );
	m.colorNode = mix( vec3( 0.004, 0.005, 0.004 ), vec3( 0.02, 0.02, 0.014 ), film );
	m.emissiveNode = refl ? refl.rgb.mul( F.mul( 0.55 ).add( 0.01 ) ).mul( float( 1 ).sub( film.mul( 0.6 ) ) ) : vec3( 0 );
	// 垂直看时浑水半透明（能看到水下的板与落叶），掠射角接近全反射
	m.opacityNode = mix( float( 0.45 ), float( 1 ), F.mul( 1.5 ).clamp() ).max( film.mul( 0.7 ) );
	return m;

}

// ———————————————————————— 杂项材质（道具、远景、灯具）————————————————————————
// 金属漆面 + 锈（自行车、卷盘、灯具、电箱）
export function paintedMetal( paint, rustAmt = 0.6, rough = 0.55 ) {

	const rt = tex( 'rust_coarse_01', '1k', 'diff', true );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: rough, metalness: 0.5 } );
	const p = positionWorld;
	const n = normalWorldGeometry.abs();
	const t = texture( rt, vec2( p.z, p.y ).mul( 1.5 ) ).rgb.mul( n.x ).add( texture( rt, vec2( p.x, p.z ).mul( 1.5 ) ).rgb.mul( n.y ) ).add( texture( rt, vec2( p.x, p.y ).mul( 1.5 ) ).rgb.mul( n.z ) );
	const rr = smoothstep( 0.45, 0.65, n01( p.mul( 6 ), 3 ).add( smoothstep( 0.5, 0.0, p.y ).mul( 0.15 ) ) ).mul( rustAmt );
	const rust = mix( vec3( luminance( t ) ), t, 0.5 ).mul( vec3( 0.42, 0.3, 0.22 ) );
	m.colorNode = mix( vec3( paint ).mul( n01( p.mul( 9 ), 2 ).mul( 0.4 ).add( 0.8 ) ), rust, rr );
	m.roughnessNode = mix( float( rough ), float( 0.9 ), rr );
	m.metalnessNode = mix( float( 0.5 ), float( 0 ), rr );
	m.aoNode = skyAO();
	return m;

}

// 简单的「贴图细节 × 指定色」材质（木板、地砖、远处地面、布料）
export function tintedMaterial( id, res, color, { scale = 1, rough = 0.85, world = 'uv', side = THREE.FrontSide, moss = 0 } = {} ) {

	const d = tex( id, res, 'diff', true ), nr = tex( id, res, 'nor_gl' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: rough, metalness: 0, side } );
	const p = positionWorld;
	const q = world === 'xz' ? vec2( p.x, p.z ).mul( scale ) : uv().mul( scale );
	const hc = hexCoords( q, 1.2 );
	const t = hexTex( d, hc ).rgb;
	let col = mix( vec3( luminance( t ) ), t, 0.4 ).mul( vec3( color ) ).mul( 2.2 ).mul( n01( p.mul( 0.7 ), 3 ).mul( 0.4 ).add( 0.8 ) );
	if ( moss > 0 ) col = mix( col, vec3( look.mossDeep ).mul( 1.5 ), smoothstep( 0.5, 0.7, n01( p.mul( 0.8 ), 4 ) ).mul( moss ) );
	m.colorNode = col;
	m.normalNode = normalMap( hexTex( nr, hc ) );
	m.aoNode = skyAO();
	return m;

}

// 接触阴影：径向渐变贴花（乘性变暗）
export function contactAOMaterial() {

	const m = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false } );
	const d = length( uv().sub( 0.5 ) ).mul( 2 );
	m.colorNode = vec3( 0, 0, 0 );
	m.opacityNode = smoothstep( 1.0, 0.1, d ).pow( 1.5 ).mul( 0.6 );
	m.polygonOffset = true; m.polygonOffsetFactor = - 2;
	return m;

}

// ez-tree 的树皮/树叶：替换为节点材质（压暗去饱和，远景剪影）
export function barkMaterial( map ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0 } );
	m.colorNode = map ? vec3( luminance( texture( map ).rgb ) ).mul( vec3( 0.09, 0.085, 0.075 ) ) : vec3( 0.04, 0.035, 0.03 );
	return m;

}

export function treeLeafMaterial( map ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.75, metalness: 0, side: THREE.DoubleSide } );
	if ( map ) {

		const t = texture( map );
		m.opacityNode = t.a;
		m.alphaTest = 0.5;
		m.colorNode = vec3( luminance( t.rgb ) ).mul( vec3( 0.07, 0.1, 0.04 ) ).mul( n01( positionWorld.mul( 0.6 ), 2 ).mul( 0.6 ).add( 0.7 ) );

	} else m.colorNode = vec3( 0.03, 0.045, 0.02 );

	return m;

}

// 花盆（实例色，陶土 + 青苔 + 白色盐霜）
export function potMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.85, metalness: 0, side: THREE.DoubleSide } );
	const p = positionWorld;
	const efflo = smoothstep( 0.55, 0.8, n01( p.mul( 14 ), 3 ) ).mul( 0.35 );
	const moss = smoothstep( 0.6, 0.75, n01( p.mul( 6 ), 3 ) ).mul( 0.6 );
	m.colorNode = mix( mix( instanceColor, vec3( 0.2, 0.19, 0.17 ), efflo ), vec3( look.mossDeep ).mul( 1.5 ), moss );
	m.aoNode = skyAO();
	return m;

}

// 发光灯面
export function lampMaterial() {

	return new THREE.MeshBasicNodeMaterial( { color: new THREE.Color( 0.9, 0.95, 1.0 ).multiplyScalar( 60 ), side: THREE.DoubleSide } );

}
