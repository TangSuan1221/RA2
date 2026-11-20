// Recessed rooms behind the batched window panes, without an extra draw per room.
export function weatheredWindows(material) {
  material.color.set(0xadb5a7);
  material.roughness = .38;
  material.metalness = .12;
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float roomSeed; varying float suite; varying vec2 paneUV; varying vec3 paneWorld; varying vec3 paneNormal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        paneUV = uv;suite=roomSeed;
        paneWorld = (modelMatrix * vec4(transformed, 1.)).xyz;
        paneNormal = mat3(modelMatrix) * normal;`);
    shader.fragmentShader = 'varying float suite; varying vec2 paneUV; varying vec3 paneWorld; varying vec3 paneNormal;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 n = normalize(paneNormal);
        vec3 sight = normalize(paneWorld - cameraPosition);
        vec3 tangent = normalize(cross(vec3(.0001,1.,0.),n));
        vec3 dir = vec3(dot(sight,tangent),sight.y,max(.08,abs(dot(sight,n))));
        vec2 pos = clamp(paneUV,vec2(.002),vec2(.998));
        vec2 farSide = step(vec2(0.),dir.xy);
        vec2 delta = (farSide-pos) / (dir.xy+vec2(.00001));
        float depth = max(0.,min(1./dir.z,min(delta.x,delta.y)));
        vec3 hit = vec3(pos+dir.xy*depth,dir.z*depth);
        float interior = mix(.25,.74,clamp(hit.y,0.,1.)) * (.65+.35*hit.z);
        vec2 aged = paneWorld.xz + vec2(11.3,7.2)*paneWorld.y;
        float grime = .5+.5*sin(aged.x*1.8+sin(aged.y*.23)*2.);
        float edge = min(min(pos.x,1.-pos.x),min(pos.y,1.-pos.y));
        vec3 room = vec3(.14,.115,.088)*interior;
        vec2 wall=clamp(hit.xy,vec2(0.),vec2(1.));
        float back=smoothstep(.97,.998,hit.z);
        room*=mix(.75,1.55,suite);
        float casing=step(.42,wall.x)*step(wall.x,.73)*step(wall.y,.79)*back;
        room*=1.-.56*casing;
        if(suite>.66){
          float blind=step(1.-.86*suite,pos.y);
          float slat=smoothstep(.30,.48,fract(pos.y*15.));
          room=mix(room,vec3(.19,.17,.13)*(.62+.38*slat),blind*.83);
        }else if(suite<.39){
          float fold=.53+.47*cos(pos.x*89.+suite*8.);
          float curtain=1.-smoothstep(.17,.20,pos.x+.032*sin(pos.y*3.+suite*6.));
          room=mix(room,vec3(.28,.246,.19)*(.48+.52*fold),curtain*.94);
        }
        vec3 pane = mix(room,vec3(.15,.19,.18),.12+.36*pow(1.-dir.z,2.));
        diffuseColor.rgb *= pane + vec3(.07,.065,.045)*grime*(1.-smoothstep(.01,.14,edge));`);
  };
}
