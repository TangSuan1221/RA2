// 手电：共享 uniform（灰尘粒子、叶片透射都要用到手电的解析光照）+ 程序化光斑 cookie 贴图
import * as THREE from 'three/webgpu';
import { uniform, vec3, float, smoothstep, normalize, dot, length, max } from 'three/tsl';

// 光斑 cookie：中心热点（硬边）→ 一圈淡淡的镜面反射环 → 宽而弱的溢光，外缘渐隐
// 另带少量同心细纹（反光杯的不完美），避免完美的 CG 圆
export function makeCookieTexture( size = 512 ) {

	const c = document.createElement( 'canvas' );
	c.width = c.height = size;
	const g = c.getContext( '2d' );
	const img = g.createImageData( size, size );
	const prof = ( r ) => {

		// r: 0 中心 → 1 光锥边缘
		// 第四轮：硬边热点（r≈0.34 处 4% 宽的陡降）→ 极弱的外圈溢光，光锥外几乎无光 → 光斑是清晰的椭圆，不再是一团乳白光晕
		const core = 1.0 - THREE.MathUtils.smoothstep( r, 0.3, 0.355 );
		const hot = - Math.exp( - ( r * r ) / 0.006 ) * 0.12; // 中心灯珠投影略暗
		const ring = Math.exp( - ( ( r - 0.3 ) ** 2 ) / 0.0006 ) * 0.28; // 反光杯亮环（紧贴硬边内侧）
		const spill = 0.16 * ( 1.0 - THREE.MathUtils.smoothstep( r, 0.34, 0.92 ) ); // 外圈溢光（照亮门周围的常春藤墙）
		const ripple = 1.0 + 0.05 * Math.sin( r * 110.0 ) * ( 1 - r ); // 同心细纹
		return Math.min( 1.4, ( core * 0.95 + hot + ring * core + spill ) * ripple );

	};

	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		const dx = ( x + 0.5 ) / size * 2 - 1, dy = ( y + 0.5 ) / size * 2 - 1;
		const r = Math.sqrt( dx * dx + dy * dy );
		// 轻微的方向性不均匀（灯珠偏心）
		const a = Math.atan2( dy, dx );
		const v = r >= 1 ? 0 : prof( r * ( 1 + 0.03 * Math.sin( a * 3 + 0.7 ) ) );
		const o = ( y * size + x ) * 4;
		const b = Math.min( 255, Math.round( v / 1.4 * 255 ) );
		img.data[ o ] = b; img.data[ o + 1 ] = b; img.data[ o + 2 ] = b; img.data[ o + 3 ] = 255;

	}

	g.putImageData( img, 0, 0 );
	const t = new THREE.CanvasTexture( c );
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.colorSpace = THREE.NoColorSpace;
	return t;

}

// 手电的解析参数（与 SpotLight 同步，update 里刷新）
export const FL = {
	pos: uniform( new THREE.Vector3() ),
	dir: uniform( new THREE.Vector3( 0, 0, - 1 ) ),
	intensity: uniform( 1 ),
	color: uniform( new THREE.Color( 0xffe9c8 ) ),
	cosCore: uniform( Math.cos( 0.088 ) ),
	cosEdge: uniform( Math.cos( 0.102 ) ),
};

// 某点受到的手电辐照度（不含阴影）：热点光锥 + 平方反比
export function flashAt( p ) {

	const toP = p.sub( FL.pos );
	const d = length( toP );
	const cd = dot( normalize( toP ), FL.dir );
	// 硬边热点 + 外圈 16% 溢光（与 cookie 一致）
	const cone = smoothstep( FL.cosEdge, FL.cosCore, cd ).add( smoothstep( Math.cos( 0.28 ), Math.cos( 0.1 ), cd ).mul( 0.16 ) );
	return vec3( FL.color ).mul( FL.intensity ).mul( cone ).div( max( d.mul( d ), float( 0.25 ) ) );

}

export function syncFlash( light ) {

	light.updateMatrixWorld();
	light.target.updateMatrixWorld();
	const p = new THREE.Vector3().setFromMatrixPosition( light.matrixWorld );
	const t = new THREE.Vector3().setFromMatrixPosition( light.target.matrixWorld );
	FL.pos.value.copy( p );
	FL.dir.value.copy( t.sub( p ).normalize() );
	FL.intensity.value = light.intensity;

}
