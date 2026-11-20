// 淹水中庭：材质库（TSL）
// 共同点：贴图双尺度混合消除平铺重复；水线附近的湿痕/藻类带；竖向水渍流痕；整体压暗（废弃 20 年、无人维护）
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, texture, uv, positionWorld, positionLocal,
	normalWorldGeometry, mx_fractal_noise_float, mx_noise_float, luminance, normalMap, instanceIndex, hash, abs, max, min, pow, attribute,
} from 'three/tsl';
import { texSet } from './util.js';

export const WATER_Y = 0;
// TSL vec3 expects vector components; Color stores r/g/b, not x/y/z.
const colorVector = hex => { const c = new THREE.Color(hex); return vec3(c.r,c.g,c.b); };

// 双尺度采样：大尺度噪声在两个不同缩放/偏移的采样之间混合，打散平铺
function detiled( map, uvN, p ) {

	const n = smoothstep( 0.35, 0.65, mx_noise_float( p.mul( 0.23 ) ).mul( 0.5 ).add( 0.5 ) );
	const a = texture( map, uvN );
	const b = texture( map, uvN.mul( 0.61 ).add( vec2( 0.37, 0.71 ) ) );
	return mix( a, b, n );

}

// 水线：水面上方 0~1.1m 的深色湿痕 + 藻类，紧贴水面的一圈最湿最亮
export const waterlineMask = ( p ) => {

	const h = p.y.sub( WATER_Y );
	const jag = mx_fractal_noise_float( vec3( p.x.mul( 1.7 ), 0, p.z.mul( 1.7 ) ), 3, 2.0, 0.5 ).mul( 0.25 );
	const band = smoothstep( float( 1.15 ).add( jag ), float( 0.55 ).add( jag ), h );
	const wetLip = smoothstep( 0.22, 0.0, h );
	return { band, wetLip };

};

/**
 * 室内建筑材质：墙、柱、天花、平台
 * opt: id 贴图组, scale UV 缩放（几何体 UV 单位为米）, tint 颜色乘子, rough 粗糙度乘子, streak 流痕强度, metal
 */
export function archMaterial( id, { scale = 0.5, tint = 0xffffff, dark = 1, streak = 0.6, moss = 0.35, rough = 1, metal = null, res = '1k', side = THREE.FrontSide } = {} ) {

	const T = texSet( id, res );
	const m = new THREE.MeshStandardNodeMaterial( { side } );
	const p = positionWorld;
	const uvN = uv().mul( scale );
	const base = detiled( T.map, uvN, p ).rgb.mul( colorVector( tint ) ).mul( dark );
	const arm = detiled( T.arm, uvN, p );
	const { band, wetLip } = waterlineMask( p );

	// 大尺度明暗斑驳（避免整面均匀）
	const blot = mx_fractal_noise_float( p.mul( 0.45 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	let col = base.mul( mix( 0.55, 1.2, blot ) );

	// 竖向黑色水渍流痕：x/z 方向高频、y 方向极低频的拉伸噪声
	const sn = mx_fractal_noise_float( vec3( p.x.mul( 4.0 ), p.y.mul( 0.12 ), p.z.mul( 4.0 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const vert = smoothstep( 0.6, 0.2, normalWorldGeometry.y.abs() );
	const streakM = smoothstep( 0.5, 0.8, sn ).mul( vert ).mul( streak );
	col = col.mul( float( 1 ).sub( streakM.mul( 0.6 ) ) );

	// 苔藓/藻：水线带 + 朝上面
	const mossN = smoothstep( 0.45, 0.7, mx_fractal_noise_float( p.mul( 1.3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) );
	const mossM = clamp( band.mul( 0.8 ).add( smoothstep( 0.6, 0.95, normalWorldGeometry.y ).mul( 0.7 ) ), 0, 1 ).mul( mossN ).mul( moss );
	col = mix( col, vec3( 0.035, 0.05, 0.02 ).mul( mix( 0.6, 1.4, blot ) ), mossM );
	// 水线湿痕：吸水变暗
	col = col.mul( mix( float( 1 ), float( 0.42 ), band ) );

	m.colorNode = col;
	m.normalNode = normalMap( texture( T.normalMap, uvN ), vec2( 0.9, 0.9 ) );
	let r = arm.g.mul( rough );
	r = mix( r, r.mul( 0.5 ), band );
	r = mix( r, float( 0.12 ), wetLip );
	m.roughnessNode = clamp( mix( r, float( 0.9 ), mossM ), 0.05, 1 );
	m.metalnessNode = metal !== null ? float( metal ) : arm.b;
	m.aoNode = arm.r;
	return m;

}

/**
 * 油漆钢材（门框/拱形钢架/梁）：深色油漆 + 剥落露锈 + 锈迹流痕
 */
export function paintedSteel( { paint = 0x1d2321, scale = 1.2, rustAmt = 0.55 } = {} ) {

	const R = texSet( 'rusty_metal_02' );
	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const uvN = uv().mul( scale );
	const rustTex = texture( R.map, uvN ).rgb;
	const n = mx_fractal_noise_float( p.mul( 3.1 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
	const n2 = mx_fractal_noise_float( p.mul( 0.7 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const chip = smoothstep( 0.72 - rustAmt * 0.2, 0.78 - rustAmt * 0.12, n.mul( 0.7 ).add( n2.mul( 0.45 ) ) );
	const paintCol = colorVector( paint ).mul( mix( 0.7, 1.25, n2 ) );
	const rustCol = rustTex.mul( vec3( 0.55, 0.36, 0.22 ) ).mul( 0.7 );
	// 锈迹往下流
	const sn = mx_fractal_noise_float( vec3( p.x.mul( 9.0 ), p.y.mul( 0.5 ), p.z.mul( 9.0 ) ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const run = smoothstep( 0.62, 0.85, sn ).mul( 0.6 );
	let col = mix( paintCol, rustCol, max( chip, run.mul( 0.7 ) ) );
	const { band } = waterlineMask( p );
	col = col.mul( mix( float( 1 ), float( 0.5 ), band ) );
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.55 ), float( 0.85 ), chip ).mul( mix( float( 1 ), float( 0.6 ), band ) );
	m.metalnessNode = mix( float( 0.25 ), float( 0.1 ), chip );
	m.normalNode = normalMap( texture( R.normalMap, uvN ), vec2( 0.6, 0.6 ) );
	return m;

}

/**
 * 铝制划艇：橄榄绿旧漆 + 剥落露出氧化铝（金属度 1）+ 锈色/污水流痕 + 水线藻垢
 * 几何属性 wear：板缘/舷边/龙骨等凸起处 = 1（漆最先磨掉），板面中部 = 0；
 * 剥落遮罩 = wear 与噪声的组合 → 油漆保留在凹处与板面中间，边缘露铝
 * 用 positionLocal 做噪声，船晃动时花纹不漂移
 */
export function boatPaint( { inner = false } = {} ) {

	const G = texSet( 'green_metal_rust' );
	const R = texSet( 'rusty_metal_02' );
	const P = texSet( 'rusty_painted_metal' );
	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.FrontSide } );
	const pl = positionLocal;
	const uvN = uv().mul( 0.55 );
	const paintT = detiled( G.map, uvN, pl ).rgb;
	const chipT = texture( P.map, uv().mul( 0.9 ) ).rgb;
	const metalT = texture( R.map, uv().mul( 0.8 ) ).rgb;
	const arm = texture( G.arm, uvN );
	const wear = attribute( 'wear', 'float' );

	const n = mx_fractal_noise_float( pl.mul( 5.5 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
	const n2 = mx_fractal_noise_float( pl.mul( 1.3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const nf = mx_noise_float( pl.mul( 38 ) ).mul( 0.5 ).add( 0.5 ); // 细碎崩口
	// 剥落：边缘磨损（wear）+ 大块剥落 + 细碎崩点，贴图亮度再打散边界
	const chipField = n.mul( 0.55 ).add( n2.mul( 0.35 ) ).add( wear.mul( 0.32 ) ).add( nf.mul( 0.12 ) ).add( luminance( chipT ).mul( 0.18 ) );
	const chip = smoothstep( 0.86, 0.9, chipField );
	const chipEdge = smoothstep( 0.8, 0.86, chipField ).sub( chip ).max( 0 ); // 剥落边缘一圈翘起的暗色漆皮
	// 油漆：褪色橄榄绿，压暗（albedo ≤ 0.25）
	const lumP = luminance( paintT );
	const paint = mix( vec3( lumP ), paintT, 0.55 ).mul( vec3( 0.36, 0.42, 0.27 ) ).mul( mix( 0.55, 1.0, n2 ) ).min( 0.22 );
	// 裸铝：氧化的灰（0.55,0.56,0.55）带白色氧化斑与黄褐腐蚀
	const oxid = smoothstep( 0.4, 0.75, luminance( metalT ).add( n.mul( 0.3 ) ) );
	const alu = mix( vec3( 0.55, 0.56, 0.55 ), vec3( 0.42, 0.36, 0.28 ), oxid.mul( 0.6 ) );
	let col = mix( paint, alu, chip );
	col = col.mul( float( 1 ).sub( chipEdge.mul( 0.5 ) ) );

	// 锈色/污水流痕（自舷边向下）
	const sn = mx_fractal_noise_float( vec3( pl.x.mul( 9 ), pl.y.mul( 1.2 ), pl.z.mul( 9 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const run = smoothstep( 0.58, 0.82, sn ).mul( smoothstep( - 0.35, - 0.05, pl.y ) );
	col = mix( col, col.mul( vec3( 0.55, 0.38, 0.22 ) ), run.mul( 0.75 ) );

	// 水线：外壳世界 y < 0.07 一带藻垢（深绿褐），水线处一条亮一点的钙化/浮渣线
	const jag = mx_noise_float( pl.mul( vec3( 6, 0, 6 ) ) ).mul( 0.015 );
	const wl = smoothstep( 0.07, - 0.04, positionWorld.y.add( jag ) );
	const scumLine = smoothstep( 0.012, 0.0, positionWorld.y.sub( 0.035 ).add( jag ).abs() );
	col = mix( col, vec3( 0.028, 0.036, 0.016 ), wl.mul( 0.9 ) );
	col = mix( col, vec3( 0.12, 0.12, 0.08 ), scumLine.mul( 0.5 ) );
	// 粗糙度 0.35（磨亮的铝）~ 0.85（粉化旧漆 / 藻垢）
	let rough = mix( mix( float( 0.62 ), float( 0.82 ), arm.g ), mix( float( 0.35 ), float( 0.6 ), oxid ), chip );
	rough = mix( rough, float( 0.85 ), run.mul( 0.5 ) );
	rough = mix( rough, float( 0.3 ), wl.mul( smoothstep( - 0.02, 0.04, positionWorld.y ) ) ); // 刚出水的湿带

	if ( inner ) {

		// 艇内：底部积了泥和落叶、湿；越往上越干
		const M = texSet( 'brown_mud_leaves_01' );
		const mud = texture( M.map, pl.xz.mul( 0.9 ) ).rgb.mul( 0.35 );
		col = col.mul( 0.6 ).mul( mix( vec3( 1 ), vec3( 0.8, 0.85, 0.65 ), n2 ) );
		const depth = smoothstep( - 0.2, - 0.36, pl.y ).mul( smoothstep( 0.3, 0.55, n2.add( 0.25 ) ) );
		col = mix( col, mud, depth );
		// 积水水位留下的一圈污渍线
		const ring = smoothstep( 0.02, 0.0, pl.y.add( 0.37 ).abs() );
		col = mix( col, vec3( 0.06, 0.05, 0.03 ), ring.mul( 0.7 ) );
		rough = mix( rough, float( 0.5 ), depth );

	}

	m.colorNode = col;
	m.roughnessNode = rough.clamp( 0.3, 0.9 );
	m.metalnessNode = mix( float( 0.0 ), float( 1.0 ), chip.mul( float( 1 ).sub( wl ) ) );
	m.normalNode = normalMap( texture( P.normalMap, uv().mul( 0.9 ) ), vec2( 0.6, 0.6 ) );
	return m;

}

// 舱底浑浊积水：深褐绿、几乎不透，带漂浮的油膜与浮渣
export function bilgeWater() {

	const m = new THREE.MeshStandardNodeMaterial( { metalness: 0 } );
	const pl = positionLocal;
	const n = mx_fractal_noise_float( vec3( pl.x.mul( 3 ), 0, pl.z.mul( 3 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const scum = smoothstep( 0.55, 0.7, n );
	m.colorNode = mix( vec3( 0.02, 0.022, 0.012 ), vec3( 0.06, 0.055, 0.03 ), scum );
	m.roughnessNode = mix( float( 0.05 ), float( 0.6 ), scum );
	return m;

}

// 布料/绳子：hessian 粗麻贴图的亮度细节 × 指定颜色
export function fabric( { tint = 0x404030, scale = 1, rough = 0.9, side = THREE.FrontSide } = {} ) {

	const T = texSet( 'hessian_230' );
	const m = new THREE.MeshStandardNodeMaterial( { side } );
	const uvN = uv().mul( scale );
	const l = luminance( texture( T.map, uvN ).rgb ).mul( 2.2 );
	const n = mx_fractal_noise_float( positionLocal.mul( 7 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	m.colorNode = colorVector( tint ).mul( l ).mul( mix( 0.5, 1.0, n ) );
	m.roughnessNode = float( rough );
	m.normalNode = normalMap( texture( T.normalMap, uvN ), vec2( 0.7, 0.7 ) );
	return m;

}

// 铝管/铝板（座板角码、护舷、铆钉）：金属度 1 的氧化铝，磨亮的边、污垢
export function aluminium( { dirt = 0.6 } = {} ) {

	const R = texSet( 'rusty_metal_02' );
	const m = new THREE.MeshStandardNodeMaterial();
	const pl = positionLocal;
	const t = texture( R.map, uv().mul( 1.5 ) ).rgb;
	const n = mx_fractal_noise_float( pl.mul( 6 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const ox = smoothstep( 0.35, 0.7, luminance( t ).add( n.mul( 0.3 ) ) );
	const base = mix( vec3( 0.5, 0.51, 0.5 ), vec3( 0.32, 0.28, 0.22 ), ox.mul( 0.7 ) ).mul( mix( 1.0, 0.45, n.mul( dirt ) ) );
	m.colorNode = base;
	m.roughnessNode = mix( float( 0.38 ), float( 0.8 ), n.mul( 0.6 ).add( ox.mul( 0.4 ) ) );
	m.metalnessNode = float( 1 );
	m.normalNode = normalMap( texture( R.normalMap, uv().mul( 1.5 ) ), vec2( 0.4, 0.4 ) );
	return m;

}

// 旧木（桨、漂浮木板、座板）
export function oldWood( { tint = 0x6b5a48, scale = 1.5 } = {} ) {

	const W = texSet( 'weathered_planks' );
	const m = new THREE.MeshStandardNodeMaterial();
	const uvN = uv().mul( scale );
	const t = texture( W.map, uvN ).rgb;
	const n = mx_fractal_noise_float( positionLocal.mul( 3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	m.colorNode = t.mul( colorVector( tint ) ).mul( mix( 0.5, 1.0, n ) ).mul( 1.4 );
	m.roughnessNode = texture( W.arm, uvN ).g;
	m.normalNode = normalMap( texture( W.normalMap, uvN ) );
	return m;

}
