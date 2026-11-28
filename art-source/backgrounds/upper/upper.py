from stone import Painting, HALL, VAULT, SACRED, FLOOR, IRON, RUST, PUBLIC, arc_points

def foundation(c,B,p,offset=0):
 for x in range(-12+offset,150,31):c.stone(x,B-8,x+30,B-2,p,3,False)
 c.rect(0,B-1,143,B-1,p[2])

def stairs(compact):
 B=144 if compact else 204;c=Painting((144,B if compact else 256),601+compact);p=HALL
 c.layer('Split limestone',p[2]);c.masonry(p,[16,21,15,22,19,17,23,15,18,20,20,20],36,3)
 y=B-(49 if compact else 96)
 c.layer('Cold stairwell')
 c.poly([(0,y-8),(11,y-16),(11,y-21),(22,y-24),(26,y-24),(30,y-31),(44,y-35),(49,y-41),(63,y-41),(63,y-48),(78,y-48),(83,y-54),(86,y-54),(87,y-58),(121,y-58),(121,y+34),(0,y+34)],p[1])
 c.poly([(8,y-8),(29,y-19),(40,y-26),(60,y-32),(69,y-45),(88,y-48),(96,y-56),(112,y-56),(112,y-6),(69,y+20),(8,y+29)],'#425055')
 for x,yy in [(12,y+7),(32,y-2),(62,y-19),(86,y-34)]:c.l('#536168',(x,yy),(x+11,yy-4),(x+14,yy-4))
 c.layer('Ascending flight')
 for j in range(12):
  x=j*10-7;yy=y+38-j*5
  if x>105:break
  c.poly([(x,yy),(x+10,yy-4),(x+30,yy-4),(x+26,yy-1),(x+12,yy+1),(x+1,yy+1)],p[5])
  c.poly([(x,yy+2),(x+11,yy+2),(x+23,yy-1),(x+23,yy+6),(x+11,yy+9),(x,yy+9)],p[3])
  c.l(p[6],(x,yy),(x+5,yy),(x+7,yy-1),(x+11,yy-1))
  if j in (2,4,9):
   c.l(RUST[0],(x+5,yy),(x+7,yy+2),(x+6,yy+5))
   c.l(p[2],(x+6,yy+1),(x+8,yy+4),(x+7,yy+7))
 c.layer('Broken parapet')
 for x,yy,w in [(0,y+40,19),(19,y+39,9),(102,y-20,23),(124,y-20,22)]:
  c.stone(x,yy,x+w-1,yy+6,p,4);c.stone(x+2,yy+7,x+w-2,yy+17,p,3,False)
 c.joint_crack([(127,B-99),(124,B-87),(127,B-83),(126,B-78),(132,B-72),(130,B-65)],p[2],p[4])
 c.l(RUST[0],(125,B-88),(126,B-83),(127,B-81))
 c.layer('Foot of the flight');foundation(c,B,p,4)
 if not compact:c.layer('Cracked flags');c.floor(B)
 return c

def corridor(compact):
 B=144 if compact else 204;c=Painting((144,B if compact else 256),746+compact);p=VAULT
 y=B-(49 if compact else 106)
 c.layer('Watch gallery',p[2]);c.masonry(p,[19,22,16,21,23,16,25,21,24,22,15],34,3)
 c.layer('Arrow slits and vanishing wall')
 c.poly([(46,y-19),(88,y-19),(100,y),(100,y+31),(49,y+34),(38,y+13)],p[2])
 for i in range(3):
  x=56+i*11;yy=y-11+abs(i-1)*3
  c.poly([(x,yy+15),(x,yy),(x+2,yy-4),(x+4,yy),(x+4,yy+14)],p[1])
  c.l('#616965',(x+1,yy+10),(x+1,yy+1),(x+2,yy-2))
 for left in [True,False]:
  def flip(pts):return pts if left else [(143-x,z) for x,z in pts]
  face=4 if left else 3
  c.poly(flip([(0,y-54),(44,y-17),(42,y+33),(0,B-10)]),p[face])
  for i in range(5):
   l=y-41+i*22;r=y-13+i*10
   c.l(p[face-1],*flip([(0,l),(7,l+(r-l)//7),(42,r)]))
   c.l(p[face+1],*flip([(0,l+2),(12,l+(r-l)*12//42+2)]))
   m=14 if i%2 else 28;my=int(l+(r-l)*m/42)
   c.l(p[face-1],*flip([(m,my),(m-1,my+8)]))
  c.l(p[5 if left else 4],*flip([(0,y-48),(43,y-16),(44,y-13)]),w=2)
  # Heavy staggered jambs interrupt the perspective at the far end.
  x=39 if left else 98
  c.column(x,y-14,y+29,6,p,4 if left else 3)
 c.layer('Stone lintels')
 c.stone(35,y-25,64,y-19,p,4);c.stone(65,y-25,106,y-19,p,3)
 for x in [4,126]:
  c.poly([(x,y-31),(x+7,y-27),(x+8,y-5),(x+4,y+1),(x,y-3)],p[1])
  c.l(p[5],(x+1,y-29),(x+1,y-5),(x+3,y-2))
 c.layer('Threshold');foundation(c,B,p,10)
 if not compact:c.layer('Gallery paving');c.floor(B)
 return c

def gate(compact):
 B=144 if compact else 204;c=Painting((144,B if compact else 256),811+compact);p=SACRED
 top=70 if compact else 44;spring=top+28
 c.layer('Gatehouse courses',p[2]);c.masonry(p,[22,16,19,22,24,25,19,22,18,21,15],39,3)
 c.layer('Sealed iron leaves')
 outline=[(14,B-10),(14,spring)]+arc_points(72,spring,58,27,180,360)+[(130,B-10)]
 c.poly(outline,p[2])
 for x in range(17,130,12):
  a=abs((x+5-72)/58);sy=spring-round(26*(1-min(1,a)**2)**.5)+3
  c.poly([(x,sy+2),(x+2,sy),(x+10,sy-1),(x+10,B-12),(x,B-12)],p[3 if x%3 else 4])
  c.l(p[4],(x+2,sy+5),(x+2,sy+16))
 c.rect(70,top+2,73,B-10,p[1]);c.l(p[4],(74,top+4),(74,B-11))
 c.layer('Rusting crossbar and lock')
 bar=B-(38 if compact else 78)
 for yy in [bar-12,bar+12]:
  for x,X in [(18,65),(78,126)]:
   c.poly([(x,yy),(X-5,yy),(X,yy+3),(X-5,yy+5),(x,yy+5)],IRON[2]);c.l(IRON[1],(x,yy+5),(X-5,yy+5))
   for r in [x+3,x+11,X-8]:c.rect(r,yy+1,r+1,yy+2,IRON[3])
 c.poly([(26,bar-2),(112,bar-2),(117,bar),(115,bar+5),(27,bar+5),(24,bar+1)],'#514f50')
 c.l('#797269',(26,bar-2),(63,bar-2),(66,bar-1),(109,bar-1))
 c.rect(62,bar-4,66,bar+6,IRON[1]);c.l(IRON[3],(63,bar-2),(63,bar+4))
 c.poly([(73,bar-3),(82,bar-2),(82,bar+6),(78,bar+9),(74,bar+6)],'#605952')
 c.rect(77,bar,78,bar+4,IRON[1])
 # The chain breaks well above the fight line. Separate short lengths have open bent ends.
 for i in range(6):
  X=112+i*2;Y=bar-10+i*3
  c.l(IRON[1],(X,Y-1),(X+2,Y),(X+2,Y+3),(X+1,Y+4),(X-1,Y+2),(X,Y-1))
  if i%2==0:c.l('#746b61',(X,Y),(X+1,Y-1))
 c.l(RUST[0],(122,bar+5),(124,bar+7),(126,bar+5))
 c.layer('Arch and threshold');c.arch(72,spring,58,27,7,p,4,n=15)
 c.column(8,spring,B-10,7,p,4);c.column(129,spring,B-10,7,p,3)
 foundation(c,B,p,2)
 if not compact:c.layer('Gate sill');c.floor(B)
 return c

def ledge():
 # Top is the rear actor's ground. The left scar exposes a plane, instead of hanging in midair.
 c=Painting((84,24),982);p=FLOOR;c.layer('Stone riser')
 c.poly([(6,0),(83,0),(83,23),(0,23),(0,10),(3,8),(3,5),(6,4)],p[1])
 for x,X in [(5,25),(26,54),(55,84)]:
  c.stone(x,5,X,14,p,2,False)
 for x,X in [(1,14),(15,39),(40,69),(70,84)]:c.stone(x,15,X,23,p,2,False)
 c.layer('Worn coping')
 c.poly([(6,0),(83,0),(83,5),(51,5),(48,6),(26,6),(23,5),(6,5),(3,7),(2,6)],p[3])
 for x,X in [(6,19),(22,42),(45,62),(65,83)]:c.l(p[4],(x,0),(X,0))
 c.l(p[5],(8,0),(17,0));c.l(p[2],(28,0),(26,2),(23,3));c.l(p[2],(60,0),(58,3),(58,4))
 return c

if __name__=='__main__':
 for name,fn in [('floor-13-14',stairs),('floor-15-17',corridor),('floor-18-19',gate)]:
  for compact in [False,True]:
   key=name+('-compact' if compact else '');fn(compact).save(key,PUBLIC/'ui/backgrounds'/(key+'.png'))
 l=ledge();f=PUBLIC/'ui/backgrounds/upper-rear-ledge.png';l.save('upper-rear-ledge',f);l.flatten().save(f,optimize=True)
