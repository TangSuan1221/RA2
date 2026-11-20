# 机位构图估算：把关键点投影到 16:9 画面（0..1）
import sys, math
import numpy as np
cam=np.array(eval(sys.argv[1])); look=np.array(eval(sys.argv[2])); fov=float(sys.argv[3])
f=look-cam; f/=np.linalg.norm(f); r=np.cross(f,[0,1,0]); r/=np.linalg.norm(r); u=np.cross(r,f)
t=math.tan(math.radians(fov/2)); A=16/9
pts=dict(eval(sys.argv[4]))
for k,p in pts.items():
    d=np.array(p)-cam; z=d@f
    if z<=0: print(k,'behind'); continue
    x=(d@r)/z/(t*A); y=(d@u)/z/t
    print('%-12s x=%.2f y=%.2f'%(k,(x+1)/2,(1-y)/2))
