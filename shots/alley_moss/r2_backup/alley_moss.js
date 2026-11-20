// 场景：TLOU2 风格苔藓小巷（ref6）· 第二轮
// 右侧：横向凹槽护墙板高墙 + 厚苔藓（凹槽空腔/滴水驱动）+ 竖向水渍 + 落水管；墙根常春藤堆 + 攀爬藤蔓
// 左侧：钢架玻璃温室（逐块破碎/污垢/裂纹的玻璃，内部种植池、育苗台、枯死盆栽、蕨类）
// 尽头：铁丝网门 + 挂布 → 树影 → 模块化立面楼；墙上冷白投光灯（真实聚光灯 + 体积光）
// 地面：不规则错位混凝土板，缝隙苔藓与草，积水镜面反射，落叶碎屑
// 光照：阴天 HDRI 天光 × 巷道天空可见度（解析遮蔽）+ 很弱的云后阳光
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, luminance, screenUV, time, fog, rangeFogFactor,
	max, positionWorld, reflector, texture, uv, exp, clamp, cameraPosition, instanceColor, atan, asin,
} from 'three/tsl';
import { loadHDR } from '../world/assets.js';
import * as MAT from '../alley_moss/materials.js';
import { L, look } from '../alley_moss/materials.js';
import { buildGround, buildGroundCover } from '../alley_moss/ground.js';
import { buildWall, buildMoss, buildWallDressing, buildRoof, graffitiTexture } from '../alley_moss/geometry.js';
import { buildGreenhouse, buildGreenhouseInterior } from '../alley_moss/greenhouse.js';
import { buildIvy } from '../alley_moss/vegetation.js';
import { buildEnd, buildProps } from '../alley_moss/props.js';

export const SHOTS = {
	hero: { position: [ - 0.3, 1.7, 6.0 ], lookAt: [ 0.3, 1.55, - 30 ], fov: 52 },
	top: { mode: 'top', yaw: 12, pitch: 55, distance: 15, target: [ - 0.4, 0, - 10 ] },
};

// 本场景调色参数
const G = {
	contrast: uniform( 1.2 ),
	saturation: uniform( 0.56 ),
	lift: uniform( 0.022 ),
	shadowTint: uniform( new THREE.Color( 0.92, 1.0, 0.99 ) ),
	highlightTint: uniform( new THREE.Color( 0.98, 1.0, 1.02 ) ),
	vignette: uniform( 0.42 ),
	grain: uniform( 0.028 ),
};

const gradeFn = Fn( ( [ c4 ] ) => {

	let c = c4.rgb.toVar();
	c.assign( c.sub( 0.36 ).mul( G.contrast ).add( 0.36 ).max( 0 ) );
	const l = luminance( c );
	c.assign( mix( vec3( l ), c, G.saturation ) );
	c.assign( c.mul( mix( vec3( G.shadowTint ), vec3( G.highlightTint ), smoothstep( 0.0, 0.7, l ) ) ) );
	c.assign( c.mul( float( 1 ).sub( G.lift ) ).add( G.lift ) );
	const d = length( screenUV.sub( 0.5 ).mul( vec2( 1.2, 1.0 ) ) );
	c.assign( c.mul( float( 1 ).sub( smoothstep( 0.3, 0.95, d ).mul( G.vignette ) ) ) );
	const n = screenUV.add( time.mul( 0.37 ).fract() ).dot( vec2( 12.9898, 78.233 ) ).sin().mul( 43758.5453 ).fract().sub( 0.5 );
	c.assign( c.add( n.mul( G.grain ).mul( l.add( 0.15 ) ) ) );
	return vec4( c, c4.a );

} );

export async function build( { scene, renderer, camera } ) {

	// —— 光照：阴天 HDRI（天光 + 天空背景）+ 云后弱阳光 ——
	const hdr = await loadHDR( 'hdri/kloofendal_overcast_2k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.62;
	// 天空：用天穹网格而不是 scene.background —— 体积光 pass 会渲染背景并模糊叠加，导致全屏发雾
	const skyMat = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, depthWrite: false, fog: false } );
	const skyI = uniform( 0.5 );
	const dir = positionWorld.sub( cameraPosition ).normalize();
	const suv = vec2( atan( dir.z, dir.x ).mul( 1 / ( 2 * Math.PI ) ).add( 0.5 ), asin( dir.y.clamp( - 1, 1 ) ).mul( 1 / Math.PI ).add( 0.5 ) );
	skyMat.colorNode = texture( hdr, suv ).rgb.mul( skyI );
	const sky = new THREE.Mesh( new THREE.SphereGeometry( 300, 32, 16 ), skyMat );
	sky.frustumCulled = false;
	sky.renderOrder = - 10;
	scene.add( sky );
	const skyFollow = ( cam ) => sky.position.copy( cam.position );
	renderer.toneMappingExposure = 1.12;

	const sun = new THREE.DirectionalLight( 0xdfe6ec, 0.55 );
	sun.position.set( - 18, 34, - 12 );
	sun.target.position.set( 0, 0, - 14 );
	look.sunDir.value.copy( sun.position ).sub( sun.target.position ).normalize();
	sun.castShadow = true;
	sun.shadow.mapSize.set( 4096, 4096 );
	const sc = sun.shadow.camera;
	sc.left = - 28; sc.right = 28; sc.top = 32; sc.bottom = - 32; sc.near = 1; sc.far = 90;
	sun.shadow.radius = 8;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.02;
	scene.add( sun, sun.target );

	// 雾：冷灰距离雾 + 两层贴地湿气（远处分层成柔和的平面）
	const fogCol = uniform( new THREE.Color( 0x6f7979 ) );
	const p = positionWorld;
	const dist = length( p.sub( cameraPosition ) );
	// 贴地雾：距离 > 8m 才开始累积（俯视镜头约 16m 外，地面不能发白）；远处第二层把背景分成柔和平面
	const dd = dist.sub( 8 ).max( 0 );
	const hFog1 = exp( p.y.max( 0 ).mul( - 0.45 ) ).mul( float( 1 ).sub( exp( dd.mul( - 0.012 ) ) ) );
	const hFog2 = exp( p.y.max( 0 ).mul( - 0.07 ) ).mul( float( 1 ).sub( exp( dist.sub( 25 ).max( 0 ).mul( - 0.02 ) ) ) ).mul( 0.8 );
	scene.fogNode = fog( fogCol, clamp( max( rangeFogFactor( 20, 140 ).mul( 0.5 ), max( hFog1, hFog2 ) ), 0, 0.9 ) );

	// —— 积水反射 ——
	const refl = reflector( { resolutionScale: 0.5, bounces: false } );
	refl.target.rotateX( - Math.PI / 2 );
	refl.target.position.y = L.WATER_Y;
	scene.add( refl.target );

	// —— 材质 ——
	const graffiti = new THREE.MeshStandardNodeMaterial( { map: graffitiTexture(), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2 } );
	const mats = {
		slab: ( mask ) => MAT.slabMaterial( mask ),
		soil: MAT.soilMaterial(),
		steel: MAT.steelMaterial(),
		glass: MAT.glassMaterial(),
		leaf: MAT.leafMaterial(),
		grass: MAT.grassMaterial(),
		fern: MAT.fernMaterial(),
		stem: MAT.stemMaterial(),
		cable: MAT.stemMaterial( new THREE.Color( 0.012, 0.012, 0.012 ) ),
		mossClump: MAT.mossClumpMaterial(),
		litter: MAT.litterMaterial(),
		pebble: MAT.pebbleMaterial(),
		water: MAT.waterMaterial( refl ),
		concrete: MAT.concreteMaterial( { moss: 0.7 } ),
		cap: MAT.concreteMaterial( { tint: new THREE.Color( 0.3, 0.31, 0.3 ), moss: 0.4 } ),
		concreteKnee: MAT.concreteMaterial( { tint: new THREE.Color( 0.36, 0.37, 0.35 ), moss: 0.6, rustDrips: true } ),
		concreteDark: MAT.concreteMaterial( { tint: new THREE.Color( 0.16, 0.17, 0.16 ), moss: 0.6 } ),
		roof: MAT.roofMaterial(),
		hvac: MAT.hvacMaterial(),
		metalDark: MAT.paintedMetal( new THREE.Color( 0.02, 0.02, 0.02 ), 0.3 ),
		metalBox: MAT.paintedMetal( new THREE.Color( 0.11, 0.12, 0.1 ), 0.5 ),
		pipe: MAT.paintedMetal( new THREE.Color( 0.07, 0.075, 0.07 ), 0.85, 0.5 ),
		bikeMetal: MAT.paintedMetal( new THREE.Color( 0.09, 0.025, 0.02 ), 0.9 ),
		lampMetal: MAT.paintedMetal( new THREE.Color( 0.05, 0.055, 0.05 ), 0.4 ),
		dark: MAT.darkMaterial(),
		shard: new THREE.MeshStandardNodeMaterial( { color: 0x1e2523, roughness: 0.08, metalness: 0.0, side: THREE.DoubleSide } ),
		lamp: MAT.lampMaterial(),
		wood: MAT.tintedMaterial( 'weathered_planks', '1k', new THREE.Color( 0.05, 0.042, 0.032 ), { scale: 1 } ),
		ghFloor: MAT.tintedMaterial( 'worn_tile_floor', '1k', new THREE.Color( 0.05, 0.05, 0.045 ), { scale: 0.5, world: 'xz', moss: 0.7 } ),
		farGround: MAT.tintedMaterial( 'road_damaged', '2k', new THREE.Color( 0.05, 0.05, 0.048 ), { scale: 0.18, world: 'xz', moss: 0.5 } ),
		tarp: MAT.tintedMaterial( 'hessian_230', '1k', new THREE.Color( 0.03, 0.045, 0.05 ), { scale: 2, side: THREE.DoubleSide, rough: 0.7 } ),
		fabric: MAT.tintedMaterial( 'hessian_230', '1k', new THREE.Color( 0.05, 0.048, 0.03 ), { scale: 3 } ),
		cloth: MAT.tintedMaterial( 'hessian_230', '1k', new THREE.Color( 0.03, 0.035, 0.045 ), { scale: 2, side: THREE.DoubleSide } ),
		hose: new THREE.MeshStandardNodeMaterial( { color: new THREE.Color( 0.05, 0.075, 0.03 ), roughness: 0.5 } ),
		terracotta: new THREE.MeshStandardNodeMaterial( { color: new THREE.Color( 0.12, 0.055, 0.035 ), roughness: 0.85, side: THREE.DoubleSide } ),
		pot: MAT.potMaterial(),
		paper: new THREE.MeshStandardNodeMaterial( { roughness: 0.75, side: THREE.DoubleSide } ),
		contactAO: MAT.contactAOMaterial(),
		bark: MAT.barkMaterial,
		treeLeaf: MAT.treeLeafMaterial,
		graffiti,
	};
	mats.paper.colorNode = MAT.n01( positionWorld.mul( 12 ), 2 ).mul( 0.3 ).add( 0.7 ).mul( vec3( 1 ) ).mul( instanceColor );

	// —— 几何 ——
	const moss = buildMoss( mats, ( tex ) => ( mats.moss = MAT.mossMaterial( tex ) ) );
	mats.wall = MAT.wallMaterial( moss.tex );
	const ground = buildGround( mats );
	scene.add( ground.group );
	const wallGroup = buildWall( mats );
	scene.add( wallGroup );
	scene.add( moss.mesh, moss.clumps );
	scene.add( buildWallDressing( mats ) );
	scene.add( buildGroundCover( mats, ground ) );
	scene.add( buildRoof( mats, ground.mossLumps ) );
	const ghGroup = buildGreenhouse( mats );
	scene.add( ghGroup );
	const ghi = buildGreenhouseInterior( mats );
	scene.add( ghi.group );
	const ivy = buildIvy( mats, moss.sampleM );
	scene.add( ivy.group );
	const end = await buildEnd( mats, scene );
	scene.add( end.group );
	scene.add( await buildProps( mats, ground, ivy ) );
	console.info( `[alley_moss] 常春藤叶 ${ivy.count}，藤茎 ${ivy.stems}，草叶 ${ground.counts.blades}，落叶 ${ground.counts.leaves}，苔藓团 ${moss.clumpCount}，蕨叶 ${ghi.fronds}` );

	// 积水反射只渲染「白名单」图层 3：天空、墙体、温室钢架与玻璃、灯、远处楼体
	// （细碎植被/碎屑在反射里看不清，却会让三角面翻倍）
	const REFL = 3;
	const reflect = ( o ) => o.traverse( ( c ) => ( c.isMesh || c.isLight ) && c.layers.enable( REFL ) );
	reflect( sky ); reflect( wallGroup ); reflect( end.group ); reflect( ghGroup ); reflect( moss.mesh );
	end.group.traverse( ( c ) => c.isTree && c.traverse( ( t ) => t.layers.disable( REFL ) ) );
	sun.layers.enable( REFL );
	// 阴影投射裁剪：温室内部（玻璃屋顶下本就是漫射光）、远处楼体、小碎物不投影；
	// 聚光灯阴影只包含灯附近的物体（自定义阴影图层 4）
	ghi.group.traverse( ( c ) => { if ( c.isMesh ) c.castShadow = false; } );
	scene.updateMatrixWorld( true );
	const SPOT = 4;
	end.spot.shadow.camera.layers.set( SPOT );
	scene.traverse( ( c ) => {

		if ( ! c.isMesh || ! c.castShadow ) return;
		c.geometry.boundingSphere || c.geometry.computeBoundingSphere();
		const bs = c.geometry.boundingSphere.clone().applyMatrix4( c.matrixWorld );
		if ( bs.center.distanceTo( end.spot.position ) < bs.radius + 10 && bs.radius < 40 ) c.layers.enable( SPOT );

	} );

	const hideInReflection = () => {

		const vc = refl.reflector.virtualCameras.get( camera );
		if ( vc && vc.layers.mask !== ( 1 << REFL ) ) vc.layers.set( REFL );

	};

	skyFollow( camera );
	return {
		sun,
		update() { skyFollow( camera ); hideInReflection(); },
		pipelineOptions: { postLDR: ( out ) => gradeFn( out ), bloomThreshold: 0.9, volumes: [ end.vol ], volumeIntensity: 1.0, volumeResolution: 0.5 },
		gui( gui ) {

			const f = gui.addFolder( '苔藓小巷' );
			f.add( G.contrast, 'value', 0.8, 1.6 ).name( '对比' );
			f.add( G.saturation, 'value', 0.3, 1.2 ).name( '饱和' );
			f.add( G.lift, 'value', 0, 0.08 ).name( '黑位' );
			f.add( look.streak, 'value', 0, 1.5 ).name( '水渍' );
			f.add( scene, 'environmentIntensity', 0, 2 ).name( '天光' );
			f.add( skyI, 'value', 0, 2 ).name( '天空' );
			f.add( sun, 'intensity', 0, 4 ).name( '阳光' );
			f.add( end.spot, 'intensity', 0, 200 ).name( '冷白灯' );
			f.add( renderer, 'toneMappingExposure', 0.2, 2 ).name( '曝光' );

		},
	};

}
