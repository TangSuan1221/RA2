// The outdoor hemisphere needs a baked sky-visibility term under the covered roadway.
export function tunnelOcclusion(material) {
  const compile=material.onBeforeCompile;
  const previousKey=material.customProgramCacheKey();
  const porous=!material.isMeshPhysicalMaterial;
  material.customProgramCacheKey=()=>previousKey+'-tunnel-sky-v2-'+porous;
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.vertexShader='varying vec3 tunnelWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      tunnelWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
    shader.fragmentShader='varying vec3 tunnelWorld;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      float portal=smoothstep(1308.,1326.,tunnelWorld.z)*(1.-smoothstep(1530.,1550.,tunnelWorld.z));
      float inside=smoothstep(769.5,770.3,tunnelWorld.x)*(1.-smoothstep(780.6,781.3,tunnelWorld.x))*(1.-smoothstep(5.85,6.25,tunnelWorld.y));
      float shelter=inside*portal;
      reflectedLight.indirectDiffuse*=1.-.97*shelter;
      reflectedLight.indirectSpecular*=1.-.94*shelter;`);
    if(porous){
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        // A former flood line follows the canal even where the stone courses change.
        vec2 bank=tunnelWorld.xz-vec2(775.,1310.);
        float tide=.89+.025*sin(dot(bank,vec2(.86,.58)))+.012*sin(dot(bank,vec2(4.1,2.2)));
        float localBank=(1.-smoothstep(7.,10.,abs(bank.x)))*smoothstep(-15.,-10.,bank.y)*(1.-smoothstep(227.,241.,bank.y));
        vec3 face=normalize(cross(dFdx(tunnelWorld),dFdy(tunnelWorld)));
        float wall=1.-smoothstep(.25,.72,abs(face.y));
        float curbX=min(778.,760.+.6*(tunnelWorld.z-1280.))-2.9;
        float curbDistance=abs(tunnelWorld.x-curbX);
        float splash=1.-smoothstep(.26,.98+.18*sin(bank.y*1.8),curbDistance);
        float submerged=localBank*mix(splash,1.,wall)*(1.-smoothstep(tide-.16,tide+.02,tunnelWorld.y));
        float scum=wall*localBank*(1.-smoothstep(.015,.082,abs(tunnelWorld.y-tide)));
        float flow=.45;
        #ifdef USE_MAP
          flow=texture2D(map,vec2((bank.x+bank.y)*.37,tunnelWorld.y*.052)).r;
        #endif
        float streak=wall*localBank*smoothstep(.22,.70,flow)*(1.-smoothstep(2.2,5.8,tunnelWorld.y));
        #ifdef USE_MAP
          vec2 wallUV=vec2(abs(face.x)>.55?bank.y:bank.x,tunnelWorld.y);
          float broken=texture2D(map,wallUV*.46).r;
          float culvertGrit=texture2D(map,wallUV*1.82+vec2(.27,.63)).r;
          float spall=wall*localBank*smoothstep(.27,.49,broken*.65+culvertGrit*.35)*smoothstep(.4,1.2,tunnelWorld.y);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.39+vec3(.06,.047,.034)*culvertGrit,spall*.78);
        #endif
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.094,.077,.048),scum*(.10+.43*smoothstep(.23,.67,flow)));
        diffuseColor.rgb*=mix(vec3(1.),vec3(.37,.48,.35),submerged);
        diffuseColor.rgb*=1.-.26*streak;
        roughnessFactor=mix(roughnessFactor,.38,submerged*.85+streak*.12);`);
    }
  };
}
