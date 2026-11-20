import {RepeatWrapping, SRGBColorSpace, TextureLoader} from 'three';

// World-locked triangular lattice adapted from Dreamfall's hexTilingNodes.js.
// Translation preserves the tangent basis of asphalt cracks and the direction of tread.
const hexSampling = `
vec2 cellOffset(vec2 cell){
 return fract(sin(vec2(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3))))*43758.5453);
}
struct SurfaceTiles { vec2 a; vec2 b; vec2 c; vec3 weights; };
SurfaceTiles surfaceTiles(vec2 uv){
 vec2 lattice=vec2(uv.x-uv.y*.57735027,uv.y*1.15470054)*.63;
 vec2 base=floor(lattice),f=fract(lattice);
 float upper=step(1.,f.x+f.y);
 vec3 w=vec3(abs(1.-f.x-f.y),mix(f.x,1.-f.y,upper),mix(f.y,1.-f.x,upper));
 w*=w; w*=w;
 return SurfaceTiles(cellOffset(base+upper),cellOffset(base+vec2(1.,0.)),cellOffset(base+vec2(0.,1.)),w/dot(w,vec3(1.)));
}
vec4 tileSample(sampler2D tex,vec2 uv,SurfaceTiles h){
 vec2 dx=dFdx(uv),dy=dFdy(uv);
 return textureGrad(tex,uv+h.a,dx,dy)*h.weights.x + textureGrad(tex,uv+h.b,dx,dy)*h.weights.y + textureGrad(tex,uv+h.c,dx,dy)*h.weights.z;
}`;

// Road UVs are in world metres before the material's repeat transform.
export function surfaceWeather(road, soil) {
  const rain = {value: 0};
  const loader = new TextureLoader();
  const meadow = loader.load('/assets/textures/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg');
  meadow.wrapS = meadow.wrapT = RepeatWrapping;
  meadow.colorSpace = SRGBColorSpace;
  meadow.anisotropy = 4;
  for (const [material, textureName, resolution, onRoad] of [
    [road, 'road_damaged', '2k', true],
    [soil, 'sparse_grass', '1k', false]
  ]) {
    const detail = loader.load('/assets/textures/' + textureName + '/' + textureName + '_diff_' + resolution + '.jpg');
    detail.wrapS = detail.wrapT = RepeatWrapping;
    detail.colorSpace = SRGBColorSpace;
    detail.anisotropy = 4;
    material.customProgramCacheKey = () => 'weather-surface-' + textureName;
    material.onBeforeCompile = shader => {
      shader.uniforms.patchMap = {value: detail};
      if (!onRoad) shader.uniforms.meadow = {value: meadow};
      shader.uniforms.rainAmount = rain;
      shader.fragmentShader = hexSampling+'\nuniform sampler2D patchMap;\nuniform float rainAmount;\n' + shader.fragmentShader;
      if (!onRoad) shader.fragmentShader = 'uniform sampler2D meadow;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        SurfaceTiles tiles=surfaceTiles(vMapUv);
        diffuseColor *= tileSample(map,vMapUv,tiles);
        vec2 rotated = mat2(.8,-.6,.6,.8) * vMapUv;
        float variation = texture2D(patchMap, rotated * .073).g;
        float patches = smoothstep(.045,.31,variation);
        vec3 worn = tileSample(patchMap, rotated * .81, tiles).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, worn, patches * ${onRoad ? '.60' : '.80'});
        ${onRoad ? '' : `
        vec3 grassCover = texture2D(meadow, rotated * .23).rgb;
        float broadCover = texture2D(meadow, rotated * .022).g;
        float seam = texture2D(patchMap, vMapUv * .32).g;
        float vegetation = smoothstep(.035,.16,broadCover * .8 + seam * .35);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.69,.67,.60),
            grassCover * vec3(.70,.83,.58), vegetation * .86);
        `}
        float damp = (.22+.78*rainAmount) * smoothstep(.09,.38,variation);
        diffuseColor.rgb *= 1.0 - damp * .38;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .13, damp);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        vec3 grain=tileSample(normalMap,vNormalMapUv,tiles).xyz*2.-1.;
        grain.xy*=normalScale*(1.-.82*damp);
        normal=normalize(tbn*grain);`);
    };
  }
  return wet => {rain.value = wet ? 1 : 0;};
}
