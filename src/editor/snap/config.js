export const config={hashMeters:4,stepsMeters:[.25,.5,1,2],gridMeters:.5,socketMeters:.65,edgeMeters:.3,vertexMeters:.25,gridToleranceMeters:.36,pathMeters:1.2,gapsMeters:[.6,1,2.5,3.5],gapToleranceMeters:.05,slopeRatio:.12,rotationDegrees:5};
const common={xz:'free',y:'surface',angleStep:null,allowOffGrid:true,requiresSocket:false,surfaceMode:'footprint',priority:['socket','edge','vertex','grid'],yOffset:0,tolerance:{socket:.65,edge:.3,vertex:.25,grid:.36}};
export const profiles={
 structural:{...common,xz:'grid',y:'socket',angleStep:90,allowOffGrid:false,requiresSocket:true},
 semantic:{...common,y:'socket',requiresSocket:true},
 prop:common,decor:{...common,surfaceMode:'pivot'}
};
export function resolvePolicy(obj,prefab={}){
 const profile=obj.profile??prefab.profile??'prop';
 return {...profiles[profile],...prefab.policy,...obj.policyOverride,profile};
}
