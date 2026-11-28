"""Redraw the live upper heavy actors using their individual production key silhouettes.
Input sprites and geometry are archived under reference/. Pillow only.
"""
from pathlib import Path
from collections import Counter
from math import hypot
import json,hashlib,struct,zlib
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parent; REF=ROOT/'reference'
OUT=ROOT/'runtime/public/art'
SHEETS=json.loads((REF/'manifest.json').read_text(encoding='utf8'))
LAYERS=['Support','Coat','Hood and bars','Wrist and hand','Weapon']
C={
 'ink':'#11181c','blk':'#1b2427','grill':'#242e32','cloth0':'#2d343c','cloth1':'#404952','cloth2':'#535e63',
 'cloth3':'#75817d','thread':'#8e9587','leather':'#4a3e34','wood':'#695741','wood2':'#937b54',
 'oxide0':'#4c3531','oxide1':'#804838','oxide2':'#ae6950','oxide3':'#ca8c62',
 'rock0':'#323c3a','rock1':'#47534c','rock2':'#647063','rock3':'#85907d','rock4':'#a7ad93',
 'iron0':'#2d3a3e','iron1':'#445457','iron2':'#627574','iron3':'#8d9f93','iron4':'#b5c1a8',
 'hood0':'#494a40','hood1':'#6e6d5b','hood2':'#92917b','hood3':'#b3ae91','hood4':'#d3cbb0',
 'brass0':'#61503b','brass1':'#8b7350','brass2':'#b1986c','bone':'#e4ce95'}
def rgb(n):
 v=C[n][1:];return tuple(int(v[i:i+2],16) for i in (0,2,4))+(255,)
def bounds(pts):
 xx,yy=zip(*pts);return min(xx),min(yy),max(xx),max(yy)
def area_points(img):
 return {(x,y):p for y in range(img.height) for x in range(img.width) if (p:=img.getpixel((x,y)))[3]}
def groups(points):
 pts=set(points);gs=[]
 while pts:
  q=[pts.pop()]
  for x,y in q:
   for a in (-1,0,1):
    for b in (-1,0,1):
     p=x+a,y+b
     if p in pts:pts.remove(p);q.append(p)
  gs.append(q)
 return sorted(gs,key=lambda g:(len(g),-min(q[1] for q in g)),reverse=True)
def posbox(box,a,b):
 l,t,r,d=box;return round(l+(r-l)*a),round(t+(d-t)*b)
def rgba(im):return im.convert('RGBA')
def composite(layers):
 im=Image.new('RGBA',next(iter(layers.values())).size)
 for n in LAYERS:im.alpha_composite(layers[n])
 return im

class Cel:
 def __init__(self,img):
  self.img=img;self.pts=area_points(img);self.box=bounds(self.pts)
  self.parts={n:Image.new('RGBA',img.size) for n in LAYERS}
 def use(self,n):self.layer=self.parts[n];self.d=ImageDraw.Draw(self.layer)
 def put(self,p,c):self.layer.putpixel(p,rgb(c))
 def poly(self,pts,c):self.d.polygon(pts,fill=rgb(c))
 def line(self,pts,c):self.d.line(pts,fill=rgb(c))
 def dot(self,p,c):self.d.point(p,fill=rgb(c))
 def clip(self):
  # The gameplay edges (for incoming blades and formation centring) stay at the
  # original native bounds; pixel information inside each silhouette is redrawn.
  for im in self.parts.values():
   a=im.load()
   for y in range(im.height):
    for x in range(im.width):
     if a[x,y][3] and (x,y) not in self.pts:a[x,y]=(0,0,0,0)
 def normal(self,box,pts):return [posbox(box,u,v) for u,v in pts]
 def mark(self,box,pts,c):self.line(self.normal(box,pts),c)
 def facet(self,box,pts,c):self.poly(self.normal(box,pts),c)
 def at(self,box,u,v,c):self.dot(posbox(box,u,v),c)

CLAY={(162,86,70),(98,60,57),(189,108,87)}
PALE={(167,160,153),(209,198,185),(244,232,215)}
CUFF={(185,139,98),(242,184,115)}
WEAVE={(43,48,58),(66,73,87),(103,111,125)}
def boss(c,key):
 pts=c.pts;l,t,r,b=c.box
 hammer=groups(p for p,q in pts.items() if q[:3] in CLAY)[0];hb=bounds(hammer)
 pale=groups(p for p,q in pts.items() if q[:3] in PALE);head=bounds(pale[0]);hx,hy,hr,hd=head
 compact=key.startswith('rear-')
 # Ink in the original pose is retained on silhouettes; broad unlit interior
 # areas become cloth or dark metal, freeing the highlights for the active prop.
 for (x,y),col in pts.items():
  col=col[:3];inside=(x-1,y) in pts and (x+1,y) in pts and (x,y-1) in pts and (x,y+1) in pts
  if hb[0]-1<=x<=hb[2]+1 and hb[1]-1<=y<=hb[3]+1 and (col in CLAY or col in [(23,24,29),(43,48,58)]):
   part='Weapon';color='rock0' if inside else 'ink'
  elif hx-1<=x<=hr+1 and hy-1<=y<=hd+1 and col not in CUFF and col not in CLAY:
   part='Hood and bars';color={244:'hood3',209:'hood2',167:'hood1',103:'hood0',66:'hood0'}.get(col[0],'blk' if inside else 'ink')
  elif col in PALE or col in CUFF:
   part='Wrist and hand';color={167:'wood2',209:'hood3',244:'hood4',185:'brass0',242:'brass1'}[col[0]]
  elif col in CLAY:
   part='Coat';color='oxide1' if col[0]>100 else 'oxide0'
  else:
   part='Support' if y>=b-(b-t)*.16 else 'Coat'
   color={43:'cloth0',66:'cloth1',103:'cloth2'}.get(col[0],'blk' if inside else 'ink')
   if part=='Support' and color=='cloth0':color='leather'
  c.use(part);c.put((x,y),color)
 # Hewn basalt hammer with an uneven battered striking face, two forged bands,
 # a triangular spall on the top lip, and a steep right-hand side plane.
 c.use('Weapon')
 mask=set(hammer)
 for p in mask:
  x,y=p;u=(x-hb[0])/max(1,hb[2]-hb[0]);v=(y-hb[1])/max(1,hb[3]-hb[1]);twist=(.17-v*.27)
  if u<.22+twist:shade='rock3' if v<.57 else 'rock2'
  elif u>.83+twist:shade='rock0'
  else:shade='rock2' if v<.4-u*.18 else 'rock1'
  if .37+twist<u<.77+twist:shade='oxide2' if v<.54 else 'oxide1'
  if .32+twist<u<.40+twist:shade='oxide0'
  c.put(p,shade)
 c.mark(hb,[(.08,.26),(.19,.08),(.36,.05)],'rock4')
 c.mark(hb,[(.10,.54),(.22,.50),(.28,.56)],'rock1')
 c.mark(hb,[(.48,.08),(.63,.09)],'oxide3');c.mark(hb,[(.45,.35),(.56,.32)],'oxide3');c.at(hb,.49,.65,'brass1')
 c.mark(hb,[(.7,.24),(.75,.35),(.67,.43)],'rock0');c.at(hb,.73,.57,'rock2')
 # Cage constructed in front of a dark eye cavity. Rag is separate from the
 # grille, so the pointed shape reads as a dented prisoner hood.
 c.use('Hood and bars')
 c.facet(head,[(.25,.35),(.47,.12),(.65,.02),(.59,.25),(.64,.43),(.89,.65),(.74,.68),(.46,.48)],'hood2')
 c.mark(head,[(.27,.38),(.46,.20),(.54,.16)],'hood4')
 c.mark(head,[(.59,.17),(.53,.32),(.57,.40),(.78,.56)],'hood1')
 c.facet(head,[(.08,.65),(.21,.53),(.48,.55),(.60,.7),(.54,.96),(.28,1),(.1,.87)],'grill')
 c.mark(head,[(.11,.65),(.23,.56),(.47,.58),(.53,.65)],'iron3');c.at(head,.22,.55,'iron4')
 c.mark(head,[(.19,.69),(.41,.67)],'ink')
 for u in ([.25,.49] if compact else [.18,.35,.51]):
  c.mark(head,[(u,.7),(u+.015,.89),(u+.035,.94)],'iron2');c.at(head,u,.73,'iron3')
 c.mark(head,[(.27,.97),(.49,.92)],'iron0');c.at(head,.25,.70,'bone')
 c.mark(head,[(.75,.72),(.84,.81),(.81,.9)],'hood0')
 # Bearer cloth: stony shoulder seam, long asymmetric fold and two rows of
 # mending stitches anchored to the shoulder rather than the frame bounds.
 c.use('Coat'); shoulder=(hr-2,hd+1)
 sx,sy=shoulder;coat=(sx-2,sy,min(r,sx+8),min(b-2,sy+15))
 c.mark(coat,[(.05,.1),(.35,.02),(.75,.08),(.91,.21)],'cloth3')
 c.mark(coat,[(.12,.14),(.38,.10),(.68,.16)],'cloth2')
 c.mark(coat,[(.34,.24),(.55,.32),(.73,.28)],'cloth0')
 c.mark(coat,[(.46,.47),(.63,.62),(.70,.8)],'cloth2')
 c.at(coat,.66,.21,'thread');c.at(coat,.83,.29,'cloth3')
 c.mark(coat,[(.76,.63),(.71,.69)],'cloth0')
 clothPts=[p for p,q in pts.items() if q[:3] in WEAVE and p[1]>hd+4 and p[0]>(hx+hr)/2]
 if clothPts:
  panel=bounds(clothPts)
  c.mark(panel,[(.13,.34),(.40,.54),(.56,.55)],'cloth2')
  c.mark(panel,[(.53,.56),(.72,.67),(.82,.69)],'cloth3')
  c.mark(panel,[(.5,.75),(.65,.81),(.73,.79)],'cloth0')
  c.at(panel,.64,.61,'thread')
 # Restrict the cloth drawing to the existing coat/support area so no seam
 # can paint the face, stone hammer, or outstretched fingers.
 c.use('Wrist and hand')
 cuff=groups(p for p,q in pts.items() if q[:3] in CUFF)
 if cuff:
  # The bright copper pixels mark gloves and the live rig's loose manacle.
  low=max(cuff,key=lambda g:(max(q[1] for q in g),len(g)));cb=bounds(low)
  if cb[2]-cb[0]>=1:
   c.mark(cb,[(0,.55),(.15,.95),(.75,1),(1,.7)],'brass1');c.at(cb,.2,.58,'brass2')
 # Place boot nails only on actual copper/leather below the hem.
 c.use('Support')
 for q in [p for p in pts if p[1]==b-1 and (p[0]-1,p[1]) not in pts]:
  c.line([(q[0]+1,q[1]),(q[0]+2,q[1])],'wood')
 c.clip()
 # Keep the open negative space between the legs and make slits through the
 # loose bottom edge of the cloak. Outer stance/contact extrema stay anchored.
 for fraction in (.50,.74):
  y=round(hd+(b-hd)*fraction);row=[x for x in range(l,r+1) if (x,y) in pts]
  if not row or y>=b-2:continue
  x=max(row)
  if x<=hx or (x==r and len([1 for xx,yy in pts if xx==r and yy!=y])<2):continue
  if not c.parts['Coat'].getpixel((x,y))[3]:continue
  for drop in range(2 if not compact and fraction>.6 else 1):
   if (x-drop,y) in pts:
    for layer in c.parts.values():layer.putpixel((x-drop,y),(0,0,0,0))

def shield(c,key):
 pts=c.pts;l,t,r,b=c.box;rear=key.startswith('rear-')
 rust=[p for p,q in pts.items() if q[:3] in [(128,80,61),(100,66,53)]]
 ys=[p[1] for p in rust];split=(min(ys)+max(ys))//2
 high=[p for p in rust if p[1]<=split];low=[p for p in rust if p[1]>split] or high
 def bar(q):
  x=list(zip(*q))[0];return (min(x)+max(x))/2,sum(p[1] for p in q)/len(q),max(x)-min(x)+1
 cx,cy,span=bar(high);lx,ly,lower=bar(low)
 z={35:'ink',37:'blk',52:'iron0',72:'iron1',86:'iron1',116:'steel' if 'steel' in C else 'iron2',137:'iron2',170:'iron3',178:'iron3',200:'iron4',225:'bone',128:'oxide2',100:'oxide0'}
 for (x,y),col in pts.items():
  part='Support' if y>b-6 else 'Coat'
  tone=z[col[0]]
  if part=='Support' and col[0] in (52,72,86):tone='wood' if col[0]==86 else 'leather'
  c.use(part);c.put((x,y),tone)
 # An asymmetrical gate slab. Its advancing bottom corner is the boss-room
 # shield bash contact, so the forward lower toe is part of the actual stone.
 def axis(y):return cx+(lx-cx)*((y-cy)/max(2,ly-cy))
 top=round(cy-6);bottom=min(b,round(ly+2));width=max(7,min(13,span+1))
 def Q(u,v):
  y=top+(bottom-top)*v;return round(axis(y)+(u-.5)*width),round(y)
 def mv(seq):return [Q(*p) for p in seq]
 c.use('Weapon')
 c.poly(mv([(.03,1),(0,.35),(.15,.34),(.15,.15),(.31,.15),(.31,.04),(.57,.04),(.62,0),(.88,.05),(1,.17),(.99,.86),(.82,1)]),'rock0')
 c.poly(mv([(.06,.93),(.04,.36),(.21,.35),(.21,.17),(.36,.17),(.36,.08),(.52,.08),(.52,.91),(.40,1)]),'rock2')
 c.poly(mv([(.51,.10),(.84,.06),(.92,.17),(.89,.88),(.70,.98),(.51,.94)]),'rock1')
 c.line(mv([(.09,.62),(.1,.37),(.25,.35),(.25,.18),(.39,.17),(.39,.09),(.54,.09)]),'rock3')
 c.line(mv([(.53,.17),(.61,.22),(.55,.32),(.66,.41)]),'rock0')
 c.line(mv([(.38,.56),(.40,.64),(.27,.71),(.28,.78)]),'rock0')
 c.line(mv([(.65,.60),(.75,.64),(.73,.68)]),'rock2')
 # A broken rim rivet and the two red-oxide clamping hoops remain broad
 # enough to read from the elevated back shelf.
 for v in (.40,.83):
  c.line(mv([(.02,v+.05),(.41,v+.06),(.87,v+.02)]),'oxide0')
  c.line(mv([(.06,v),(.43,v+.01),(.88,v-.01)]),'oxide2')
  c.dot(Q(.27,v),'brass2');c.dot(Q(.76,v-.01),'wood2')
 c.dot(Q(.79,.13),'rock3');c.dot(Q(.16,.55),'rock4' if not rear else 'rock3')
 # Helmet and segmented neck iron sit above the shield. Infer the helmet
 # centre from the separately posed oldest two rows rather than torso centre.
 crown=[q for q in pts if t<=q[1]<=t+2]
 a,_,z1,_=bounds(crown);mx=round((a+z1)/2)
 if key=='down':hh=6
 else:hh=9 if (b-t)>=23 else 7
 head=(mx-4,t,mx+3,min(t+hh,b))
 c.use('Hood and bars')
 c.facet(head,[(.06,.4),(.30,.10),(.57,0),(.90,.11),(1,.55),(.9,.88),(.62,1),(.24,.82)],'iron1')
 c.facet(head,[(.12,.41),(.37,.13),(.61,.09),(.68,.3),(.53,.40)],'iron2')
 c.mark(head,[(.12,.44),(.46,.37),(.76,.40)],'iron3')
 c.facet(head,[(0,.52),(.6,.45),(.69,.55),(.56,.66),(.09,.68)],'ink')
 c.at(head,.22,.55,'brass2')
 c.mark(head,[(.25,.77),(.50,.85),(.73,.77)],'iron2');c.at(head,.7,.58,'iron0')
 c.clip()
 # Chip a notch from the shield's exposed silhouette, away from its leading
 # attack edge and the registration bounds. It changes the profile at 1×.
 for v in (.56,.68):
  qx,qy=Q(.04,v)
  for x in range(max(l+1,qx-2),min(r,qx+3)):
   p=x,qy
   if p in pts and (x-1,qy) not in pts and (x+1,qy) in pts and qy<b-2:
    for layer in c.parts.values():layer.putpixel(p,(0,0,0,0))
    break

def write_ase(name,keys,frames):
 def pack(fmt,*v):return struct.pack('<'+fmt,*v)
 def string(s):
  raw=s.encode();return pack('H',len(raw))+raw
 def chunk(kind,data):return pack('IH',len(data)+6,kind)+data
 w,h=next(iter(frames[0].values())).size;buf=[]
 for i,layers in enumerate(frames):
  chunks=[]
  if i==0:
   for n in LAYERS:chunks.append(chunk(0x2004,pack('6HB',3,0,0,0,0,0,255)+bytes(3)+string(n)))
   tags=pack('H',len(keys))+bytes(8)
   for j,k in enumerate(keys):tags+=pack('HHBH',j,j,0,0)+bytes(6)+bytes([131,150,140,0])+string(k)
   chunks.append(chunk(0x2018,tags))
  for j,n in enumerate(LAYERS):
   im=layers[n];box=im.getbbox()
   if not box:continue
   item=im.crop(box);chunks.append(chunk(0x2005,pack('HhhBHh',j,box[0],box[1],255,2,0)+bytes(5)+pack('HH',*item.size)+zlib.compress(item.tobytes(),9)))
  frame=b''.join(chunks);buf.append(pack('IHHH',len(frame)+16,0xf1fa,len(chunks),100)+bytes(2)+pack('I',len(chunks))+frame)
 body=b''.join(buf);header=pack('I5HIH',len(body)+128,0xa5e0,len(keys),w,h,32,1,100)+bytes(12)+pack('HBBhhHH',0,1,1,0,0,0,0)
 raw=header.ljust(128,b'\0')+body
 folder=ROOT/'source';folder.mkdir(exist_ok=True);(folder/(name+'.aseprite')).write_bytes(raw)
 # Decode each exported cel and check against its exact runtime source.
 start=128
 for parts in frames:
  length,magic,count=struct.unpack_from('<IHH',raw,start);assert magic==0xf1fa;cur=start+16
  im=Image.new('RGBA',(w,h))
  for _ in range(count):
   size,kind=struct.unpack_from('<IH',raw,cur)
   if kind==0x2005:
    _,x,y=struct.unpack_from('<Hhh',raw,cur+6);cw,ch=struct.unpack_from('<HH',raw,cur+22)
    im.alpha_composite(Image.frombytes('RGBA',(cw,ch),zlib.decompress(raw[cur+26:cur+size])),(x,y))
   cur+=size
  assert cur==start+length and im.tobytes()==composite(parts).tobytes()
  start=cur
 assert start==len(raw)

def main():
 (OUT/'motion').mkdir(exist_ok=True,parents=True)
 checks={};show={};updates={}
 for name,sheet in SHEETS.items():
  orig=rgba(Image.open(REF/(name+'.png')));new=Image.new('RGBA',orig.size);frames=[];keys=[];stats=[]
  for f in sheet['frames']:
   key=f['id'];x,y,w,h=f['rect'];old=orig.crop((x,y,x+w,y+h));c=Cel(old);(shield if name=='upper-shield' else boss)(c,key)
   pt=f.get('candidateContact')
   if pt:
    p=tuple(pt);assert old.getpixel(p)[3];c.use('Weapon')
    c.put(p,'rock3' if name=='upper-shield' else 'rock2')
   flat=composite(c.parts)
   if flat.getbbox()!=old.getbbox():raise AssertionError([name,key,flat.getbbox(),old.getbbox()])
   assert flat.getbbox()[3]==sheet['pivot'][1]
   assert flat.getchannel('A').getextrema()==(0,255)
   if pt:assert c.parts['Weapon'].getpixel(tuple(pt))[3]==255
   destAlpha=flat.getchannel('A');srcAlpha=old.getchannel('A')
   cut=sum(va!=vb for va,vb in zip(destAlpha.get_flattened_data(),srcAlpha.get_flattened_data()))
   different=sum(a!=b for a,b in zip(flat.get_flattened_data(),old.get_flattened_data()))
   frames.append(c.parts);keys.append(key);new.paste(flat,(x,y));show[(name,key)]=[old,flat]
   stats.append({'key':key,'ground':flat.getbbox()[3],'bounds':flat.getbbox(),'contact':pt,'changedRGBA':different,'silhouetteEdits':cut})
  assert len({hashlib.sha256(composite(frame).tobytes()).hexdigest() for frame in frames})==len(keys)
  new.save(OUT/'motion'/(name+'.png'));write_ase(name,keys,frames)
  meta=json.loads(json.dumps(sheet))
  for f,par in zip(meta['frames'],frames):
   px=composite(par);f['alphaPixels']=sum(px.getchannel('A').histogram()[1:]);f['drawing']=hashlib.sha256(px.crop(px.getbbox()).tobytes()).hexdigest()[:12]
  updates[name]={f['id']:{'alphaPixels':f['alphaPixels'],'drawing':f['drawing']} for f in meta['frames']}
  checks[name]=stats
  if name!='upper-boss-special':
   target=rgba(Image.open(REF/(name+'-idle.png')));x,y,rr,b=target.getbbox();old,new=show[(name,'ready')];box=new.getbbox()
   assert (rr-x,b-y)==(box[2]-box[0],box[3]-box[1])
   port=Image.new('RGBA',target.size);port.paste(new.crop(box),(x,y));port.save(OUT/(name+'-idle.png'))
 (ROOT/'checks.json').write_text(json.dumps(checks,indent=2),encoding='utf8')
 (ROOT/'manifest-fields.json').write_text(json.dumps(updates,indent=2),encoding='utf8')
 picked=[('upper-shield','ready'),('upper-shield','contact'),('upper-shield','rear-ready'),('upper-boss','ready'),('upper-boss','repeat-contact'),
  ('upper-boss','rear-ready'),('upper-boss-special','charge-peak'),('upper-boss-special','charge-contact'),('upper-boss-special','weak-contact')]
 board=Image.new('RGB',(3*334,3*176),'#41443e');d=ImageDraw.Draw(board)
 for i,(n,k) in enumerate(picked):
  for j,v in enumerate(show[n,k]):
   box=v.getbbox();crop=v.crop(box);sc=min(4,152//crop.width,133//crop.height);crop=crop.resize((crop.width*sc,crop.height*sc),Image.Resampling.NEAREST)
   x=i%3*334+j*161;y=i//3*176;board.paste(crop,(x+(160-crop.width)//2,y+140-crop.height),crop)
  d.text((i%3*334+10,i//3*176+148),n+' / '+k+'   old | new',fill='#eee3ce')
 board.save(ROOT/'review.png')
 print([(k,len(v),sum(r['silhouetteEdits'] for r in v)) for k,v in checks.items()])
if __name__=='__main__':main()
