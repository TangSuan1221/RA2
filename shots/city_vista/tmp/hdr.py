import sys, numpy as np
from PIL import Image
def read_hdr(p):
    f=open(p,'rb'); 
    while True:
        l=f.readline().strip()
        if l==b'': break
    dims=f.readline().split(); H=int(dims[1]); W=int(dims[3])
    img=np.zeros((H,W,4),np.uint8)
    for y in range(H):
        hdr=f.read(4)
        row=np.zeros((4,W),np.uint8)
        for c in range(4):
            x=0
            while x<W:
                n=f.read(1)[0]
                if n>128:
                    n-=128; v=f.read(1)[0]; row[c,x:x+n]=v; x+=n
                else:
                    row[c,x:x+n]=np.frombuffer(f.read(n),np.uint8); x+=n
        img[y]=row.T
    e=img[...,3].astype(np.float32)
    rgb=img[...,:3].astype(np.float32)*np.ldexp(1.0,(e-136).astype(int))[...,None]
    rgb[e==0]=0
    return rgb
p=sys.argv[1]; rgb=read_hdr(p); H,W,_=rgb.shape
L=rgb.mean(-1); y,x=np.unravel_index(L.argmax(),L.shape)
print('size',W,H,'max',L.max(),'at',x,y,'elev deg',90-y/H*180,'u',x/W)
print('mean sky',rgb[:H//2].reshape(-1,3).mean(0),'mean ground',rgb[H//2:].reshape(-1,3).mean(0))
ld=np.clip((rgb/(1+rgb))**(1/2.2),0,1)
Image.fromarray((ld*255).astype(np.uint8)).resize((512,256)).save(sys.argv[2])
