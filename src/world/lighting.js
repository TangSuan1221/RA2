// 光照与大气：阴天 HDRI 天光 + 弱方向光（云层透光）+ 高度雾 + 距离雾
// 目标：参考图 4 的「阴天、湿冷、青灰」氛围 —— 低对比的柔光，影子软而淡
import * as THREE from 'three/webgpu';
import {
	uniform, fog, rangeFogFactor, exponentialHeightFogFactor, color, float, max,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { loadHDR } from './assets.js';

export const atmos = {
	fogColor: uniform( new THREE.Color( 0x6d7774 ) ),
	fogNear: uniform( 25 ),
	fogFar: uniform( 160 ),
	heightFogDensity: uniform( 0.006 ),
	heightFogHeight: uniform( 1.5 ),
};

export async function setupLighting( scene, renderer, camera ) {

	// HDRI：伦敦阴天街道（低对比自然光）。用作环境光与反射，背景用雾色纯色（俯视镜头几乎看不到天空）
	const hdr = await loadHDR( 'hdri/urban_street_01_1k.hdr' );
	scene.environment = hdr;
	scene.environmentIntensity = 0.55;
	scene.background = new THREE.Color( 0x6d7774 );

	// 云层后的太阳：低强度、偏冷
	const sun = new THREE.DirectionalLight( 0xdfe6ea, 1.1 );
	sun.position.set( - 40, 60, 25 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.radius = 4;
	sun.shadow.bias = - 0.0003;
	sun.shadow.normalBias = 0.03;
	const csm = new CSMShadowNode( sun, { cascades: 3, maxFar: 140, mode: 'practical', lightMargin: 40 } );
	csm.fade = true;
	sun.shadow.shadowNode = csm;
	scene.add( sun );

	// 雾：距离雾 + 低洼处高度雾（贴地的湿气）
	const distFog = rangeFogFactor( atmos.fogNear, atmos.fogFar );
	const hFog = exponentialHeightFogFactor( atmos.heightFogDensity, atmos.heightFogHeight );
	scene.fogNode = fog( atmos.fogColor, max( distFog, hFog ) );

	return { sun, hdr, csm };

}
