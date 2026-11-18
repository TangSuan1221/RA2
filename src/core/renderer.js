// 渲染器与后处理管线
// 链路：场景 Pass（MRT：颜色/法线/速度）→ GTAO 环境光遮蔽 → TRAA 时间抗锯齿
//      → 色调映射 → 调色（对比/饱和/冷暖分离/暗角/颗粒）
import * as THREE from 'three/webgpu';
import {
	pass, mrt, output, normalView, velocity, screenUV, sample, packNormalToRGB, unpackRGBToNormal,
	builtinAOContext, renderOutput, uniform, vec2, vec3, vec4, float, luminance, mix, smoothstep, length, time, Fn, screenCoordinate,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { bayer16 } from 'three/addons/tsl/math/Bayer.js';

// 体积光图层：场景里把体积雾网格放到这一层，并让需要产生光柱的灯光 layers.enable(VOLUME_LAYER)
export const VOLUME_LAYER = 10;

/**
 * 创建体积雾网格（光柱、手电光束、窗口丁达尔效应）。
 * @param {THREE.BufferGeometry} geometry  雾所在的空间（通常是一个盒子）
 * @param {object} opt density: 雾浓度节点或数字；steps: 步进次数
 */
export function createVolumeFog( geometry, { density = 1, steps = 12, noise = null } = {} ) {

	const mat = new THREE.VolumeNodeMaterial();
	mat.steps = steps;
	mat.offsetNode = bayer16( screenCoordinate );
	const d = typeof density === 'number' ? uniform( density ) : density;
	mat.scatteringNode = Fn( ( { positionRay } ) => noise ? d.mul( noise( positionRay ) ) : d );
	const mesh = new THREE.Mesh( geometry, mat );
	mesh.receiveShadow = true;
	mesh.layers.disableAll();
	mesh.layers.enable( VOLUME_LAYER );
	mesh.userData.density = d;
	return mesh;

}

export async function createRenderer( { forceWebGL = false } = {} ) {

	const renderer = new THREE.WebGPURenderer( { antialias: false, forceWebGL, trackTimestamp: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.0;
	renderer.info.autoReset = false;
	document.body.appendChild( renderer.domElement );
	await renderer.init();
	return renderer;

}

// 调色参数（全部是 uniform，GUI 实时调节，不需要重新编译着色器）
export const grade = {
	contrast: uniform( 1.08 ),
	saturation: uniform( 0.78 ),
	shadowTint: uniform( new THREE.Color( 0.92, 1.0, 0.98 ) ), // 暗部偏青绿
	highlightTint: uniform( new THREE.Color( 1.02, 1.0, 0.95 ) ), // 亮部微暖
	vignette: uniform( 0.35 ),
	grain: uniform( 0.035 ),
	bloomStrength: uniform( 0.12 ),
};

const colorGrade = Fn( ( [ color ] ) => {

	let c = color.rgb.toVar();
	// 对比度（以 0.18 中灰为轴，显示空间下近似处理）
	c.assign( c.sub( 0.42 ).mul( grade.contrast ).add( 0.42 ).max( 0 ) );
	// 饱和度
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, grade.saturation ) );
	// 暗部/亮部分离着色
	const w = smoothstep( 0.0, 0.7, l );
	c.assign( c.mul( mix( vec3( grade.shadowTint ), vec3( grade.highlightTint ), w ) ) );
	// 暗角
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.25, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.35, 0.95, d ).mul( grade.vignette ) ) ) );
	// 胶片颗粒
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( grade.grain ) ) );
	return vec4( c, color.a );

} );

export function createPipeline( renderer, scene, camera, opts = {} ) {

	const pipeline = new THREE.RenderPipeline( renderer );
	pipeline.outputColorTransform = false; // 手动控制：先色调映射，再调色

	// 预渲染：法线 + 速度（供 AO 与 TRAA 使用）
	const prePass = pass( scene, camera );
	prePass.transparent = false;
	prePass.setMRT( mrt( { output: packNormalToRGB( normalView ), velocity } ) );
	prePass.getTexture( 'output' ).type = THREE.UnsignedByteType;
	const preNormal = sample( ( uv ) => unpackRGBToNormal( prePass.getTextureNode().sample( uv ) ) );
	const preDepth = prePass.getTextureNode( 'depth' );
	const preVelocity = prePass.getTextureNode( 'velocity' );

	const aoPass = ao( preDepth, preNormal, camera );
	aoPass.resolutionScale = 0.5;
	aoPass.radius.value = 0.6;
	aoPass.scale.value = 1.2;
	aoPass.thickness.value = 1.0;

	const scenePass = pass( scene, camera );
	scenePass.contextNode = builtinAOContext( aoPass.getTextureNode().sample( screenUV ).r );

	// 可选：体积光（opts.volumes = [createVolumeFog(...) 生成的网格]）
	let volumeComposite = null;
	const volumeIntensity = uniform( opts.volumeIntensity ?? 1 );
	if ( opts.volumes?.length ) {

		const sceneDepth = scenePass.getTextureNode( 'depth' );
		for ( const v of opts.volumes ) v.material.depthNode = sceneDepth.sample( screenUV );
		const layer = new THREE.Layers();
		layer.disableAll();
		layer.enable( VOLUME_LAYER );
		const volPass = pass( scene, camera, { depthBuffer: false } );
		volPass.setLayers( layer );
		volPass.setResolutionScale( opts.volumeResolution ?? 0.5 );
		volumeComposite = gaussianBlur( volPass, uniform( 0.6 ) ).mul( volumeIntensity );

	}

	const beauty = volumeComposite ? scenePass.add( volumeComposite ) : scenePass;
	const aa = traa( beauty, preDepth, preVelocity, camera );
	aa.useSubpixelCorrection = false;

	const bloomPass = bloom( aa, grade.bloomStrength, 0.4, opts.bloomThreshold ?? 0.85 );

	const toggles = { ao: true, taa: true, bloom: true, grade: true, aoOnly: false };

	function rebuild() {

		let hdr = toggles.taa ? aa : beauty;
		if ( toggles.bloom ) hdr = hdr.add( bloomPass );
		if ( opts.postHDR ) hdr = opts.postHDR( hdr, { scenePass, preDepth, camera } ); // 场景自定义：色调映射前（线性 HDR）
		let out = renderOutput( hdr );
		if ( toggles.grade ) out = opts.postLDR ? opts.postLDR( out, { scenePass, preDepth, camera } ) : colorGrade( out ); // 场景自定义调色
		if ( toggles.aoOnly ) out = vec4( vec3( aoPass.getTextureNode().sample( screenUV ).r ), 1 );
		pipeline.outputNode = out;
		scenePass.contextNode = toggles.ao ? builtinAOContext( aoPass.getTextureNode().sample( screenUV ).r ) : null;
		scenePass.needsUpdate = true;
		pipeline.needsUpdate = true;

	}

	rebuild();
	return { pipeline, aoPass, toggles, rebuild, volumeIntensity };

}
