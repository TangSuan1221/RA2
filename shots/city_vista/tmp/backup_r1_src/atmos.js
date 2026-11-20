// 城市远景：大气与光照
//   · 晴朗偏雾的午后：暖白太阳 + 蓝天 HDRI 天光
//   · 大气透视：按视距与高度积分的指数雾，朝向太阳的方向有米氏散射暖光晕，远处楼宇自然变成蓝灰色
//   · 天空：HDRI 云层 + 地平线雾带（天空背景不受场景雾影响，因此在这里单独混合）
//   · 调色：替换默认调色，对比略高、绿色略去饱和、黑位微抬、暗角与颗粒
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, exp, max, min, pow, clamp, dot, normalize, length,
	positionWorld, cameraPosition, positionWorldDirection, texture, equirectUV, luminance, screenUV, time, fog,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { loadHDR } from '../world/assets.js';

// HDRI 中太阳方向（右后方，高度角约 48°）；整体绕 Y 旋转 ENV_ROT，让太阳更偏右侧，树影斜向落在草地上
export const ENV_ROT = THREE.MathUtils.degToRad( - 68 );
export const SUN_DIR = new THREE.Vector3( 0.553, 0.743, 0.376 ).normalize().applyAxisAngle( new THREE.Vector3( 0, 1, 0 ), ENV_ROT );

export const air = {
	hazeColor: uniform( new THREE.Color( 0.50, 0.60, 0.72 ) ), // 远景蓝灰（线性）
	sunHaze: uniform( new THREE.Color( 1.0, 0.86, 0.66 ) ), // 太阳方向散射暖色
	density: uniform( 0.0011 ), // 地面处消光系数（每米）
	falloff: uniform( 1 / 260 ), // 高度衰减（1/标高）
	maxFog: uniform( 0.93 ),
	sunDir: uniform( SUN_DIR.clone() ),
	skyIntensity: uniform( 0.72 ),
};

export const look = {
	exposure: 1.12,
	contrast: uniform( 1.34 ),
	saturation: uniform( 1.15 ),
	lift: uniform( 0.008 ),
	vignette: uniform( 0.34 ),
	grain: uniform( 0.022 ),
	greenDesat: uniform( 0.05 ),
};

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
	// 米氏散射：朝太阳方向更亮更暖
	const mu = max( dot( dir, air.sunDir ), 0 );
	const mie = pow( mu, 6 ).mul( 0.55 ).add( pow( mu, 40 ).mul( 0.6 ) );
	const col = mix( vec3( air.hazeColor ), vec3( air.sunHaze ).mul( 1.4 ), mie.min( 1 ) );
	return vec4( col, f );

} );

export async function setupAtmosphere( scene, renderer, camera ) {

	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = look.exposure;

	// 天光：晴间多云纯天空 HDRI（无地面），环境光偏蓝
	const hdr = await loadHDR( 'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.2;
	scene.environmentRotation.y = ENV_ROT;
	scene.backgroundRotation.y = ENV_ROT;

	// 天空背景：HDRI 云层（压暗太阳本体避免过曝）+ 地平线雾带
	scene.backgroundNode = Fn( () => {

		const dir = positionWorldDirection;
		const sky = texture( hdr, equirectUV( dir ) ).rgb.min( vec3( 6 ) ).mul( air.skyIntensity );
		const up = dir.y;
		const band = smoothstep( 0.32, - 0.02, up ); // 越接近地平线越被雾吞没
		const mu = max( dot( dir, air.sunDir ), 0 );
		const mie = pow( mu, 6 ).mul( 0.55 ).add( pow( mu, 40 ).mul( 0.6 ) );
		const haze = mix( vec3( air.hazeColor ), vec3( air.sunHaze ).mul( 1.4 ), mie.min( 1 ) ).mul( 1.08 );
		// 整体天空偏乳白（雾霾天）
		return mix( mix( sky, haze.mul( 1.1 ), 0.15 ), haze, band.mul( 0.9 ) );

	} )();

	// 太阳：暖白硬光
	const sun = new THREE.DirectionalLight( 0xffecd0, 5.0 );
	sun.position.copy( SUN_DIR ).multiplyScalar( 300 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.radius = 2;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.05;
	const csm = new CSMShadowNode( sun, { cascades: 3, maxFar: 260, mode: 'practical', lightMargin: 120 } );
	csm.fade = true;
	sun.shadow.shadowNode = csm;
	scene.add( sun );

	// 大气透视雾（替换默认距离雾）
	const a = aerial( positionWorld );
	scene.fogNode = fog( a.rgb, a.a );

	camera.near = 0.25;
	camera.far = 7000;
	camera.updateProjectionMatrix();

	return { sun, csm, hdr };

}

// 调色（LDR，色调映射之后）
export const gradeLDR = ( ldr ) => Fn( () => {

	let c = ldr.rgb.toVar();
	// 对比（S 曲线，围绕中灰）
	c.assign( c.sub( 0.45 ).mul( look.contrast ).add( 0.45 ).max( 0 ) );
	// 饱和度 + 高饱和绿色单独压一点（TLOU 的绿是「灰掉的绿」）
	const l = luminance( c );
	const greenness = clamp( c.g.sub( max( c.r, c.b ) ).mul( 4 ), 0, 1 );
	const sat = look.saturation.sub( greenness.mul( look.greenDesat ) );
	c.assign( mix( vec3( l ), c, sat ) );
	// 暗部微冷、亮部微暖
	const w = smoothstep( 0.05, 0.75, l );
	c.assign( c.mul( mix( vec3( 0.97, 1.0, 1.02 ), vec3( 1.02, 1.0, 0.97 ), w ) ) );
	// 黑位抬升（胶片感）
	c.assign( c.mul( float( 1 ).sub( look.lift ) ).add( look.lift ) );
	// 暗角
	const dd = length( screenUV.sub( 0.5 ).mul( vec2( 1.2, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.4, 1.0, dd ).mul( look.vignette ) ) ) );
	// 颗粒
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( look.grain ) ) );
	return vec4( c, 1 );

} )();
