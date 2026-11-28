from pathlib import Path
import json,math
import numpy as np
from PIL import Image
import sys
k=Path(__file__).resolve().parent.parent
game=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else k/'rebuilt'
q=game
sk=json.loads((k/'slime-pool.json').read_text());samples=json.loads((q/'samples.json').read_text())
textures={f.stem:np.array(Image.open(f)) for f in (k/'images').glob('*.png')}
slots=[s['name'] for s in sk['slots']];coordinates=sk['skins'][0]['attachments']
width,height=104,48
def render(part):
 att=coordinates[part['s']][part['a']];tex=textures[att['path']];h,w=tex.shape[:2]
 uv=np.array(att['uvs']).reshape(-1,2)*[w,h];verts=np.array(part['v']).reshape(-1,2)
 layer=np.zeros((height,width,4),dtype=np.uint8)
 for ids in np.array(att['triangles']).reshape(-1,3):
  tri=verts[ids];a,b,c=tri
  x0,y0=np.maximum(0,np.floor(tri.min(axis=0))).astype(int);x1,y1=np.minimum([width,height],np.ceil(tri.max(axis=0))).astype(int)
  if x0>=x1 or y0>=y1:continue
  u=b-a;v=c-a;det=u[0]*v[1]-u[1]*v[0]
  if abs(det)<.00001:continue
  Y,X=np.mgrid[y0:y1,x0:x1];dx=X+.5-a[0];dy=Y+.5-a[1]
  l=(dx*v[1]-dy*v[0])/det;j=(dy*u[0]-dx*u[1])/det
  inside=(l>=-1e-5)&(j>=-1e-5)&(l+j<=1.00001)
  src=uv[ids]
  pos=src[0]+l[...,None]*(src[1]-src[0])+j[...,None]*(src[2]-src[0])
  xy=np.floor(pos+1e-6).astype(int)
  rgba=tex[np.clip(xy[:,:,1],0,h-1),np.clip(xy[:,:,0],0,w-1)]
  layer[y0:y1,x0:x1][inside]=rgba[inside]
 return Image.fromarray(layer)
total=sum(len(v) for v in samples.values());cols=12;rows=math.ceil(total/cols)
sheet=Image.new('RGBA',(cols*104,rows*48))
layers=Image.new('RGBA',(sheet.width,sheet.height*3))
i=0;lookup={}
for clip,snaps in samples.items():
 entries=[]
 for snap in snaps:
  frame=Image.new('RGBA',(104,48));x=i%cols*104;y=i//cols*48
  for part in snap['parts']:
   rendered=render(part);frame.alpha_composite(rendered)
   if clip=='attack':
    group=0 if part['s'] in ('bed','little-curl','rear-curl') else 1 if part['s']=='lash' else 2
    layers.alpha_composite(rendered,(x,y+group*sheet.height))
  sheet.paste(frame,(x,y));entries.append([snap['t'],x,y]);i+=1
 lookup[clip]=entries
sheet.save(game/'slime-pool-motion.png')
layers.save(game/'slime-pool-layers.png')
(game/'pool-clips.json').write_text(json.dumps(lookup,separators=(',',':')),encoding='utf-8')
print('Exported',i,'samples to',game)
