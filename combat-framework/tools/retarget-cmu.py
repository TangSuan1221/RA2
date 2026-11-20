"""Blender: retarget CMU MotionBuilder BVH to the production 65-bone skeleton.
The added source T-pose is calibration only and is excluded from exported frames.
Root path and headings remain measured metadata; poses are heading-relative/in-place.
"""
import bpy, json, math, re, struct, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
BASE=Path(r'C:\Users\Lenovo\Desktop\the last rule')
OUT=BASE/'public/data/combat'
scene=bpy.data.scenes['CombatAssetLab'];bpy.context.window.scene=scene
target=bpy.data.objects['Combat_Female']
target.animation_data.action=None
for track in target.animation_data.nla_tracks:track.mute=True
skeleton=json.loads((OUT/'bones.json').read_text())
names=[b['name'] for b in skeleton['bones']]
mapping={'pelvis':'Hips','spine_01':'LowerBack','spine_02':'Spine','spine_03':'Spine1','neck_01':'Neck1','Head':'Head'}
for side,prefix in [('l','Left'),('r','Right')]:
    for dst,src in [('clavicle','Shoulder'),('upperarm','Arm'),('lowerarm','ForeArm'),('hand','Hand'),('thigh','UpLeg'),('calf','Leg'),('foot','Foot'),('ball','ToeBase')]:mapping[dst+'_'+side]=prefix+src
conversion=Matrix.Rotation(-math.pi/2,4,'X')
paths=sorted((BASE/'combat-framework/assets-source/CMU').rglob('*.bvh'))
paths+=sorted((BASE/'combat-framework/assets-source/CMU-113-128').rglob('*.bvh'))
paths=[p for p in paths if re.match(r'^(02_0[1-3]|03_\d+|05_01|06_01|0[789]_\d+|127_(0[3-9]|1\d|20)|128_(02|03|0[5-8]))$',p.stem)]
if globals().get('CMU_ONLY'):paths=[p for p in paths if p.stem in CMU_ONLY]
results=[]
for path in paths:
    text=path.read_text();source_count=int(re.search(r'Frames:\s*(\d+)',text).group(1));source_dt=float(re.search(r'Frame Time:\s*([\d.]+)',text).group(1));
    before=set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=str(path),global_scale=.056444,frame_start=1,use_fps_scale=False,update_scene_fps=False,update_scene_duration=False)
    source=next(o for o in set(bpy.data.objects)-before if o.type=='ARMATURE');source.name='CMU_'+path.stem
    scene.frame_set(1)
    bind={n:b.matrix.copy() for n,b in source.pose.bones.items()}
    for key in mapping.values():
        if key not in bind:raise RuntimeError('Missing mapped source bone '+key)
    source_height=bind['Head'].translation.z-min(bind['LeftFoot'].translation.z,bind['RightFoot'].translation.z)
    target_height=target.data.bones['Head'].head_local.z-min(target.data.bones['foot_l'].head_local.z,target.data.bones['foot_r'].head_local.z)
    scale=target_height/source_height
    duration=(source_count-2)*source_dt;count=math.floor(duration*30+1e-4)+1
    quats=[];translations=[];landmarks=[];root_path=[];headings=[];first_root=None
    target.animation_data.action=None
    preview=bpy.data.actions.new('CMU_PREVIEW_'+path.stem) if globals().get('CMU_PREVIEW',False) else None
    if preview:target.animation_data.action=preview
    for i in range(count):
        frame=2+i/30/source_dt;scene.frame_set(math.floor(frame),subframe=frame%1)
        hips=source.pose.bones['Hips'];delta=hips.matrix.to_quaternion()@bind['Hips'].to_quaternion().inverted()
        face=delta@Vector((0,-1,0));heading=math.atan2(face.x,-face.y);unheading=Matrix.Rotation(-heading,4,'Z')
        hip=hips.matrix.translation*scale
        if first_root is None:first_root=Vector((hip.x,hip.y,0))
        root_path.append([hip.x-first_root.x,0,-hip.y+first_root.y]);headings.append(heading)
        desired={}
        for name in names:
            bone=target.data.bones[name]
            if bone.parent:
                rest_local=bone.parent.matrix_local.inverted()@bone.matrix_local
                local_pos=desired[bone.parent.name]@rest_local.translation
            else:local_pos=bone.head_local.copy()
            if name in mapping:
                src=mapping[name];rotation_delta=source.pose.bones[src].matrix.to_quaternion()@bind[src].to_quaternion().inverted()
                rot=unheading.to_quaternion()@rotation_delta@bone.matrix_local.to_quaternion()
            elif bone.parent:rot=desired[bone.parent.name].to_quaternion()@rest_local.to_quaternion()
            else:rot=bone.matrix_local.to_quaternion()
            if name=='pelvis':local_pos=Vector((0,0,hip.z))
            mat=rot.to_matrix().to_4x4();mat.translation=local_pos;desired[name]=mat
            local=desired[bone.parent.name].inverted()@mat if bone.parent else conversion@mat
            q=local.to_quaternion().normalized();quats.extend([q.x,q.y,q.z,q.w]);translations.extend(local.translation)
            if preview:
                basis=rest_local.inverted()@local if bone.parent else bone.matrix_local.inverted()@mat
                pb=target.pose.bones[name];pb.rotation_mode='QUATERNION';pb.rotation_quaternion=basis.to_quaternion();pb.location=basis.translation
                pb.keyframe_insert('rotation_quaternion',frame=i);pb.keyframe_insert('location',frame=i)
        landmarks.append({n:list((conversion@desired[n]).translation) for n in ['root','pelvis','Head','hand_l','hand_r','foot_l','foot_r']})
    # The source and target leg/head proportions differ. Align the lower fifth
    # percentile ankle plane once per clip, preserving captured vertical motion.
    ankle_plane=sorted(min(m['foot_l'][1],m['foot_r'][1]) for m in landmarks)[max(0,int(count*.05))]
    target_plane=min(target.data.bones['foot_l'].head_local.z,target.data.bones['foot_r'].head_local.z)
    height_correction=ankle_plane-target_plane
    pelvis_index=names.index('pelvis')
    for i,m in enumerate(landmarks):
        translations[(i*len(names)+pelvis_index)*3+2]-=height_correction
        for name in m:
            if name!='root':m[name][1]-=height_correction
    root_delta=[0.,0.,0.]
    for i in range(1,count):root_delta.extend([root_path[i][j]-root_path[i-1][j] for j in range(3)])
    clip_id='CMU_'+path.stem
    data=bytearray(struct.pack('<4sHIHIfB',b'ANIM',1,skeleton['skeletonId'],len(names),count,30,0))
    data.extend(struct.pack('<'+'f'*len(quats),*quats));data.extend(struct.pack('<'+'f'*len(translations),*translations));data.extend(struct.pack('<H',0));data.extend(struct.pack('<'+'f'*len(root_delta),*root_delta))
    (OUT/'anim'/f'{clip_id}.bin').write_bytes(data)
    results.append({'id':clip_id,'frames':count,'duration':(count-1)/30,'loop':False,'source':str(path.relative_to(BASE)).replace('\\','/'),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceFrames':source_count,'sourceHz':1/source_dt,'calibrationFrameExcluded':True,'retargetScale':scale,'heightCorrection':height_correction,'landmarks':landmarks,'rootPath':root_path,'headings':headings,'measuredRoot':True})
    source.hide_set(True)
    if not preview:
        action=source.animation_data.action;bpy.data.objects.remove(source,do_unlink=True)
        if action and action.users==0:bpy.data.actions.remove(action)
    print(clip_id,count)
manifest_path=OUT/'cmu-animations.json';previous=json.loads(manifest_path.read_text())['clips'] if manifest_path.exists() else []
indexed={c['id']:c for c in previous};indexed.update({c['id']:c for c in results})
manifest_path.write_text(json.dumps({'schemaVersion':1,'skeletonId':skeleton['skeletonId'],'sampleHz':30,'boneCount':len(names),'clips':list(indexed.values())}),encoding='utf-8')
scene.render.fps=30
if globals().get('CMU_PREVIEW',False):scene.frame_set(15)
print(json.dumps({'clips':len(results),'realFrames':sum(c['frames'] for c in results)}))
