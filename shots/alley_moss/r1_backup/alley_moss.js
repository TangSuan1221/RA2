// 场景：TLOU2 风格苔藓小巷（ref6）
// 右侧：横向凹槽护墙板高墙 + 厚苔藓 + 竖向水渍；墙根堆满常春藤并向上攀爬
// 左侧：钢架玻璃温室（破碎玻璃、锈蚀钢梁）；尽头：冷白壁灯
// 地面：错位破裂的混凝土板，缝隙长满苔藓与杂草，潮湿积水
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, luminance, screenUV, time, fog, rangeFogFactor,
	exponentialHeightFogFactor, max, color, positionWorld,
} from 'three/tsl';
import { loadHDR } from '../world/assets.js';
import { L, look, wallMaterial, mossMaterial, slabMaterial, soilMaterial, steelMaterial, glassMaterial, leafMaterial, grassMaterial, stemMaterial, concreteMaterial, darkMaterial, roofMaterial } from '../alley_moss/materials.js';
import { buildGround, buildWall, buildMoss, buildGreenhouse, buildEnd } from '../alley_moss/geometry.js';
import { buildIvy, buildGrass } from '../alley_moss/vegetation.js';
import { buildProps } from '../alley_moss/props.js';

export const SHOTS = {
	hero: { position: [ - 0.25, 1.7, 6.2 ], lookAt: [ 0.35, 1.45, - 30 ], fov: 52 },
	top: { mode: 'top', yaw: 8, pitch: 55, distance: 17, target: [ - 0.6, 0, - 8 ] },
};

// 本场景调色参数
const G = {
	contrast: uniform( 1.12 ),
	saturation: uniform( 0.72 ),
	lift: uniform( 0.018 ),
	shadowTint: uniform( new THREE.Color( 0.93, 1.0, 0.98 ) ),
	highlightTint: uniform( new THREE.Color( 1.0, 1.0, 0.97 ) ),
	vignette: uniform( 0.38 ),
	grain: uniform( 0.03 ),
};

const gradeFn = Fn( ( [ c4 ] ) => {

	let c = c4.rgb.toVar();
	c.assign( c.sub( 0.4 ).mul( G.contrast ).add( 0.4 ).max( 0 ) );
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, G.saturation ) );
	c.assign( c.mul( mix( vec3( G.shadowTint ), vec3( G.highlightTint ), smoothstep( 0.0, 0.7, l ) ) ) );
	// 黑位抬升（胶片感）
	c.assign( c.mul( float( 1 ).sub( G.lift ) ).add( G.lift ) );
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.2, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( G.vignette ) ) ) );
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( G.grain ) ) );
	return vec4( c, c4.a );

} );

export async function build( { scene, renderer } ) {

	// —— 光照：阴天 HDRI（天光 + 天空背景）+ 云后弱阳光 ——
	const hdr = await loadHDR( 'hdri/kloofendal_overcast_2k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.5;
	scene.background = hdr;
	scene.backgroundIntensity = 0.55;
	scene.backgroundBlurriness = 0.0;
	renderer.toneMappingExposure = 0.85;

	const sun = new THREE.DirectionalLight( 0xe4ebf0, 0.9 );
	sun.position.set( - 18, 34, - 12 );
	sun.target.position.set( 0, 0, - 14 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 4096, 4096 );
	const sc = sun.shadow.camera;
	sc.left = - 30; sc.right = 30; sc.top = 30; sc.bottom = - 30; sc.near = 1; sc.far = 90;
	sun.shadow.radius = 6;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.02;
	scene.add( sun, sun.target );

	// 雾：冷灰距离雾 + 贴地湿气
	const fogCol = uniform( new THREE.Color( 0x7d8786 ) );
	scene.fogNode = fog( fogCol, max( rangeFogFactor( 12, 120 ).mul( 0.7 ), exponentialHeightFogFactor( 0.02, 0.6 ) ) );

	// —— 材质 ——
	const mats = {
		slab: slabMaterial(),
		soil: soilMaterial(),
		
		steel: steelMaterial(),
		glass: glassMaterial(),
		leaf: leafMaterial(),
		grass: grassMaterial(),
		stem: stemMaterial(),
		concrete: concreteMaterial( { moss: 0.7 } ),
		roof: roofMaterial(),
		concreteDark: concreteMaterial( { tint: new THREE.Color( 0.22, 0.24, 0.22 ), moss: 0.6 } ),
		concreteEnd: concreteMaterial( { tint: new THREE.Color( 0.6, 0.6, 0.58 ), moss: 0.35 } ),
		dark: darkMaterial(),
		shard: new THREE.MeshStandardNodeMaterial( { color: 0x2a3330, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide } ),
		lamp: new THREE.MeshBasicNodeMaterial( { color: new THREE.Color( 0.9, 0.95, 1.0 ).multiplyScalar( 18 ) } ),
	};

	// —— 几何 ——
	const moss = buildMoss( mats, ( tex ) => ( mats.moss = mossMaterial( tex ) ) );
	mats.wall = wallMaterial( moss.tex );
	const ground = buildGround( mats );
	scene.add( ground.group );
	scene.add( buildWall( mats ) );
	scene.add( moss.mesh );
	scene.add( buildGreenhouse( mats ) );
	const end = buildEnd( mats );
	scene.add( end.group );
	const ivy = buildIvy( mats, moss.sampleM );
	scene.add( ivy.group );
	scene.add( buildGrass( mats, ground ) );
	scene.add( await buildProps( mats ) );

	return {
		sun,
		pipelineOptions: { postLDR: ( out ) => gradeFn( out ), bloomThreshold: 0.9 },
		gui( gui ) {

			const f = gui.addFolder( '苔藓小巷' );
			f.add( G.contrast, 'value', 0.8, 1.5 ).name( '对比' );
			f.add( G.saturation, 'value', 0.3, 1.2 ).name( '饱和' );
			f.add( G.lift, 'value', 0, 0.08 ).name( '黑位' );
			f.add( look.streak, 'value', 0, 1.5 ).name( '水渍' );
			f.add( look.puddle, 'value', 0, 1.5 ).name( '积水' );
			f.add( scene, 'environmentIntensity', 0, 2 ).name( '天光' );
			f.add( scene, 'backgroundIntensity', 0, 2 ).name( '天空' );
			f.add( sun, 'intensity', 0, 4 ).name( '阳光' );

		},
	};

}
