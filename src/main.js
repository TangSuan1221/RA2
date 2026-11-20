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

	const name = params.get( 'scene' ) || 'flooded_atrium';
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
	window.__applyShot = ( n ) => { if ( shots[ n ] ) applyShot( shots[ n ] ); };

	const { pipeline, aoPass, toggles, rebuild } = createPipeline( renderer, scene, camera, ctx.pipelineOptions );
	const ui = params.get( 'ui' ) !== '0';
	if ( ui ) {
		const nav = document.createElement( 'nav' );
		nav.id = 'scene-nav';
		const entries = { flooded_atrium: '淹水中庭', hospital: '废弃病房', aquarium: '鲸鱼展厅', street_tlou: '城市街道', city_vista: '城市远眺', alley_moss: '苔藓小巷', interior_sun: '旧书店', interior_dark: '黑水走廊' };
		const select = document.createElement( 'select' ); select.setAttribute( 'aria-label', '选择场景' );
		for ( const [ value, label ] of Object.entries( entries ) ) {
			const option = new Option( label, value ); option.selected = value === name; select.add( option );
		}
		select.addEventListener( 'change', () => { const next = new URL( location.href ); next.searchParams.set( 'scene', select.value ); if (select.value === 'street_tlou') next.searchParams.set('shot','golden'); else next.searchParams.delete( 'shot' ); location.href = next.href; } );
		nav.append( select );
		for ( const key of Object.keys( shots ) ) { const button = document.createElement( 'button' ); button.textContent = key === 'hero' ? '参考机位' : key === 'top' ? '俯视探索' : key; button.addEventListener( 'click', () => { if (name === 'street_tlou' && (key === 'golden' || params.get('shot') === 'golden')) { const next = new URL(location.href); next.searchParams.set('shot',key); location.href = next.href; } else applyShot(shots[key]); } ); nav.append( button ); }
		document.body.append( nav );
	}
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

		if ( /^(INPUT|SELECT|TEXTAREA)$/.test( e.target?.tagName ) ) return;
		if ( e.code === 'KeyC' ) {
			if ( ctx.lockCamera && shots.top ) applyShot( shots.top );
			else { ctx.lockCamera = false; controls.toggleMode(); }
		}
		if ( e.code === 'KeyP' ) screenshot( renderer );

	} );

	window.__app = { renderer, scene, camera, controls, toggles, rebuild, stress, ctx, shots };
	document.getElementById( 'loading' ).remove();

	// 预编译所有着色器，避免首帧卡顿
	window.__phase = 'compile';
 if (params.get('compile') !== 'skip') await renderer.compileAsync(scene,camera);
 window.__phase = 'first frame';

	const clock = new THREE.Timer();
	let frames = 0;
	renderer.setAnimationLoop( () => {

		clock.update();
		const dt = Math.min( clock.getDelta(), 0.1 );
		if ( ! ctx.lockCamera ) controls.update( dt );
		ctx.update?.( dt, clock.getElapsed() );
		renderer.info.reset();
		pipeline.render();
		stats.update( clock.getDelta() );
		if (++frames === 30) { window.__phase = 'ready'; window.__ready = true; }

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


