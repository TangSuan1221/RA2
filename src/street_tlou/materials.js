// 本场景的材质工具（TSL）：世界空间三平面贴图、去平铺采样、废土层（苔藓/水渍/潮湿）
// 全部在世界空间计算 —— 程序化几何没有 UV 拉伸，模块拼接处没有接缝
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, positionWorld, normalWorldGeometry, texture,
	mx_fractal_noise_float, mx_noise_float, materialColor, materialRoughness, luminance, abs, sin, cos, normalMap,
} from 'three/tsl';
import { loadTexture } from '../world/assets.js';

export const W = {
	wet: uniform( 0.6 ),
	moss: uniform( 0.45 ),
	mossColor: uniform( new THREE.Color( 0x27311b ) ),
	mossColor2: uniform( new THREE.Color( 0x343d24 ) ),
	grime: uniform( 0.7 ),
	streaks: uniform( 0.65 ),
};

const texCache = new Map();
// 读取 Poly Haven 贴图组（diff / nor_gl / arm），带缓存
export function texSet( id, res = '1k' ) {

	const key = id + res;
	if ( texCache.has( key ) ) return texCache.get( key );
	const p = `textures/${id}/${id}_`;
	const s = {
		diff: loadTexture( `${p}diff_${res}.jpg`, { srgb: true } ),
		nor: loadTexture( `${p}nor_gl_${res}.jpg` ),
		arm: loadTexture( `${p}arm_${res}.jpg` ),
	};
	texCache.set( key, s );
	return s;

}

// 世界空间三平面采样（scale = 每米多少个贴图周期）
export const triplanar = ( tex, scale, pos = positionWorld, nrm = normalWorldGeometry ) => {

	let bf = nrm.abs().pow( vec3( 4 ) );
	bf = bf.div( bf.x.add( bf.y ).add( bf.z ) );
	const p = pos.mul( scale );
	return texture( tex, p.zy ).mul( bf.x ).add( texture( tex, p.xz ).mul( bf.y ) ).add( texture( tex, p.xy ).mul( bf.z ) );

};

// 去平铺：两套尺度/旋转的采样按低频噪声混合（混合因子只算一次，多张贴图共享）
export function untiler( uv, rotA = 0.7 ) {

	const n = mx_fractal_noise_float( vec3( uv.mul( 0.23 ), 0 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const c = Math.cos( rotA ), s = Math.sin( rotA );
	const uv2 = vec2( uv.x.mul( c ).sub( uv.y.mul( s ) ), uv.x.mul( s ).add( uv.y.mul( c ) ) ).mul( 0.83 ).add( 0.37 );
	const k = smoothstep( 0.35, 0.65, n );
	return ( tex ) => mix( texture( tex, uv ), texture( tex, uv2 ), k );

}

export const untiled = ( tex, uv, rotA = 0.7 ) => untiler( uv, rotA )( tex );

// 竖向雨痕/黑色水渍遮罩（墙面），topY: 墙顶高度（流痕从顶部、窗台向下）
export const streakMask = Fn( ( [ p, nrmY ] ) => {

	const vertical = smoothstep( 0.6, 0.15, abs( nrmY ) );
	const sn = mx_fractal_noise_float( vec3( p.x.mul( 2.2 ).add( p.z.mul( 2.2 ) ), p.y.mul( 0.09 ), p.z.mul( 0.4 ) ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const fine = mx_noise_float( vec3( p.x.mul( 9.0 ).add( p.z.mul( 9.0 ) ), p.y.mul( 0.5 ), 0 ) ).mul( 0.5 ).add( 0.5 );
	// 楼层分隔下方（每 3m 一层的窗台/腰线）流痕更浓
	const ledge = p.y.div( 3.0 ).fract().mul( 0.3 );
	return smoothstep( 0.5, 0.82, sn.add( fine.mul( 0.18 ) ).add( ledge ) ).mul( vertical );

} );

/**
 * 给材质叠加废土层：墙根泥污、竖向水渍、朝上面与墙根的苔藓、潮湿变暗
 * @param {THREE.MeshStandardNodeMaterial} mat
 * @param {object} o  moss: 苔藓强度 0..1.5；streak：水渍强度；baseNode：替换基础色节点
 */
export function weatherMat( mat, { moss = 1, streak = 1, grime = 1, baseNode = null, roughNode = null, wet = 1 } = {} ) {

	const p = positionWorld;
	const ny = normalWorldGeometry.y;
	const base = baseNode || materialColor.rgb;
	const n1 = mx_fractal_noise_float( p.mul( 0.33 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const n2 = mx_fractal_noise_float( p.mul( 2.3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

	const vertical = smoothstep( 0.6, 0.15, abs( ny ) );
	const up = smoothstep( 0.3, 0.85, ny );
	// 墙根：泥水溅痕 + 苔藓
	const foot = smoothstep( 1.4, 0.0, p.y ).mul( vertical );
	const dirt = foot.mul( n2.mul( 0.6 ).add( 0.6 ) ).mul( W.grime ).mul( grime ).clamp();
	const st = streakMask( p, ny ).mul( W.streaks ).mul( streak );

	const mossBase = up.mul( 1.1 ).add( foot.mul( 0.9 ) ).add( st.mul( 0.25 ) ).mul( smoothstep( 0.3, 0.72, n1 ).mul( 1.4 ) ).mul( n2.mul( 0.6 ).add( 0.55 ) );
	const mk = smoothstep( float( 0.95 ).sub( W.moss.mul( moss ).mul( 0.6 ) ), float( 1.2 ).sub( W.moss.mul( moss ).mul( 0.6 ) ), mossBase );
	const mossCol = mix( vec3( W.mossColor ), vec3( W.mossColor2 ), n2 ).mul( n2.mul( 0.5 ).add( 0.75 ) );

	let col = mix( base, base.mul( vec3( 0.42, 0.40, 0.36 ) ), dirt.mul( 0.75 ) );
	col = mix( col, col.mul( vec3( 0.30, 0.31, 0.29 ) ), st.mul( 0.8 ) ); // 黑色水渍
	col = mix( col, mossCol, mk );
	const wetK = W.wet.mul( wet );
	col = col.mul( mix( float( 1 ), float( 0.68 ), wetK.mul( mk.oneMinus().mul( 0.6 ).add( 0.4 ) ) ) );
	mat.colorNode = col;

	const r0 = roughNode || materialRoughness;
	const wr = mix( r0, r0.mul( 0.55 ), wetK.mul( st.mul( 0.5 ).add( 0.5 ) ).mul( mk.oneMinus() ) );
	mat.roughnessNode = clamp( mix( wr, float( 0.92 ), mk ), 0.05, 1 );
	return mat;

}

// 三平面 PBR 材质（程序化几何用）：贴图组 + 世界空间投影 + 废土层
export function triMaterial( id, { res = '1k', scale = 0.5, tint = 0xffffff, moss = 1, streak = 1, grime = 1, metal = false, rough = 1, normalScale = 1 } = {} ) {

	const t = texSet( id, res );
	const m = new THREE.MeshStandardNodeMaterial( { color: tint, roughness: rough, metalness: 0 } );
	const arm = triplanar( t.arm, scale );
	const baseNode = triplanar( t.diff, scale ).rgb.mul( vec3( m.color ) );
	m.metalnessNode = metal ? arm.b : float( 0 );
	weatherMat( m, { moss, streak, grime, baseNode, roughNode: arm.g.mul( rough ) } );
	m.aoNode = arm.r.mul( 0.6 ).add( 0.4 );
	return m;

}
