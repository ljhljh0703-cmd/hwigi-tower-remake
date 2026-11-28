const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const W=104, H=60, FOOT=[36,57];
const pal={X:'11181c',u:'242829',h:'403838',e:'5b4940',b:'80624b',t:'a8835e',s:'c29a70',f:'dab78a',i:'e9d5a0',
 n:'252c35',P:'343c4a',C:'48505c',J:'626c70',K:'636d7e',G:'89928a',d:'302e42',a:'46435d',l:'68647d',L:'868593',
 o:'65503b',y:'a08358',m:'c5a26a',j:'465454',g:'687a79',v:'9eafa6',w:'d2d8bf'};
const colors=Object.fromEntries(Object.entries(pal).map(([k,v])=>[k,Buffer.from(v+'ff','hex')]));
colors.x=colors.X;
const names=['Rear arm','Mantle','Legs','Coat','Head','Sword','Sword arm','Fingers'];
const legs=require('./legs.json');
const root=path.join(__dirname,'art');fs.mkdirSync(root,{recursive:true});
let layers,layer;
function pick(n){layer=layers[n]}
function dot(x,y,c){x=Math.round(x);y=Math.round(y);if(x<0||x>=W||y<0||y>=H)throw Error('Outside cell '+[x,y,c]);colors[c].copy(layer,(y*W+x)*4)}
function line(c,...points){for(let i=1;i<points.length;i++){
 let [x,y]=points[i-1].map(Math.round);const [ex,ey]=points[i].map(Math.round);
 const dx=Math.abs(ex-x),dy=-Math.abs(ey-y),sx=x<ex?1:-1,sy=y<ey?1:-1;let err=dx+dy;
 for(;;){dot(x,y,c);if(x===ex&&y===ey)break;const e2=err*2;if(e2>=dy){err+=dy;x+=sx}if(e2<=dx){err+=dx;y+=sy}}
}}
function poly(c,pts){
 const y0=Math.min(...pts.map(p=>p[1])),y1=Math.max(...pts.map(p=>p[1]));
 for(let y=Math.round(y0);y<=Math.round(y1);y++){
  const cuts=[];
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
   const [ax,ay]=pts[j],[bx,by]=pts[i];if((ay<=y+.01&&by>y+.01)||(by<=y+.01&&ay>y+.01))cuts.push(ax+(y+.01-ay)*(bx-ax)/(by-ay));
  }
  cuts.sort((a,b)=>a-b);for(let i=0;i+1<cuts.length;i+=2)for(let x=Math.ceil(cuts[i]);x<=Math.floor(cuts[i+1]);x++)dot(x,y,c)
 }
 line(c,...pts,pts[0])
}
function stamp(x,y,blueprint){blueprint.trim().split(/\s+/).forEach((row,j)=>[...row].forEach((v,i)=>{if(v!=='.')dot(x+i,y+j,v)}))}
function projected(origin,end){const dx=end[0]-origin[0],dy=end[1]-origin[1],l=Math.hypot(dx,dy),a=dx/l,b=dy/l;
 return (t,n=0)=>[Math.round(origin[0]+a*t-b*n),Math.round(origin[1]+b*t+a*n)]}
function limb(a,b,w0,w1,base,light,shade){
 const len=Math.hypot(b[0]-a[0],b[1]-a[1]);const p=projected(a,b);
 poly('X',[p(-1,-w0),p(len,-w1),p(len+1,w1),p(1,w0)]);
 poly(base,[p(0,-w0+1),p(len,-w1+1),p(len,w1-1),p(0,w0-1)]);
 line(light,p(1,-w0+1),p(len*.57,-w1+1));line(shade,p(len*.48,w1-1),p(len,w1-1));
}
// Coordinates are per-key, from the planted foot plane. The grip is also the weapon pivot.
//             hip     collar   elbow    grip     blade angle   cape tail       head
const keys={
 idle:[[36,33],[37,21],[40,34],[50,32],-36,[14,39],'alert'],
 'idle-breathe':[[37,34],[37,22],[40,35],[50,33],-35,[13,40],'alert'],
 'guard-lift':[[34,34],[35,22],[39,35],[50,30],-45,[12,38],'alert'],
 guard:[[34,34],[35,22],[40,36],[52,31],-61,[13,40],'alert'],
 'guard-brace':[[34,36],[37,26],[40,39],[51,33],-65,[12,38],'brace'],
 'guard-middle':[[34,35],[36,25],[40,36],[50,35],-14,[12,39],'brace'],
 'guard-low':[[34,36],[36,27],[39,39],[49,40],20,[12,39],'brace'],
 'attack-prepare':[[31,33],[29,22],[20,29],[14,23],-107,[8,36],'alert'],
 step:[[37,33],[40,21],[45,33],[55,31],-31,[12,33],'alert'],
 attack:[[40,37],[47,28],[54,34],[63,33],17,[12,32],'brace'],
 'attack-follow':[[40,35],[44,25],[52,35],[58,36],24,[16,28],'brace'],
 hit:[[35,34],[29,21],[20,29],[25,42],18,[8,25],'hurt'],
 recover:[[35,34],[37,24],[40,35],[49,36],-8,[15,40],'alert'],
 fall:[[35,42],[32,32],[26,42],[34,48],8,[13,48],'hurt'],
 down:[[40,49],[30,47],[30,53],[40,52],2,[17,55],'down'],
};
const rotate=(x,y,r)=>[Math.round(x*Math.cos(r)-y*Math.sin(r)),Math.round(x*Math.sin(r)+y*Math.cos(r))];
function paint(pose){
 layers=Object.fromEntries(names.map(n=>[n,Buffer.alloc(W*H*4)]));
 const [hip,collar,elbow,grip,angle,tail,headType]=keys[pose];
 const [hx,hy]=hip,[cx,cy]=collar;const down=pose==='down', prep=pose==='attack-prepare',hit=pose==='hit';
 pick('Legs');for(const [x,y,c] of legs[pose])dot(x,y,c);
 if(!down){
  // Reinforce the original rear and forward soles, using the actual stance of this cel.
  const boots=legs[pose].filter(p=>p[1]===56).map(p=>p[0]).sort((a,b)=>a-b);
  for(const x of boots){dot(x,56,'X');if(x===boots[boots.length-1])dot(x+1,56,'X')}
 }
 pick('Rear arm');
 const farShoulder=[cx+2,cy+2],farElbow=down?[35,53]:prep?[41,28]:hit?[25,30]:[cx+7,cy+8];
 const farHand=down?[39,53]:prep?[49,26]:hit?[40,27]:[cx+5,cy+13];
 limb(farShoulder,farElbow,2.8,1.9,'h','e','u');limb(farElbow,farHand,1.8,1.25,'h','b','u');
 stamp(farHand[0]-1,farHand[1]-1,'ebx btx .hx');
 pick('Mantle');const [tx,ty]=tail;
 if(down){poly('X',[[cx-3,cy-2],[hx+2,hy],[45,55],[20,56],[14,55],[18,52]]);poly('a',[[cx-3,cy],[36,53],[23,55],[16,54]]);line('l',[19,54],[25,52],[28,51]);}
 else {
   const p=(dx,dy)=>[cx+dx,cy+dy];
   poly('X',[p(-4,-2),p(3,0),[hx+2,hy+3],[tx+12,ty+1],[tx+5,ty+4],[tx+5,ty+2],[tx,ty+3],[tx+1,ty],[tx-2,ty+1],[tx+3,ty-4],p(-8,3)]);
   poly('o',[[tx+2,ty],[tx+7,ty-5],[hx,hy-3],[hx-4,hy+2],[tx+6,ty+2],[tx+7,ty],[tx+2,ty+2]]);
   line('y',[tx+3,ty+1],[tx+7,ty-1],[tx+9,ty-2]);
   poly('a',[p(-4,-2),p(2,0),[hx-3,hy-2],[tx+8,ty-1],[tx,ty+1],[tx+4,ty-5],p(-8,3)]);
   poly('l',[p(-5,0),p(-2,0),[tx+9,ty-4],[tx+3,ty-1],[tx+8,ty-6]]);
   line('C',p(-6,2),[tx+5,ty-3],[tx+2,ty]);line('n',p(0,2),[tx+12,ty-1]);
   line('a',p(-8,1),p(-11,3),[tx+12,ty-3]);
   line('L',p(-6,1),p(-9,3));
   line('o',[tx+4,ty+1],[tx+6,ty]);dot(tx+5,ty,'m');
 }
 pick('Coat');
 const body=projected(hip,collar),len=Math.hypot(cx-hx,cy-hy);
 const bpoly=(c,pts)=>poly(c,pts.map(([t,n])=>body(t,n)));
 bpoly('X',[[-5,-6],[1,-5],[len-2,-5],[len+1,-3],[len+1,3],[len-3,6],[2,4],[-3,6],[-2,1],[-4,0]]);
 bpoly('u',[[-3,-5],[2,-4],[len-1,-4],[len,3],[len-4,5],[2,3],[-2,4]]);
 bpoly('h',[[1,-4],[len-2,-3],[len-1,0],[len-5,3],[3,2]]);
 bpoly('e',[[4,-1],[len-3,-3],[len-2,-1],[len-6,1]]);
 line('h',body(len-2,2),body(len-4,4),body(len-7,4));
 bpoly('h',[[-4,-5],[-1,-5],[0,3],[-3,4],[-2,1]]);
 line('o',body(1,-4),body(0,3));line('b',body(1,-3),body(1,-1));dot(...body(0,2),'y');
 pick('Head');
 const head=[
 '......xxxxxx..','...xxuhheeeux.','..xuhhheehehux','..xuhehehhuhux','xxuhhhehttbshx',
 '..xuuhhtbbheux','xuuuhhtttssxex','.xuuhuxbtsesfx','..xxhuxbbtssx','...xuxhetssfx',
 '......xehbtsx','.......xehbx','........xehx',
 ];
 const rot=down?-1.29:headType==='hurt'?-.41:headType==='brace'?.13:-.04;
 const skullOrigin=down?[cx-1,cy]:[cx,cy-1];
 // Inverse-map so the rotated head stays solid on the native pixel grid.
 for(let yy=-17;yy<=10;yy++)for(let xx=-19;xx<=10;xx++){
  const [dx,dy]=rotate(xx,yy,-rot),row=dy+11,col=dx+6;
  const ink=row>=0&&row<head.length&&col>=0?head[row][col]:null;
  if(ink&&ink!=='.')dot(skullOrigin[0]+xx,skullOrigin[1]+yy,ink)
 }
 if(!down){
  // Cloth collar laid just beneath the jaw, with a textile fold instead of chest hardware.
  line('n',[cx-5,cy],[cx-2,cy+2],[cx+2,cy+2]);
  line('l',[cx-5,cy],[cx-3,cy+1]);
  dot(cx-3,cy+1,'y');
 }
 pick('Sword');
 const rad=angle*Math.PI/180,dx=Math.cos(rad),dy=Math.sin(rad);
 const wp=(t,n=0)=>[Math.round(grip[0]+dx*t-dy*n),Math.round(grip[1]+dy*t+dx*n)];
 const end=prep?22:down?29:32;
 // blade length on the anticipation pose is foreshortened toward the camera
 const wpPoly=(c,pts)=>poly(c,pts.map(([t,n])=>wp(t,n)));
 wpPoly('X',[[5,-1.6],[end-5,-.8],[end,0],[end-3,1],[6,2]]);
 wpPoly('g',[[6,-1],[end-5,-.6],[end,0],[end-5,.6],[6,1]]);
 line('v',wp(7,-1),wp(15,-1));line('w',wp(16,-1),wp(22,-.6));line('v',wp(23,-.6),wp(end,0));
 line('X',wp(-5,0),wp(5,0));line('e',wp(-5,-1),wp(4,-1));line('o',wp(-4,0),wp(4,0));
 line('g',wp(-6,-1),wp(-6,1));dot(...wp(-6,-1),'v');
 line('X',wp(4,-4),wp(4,4));line('g',wp(5,-3),wp(5,3));dot(...wp(5,-3),'v');dot(...wp(4,4),'h');
 pick('Sword arm');
 const shoulder=[cx-2,cy+2];
 limb(shoulder,elbow,3.4,2.3,'h','b','u');
 const sleeve=projected(shoulder,elbow);const upperLength=Math.hypot(elbow[0]-shoulder[0],elbow[1]-shoulder[1]);
 poly('P',[sleeve(-1,-3),sleeve(2,-3),sleeve(5,-2),sleeve(5,2),sleeve(1,3),sleeve(-1,1)]);
 line('K',sleeve(0,-2),sleeve(3,-2));dot(...sleeve(0,-2),'G');
 line('e',sleeve(upperLength*.52,-1),sleeve(upperLength*.68,1));
 const unit=projected(elbow,grip),foreLength=Math.hypot(grip[0]-elbow[0],grip[1]-elbow[1]);
 const wrist=unit(foreLength-1,0);
 limb(elbow,wrist,2.5,1.65,'e','b','h');
 line('h',unit(foreLength*.55,-1),unit(foreLength*.61,1));
 line('t',unit(foreLength*.76,-1),unit(foreLength*.83,1));
 pick('Fingers');wpPoly('X',[[-2,-2],[0,-3],[2,-2],[2,1],[1,2],[-2,2],[-3,0]]);
 wpPoly('b',[[-2,-1],[-1,-2],[1,-2],[2,-1],[1,1],[-2,1]]);
 line('s',wp(-2,-1),wp(0,-2),wp(1,-1));dot(...wp(0,-2),'f');dot(...wp(1,1),'h');dot(...wp(-1,1),'t');
 return {grip,guard:wp(5,0),tip:wp(end,0),angle,hip,elbow,shoulder,foot:FOOT}
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function chunk(id,data){const raw=Buffer.concat([Buffer.from(id),data]),m=Buffer.alloc(4),l=Buffer.alloc(4);let n=0xffffffff;for(const v of raw)n=crcTable[(n^v)&255]^(n>>>8);m.writeUInt32BE((n^0xffffffff)>>>0);l.writeUInt32BE(data.length);return Buffer.concat([l,raw,m])}
function png(raw){const hdr=Buffer.alloc(13);hdr.writeUInt32BE(W);hdr.writeUInt32BE(H,4);hdr[8]=8;hdr[9]=6;const rows=[];for(let i=0;i<H;i++)rows.push(Buffer.from([0]),raw.subarray(4*i*W,4*(i+1)*W));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))])}
const meta={size:[W,H],pivot:FOOT,layers:names,poses:{}};
for(const pose of Object.keys(keys)){
 meta.poses[pose]=paint(pose);const dir=path.join(root,'layers',pose);fs.mkdirSync(dir,{recursive:true});
 const flat=Buffer.alloc(W*H*4);
 for(const n of names){
  fs.writeFileSync(path.join(dir,n+'.png'),png(layers[n]));
  for(let i=0;i<flat.length;i+=4)if(layers[n][i+3])layers[n].copy(flat,i,i,i+4);
 }
 fs.writeFileSync(path.join(root,'hero-'+pose+'.png'),png(flat));
}
fs.writeFileSync(path.join(root,'sword.json'),JSON.stringify(meta,null,2));
