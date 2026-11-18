// 调试面板：所有氛围参数的实时滑条 + 后处理开关 + 性能压测
// 你可以自己拖到满意，然后点「导出参数」把数值发给我
import * as THREE from 'three/webgpu';
import GUI from 'lil-gui';
import { grade } from '../core/renderer.js';
import { weather, puddle } from '../materials/weathering.js';
import { atmos } from '../world/lighting.js';
import { ground } from '../world/ground.js';
import { InstanceBatch, trs } from '../world/assets.js';
import { rng } from '../world/buildings.js';

export function createDebugUI( { renderer, scene, sun, aoPass, toggles, rebuild, controls, M, extraGUI, shots = {}, applyShot } ) {

	const gui = new GUI( { title: '调试面板（P0）', width: 300 } );
	const u = ( folder, obj, key, min, max, step, label ) => folder.add( obj[ key ], 'value', min, max, step ).name( label );
	const col = ( folder, obj, key, label ) => {

		const proxy = { c: '#' + obj[ key ].value.getHexString() };
		folder.addColor( proxy, 'c' ).name( label ).onChange( ( v ) => obj[ key ].value.set( v ) );

	};

	const fW = gui.addFolder( '废土化 / 潮湿' );
	u( fW, weather, 'wetness', 0, 1, 0.01, '潮湿度' );
	u( fW, weather, 'mossAmount', 0, 1, 0.01, '苔藓覆盖' );
	u( fW, weather, 'creep', 0, 2, 0.01, '墙面植物蔓延高度' );
	u( fW, ground, 'grass', 0, 1, 0.01, '荒地野草覆盖' );
	col( fW, ground, 'grassColor', '野草颜色' );
	u( fW, weather, 'dirtAmount', 0, 1, 0.01, '墙根污渍' );
	u( fW, weather, 'streaks', 0, 1, 0.01, '雨痕' );
	u( fW, puddle, 'amount', 0, 1, 0.01, '积水量' );
	col( fW, weather, 'mossColor', '苔藓颜色' );

	const fA = gui.addFolder( '光照 / 大气' );
	if ( sun ) fA.add( sun, 'intensity', 0, 4, 0.05 ).name( '太阳强度' );
	fA.add( scene, 'environmentIntensity', 0, 2, 0.01 ).name( '天光强度' );
	fA.add( renderer, 'toneMappingExposure', 0.3, 2.5, 0.01 ).name( '曝光' );
	const sunAngle = { az: 148, el: 52 };
	const setSun = () => {

		if ( ! sun ) return;

		const a = THREE.MathUtils.degToRad( sunAngle.az ), e = THREE.MathUtils.degToRad( sunAngle.el );
		sun.position.set( Math.sin( a ) * Math.cos( e ), Math.sin( e ), Math.cos( a ) * Math.cos( e ) ).multiplyScalar( 80 );

	};

	setSun();
	fA.add( sunAngle, 'az', 0, 360, 1 ).name( '太阳方位' ).onChange( setSun );
	fA.add( sunAngle, 'el', 5, 89, 1 ).name( '太阳高度' ).onChange( setSun );
	col( fA, atmos, 'fogColor', '雾颜色' );
	u( fA, atmos, 'fogNear', 0, 100, 1, '雾起始距离' );
	u( fA, atmos, 'fogFar', 30, 400, 1, '雾完全距离' );
	u( fA, atmos, 'heightFogDensity', 0, 0.03, 0.0005, '贴地雾浓度' );
	u( fA, atmos, 'heightFogHeight', 0, 8, 0.1, '贴地雾高度' );
	fA.onChange( () => ( scene.background = atmos.fogColor.value ) );

	const fG = gui.addFolder( '调色' );
	u( fG, grade, 'contrast', 0.6, 1.6, 0.01, '对比度' );
	u( fG, grade, 'saturation', 0, 1.5, 0.01, '饱和度' );
	col( fG, grade, 'shadowTint', '暗部色调' );
	col( fG, grade, 'highlightTint', '亮部色调' );
	u( fG, grade, 'vignette', 0, 1, 0.01, '暗角' );
	u( fG, grade, 'grain', 0, 0.15, 0.001, '胶片颗粒' );
	u( fG, grade, 'bloomStrength', 0, 1, 0.01, '泛光' );

	const fP = gui.addFolder( '后处理开关（对比用）' );
	fP.add( toggles, 'ao' ).name( '环境光遮蔽 GTAO' ).onChange( rebuild );
	fP.add( toggles, 'taa' ).name( '时间抗锯齿 TRAA' ).onChange( rebuild );
	fP.add( toggles, 'bloom' ).name( '泛光' ).onChange( rebuild );
	fP.add( toggles, 'grade' ).name( '调色' ).onChange( rebuild );
	fP.add( toggles, 'aoOnly' ).name( '只看 AO 通道' ).onChange( rebuild );
	u( fP, aoPass, 'radius', 0.1, 3, 0.01, 'AO 半径' );
	u( fP, aoPass, 'scale', 0.2, 3, 0.01, 'AO 强度' );

	const fC = gui.addFolder( '镜头' );
	fC.add( { 切换俯视近景: () => controls.toggleMode() }, '切换俯视近景' );
	fC.add( controls.modes.top, 'pitch', 15, 85, 1 ).name( '俯视俯仰角' ).listen();
	fC.add( controls.modes.top, 'distance', 14, 90, 1 ).name( '俯视距离' ).listen();
	for ( const [ k, v ] of Object.entries( shots ) ) fC.add( { [ k ]: () => applyShot( v ) }, k ).name( '机位：' + k );
	extraGUI?.( gui );

	// —— 压测：额外撒 N 株植被，检测性能上限 ——
	const stress = { count: 0, group: null };
	const fS = gui.addFolder( '性能压测' );
	if ( ! M?.fern_02 ) fS.hide();
	fS.add( stress, 'count', [ 0, 10000, 30000, 60000 ] ).name( '额外植被实例' ).onChange( ( n ) => {

		if ( stress.group ) scene.remove( stress.group );
		stress.group = null;
		if ( ! n ) return;
		const b = new InstanceBatch(), r = rng( 99 );
		const ids = [ [ 'fern_02', 'fern_02_b' ], [ 'weed_plant_02', 'weed_plant_02_a_LOD0' ], [ 'shrub_04', 'shrub_04' ] ];
		for ( let i = 0; i < n; i ++ ) {

			const [ id, node ] = ids[ i % ids.length ];
			b.add( M[ id ].parts, node, trs( ( r() - 0.5 ) * 110, 0, ( r() - 0.5 ) * 110, r() * 6.28, id === 'fern_02' ? 1 : 3 ) );

		}

		stress.group = b.build();
		scene.add( stress.group );

	} );

	gui.add( { 导出参数: () => {

		const dump = {};
		const walk = ( name, obj ) => {

			dump[ name ] = {};
			for ( const [ k, v ] of Object.entries( obj ) ) dump[ name ][ k ] = v.value?.isColor ? '#' + v.value.getHexString() : v.value;

		};

		walk( 'weather', weather ); walk( 'puddle', puddle ); walk( 'atmos', atmos ); walk( 'grade', grade );
		dump.light = { sun: sun.intensity, env: scene.environmentIntensity, exposure: renderer.toneMappingExposure, ...sunAngle };
		const text = JSON.stringify( dump, null, 2 );
		navigator.clipboard?.writeText( text );
		console.log( text );
		alert( '参数已复制到剪贴板（也打印在控制台）' );

	} }, '导出参数' ).name( '📋 导出参数' );

	gui.close();
	return stress;

}
