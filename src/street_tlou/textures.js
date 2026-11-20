// 程序化植被贴图（Canvas 绘制）：常春藤叶簇、草丛、落叶/纸屑
// 全部自绘，避免 Poly Haven 植被贴图偏枯黄的问题；颜色在着色器里再做实例级变化
import * as THREE from 'three/webgpu';
import { rng } from './noise.js';

function canvas( w, h ) {

	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	return [ c, c.getContext( '2d' ) ];

}

// 生成颜色贴图 + 独立 Alpha 贴图：透明区域填背景色，避免 mipmap 把黑边混进叶片边缘
function finish( c, bg = 'rgb(60,70,40)' ) {

	const w = c.width, h = c.height;
	const [ ca, ctxA ] = canvas( w, h );
	const src = c.getContext( '2d' ).getImageData( 0, 0, w, h );
	const a = ctxA.createImageData( w, h );
	for ( let i = 0; i < src.data.length; i += 4 ) {

		const v = src.data[ i + 3 ];
		a.data[ i ] = a.data[ i + 1 ] = a.data[ i + 2 ] = v; a.data[ i + 3 ] = 255;

	}

	ctxA.putImageData( a, 0, 0 );
	const [ cc, ctxC ] = canvas( w, h );
	ctxC.fillStyle = bg; ctxC.fillRect( 0, 0, w, h );
	// 先把叶片放大模糊铺一层（颜色外扩），再叠原图
	ctxC.filter = 'blur(6px)'; ctxC.drawImage( c, 0, 0 ); ctxC.drawImage( c, 0, 0 );
	ctxC.filter = 'none'; ctxC.drawImage( c, 0, 0 );
	const map = tex( cc, true ), alphaMap = tex( ca, false );
	return { map, alphaMap };

}

function tex( c, srgb ) {

	const t = new THREE.CanvasTexture( c );
	if ( srgb ) t.colorSpace = THREE.SRGBColorSpace;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.anisotropy = 8;
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.needsUpdate = true;
	return t;

}

// 常春藤单叶路径（三到五裂掌状叶），以叶柄为原点，叶尖朝 -y
function ivyLeafPath( ctx, s, lobes ) {

	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	if ( lobes ) {

		ctx.bezierCurveTo( - 0.35 * s, 0.05 * s, - 0.62 * s, - 0.12 * s, - 0.55 * s, - 0.34 * s ); // 左下裂
		ctx.bezierCurveTo( - 0.42 * s, - 0.42 * s, - 0.38 * s, - 0.5 * s, - 0.25 * s, - 0.56 * s );
		ctx.bezierCurveTo( - 0.2 * s, - 0.75 * s, - 0.08 * s, - 0.9 * s, 0, - 1.0 * s ); // 叶尖
		ctx.bezierCurveTo( 0.08 * s, - 0.9 * s, 0.2 * s, - 0.75 * s, 0.25 * s, - 0.56 * s );
		ctx.bezierCurveTo( 0.38 * s, - 0.5 * s, 0.42 * s, - 0.42 * s, 0.55 * s, - 0.34 * s );
		ctx.bezierCurveTo( 0.62 * s, - 0.12 * s, 0.35 * s, 0.05 * s, 0, 0 );

	} else {

		ctx.bezierCurveTo( - 0.5 * s, - 0.1 * s, - 0.45 * s, - 0.7 * s, 0, - 1.0 * s );
		ctx.bezierCurveTo( 0.45 * s, - 0.7 * s, 0.5 * s, - 0.1 * s, 0, 0 );

	}

	ctx.closePath();

}

// 叶簇贴图：一根短茎上 7~11 片叶，2×2 图集（4 种变体）
export function makeIvyTexture() {

	const S = 1024, H = S / 2;
	const [ c, ctx ] = canvas( S, S );
	const r = rng( 91 );
	for ( let q = 0; q < 4; q ++ ) {

		ctx.save();
		ctx.translate( ( q % 2 ) * H, Math.floor( q / 2 ) * H );
		ctx.beginPath(); ctx.rect( 0, 0, H, H ); ctx.clip();
		const n = 8 + Math.floor( r() * 5 );
		const leaves = [];
		for ( let i = 0; i < n; i ++ ) {

			const a = r() * Math.PI * 2;
			const d = 30 + r() * 120;
			leaves.push( { x: H / 2 + Math.cos( a ) * d * 0.9, y: H / 2 + Math.sin( a ) * d * 0.9, rot: a + Math.PI / 2 + ( r() - 0.5 ) * 0.8, s: 70 + r() * 55, lobes: r() < 0.75, d } );

		}

		leaves.sort( ( a, b ) => b.d - a.d ); // 外圈先画，内圈叠在上面
		// 茎
		ctx.strokeStyle = 'rgb(52,44,30)';
		ctx.lineWidth = 5;
		for ( const l of leaves ) {

			ctx.beginPath(); ctx.moveTo( H / 2, H / 2 ); ctx.quadraticCurveTo( ( H / 2 + l.x ) / 2 + 10, ( H / 2 + l.y ) / 2, l.x, l.y ); ctx.stroke();

		}

		for ( const l of leaves ) {

			ctx.save();
			ctx.translate( l.x, l.y );
			ctx.rotate( l.rot );
			// 底色：深浅不同的绿，少量偏黄/偏褐的老叶
			// 深绿为主（ref1 的植被密度、ref5 的去饱和），少量老叶偏黄褐
			const old = r() < 0.1;
			const g = 62 + r() * 46, rr = 30 + r() * 24 + ( old ? 45 : 0 ), b = 20 + r() * 16;
			const grad = ctx.createLinearGradient( 0, 0, 0, - l.s );
			grad.addColorStop( 0, `rgb(${rr * 0.6 | 0},${g * 0.62 | 0},${b * 0.6 | 0})` );
			grad.addColorStop( 0.6, `rgb(${rr | 0},${g | 0},${b | 0})` );
			grad.addColorStop( 1, `rgb(${rr * 1.1 | 0},${g * 1.08 | 0},${b | 0})` );
			ivyLeafPath( ctx, l.s, l.lobes );
			ctx.fillStyle = grad;
			ctx.fill();
			// 叶边缘暗线
			ctx.strokeStyle = 'rgba(20,28,12,0.55)'; ctx.lineWidth = 2; ctx.stroke();
			// 叶脉
			ctx.strokeStyle = 'rgba(150,170,110,0.35)'; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( 0, - l.s * 0.92 );
			if ( l.lobes ) { ctx.moveTo( 0, - l.s * 0.1 ); ctx.lineTo( - l.s * 0.45, - l.s * 0.32 ); ctx.moveTo( 0, - l.s * 0.1 ); ctx.lineTo( l.s * 0.45, - l.s * 0.32 ); }
			ctx.stroke();
			ctx.restore();

		}

		ctx.restore();

	}

	return finish( c, 'rgb(48,60,30)' );

}

// 草丛贴图：大量细长叶片（底部暗、尖端亮），含少量枯黄
export function makeGrassTexture() {

	const W = 512, Hh = 512;
	const [ c, ctx ] = canvas( W, Hh );
	const r = rng( 17 );
	for ( let i = 0; i < 170; i ++ ) {

		const x0 = W * 0.1 + r() * W * 0.8;
		const h = Hh * ( 0.35 + r() * 0.62 );
		const lean = ( r() - 0.5 ) * W * 0.45;
		const w = 4 + r() * 7;
		const dry = r() < 0.18;
		const g = dry ? [ 130 + r() * 30, 120 + r() * 25, 70 ] : [ 70 + r() * 30, 100 + r() * 45, 40 + r() * 15 ];
		const grad = ctx.createLinearGradient( 0, Hh, 0, Hh - h );
		grad.addColorStop( 0, `rgb(${g[ 0 ] * 0.55 | 0},${g[ 1 ] * 0.55 | 0},${g[ 2 ] * 0.55 | 0})` );
		grad.addColorStop( 0.5, `rgb(${g[ 0 ] * 0.8 | 0},${g[ 1 ] * 0.8 | 0},${g[ 2 ] * 0.8 | 0})` );
		grad.addColorStop( 1, `rgb(${g[ 0 ] | 0},${g[ 1 ] | 0},${g[ 2 ] | 0})` );
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo( x0 - w, Hh );
		ctx.quadraticCurveTo( x0 + lean * 0.3, Hh - h * 0.6, x0 + lean, Hh - h );
		ctx.quadraticCurveTo( x0 + lean * 0.3 + w * 0.3, Hh - h * 0.6, x0 + w, Hh );
		ctx.closePath();
		ctx.fill();

	}

	return finish( c, 'rgb(70,80,40)' );

}

// 地面碎屑贴图（2×2 图集）：0 报纸 / 1 布料（衣物）/ 2、3 落叶团（多种叶形、湿褐色、边缘稀疏）
export function makeLitterTexture() {

	const S = 1024, H = 512;
	const [ c, ctx ] = canvas( S, S );
	const r = rng( 5 );
	// 0：报纸（折叠、受潮泛黄、墨迹被水晕开）
	ctx.save();
	ctx.translate( 40, 60 );
	ctx.fillStyle = 'rgb(128,124,110)'; ctx.beginPath(); ctx.moveTo( 0, 20 ); ctx.lineTo( 420, 0 ); ctx.lineTo( 440, 380 ); ctx.lineTo( 10, 400 ); ctx.fill();
	ctx.fillStyle = 'rgba(30,30,28,0.5)';
	for ( let y = 60; y < 380; y += 13 ) for ( let x = 20; x < 410; x += 132 ) ctx.fillRect( x, y + x * - 0.04, 118 * ( 0.6 + r() * 0.4 ), 4 );
	ctx.fillStyle = 'rgba(20,20,20,0.7)'; ctx.fillRect( 20, 28, 390, 22 );
	ctx.fillStyle = 'rgba(80,66,40,0.35)'; ctx.beginPath(); ctx.ellipse( 300, 260, 140, 90, 0.4, 0, 7 ); ctx.fill();
	ctx.strokeStyle = 'rgba(60,58,50,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo( 220, 10 ); ctx.lineTo( 225, 390 ); ctx.stroke();
	ctx.restore();
	// 1：布料（深色外套/衬衫，皱褶）
	ctx.save();
	ctx.translate( H + 30, 40 );
	ctx.fillStyle = 'rgb(46,50,52)';
	ctx.beginPath(); ctx.moveTo( 120, 30 ); ctx.lineTo( 330, 20 ); ctx.lineTo( 440, 120 ); ctx.lineTo( 380, 170 ); ctx.lineTo( 350, 420 ); ctx.lineTo( 110, 430 ); ctx.lineTo( 90, 180 ); ctx.lineTo( 20, 150 ); ctx.closePath(); ctx.fill();
	for ( let i = 0; i < 40; i ++ ) {

		ctx.strokeStyle = `rgba(${r() < 0.5 ? '10,10,10' : '90,95,95'},${0.15 + r() * 0.2})`; ctx.lineWidth = 3 + r() * 8;
		const x = 100 + r() * 260, y = 60 + r() * 340;
		ctx.beginPath(); ctx.moveTo( x, y ); ctx.quadraticCurveTo( x + ( r() - 0.5 ) * 80, y + 30, x + ( r() - 0.5 ) * 120, y + 60 + r() * 60 ); ctx.stroke();

	}

	ctx.fillStyle = 'rgba(70,60,40,0.35)'; ctx.beginPath(); ctx.ellipse( 240, 330, 120, 70, 0, 0, 7 ); ctx.fill();
	ctx.restore();
	// 2/3：落叶团
	for ( let q = 2; q < 4; q ++ ) {

		const ox = ( q % 2 ) * H, oy = H;
		ctx.save();
		ctx.beginPath(); ctx.rect( ox, oy, H, H ); ctx.clip();
		const n = 140;
		for ( let i = 0; i < n; i ++ ) {

			const a = r() * Math.PI * 2, d = Math.pow( r(), 0.7 ) * 210;
			ctx.save();
			ctx.translate( ox + H / 2 + Math.cos( a ) * d, oy + H / 2 + Math.sin( a ) * d * 0.9 );
			ctx.rotate( r() * 7 );
			const t = r();
			const v = 0.55 + r() * 0.45;
			const col = t < 0.45 ? [ 92, 62, 34 ] : t < 0.75 ? [ 70, 58, 36 ] : t < 0.9 ? [ 104, 84, 40 ] : [ 50, 58, 34 ];
			ctx.fillStyle = `rgb(${col[ 0 ] * v | 0},${col[ 1 ] * v | 0},${col[ 2 ] * v | 0})`;
			const sz = 16 + r() * 22;
			if ( r() < 0.5 ) ivyLeafPath( ctx, sz, false ); else { ctx.beginPath(); ctx.ellipse( 0, - sz * 0.45, sz * 0.2, sz * 0.5, 0, 0, 7 ); }
			ctx.fill();
			ctx.strokeStyle = 'rgba(30,20,10,0.5)'; ctx.lineWidth = 1.5;
			ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( 0, - sz * 0.9 ); ctx.stroke();
			ctx.restore();

		}

		ctx.restore();

	}

	return finish( c, 'rgb(70,58,40)' );

}

// 阔叶杂草图集（2×2）：蒲公英莲座、车前草、细长芒草、蕨状复叶
export function makeWeedTexture() {

	const S = 1024, H = 512;
	const [ c, ctx ] = canvas( S, S );
	const r = rng( 61 );
	const leafCol = ( k = 1 ) => {

		const g = ( 70 + r() * 40 ) * k, rr = ( 38 + r() * 22 ) * k, b = ( 22 + r() * 14 ) * k;
		return [ rr, g, b ];

	};

	for ( let q = 0; q < 4; q ++ ) {

		const ox = ( q % 2 ) * H, oy = Math.floor( q / 2 ) * H;
		ctx.save();
		ctx.beginPath(); ctx.rect( ox, oy, H, H ); ctx.clip();
		ctx.translate( ox + H / 2, oy + H );
		const blades = q === 2 ? 60 : q === 3 ? 9 : 14;
		for ( let i = 0; i < blades; i ++ ) {

			const ang = ( r() - 0.5 ) * ( q === 2 ? 0.9 : 1.6 );
			const len = H * ( q === 2 ? 0.55 + r() * 0.4 : 0.45 + r() * 0.45 );
			const wdt = q === 0 ? 34 : q === 1 ? 60 : q === 2 ? 6 : 18;
			const col = leafCol( 0.8 + r() * 0.4 );
			const grad = ctx.createLinearGradient( 0, 0, 0, - len );
			grad.addColorStop( 0, `rgb(${col[ 0 ] * 0.45 | 0},${col[ 1 ] * 0.45 | 0},${col[ 2 ] * 0.45 | 0})` );
			grad.addColorStop( 1, `rgb(${col[ 0 ] | 0},${col[ 1 ] | 0},${col[ 2 ] | 0})` );
			ctx.save();
			ctx.rotate( ang );
			ctx.fillStyle = grad;
			ctx.beginPath();
			if ( q === 0 ) {

				// 蒲公英：锯齿边
				ctx.moveTo( 0, 0 );
				const k = 6;
				for ( let j = 1; j <= k; j ++ ) { const y = - len * j / k; ctx.lineTo( - wdt * ( 0.4 + 0.6 * Math.sin( j / k * 3 ) ), y + len / k * 0.6 ); ctx.lineTo( - wdt * 0.15, y ); }
				for ( let j = k; j >= 1; j -- ) { const y = - len * j / k; ctx.lineTo( wdt * 0.15, y ); ctx.lineTo( wdt * ( 0.4 + 0.6 * Math.sin( j / k * 3 ) ), y + len / k * 0.6 ); }

			} else if ( q === 3 ) {

				// 蕨状复叶：中轴 + 两侧小叶
				ctx.rect( - 2, - len, 4, len );
				for ( let j = 1; j < 14; j ++ ) { const y = - len * j / 14, w = wdt * 2.4 * ( 1 - j / 15 ); ctx.ellipse( - w / 2, y, w / 2, 5, 0.3, 0, 7 ); ctx.ellipse( w / 2, y, w / 2, 5, - 0.3, 0, 7 ); }

			} else {

				ctx.moveTo( - wdt * 0.3, 0 );
				ctx.quadraticCurveTo( - wdt, - len * 0.5, 0, - len );
				ctx.quadraticCurveTo( wdt, - len * 0.5, wdt * 0.3, 0 );

			}

			ctx.fill();
			ctx.strokeStyle = 'rgba(160,180,120,0.25)'; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( 0, - len * 0.9 ); ctx.stroke();
			ctx.restore();

		}

		ctx.restore();

	}

	return finish( c, 'rgb(40,52,26)' );

}
