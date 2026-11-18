// 场景宿主：按 ?scene= 加载 src/scenes/<名字>.js
// 每个场景模块导出：
//   build({ scene, renderer, camera, controls, params }) → { sun?, csm?, M?, update?(dt, t), pipelineOptions? }
//   SHOTS：固定机位表，?shot=<名字> 选择（用于截图对比）
// URL 参数：?scene=street|interior|...  ?shot=名字  ?ui=0（隐藏界面，截图用）  ?webgl（强制 WebGL2）
import * as THREE from 'three/webgpu';
import { createRenderer, createPipeline } from './core/renderer.js';
import { TopDownCamera } from './core/camera.js';
import { createDebugUI } from './debug/gui.js';
import { createStats } from './debug/stats.js';

const params = new URLSearchParams( location.search );
const SCENES = import.meta.glob( './scenes/*.js' );

async function main() {

	const name = params.get( 'scene' ) || 'street';
	const loader = SCENES[ `./scenes/${name}.js` ];
	if ( ! loader ) throw new Error( `没有场景：${name}（可选：${Object.keys( SCENES ).map( ( k ) => k.slice( 9, - 3 ) ).join( ', ' )}）` );
	const mod = await loader();

	const renderer = await createRenderer( { forceWebGL: params.has( 'webgl' ) } );
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 0.05, 400 );
	const controls = new TopDownCamera( camera, renderer.domElement );

	const ctx = await mod.build( { scene, renderer, camera, controls, params } );
	const shots = mod.SHOTS || {};
	const shot = shots[ params.get( 'shot' ) ] || Object.values( shots )[ 0 ];
	// 机位两种写法：{ mode, yaw, pitch, distance, target }（俯视控制器）或 { position, lookAt, fov }（固定电影机位）
	const applyShot = ( s ) => {

		if ( s.position ) {

			ctx.lockCamera = true;
			camera.position.set( ...s.position );
			camera.lookAt( ...s.lookAt );
			if ( s.fov ) { camera.fov = s.fov; camera.updateProjectionMatrix(); }

		} else {

			ctx.lockCamera = false;
			controls.setView( s );

		}

	};

	if ( shot ) applyShot( shot );
	window.__applyShot = ( n ) => applyShot( shots[ n ] );

	const { pipeline, aoPass, toggles, rebuild } = createPipeline( renderer, scene, camera, ctx.pipelineOptions );
	const ui = params.get( 'ui' ) !== '0';
	const stats = createStats( renderer, ui );
	let stress = null;
	if ( ui ) stress = createDebugUI( { renderer, scene, sun: ctx.sun, csm: ctx.csm, aoPass, toggles, rebuild, controls, M: ctx.M, extraGUI: ctx.gui, shots, applyShot } );
	else document.querySelectorAll( '#hud, #help' ).forEach( ( e ) => e.remove() );

	window.addEventListener( 'resize', () => {

		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( innerWidth, innerHeight );

	} );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.code === 'KeyC' ) controls.toggleMode();
		if ( e.code === 'KeyP' ) screenshot( renderer );

	} );

	window.__app = { renderer, scene, camera, controls, toggles, rebuild, stress, ctx, shots };
	document.getElementById( 'loading' ).remove();

	// 预编译所有着色器，避免首帧卡顿
	await renderer.compileAsync( scene, camera );

	const clock = new THREE.Timer();
	let frames = 0;
	renderer.setAnimationLoop( () => {

		clock.update();
		const dt = Math.min( clock.getDelta(), 0.1 );
		if ( ! ctx.lockCamera ) controls.update( dt );
		ctx.update?.( dt, clock.getElapsed() );
		renderer.info.reset();
		pipeline.render();
		stats.update( dt );
		if ( ++ frames === 30 ) window.__ready = true;

	} );

}

function screenshot( renderer ) {

	renderer.domElement.toBlob( ( blob ) => {

		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = `tlr-${Date.now()}.png`;
		a.click();

	} );

}

main().catch( ( e ) => {

	console.error( e );
	window.__error = e.message;
	const l = document.getElementById( 'loading' );
	if ( l ) l.textContent = '启动失败：' + e.message;

} );
