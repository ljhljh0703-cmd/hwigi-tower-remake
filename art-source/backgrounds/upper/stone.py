"""Return Tower. Draw on the native texel grid. Each named plate is independently editable in its ORA."""
from pathlib import Path
import io, math, random, zipfile
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

# In the game repository this file lives in art-source/backgrounds/upper/.
ROOT=Path(__file__).resolve().parents[3]
PUBLIC=ROOT/'public/art'
SOURCE=Path(__file__).resolve().parent
N='#20272b'
HALL=['#242d31','#30393c','#394246','#424c4c','#4c5553','#59615b','#686c60','#7c7e6d','#90917a','#a8a38a']
VAULT=['#252b31','#30353a','#393e41','#444849','#504f4d','#595650','#686158','#786e61','#8c8070','#aca18d']
SACRED=['#2a2b34','#35363e','#40414a','#494b52','#55555b','#605e61','#736e6d','#817971','#918576','#ad9a80']
FLOOR=['#373b3b','#444746','#505451','#5a5d57','#65685e','#717369','#818175','#969181']
IRON=['#252b30','#343b3e','#4b5050','#656b65','#7a7d70']
RUST=['#614643','#78534c','#8c6154','#a0745f']

def clamp(v,a,b):return min(b,max(a,v))
def tip(x,y):return round(x),round(y)
def arc_points(cx,cy,rx,ry,a,b,step=3):
 n=max(1,math.ceil(abs(b-a)/step))
 return [tip(cx+rx*math.cos(math.radians(a+(b-a)*i/n)),cy+ry*math.sin(math.radians(a+(b-a)*i/n))) for i in range(n+1)]

class Painting:
 def __init__(self,size,seed):
  self.size=size;self.r=random.Random(seed);self.layers=[]
 def layer(self,name,bg=None):
  self.im=Image.new('RGBA',self.size,bg or (0,0,0,0));self.d=ImageDraw.Draw(self.im)
  self.layers.append((name,self.im))
 def rect(self,x,y,X,Y,c):
  if X>=x and Y>=y:self.d.rectangle((x,y,X,Y),fill=c)
 def poly(self,pts,color):self.d.polygon(pts,fill=color)
 def line(self,pts,color,w=1):self.d.line(pts,fill=color,width=w)
 def l(self,c,*pts,w=1):self.line(pts,c,w)
 def stipple(self,x,y,w,h,p,index,n):
  # Small clusters follow planes of stone. No independent pixel noise.
  for j in range(n):
   X=x+self.r.randrange(max(1,w));Y=y+self.r.randrange(max(1,h))
   dx=self.r.choice([2,3,3,4,5,7]); tone=p[clamp(index+self.r.choice([-1,-1,1]),0,len(p)-1)]
   self.line([(X,Y),(X+dx//2,Y),(X+dx//2+1,Y-1),(X+dx,Y-1)],tone)
 def stone(self,x,y,X,Y,p,k=4,detail=True,grain=True):
  if X<=x or Y<=y:return
  D=self.r;w=X-x;h=Y-y;k=clamp(k,1,len(p)-3)
  chip=D.choice([0,0,1,1,2]);top=D.choice([0,0,1])
  self.poly([(x+1+chip,y),(X-2,y),(X,y+2),(X-1,Y-1),(X-3,Y),(x+1,Y),(x,Y-2),(x,y+2+chip)],p[k])
  self.l(p[k+1],(x+2+chip,y+1),(x+w//2+top,y+1))
  self.l(p[k-1],(x+w//3,Y-1),(X-2,Y-1),(X-1,Y-3))
  if w>14 and h>7 and grain:
   # Elongated strata slightly darker along lower right; preserve the quiet interior.
   band=D.randint(2,max(2,w//2))
   self.poly([(X-band,Y-2),(X-band+3,Y-3),(X-5,Y-3),(X-3,Y-5),(X-2,Y-5),(X-2,Y-2)],p[k-1])
   if detail:self.stipple(x+3,y+3,max(1,w-11),max(1,h-5),p,k,max(1,w//21))
  if detail and h>10 and w>13 and D.random()<.32:
   q=x+D.randint(5,w-5)
   self.l(p[k-1],(q,y),(q+1,y+3),(q-1,y+5),(q-1,y+6))
 def masonry(self,p,rows,width,base=3,origin=0,quiet=108):
  y=origin
  for j,h in enumerate(rows):
   x=-self.r.randint(7,width-7)
   while x<self.size[0]:
    w=self.r.randint(width-8,width+12);v=base+self.r.choice([0,0,0,0,1,-1])
    self.stone(x,y,x+w-1,y+h-1,p,v,y<quiet)
    x+=w
   y+=h
 def column(self,x,y,bottom,w,p,k=4):
  self.rect(x+2,y,x+w,bottom,p[k-2])
  Y=y+2
  while Y<bottom:
   h=min(self.r.randint(14,22),bottom-Y+1)
   self.stone(x,Y,x+w-1,Y+h-2,p,k)
   self.rect(x+1,Y+2,x+2,Y+h-3,p[k+1])
   self.rect(x+w-3,Y+1,x+w-2,Y+h-3,p[k-1])
   Y+=h
  self.stone(x-2,y-1,x+w+2,y+4,p,k+1)
  self.stone(x-2,bottom-5,x+w+2,bottom-2,p,k)
  self.stone(x-4,bottom-1,x+w+4,bottom+3,p,k)
 def arch(self,cx,y,rx,ry,t,p,base=4,n=13,skip=(),keystone=True):
  for i in range(n):
   if i in skip:continue
   a=180+180*i/n;b=180+180*(i+1)/n
   extra=2 if i==n//2 and keystone else 0
   outer=arc_points(cx,y,rx+t+extra,ry+t+extra,a,b)
   inner=arc_points(cx,y,rx,ry,b,a)
   k=clamp(base+self.r.choice([0,0,0,1,-1]),1,len(p)-3)
   self.poly(outer+inner,p[k])
   self.line(outer,p[k+1]);self.line(inner,p[k-1])
   self.line([outer[0],inner[-1]],p[max(0,k-2)])
   if i%3==1 and len(outer)>2:self.line(outer[1:4],p[k+2])
   if i%4==0:
    u=(outer[len(outer)//2][0]+inner[len(inner)//2][0])//2
    v=(outer[len(outer)//2][1]+inner[len(inner)//2][1])//2
    self.l(p[k-1],(u-1,v),(u+1,v),(u+2,v-1))
 def joint_crack(self,pts,shadow,light):
  self.line([(x+1,y+1) for x,y in pts],light);self.line(pts,shadow)
 def roundel(self,cx,cy,R,p):
  for radius in [R,R-3,R-8,R-12,R-21]:
   self.line(arc_points(cx,cy,radius,radius*1.10,0,360),p[2],2)
   self.line(arc_points(cx,cy,radius+1,radius*1.10+1,194,299),p[6])
   self.line(arc_points(cx,cy,radius-1,radius*1.10-1,12,99),p[4])
 def floor(self,split,p=FLOOR):
  W,H=self.size; h=H-split
  self.rect(0,split,W-1,H-1,p[3]);van=W*.53
  rows=[split,split+round(h*.11),split+round(h*.30),split+round(h*.59),H]
  # Break joints are offset course by course. Narrow grooves converge upstage.
  for j,(a,b) in enumerate(zip(rows,rows[1:])):
   columns=[-1.15,-.68,-.26,.16,.63,1.12] if j%2 else [-1.4,-.88,-.48,-.07,.40,.91,1.30]
   def sx(c,y):return round(van+c*W*(.64+(y-split)/h*.56))
   for i,(l,rr) in enumerate(zip(columns,columns[1:])):
    A=sx(l,a);B=sx(rr,a);C=sx(rr,b);D=sx(l,b)
    k=4+self.r.choice([-1,0,0,1]);self.poly([(A,a),(B-1,a),(C-1,b-1),(D,b-1)],p[k])
    self.l(p[1],(A,a+1),(B-1,a+1),(C-1,b-1))
    self.l(p[k+1],(A+2,a+2),(min(B-4,A+max(4,(B-A)*2//3)),a+2))
    if j>=2:
     self.l(p[k-1],(D+3,b-2),(D+9,b-2),(D+12,b-3))
     if i%2==1 and j==3:self.joint_crack([(B-10,a+1),(B-14,a+4),(B-13,a+8),(B-17,a+10)],p[2],p[k])
   self.l(p[2],(0,b-1),(W-1,b-1))
  self.l(p[2],(0,split),(W-1,split))
  for x,length in [(3,14),(28,8),(57,11),(99,9),(128,5)]:
   self.l(p[5],(x,split+2),(x+length,split+2))
 def flatten(self):
  dest=Image.new('RGBA',self.size)
  for _,img in self.layers:dest.alpha_composite(img)
  return dest
 def save(self,stem,path):
  path.parent.mkdir(parents=True,exist_ok=True)
  flat=self.flatten();flat.convert('RGB').save(path,optimize=True)
  def png(im):
   stream=io.BytesIO();im.save(stream,format='PNG');return stream.getvalue()
  root=ET.Element('image',{'version':'0.0.3','name':stem,'w':str(self.size[0]),'h':str(self.size[1])})
  stack=ET.SubElement(root,'stack')
  with zipfile.ZipFile(SOURCE/(stem+'.ora'),'w') as z:
   z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
   for i,(name,img) in enumerate(reversed(self.layers)):
    file='data/layer%d.png'%i;z.writestr(file,png(img));ET.SubElement(stack,'layer',{'name':name,'src':file,'x':'0','y':'0','opacity':'1.0','visibility':'visible','composite-op':'svg:src-over'})
   z.writestr('stack.xml',ET.tostring(root,encoding='utf-8',xml_declaration=True));z.writestr('mergedimage.png',png(flat))
   prev=flat.copy();prev.thumbnail((256,256));z.writestr('Thumbnails/thumbnail.png',png(prev))

def scar(c,x,y,scale=1):
 pts=[(0,0),(2,-1),(2,-4),(4,-2),(5,-7),(6,-8),(6,-4),(5,-2),(8,-4),(8,-2),(5,0),(4,3),(3,4),(4,0),(1,2)]
 c.poly([(x+xx*scale,y+yy*scale) for xx,yy in pts],RUST[1])
 c.l(RUST[2],(x+4*scale,y),(x+6*scale,y-5*scale));c.l(RUST[0],(x+3,y+4),(x+2,y+7))

def damp(c,x,y,p):
 # A lime bloom follows the bed joint, then drips down in two narrow tongues.
 c.poly([(x,y),(x+4,y),(x+5,y-1),(x+10,y-1),(x+11,y-3),(x+15,y-3),(x+11,y-1),(x+9,y),(x+8,y+4),(x+7,y+5),(x+7,y+1),(x+3,y+2),(x+2,y+4),(x+2,y+2),(x,y+1)],p[5])
 c.l(p[6],(x+4,y),(x+6,y-1),(x+8,y-1));c.l(p[4],(x+7,y+5),(x+7,y+9))

def engraving(c,cx,cy,r,p):
 for a in [-90,30,150]:
  def pt(x,y):
   ang=math.radians(a);return tip(cx+x*math.cos(ang)-y*math.sin(ang),cy+x*math.sin(ang)+y*math.cos(ang))
  shape=[(r,0),(r-2,4),(9,8),(5,8),(7,3),(10,-1),(10,2),(8,5),(12,4),(r-3,1)]
  c.poly([pt(x,y) for x,y in shape],p[2])
  c.l(p[6],*[pt(x,y) for x,y in [(r-2,2),(r-5,4),(10,6),(7,6)]])
  c.l(p[4],pt(10,0),pt(9,2))

