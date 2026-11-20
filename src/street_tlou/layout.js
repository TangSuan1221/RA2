// 场景布局常量（单位：米，+X 东，-Z 为主街向前延伸方向）
// 主街：南北向，x ∈ [-7, 7]（四车道），两侧人行道 4m，x ∈ ±[7, 11]
// 十字路口：东西向横街 z ∈ [-22, -8]
export const L = {
	roadHalf: 7,
	walk: 4,
	curb: 0.16,
	cross: { z0: - 22, z1: - 8 }, // 十字路口（俯视镜头的中心）
	zNear: 40, // 场景近端
	zFar: - 150, // 主街远端
	crossFar: 120, // 横街两端长度
};

export const onMainRoad = ( x, z ) => Math.abs( x ) < L.roadHalf && z < L.zNear && z > L.zFar;
export const onCrossRoad = ( x, z ) => z > L.cross.z0 && z < L.cross.z1 && Math.abs( x ) < L.crossFar;
export const onRoad = ( x, z ) => onMainRoad( x, z ) || onCrossRoad( x, z );

// 人行道（路缘抬高）
export function onWalk( x, z ) {

	if ( onRoad( x, z ) ) return false;
	const ax = Math.abs( x );
	const nearMain = ax < L.roadHalf + L.walk;
	const nearCross = ( z > L.cross.z0 - L.walk && z < L.cross.z1 + L.walk );
	return nearMain || nearCross;

}

export const groundY = ( x, z ) => ( onWalk( x, z ) ? L.curb : 0 );
