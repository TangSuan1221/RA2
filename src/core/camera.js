// 俯视角相机控制器
// 模式一「俯视」：固定俯仰角（默认 55°），可旋转方位、缩放、WASD 平移 —— 未来游戏的主镜头
// 模式二「近景」：低角度近距离，用于和 TLOU2 第三人称参考图做氛围对比
import * as THREE from 'three/webgpu';

export class TopDownCamera {

	constructor( camera, dom ) {

		this.camera = camera;
		this.target = new THREE.Vector3( 0, 0, 0 );
		this.modes = {
			top: { pitch: 55, distance: 38, minD: 14, maxD: 90 },
			close: { pitch: 14, distance: 7, minD: 3, maxD: 16, height: 1.6 },
		};
		this.mode = 'top';
		this.yaw = 35; // 度
		this.keys = new Set();
		this._drag = null;

		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		dom.addEventListener( 'pointerdown', ( e ) => {

			if ( e.button === 2 || e.button === 1 ) this._drag = { x: e.clientX, y: e.clientY };

		} );
		window.addEventListener( 'pointerup', () => ( this._drag = null ) );
		window.addEventListener( 'pointermove', ( e ) => {

			if ( ! this._drag ) return;
			const m = this.modes[ this.mode ];
			this.yaw -= ( e.clientX - this._drag.x ) * 0.3;
			m.pitch = THREE.MathUtils.clamp( m.pitch + ( e.clientY - this._drag.y ) * 0.2, 5, 85 );
			this._drag = { x: e.clientX, y: e.clientY };

		} );
		dom.addEventListener( 'wheel', ( e ) => {

			const m = this.modes[ this.mode ];
			m.distance = THREE.MathUtils.clamp( m.distance * ( 1 + Math.sign( e.deltaY ) * 0.1 ), m.minD, m.maxD );

		}, { passive: true } );
		window.addEventListener( 'keydown', ( e ) => this.keys.add( e.code ) );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );

	}

	toggleMode() {

		this.mode = this.mode === 'top' ? 'close' : 'top';

	}

	update( dt ) {

		const m = this.modes[ this.mode ];
		const yaw = THREE.MathUtils.degToRad( this.yaw );
		const fwd = new THREE.Vector3( - Math.sin( yaw ), 0, - Math.cos( yaw ) );
		const right = new THREE.Vector3( - fwd.z, 0, fwd.x );
		const speed = ( this.keys.has( 'ShiftLeft' ) ? 30 : 12 ) * dt;
		if ( this.keys.has( 'KeyW' ) ) this.target.addScaledVector( fwd, speed );
		if ( this.keys.has( 'KeyS' ) ) this.target.addScaledVector( fwd, - speed );
		if ( this.keys.has( 'KeyD' ) ) this.target.addScaledVector( right, speed );
		if ( this.keys.has( 'KeyA' ) ) this.target.addScaledVector( right, - speed );
		this.target.x = THREE.MathUtils.clamp( this.target.x, - 30, 30 );
		this.target.z = THREE.MathUtils.clamp( this.target.z, - 30, 30 );

		const pitch = THREE.MathUtils.degToRad( m.pitch );
		const look = this.target.clone();
		if ( this.mode === 'close' ) look.y += m.height;
		const offset = new THREE.Vector3(
			Math.sin( yaw ) * Math.cos( pitch ),
			Math.sin( pitch ),
			Math.cos( yaw ) * Math.cos( pitch ),
		).multiplyScalar( m.distance );
		this.camera.position.copy( look ).add( offset );
		this.camera.lookAt( look );

	}

	// 用于截图对比时恢复固定机位
	setView( { mode, yaw, pitch, distance, target } ) {

		this.mode = mode;
		this.yaw = yaw;
		Object.assign( this.modes[ mode ], { pitch, distance } );
		this.target.set( ...target );

	}

}
