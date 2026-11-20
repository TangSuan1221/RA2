"""Retarget openly distributed ACCAD / Quaternius clips; preserve attribution.
Run inside the existing Blender CombatAssetLab, without editing user scenes.
"""
import bpy, json, math, struct, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
BASE=Path(r'C:\Users\Lenovo\Desktop\the last rule')
OUT=BASE/'public/data/combat'
scene=bpy.data.scenes['CombatAssetLab'];bpy.context.window.scene=scene;scene.render.fps=30
target=bpy.data.objects['Combat_Female'];target.animation_data.action=None
for track in target.animation_data.nla_tracks:track.mute=True
skeleton=json.loads((OUT/'bones.json').read_text());names=[b['name'] for b in skeleton['bones']]
conversion=Matrix.Rotation(-math.pi/2,4,'X')
catalog=json.loads((BASE/'combat-framework/assets-source/kinemiq-catalog.json').read_text())
entries={c['id']:c for c in catalog['clips']}
selected={'female1_a11_crawlforward':'Prone_Crawl_Forward','female1_a12_crawlbackwards':'Prone_Crawl_Backward','female1_a08_crouchtolie':'Crouch_To_Prone','safetyvault':'Safety_Vault','climbup_2m':'ClimbUp_2m'}
results=[]
for source_id,clip_id in selected.items():
    path=BASE/'combat-framework/assets-source/KinemIQ'/f'{source_id}.glb'
    raw=path.read_bytes();header=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    source=next(o for o in set(bpy.data.objects)-before if o.type=='ARMATURE');source.name='Extra_'+clip_id
    action=source.animation_data.action;start,end=action.frame_range;count=int(round(end-start))+1
    missing=[n for n in names if n not in source.data.bones]
    if missing:raise RuntimeError('Missing source bones: '+str(missing))
    scale=target.data.bones['pelvis'].head_local.z/source.data.bones['pelvis'].head_local.z
    # Prone mocap was filmed along -X; its horizontal spine points forward.
    # Use the lying section for the transition, not its upright first frame.
    scene.frame_set(int(end if source_id.endswith('crouchtolie') else (start+end)/2))
    if source_id.startswith('female'):
        facing=source.pose.bones['Head'].head-source.pose.bones['pelvis'].head
        heading=math.atan2(facing.x,-facing.y)
    else:heading=0
    unheading=Matrix.Rotation(-heading,4,'Z');quats=[];translations=[];landmarks=[];root_path=[]
    for frame in range(count):
        scene.frame_set(int(start)+frame)
        hip=source.pose.bones['pelvis'].head*scale
        lift=0 if source_id.startswith('female') else max(0,min(source.pose.bones['foot_l'].head.z,source.pose.bones['foot_r'].head.z)*scale-target.data.bones['foot_l'].head_local.z)
        root_path.append([hip.x,lift,-hip.y]);desired={}
        for name in names:
            bone=target.data.bones[name]
            if bone.parent:
                rest_local=bone.parent.matrix_local.inverted()@bone.matrix_local
                position=desired[bone.parent.name]@rest_local.translation
            else:position=bone.head_local.copy()
            if name=='root':rotation=bone.matrix_local.to_quaternion()
            else:
                delta=source.pose.bones[name].matrix.to_quaternion()@source.data.bones[name].matrix_local.to_quaternion().inverted()
                rotation=unheading.to_quaternion()@delta@bone.matrix_local.to_quaternion()
            if name=='pelvis':position=Vector((0,0,hip.z-lift))
            mat=rotation.to_matrix().to_4x4();mat.translation=position;desired[name]=mat
            local=desired[bone.parent.name].inverted()@mat if bone.parent else conversion@mat
            q=local.to_quaternion().normalized();quats.extend([q.x,q.y,q.z,q.w]);translations.extend(local.translation)
        landmarks.append({n:list((conversion@desired[n]).translation) for n in ['root','pelvis','Head','hand_l','hand_r','foot_l','foot_r']})
    root_delta=[0.,0.,0.]
    for i in range(1,count):root_delta.extend([root_path[i][j]-root_path[i-1][j] for j in range(3)])
    data=bytearray(struct.pack('<4sHIHIfB',b'ANIM',1,skeleton['skeletonId'],len(names),count,30,0))
    for values in [quats,translations]:data.extend(struct.pack('<'+'f'*len(values),*values))
    data.extend(struct.pack('<H',0));data.extend(struct.pack('<'+'f'*len(root_delta),*root_delta))
    (OUT/'anim'/f'{clip_id}.bin').write_bytes(data)
    results.append({'id':clip_id,'frames':count,'duration':(count-1)/30,'loop':False,'source':str(path.relative_to(BASE)).replace('\\','/'),'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceURL':'https://kinemiq.app/wp-content/kinemiq-app/library/'+entries[source_id]['file'],'originalSource':entries[source_id]['source'],'copyright':header['asset'].get('copyright',''),'changes':'Retargeted to production 65-bone rig; heading normalized; horizontal root extracted. Traversal vertical root extracted from lower foot height. No generated or duplicated source frames.','headingCorrection':heading,'retargetScale':scale,'landmarks':landmarks,'rootPath':root_path,'measuredRoot':False,'locomotion':False})
    source.hide_set(True)
    print(clip_id,count,'headHeight',min(m['Head'][1] for m in landmarks),max(m['Head'][1] for m in landmarks))
(OUT/'extra-animations.json').write_text(json.dumps({'schemaVersion':1,'clips':results}),encoding='utf-8')
print(json.dumps({'clips':len(results),'frames':sum(c['frames'] for c in results)}))
