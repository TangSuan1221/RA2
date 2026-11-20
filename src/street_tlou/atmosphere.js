// 大气与光照：阴天 HDRI 天光（主光）+ 极弱云后太阳（云影扫过）+ 双层指数高度雾（贴地浓雾 + 高空薄雾 + 漂移雾团）
//            + 自定义天空背景 + 强化 GTAO（大半径，压暗巷道/车底/门洞）+ 调色（暗部压深、趾部、去饱和）+ 雨丝/孢子粒子
// 目标：ref4/ref5 —— 阴天、湿冷、青灰、低饱和；暗部压到 15/255 以下，高光只来自天空与湿面反射
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, fog, positionWorldDirection, equirectUV, texture,
	luminance, positionWorld, cameraPosition, exp, max, min, screenUV, length, time, mx_fractal_noise_float, mx_noise_float,
	builtinAOContext, sample, unpackRGBToNormal, positionLocal, instanceIndex, hash, uv, abs, pow, attribute,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { loadHDR } from '../world/assets.js';

// 只参与阴影投射的图层（阴影代理体放这里，主相机看不到）
export const SHADOW_LAYER = 3;
// 积水平面反射只渲染这一层（建筑代理、塔楼、车辆、公交、大件道具）
export const REFLECT_LAYER = 4;

export const atmo = {
	fogColor: uniform( new THREE.Color( 0x3c4746 ) ),
	fogDensity: uniform( 0.0062 ), // 高空薄雾（全局）
	groundDensity: uniform( 0.022 ), // 贴地浓雾（5m 以下）
	groundFalloff: uniform( 0.32 ), // 贴地层高度衰减（1/m）
	heightFalloff: uniform( 0.022 ),
	fogStart: uniform( 4 ),
	mist: uniform( 0.9 ), // 漂移雾团强度
	skyTint: uniform( new THREE.Color( 0.82, 0.89, 0.95 ) ),
	skyIntensity: uniform( 1.6 ),
	cloud: uniform( 0.6 ), // 云影强度
	sunColor: uniform( new THREE.Color( 0xdde6ee ).multiplyScalar( 0.55 ) ),
	rain: uniform( 1 ),
};

// 指数高度雾的解析光学厚度：∫ d·exp(-k·y) ds，沿相机→片元直线
const heightOD = ( dist, y0, y1, d, k ) => {

	const dy = y1.sub( y0 );
	const a = exp( y0.max( - 2 ).mul( k ).negate() );
	const b = exp( y1.max( - 2 ).mul( k ).negate() );
	// dy → 0 时退化为 a
	const ratio = abs( dy ).lessThan( 0.01 ).select( a, a.sub( b ).div( dy.mul( k ) ) );
	return d.mul( dist ).mul( ratio );

};

export async function setupAtmosphere( scene, renderer ) {

	// 环境光：完整阴天 HDRI（地面反弹压暗）；背景：纯天空 HDRI
	const [ env, sky ] = await Promise.all( [ loadHDR( 'hdri/kloofendal_overcast_2k.hdr' ), loadHDR( 'hdri/kloofendal_overcast_puresky_2k.hdr' ) ] );
	scene.environment = env;
	scene.environmentIntensity = 0.62;
	scene.environmentRotation = new THREE.Euler( 0, 1.2, 0 );

	// 天空背景：去饱和、偏青；靠近地平线融入雾色（远景剪影溶在雾里），天顶略暗（云层厚度）
	scene.backgroundNode = Fn( () => {

		const d = positionWorldDirection;
		const s = texture( sky, equirectUV( d ) ).rgb.toVar();
		const l = luminance( s );
		const c = mix( vec3( l ), s, 0.3 ).mul( atmo.skyTint ).mul( atmo.skyIntensity );
		const zen = mix( float( 1.0 ), float( 0.78 ), smoothstep( 0.25, 0.9, d.y ) );
		const h = smoothstep( - 0.02, 0.3, d.y );
		return mix( vec3( atmo.fogColor ).mul( 1.08 ), c.mul( zen ), h );

	} )();

	// 云层后的太阳：低强度、冷白、软阴影；颜色节点乘以滚动的云影噪声（俯视镜头的明暗起伏）
	const sun = new THREE.DirectionalLight( 0xdde6ee, 0.55 );
	sun.colorNode = Fn( () => {

		const p = positionWorld.xz.mul( 0.011 ).add( vec2( time.mul( 0.0035 ), time.mul( 0.0015 ) ) );
		const n = mx_fractal_noise_float( vec3( p, 0.3 ), 3, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
		const k = smoothstep( 0.38, 0.66, n );
		return vec3( atmo.sunColor ).mul( mix( float( 1 ).sub( atmo.cloud ), float( 1.15 ), k ) );

	} )();
	sun.position.set( - 30, 70, - 45 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.radius = 6;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.04;
	// 阴影相机只渲染 SHADOW_LAYER：高面数立面不投影，由低模代理体投影
	sun.shadow.camera.layers.disableAll();
	sun.shadow.camera.layers.enable( SHADOW_LAYER );
	const csm = new CSMShadowNode( sun, { cascades: 3, maxFar: 140, mode: 'practical', lightMargin: 60 } );
	csm.fade = true;
	sun.shadow.shadowNode = csm;
	scene.add( sun );

	// 冷色天光补光极弱（主要靠 HDRI），地面色偏暗绿
	const hemi = new THREE.HemisphereLight( 0x9fb2bd, 0x1e211c, 0.06 );
	scene.add( hemi );

	// 雾：高空薄雾 + 贴地浓雾（解析积分）× 漂移雾团噪声
	scene.fogNode = Fn( () => {

		const p = positionWorld;
		const c = cameraPosition;
		const distAll = length( p.sub( c ) );
		const dist = max( distAll.sub( atmo.fogStart ), 0 );
		// 雾团：相机与片元中点处的低频 3D 噪声，随时间缓慢漂移
		const mid = mix( c, p, 0.6 );
		const mn = mx_fractal_noise_float( vec3( mid.x.mul( 0.022 ).add( time.mul( 0.004 ) ), mid.y.mul( 0.05 ), mid.z.mul( 0.022 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
		const mistK = mix( float( 1 ), smoothstep( 0.25, 0.75, mn ).mul( 1.6 ).add( 0.25 ), atmo.mist );
		const od1 = heightOD( dist, c.y, p.y, atmo.fogDensity, atmo.heightFalloff );
		const od2 = heightOD( dist, c.y, p.y, atmo.groundDensity, atmo.groundFalloff ).mul( mistK );
		const f = float( 1 ).sub( exp( od1.add( od2 ).negate() ) );
		return fog( atmo.fogColor, min( f, 0.985 ) );

	} )();

	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.0;
	return { sun, csm, hemi, env };

}

// —— 强化 GTAO：替换管线默认的小半径 AO（0.6m）为大半径（街道尺度），只影响间接光 ——
// 管线 rebuild() 在 postHDR 之后才设置 contextNode，因此在首帧 update 里覆盖
export function makeStrongAO( ctx ) {

	const prePass = ctx.preDepth.passNode;
	const preNormal = sample( ( u ) => unpackRGBToNormal( prePass.getTextureNode().sample( u ) ) );
	const node = ao( ctx.preDepth, preNormal, ctx.camera );
	node.resolutionScale = 0.5;
	node.radius.value = 2.2;
	node.scale.value = 1.45;
	node.thickness.value = 2.0;
	node.distanceExponent.value = 1.6;
	node.samples.value = 16;
	return {
		node,
		apply() {

			ctx.scenePass.contextNode = builtinAOContext( node.getTextureNode().sample( screenUV ).r );
			ctx.scenePass.needsUpdate = true;

		},
	};

}

// 调色（替换默认 colorGrade）：TLOU2 阴天 —— 低饱和、暗部偏青绿、趾部压黑、对比偏高、暗角、颗粒
export const tgrade = {
	exposure: uniform( 0.7 ),
	contrast: uniform( 1.28 ),
	pivot: uniform( 0.34 ),
	toe: uniform( 0.05 ),
	saturation: uniform( 0.48 ),
	lift: uniform( 0.006 ),
	shadowTint: uniform( new THREE.Color( 0.90, 1.0, 1.01 ) ),
	highlightTint: uniform( new THREE.Color( 1.0, 1.0, 0.98 ) ),
	vignette: uniform( 0.42 ),
	grain: uniform( 0.026 ),
};

export const tlouGrade = Fn( ( [ color ] ) => {

	let c = color.rgb.mul( tgrade.exposure ).toVar();
	// 趾部：暗部按 x²/(x+toe) 压深（黑位更实）
	c.assign( c.mul( c ).div( c.add( tgrade.toe ) ).mul( float( 1 ).add( tgrade.toe ) ) );
	// S 曲线对比（显示空间）
	c.assign( c.sub( tgrade.pivot ).mul( tgrade.contrast ).add( tgrade.pivot ).max( 0 ) );
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, tgrade.saturation ) );
	const w = smoothstep( 0.02, 0.6, l );
	c.assign( c.mul( mix( vec3( tgrade.shadowTint ), vec3( tgrade.highlightTint ), w ) ) );
	// 黑位微抬（胶片感，极少）
	c.assign( c.mul( float( 1 ).sub( tgrade.lift ) ).add( vec3( tgrade.lift.mul( 0.85 ), tgrade.lift, tgrade.lift ) ) );
	// 暗角
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.3, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( tgrade.vignette ) ) ) );
	// 颗粒（亮度相关，暗部更明显）
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( tgrade.grain ).mul( float( 1.2 ).sub( l ) ) ) );
	return vec4( c.clamp( 0, 1 ), color.a );

} );

// —— 雨丝 + 孢子/尘埃：实例化细长面片，在相机周围的循环盒子里下落（顶点着色器动画，无 CPU 开销）——
export function makeParticles( camera ) {

	const g = new THREE.Group();
	const BOX = new THREE.Vector3( 36, 18, 36 );
	const camU = uniform( new THREE.Vector3() );

	// 雨丝：0.9m × 6mm 竖条
	{

		const N = 5000;
		const geo = new THREE.PlaneGeometry( 0.006, 0.9 );
		const mat = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
		const id = float( instanceIndex );
		const r1 = hash( instanceIndex ), r2 = hash( instanceIndex.add( 7919 ) ), r3 = hash( instanceIndex.add( 104729 ) );
		const speed = r3.mul( 2 ).add( 7.5 );
		// 盒内位置（相对相机循环）
		const base = vec3( r1, r2, r3 ).mul( vec3( BOX ) );
		const fall = vec3( time.mul( 0.9 ), time.mul( speed ).negate(), time.mul( 0.35 ) );
		const rel = base.add( fall ).sub( camU ).mod( vec3( BOX ) ).sub( vec3( BOX ).mul( 0.5 ) );
		const wp = camU.add( rel );
		// 面片朝向相机（绕竖轴的柱状公告板），略随风倾斜
		const toCam = cameraPosition.sub( wp ).mul( vec3( 1, 0, 1 ) ).normalize();
		const right = vec3( toCam.z, 0, toCam.x.negate() );
		const lp = positionLocal;
		mat.positionNode = wp.add( right.mul( lp.x ) ).add( vec3( lp.y.mul( 0.1 ), lp.y, lp.y.mul( 0.04 ) ) );
		const fade = smoothstep( 0.5, 0.2, length( rel.div( vec3( BOX ) ) ) ).mul( smoothstep( 1.5, 4, length( rel ) ) );
		const along = uv().y;
		mat.colorNode = vec3( 0.55, 0.6, 0.64 );
		mat.opacityNode = fade.mul( smoothstep( 0, 0.5, along ).mul( smoothstep( 1, 0.5, along ) ) ).mul( 0.16 ).mul( atmo.rain );
		const mesh = new THREE.InstancedMesh( geo, mat, N );
		mesh.frustumCulled = false;
		g.add( mesh );

	}

	// 孢子/尘埃：缓慢漂浮的小亮点（ref 的空气质感）
	{

		const N = 900;
		const geo = new THREE.PlaneGeometry( 0.025, 0.025 );
		const mat = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
		const r1 = hash( instanceIndex.add( 3 ) ), r2 = hash( instanceIndex.add( 33 ) ), r3 = hash( instanceIndex.add( 333 ) );
		const S = vec3( 22, 8, 22 );
		const base = vec3( r1, r2, r3 ).mul( S );
		const t = time.mul( 0.15 );
		const drift = vec3( mx_noise_float( vec3( r1.mul( 40 ), t, 0 ) ), mx_noise_float( vec3( r2.mul( 40 ), t, 3 ) ).mul( 0.5 ).sub( t.mul( 0.2 ) ), mx_noise_float( vec3( r3.mul( 40 ), t, 7 ) ) ).mul( 2.0 );
		const rel = base.add( drift ).sub( camU ).mod( S ).sub( S.mul( 0.5 ) );
		const wp = camU.add( rel );
		const toCam = cameraPosition.sub( wp ).normalize();
		const right = vec3( toCam.z, 0, toCam.x.negate() ).normalize();
		const up = toCam.cross( right );
		mat.positionNode = wp.add( right.mul( positionLocal.x ) ).add( up.mul( positionLocal.y ) );
		const d = length( uv().sub( 0.5 ) ).mul( 2 );
		mat.colorNode = vec3( 0.7, 0.72, 0.66 );
		mat.opacityNode = smoothstep( 1, 0.2, d ).mul( smoothstep( 0.5, 0.25, length( rel.div( S ) ) ) ).mul( 0.35 );
		const mesh = new THREE.InstancedMesh( geo, mat, N );
		mesh.frustumCulled = false;
		g.add( mesh );

	}

	g.userData.update = () => camU.value.copy( camera.position );
	return g;

}
