// 城市远景：大气与光照
//   · 太阳：高度角 38°，从镜头右后方斜射（侧逆光），暖色 #ffe7c2；4 级 CSM，最远级联 600 m → 树与楼在草地上投下长影
//   · 天光：HDRI 仅作环境反射/漫反射，强度压低并偏冷，阴影面约为受光面的 40%
//   · 天空：程序化（天顶蓝 → 地平线乳白雾带 + 太阳米氏光晕 + 两层噪声云），不再使用任何云网格
//   · 大气透视：指数高度雾沿视线解析积分（1 km 处约损失 45% 对比，远山约 70% 被雾吞没），朝太阳方向暖色内散射
//   · 调色：中间调对比 S 曲线、暖高光/冷阴影分离、只对远景去饱和（由雾完成）、2.5% 颗粒、0.15 暗角
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, exp, max, pow, clamp, dot, length,
	positionWorld, cameraPosition, positionWorldDirection, luminance, screenUV, time, fog, mx_fractal_noise_float,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { loadHDR } from '../world/assets.js';

// 太阳方位：镜头朝 -Z；方位角从 -Z 顺时针量（右为正）。110° = 右侧略偏后 → 面向镜头的立面掠射受光，右侧面全亮
const SUN_AZ = THREE.MathUtils.degToRad( 112 ), SUN_EL = THREE.MathUtils.degToRad( 38 );
export const SUN_DIR = new THREE.Vector3( Math.sin( SUN_AZ ) * Math.cos( SUN_EL ), Math.sin( SUN_EL ), - Math.cos( SUN_AZ ) * Math.cos( SUN_EL ) ).normalize();
// HDRI 自带太阳（原始方向约 (0.553,0.743,0.376)）旋转到与主光同一方位，保证环境反射的亮侧一致
const HDR_SUN_AZ = Math.atan2( 0.553, - 0.376 );
export const ENV_ROT = HDR_SUN_AZ - SUN_AZ;

export const air = {
	hazeColor: uniform( new THREE.Color( 0x9fb3c4 ).convertSRGBToLinear().multiplyScalar( 1.15 ) ), // 远景蓝灰（线性）
	sunHaze: uniform( new THREE.Color( 1.0, 0.84, 0.62 ) ), // 太阳方向散射暖色
	density: uniform( 0.0021 ), // Stronger separation between nearby ruins and the skyline.
	falloff: uniform( 1 / 900 ), // 高度衰减（1/标高）
	maxFog: uniform( 0.9 ),
	sunDir: uniform( SUN_DIR.clone() ),
	skyIntensity: uniform( 1.0 ),
	cloud: uniform( 0.55 ),
};

export const look = {
	exposure: 1.0,
	contrast: uniform( 1.18 ),
	saturation: uniform( 0.92 ),
	lift: uniform( 0.012 ),
	vignette: uniform( 0.15 ),
	grain: uniform( 0.025 ),
	greenDesat: uniform( 0.1 ),
};

// 米氏散射相位（简化）：朝太阳方向更亮更暖
const miePhase = ( mu ) => pow( mu, 5 ).mul( 0.45 ).add( pow( mu, 32 ).mul( 0.7 ) );

// 大气透视：返回 vec4(雾色, 雾因子)
const aerial = Fn( ( [ wp ] ) => {

	const cam = cameraPosition;
	const d = length( wp.sub( cam ) );
	const dir = wp.sub( cam ).div( max( d, 0.001 ) );
	// 指数高度雾沿视线解析积分：∫ density·exp(-h·k) ds
	const k = air.falloff;
	const h0 = cam.y, dy = wp.y.sub( cam.y );
	const kdy = dy.mul( k );
	const ratio = kdy.abs().lessThan( 1e-3 ).select( float( 1 ), float( 1 ).sub( exp( kdy.negate() ) ).div( kdy ) );
	const optical = air.density.mul( exp( h0.mul( k ).negate() ) ).mul( d ).mul( ratio );
	const f = float( 1 ).sub( exp( optical.negate() ) ).min( air.maxFog );
	const mu = max( dot( dir, air.sunDir ), 0 );
	const col = mix( vec3( air.hazeColor ), vec3( air.sunHaze ).mul( 1.6 ), miePhase( mu ).min( 1 ) );
	return vec4( col, f );

} );

// 程序化天空（也被玻璃反射近似调用）
export const skyColor = Fn( ( [ dir ] ) => {

	const up = dir.y.max( - 0.2 );
	const zenith = vec3( 0.16, 0.30, 0.62 );
	const horizon = vec3( air.hazeColor ).mul( 1.18 );
	// 天顶蓝 → 地平线乳白（指数过渡，地平线附近一大片亮雾带）
	const t = float( 1 ).sub( exp( up.max( 0 ).mul( - 4.5 ) ) );
	let sky = mix( horizon, zenith, t.mul( 0.85 ) );
	const mu = max( dot( dir, air.sunDir ), 0 );
	sky = sky.add( vec3( air.sunHaze ).mul( miePhase( mu ).mul( 0.9 ) ) );
	sky = sky.add( vec3( 1.0, 0.9, 0.75 ).mul( smoothstep( 0.9994, 0.9998, mu ).mul( 20 ) ) );
	// 云：投影到高空平面上的两层噪声（积云 + 卷云），越靠近地平线越扁、越被雾吞没
	const pd = dir.xz.div( up.max( 0.04 ).add( 0.08 ) );
	const c1 = mx_fractal_noise_float( vec3( pd.mul( 0.9 ).add( vec2( 3.1, 7.7 ) ), time.mul( 0.003 ) ), 5, 2.1, 0.5 ).mul( 0.5 ).add( 0.5 );
	const c2 = mx_fractal_noise_float( vec3( pd.x.mul( 0.5 ), pd.y.mul( 2.2 ), 4.4 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
	const cum = smoothstep( 0.52, 0.78, c1 ).mul( air.cloud );
	const cir = smoothstep( 0.55, 0.85, c2 ).mul( 0.35 );
	const fade = smoothstep( 0.0, 0.12, up );
	const cloudLit = vec3( 1.05, 1.0, 0.95 ).mul( mix( float( 0.82 ), float( 1.15 ), miePhase( mu ).min( 1 ) ) );
	const cloudBase = vec3( 0.62, 0.66, 0.72 );
	const cloudCol = mix( cloudBase, cloudLit, smoothstep( 0.55, 0.95, c1 ) );
	sky = mix( sky, cloudCol, cum.mul( fade ) );
	sky = mix( sky, vec3( 0.95, 0.96, 0.98 ), cir.mul( fade ).mul( float( 1 ).sub( cum ) ) );
	// 地平线以下：远景雾色
	sky = mix( sky, horizon.mul( 0.92 ), smoothstep( 0.0, - 0.08, dir.y ) );
	return sky.mul( air.skyIntensity );

} );

export async function setupAtmosphere( scene, renderer, camera ) {

	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = look.exposure;

	// 天光：晴间多云纯天空 HDRI（无地面），只作环境光与反射，强度压低
	const hdr = await loadHDR( 'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.32;
	scene.environmentRotation.y = ENV_ROT;

	scene.backgroundNode = skyColor( positionWorldDirection );

	// 冷色半球补光：阴影面偏蓝，地面反弹偏绿褐
	const hemi = new THREE.HemisphereLight( 0x9db7d6, 0x3a4126, 0.55 );
	scene.add( hemi );

	// 太阳：暖白硬光
	const sun = new THREE.DirectionalLight( 0xffe7c2, 6.2 );
	sun.position.copy( SUN_DIR ).multiplyScalar( 400 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.radius = 2;
	sun.shadow.bias = - 0.0003;
	sun.shadow.normalBias = 0.06;
	const csm = new CSMShadowNode( sun, { cascades: 3, maxFar: 350, mode: 'practical', lightMargin: 140 } );
	csm.fade = true;
	sun.shadow.shadowNode = csm;
	scene.add( sun );

	// 大气透视雾（替换默认距离雾）
	const a = aerial( positionWorld );
	scene.fogNode = fog( a.rgb, a.a );

	camera.near = 0.2;
	camera.far = 12000;
	camera.updateProjectionMatrix();

	return { sun, csm, hdr, hemi };

}

// 调色（LDR，色调映射之后）
export const gradeLDR = ( ldr ) => Fn( () => {

	let c = ldr.rgb.toVar();
	// 中间调对比：以 0.42 为轴的 S 曲线（暗部压深、亮部提亮但不硬切）
	const x = c.sub( 0.42 ).mul( look.contrast );
	c.assign( x.div( x.abs().mul( 0.35 ).add( 1 ) ).mul( 1.35 ).add( 0.42 ).max( 0 ) );
	// 饱和度 + 高饱和绿色单独压一点（TLOU 的绿是「灰掉的绿」）
	const l = luminance( c );
	const greenness = clamp( c.g.sub( max( c.r, c.b ) ).mul( 4 ), 0, 1 );
	const sat = look.saturation.sub( greenness.mul( look.greenDesat ) );
	c.assign( mix( vec3( l ), c, sat ) );
	// 暗部微冷、亮部微暖
	const w = smoothstep( 0.05, 0.8, l );
	c.assign( c.mul( mix( vec3( 0.95, 1.0, 1.04 ), vec3( 1.04, 1.0, 0.95 ), w ) ) );
	// 黑位抬升（胶片感）
	c.assign( c.mul( float( 1 ).sub( look.lift ) ).add( look.lift ) );
	// 暗角
	const dd = length( screenUV.sub( 0.5 ).mul( vec2( 1.3, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.35, 0.95, dd ).mul( look.vignette ) ) ) );
	// 颗粒（亮度相关：中间调最明显）
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( look.grain ).mul( float( 1 ).sub( l.sub( 0.45 ).abs() ) ) ) );
	return vec4( c, 1 );

} )();
