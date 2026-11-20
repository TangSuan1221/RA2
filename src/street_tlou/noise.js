// JS 端噪声与随机数（布置植被/裂缝/藤蔓时在 CPU 上使用）
export function rng( seed ) {

	let s = ( seed >>> 0 ) || 1;
	return () => ( ( s = ( s * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

}

// 整数哈希 → [0,1)
function hash2( x, y, seed ) {

	let h = ( x * 374761393 + y * 668265263 + seed * 2147483647 ) | 0;
	h = ( h ^ ( h >>> 13 ) ) * 1274126177 | 0;
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}

const fade = ( t ) => t * t * ( 3 - 2 * t );

// 二维值噪声 [0,1]
export function vnoise( x, y, seed = 0 ) {

	const xi = Math.floor( x ), yi = Math.floor( y );
	const xf = fade( x - xi ), yf = fade( y - yi );
	const a = hash2( xi, yi, seed ), b = hash2( xi + 1, yi, seed );
	const c = hash2( xi, yi + 1, seed ), d = hash2( xi + 1, yi + 1, seed );
	return a + ( b - a ) * xf + ( c - a ) * yf + ( a - b - c + d ) * xf * yf;

}

// 分形噪声 [0,1]
export function fbm( x, y, oct = 4, seed = 0 ) {

	let sum = 0, amp = 0.5, norm = 0, f = 1;
	for ( let i = 0; i < oct; i ++ ) {

		sum += vnoise( x * f, y * f, seed + i * 17 ) * amp;
		norm += amp; amp *= 0.5; f *= 2.03;

	}

	return sum / norm;

}

export const clamp01 = ( v ) => Math.min( 1, Math.max( 0, v ) );
export const smooth = ( a, b, v ) => {

	const t = clamp01( ( v - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};
