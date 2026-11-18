// 废土化材质系统（TSL）
// 给任意 PBR 材质叠加三层「时间痕迹」，全部在世界空间计算，因此模块化资产拼接处不会出现接缝：
//   1. 苔藓/泥土覆盖：朝上的表面 + 噪声遮罩 + 靠近地面更多
//   2. 潮湿：整体变暗、粗糙度降低（西雅图常年阴雨）
//   3. 水渍/污垢：墙面自上而下的雨痕、墙根的泥水溅痕
// 参数全部是 uniform，可在调试面板实时调节
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec3, mix, smoothstep, clamp, positionWorld, normalWorldGeometry,
	mx_fractal_noise_float, materialColor, materialRoughness, texture, luminance,
} from 'three/tsl';

export const weather = {
	wetness: uniform( 0.55 ),
	mossAmount: uniform( 0.45 ),
	creep: uniform( 0.6 ), // 墙面植物蔓延高度系数
	mossColor: uniform( new THREE.Color( 0x34401f ) ),
	dirtAmount: uniform( 0.6 ),
	dirtColor: uniform( new THREE.Color( 0x2e2a22 ) ),
	streaks: uniform( 0.5 ),
};

// 共享的苔藓细节贴图（由 main.js 加载后设置）
export const mossTex = { map: null };

// 贴图亮度细节 × 目标色（leafy_grass 线性空间平均亮度约 0.2，归一化到 1）
export const tintDetail = ( rgb, tint ) => vec3( tint ).mul( luminance( rgb ).mul( 3.2 ) );

// 计算覆盖遮罩，返回 { moss, dirt, streak }
const masks = Fn( ( [ strength ] ) => {

	const p = positionWorld;
	const up = normalWorldGeometry.y;
	const n1 = mx_fractal_noise_float( p.mul( 0.35 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const n2 = mx_fractal_noise_float( p.mul( 2.1 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

	// 苔藓：朝上面 + 地面附近（墙根）+ 墙面上向上蔓延的不规则斑块（模拟藤蔓/爬墙植物）
	const upFacing = smoothstep( 0.35, 0.9, up );
	const vertical = smoothstep( 0.5, 0.1, up.abs() );
	const nearGround = smoothstep( 1.6, 0.0, p.y ).mul( vertical );
	const creepH = mx_fractal_noise_float( vec3( p.x.mul( 0.25 ), 0, p.z.mul( 0.25 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ).mul( 9.0 ).mul( weather.creep );
	const creep = smoothstep( creepH, creepH.sub( 2.5 ), p.y ).mul( vertical ).mul( n2.mul( 0.8 ).add( 0.4 ) );
	const mossBase = upFacing.add( nearGround.mul( 0.8 ) ).add( creep ).mul( smoothstep( 0.35, 0.75, n1 ).mul( 1.3 ) ).mul( n2.mul( 0.7 ).add( 0.5 ) );
	const moss = smoothstep( float( 0.9 ).sub( weather.mossAmount.mul( strength ) ), float( 1.15 ).sub( weather.mossAmount.mul( strength ) ), mossBase );

	// 墙根泥水溅痕
	const dirt = smoothstep( 1.2, 0.0, p.y ).mul( n2.mul( 0.7 ).add( 0.5 ) ).mul( weather.dirtAmount ).clamp();

	// 竖直雨痕：在 x/z 方向上用拉伸噪声
	const sn = mx_fractal_noise_float( vec3( p.x.mul( 3.0 ), p.y.mul( 0.15 ), p.z.mul( 3.0 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const streak = smoothstep( 0.55, 0.85, sn ).mul( vertical ).mul( weather.streaks );

	return vec3( moss, dirt, streak );

} );

/**
 * 给材质叠加废土层。
 * @param {THREE.MeshStandardNodeMaterial} mat
 * @param {object} opt  strength: 覆盖强度（0~1.5），wet: 是否受潮湿影响
 */
export function weathered( mat, { strength = 1, wet = true } = {} ) {

	const s = float( strength );
	const m = masks( s );
	const moss = m.x, dirt = m.y, streak = m.z;

	let mossCol = vec3( weather.mossColor );
	// 取贴图亮度作细节，再用美术指定的绿色重新着色（Poly Haven 的草/苔藓贴图都偏枯黄）
	if ( mossTex.map ) mossCol = tintDetail( texture( mossTex.map, positionWorld.xz.mul( 0.5 ) ).rgb, weather.mossColor );

	const base = materialColor.rgb;
	let col = mix( base, base.mul( vec3( weather.dirtColor ).mul( 2.2 ) ), dirt.mul( 0.7 ) );
	col = col.mul( float( 1 ).sub( streak.mul( 0.35 ) ) );
	col = mix( col, mossCol, moss );
	const wetK = wet ? weather.wetness : float( 0 );
	// 潮湿：多孔表面吸水变暗
	col = col.mul( mix( float( 1 ), float( 0.62 ), wetK.mul( float( 1 ).sub( moss.mul( 0.5 ) ) ) ) );
	mat.colorNode = col;

	const rough = materialRoughness;
	const wetRough = mix( rough, rough.mul( 0.45 ), wetK.mul( float( 1 ).sub( moss ) ) );
	mat.roughnessNode = clamp( mix( wetRough, float( 0.95 ), moss ), 0.04, 1 );
	return mat;

}

// 地面专用：积水坑（低洼处镜面反射）
export const puddle = {
	amount: uniform( 0.45 ),
	scale: uniform( 0.12 ),
};

export function puddleGround( mat ) {

	const p = positionWorld;
	const n = mx_fractal_noise_float( vec3( p.x, 0, p.z ).mul( puddle.scale ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const edge = mx_fractal_noise_float( vec3( p.x, 0, p.z ).mul( 1.7 ), 2, 2.0, 0.5 ).mul( 0.05 );
	const water = smoothstep( float( 0.72 ).sub( puddle.amount.mul( 0.35 ) ), float( 0.76 ).sub( puddle.amount.mul( 0.35 ) ), n.add( edge ) );
	const damp = smoothstep( float( 0.55 ).sub( puddle.amount.mul( 0.35 ) ), float( 0.75 ).sub( puddle.amount.mul( 0.35 ) ), n );

	const base = materialColor.rgb;
	const wetK = weather.wetness;
	let col = base.mul( mix( float( 1 ), float( 0.6 ), wetK.max( damp ) ) );
	col = mix( col, col.mul( 0.35 ).add( vec3( 0.01, 0.012, 0.012 ) ), water );
	mat.colorNode = col;
	const r = materialRoughness;
	mat.roughnessNode = mix( mix( r, r.mul( 0.5 ), wetK.max( damp.mul( 0.8 ) ) ), float( 0.03 ), water );
	// 积水处压平法线（水面是平的）
	mat.userData.puddleMask = water;
	return { water };

}
