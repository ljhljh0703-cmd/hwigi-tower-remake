import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {TextureAtlas,AtlasAttachmentLoader,SkeletonJson,Skeleton,Physics,MixBlend,MixDirection}=await import(process.env.SPINE_CORE_PATH ? pathToFileURL(path.resolve(process.env.SPINE_CORE_PATH)).href : '@esotericsoftware/spine-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]??path.join(root,'rebuilt'));
fs.mkdirSync(output,{recursive:true});
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const atlas=new TextureAtlas(read('slime-pool.atlas'));
for(const page of atlas.pages)page.setTexture({getImage:()=>({width:page.width,height:page.height}),setFilters(){},setWraps(){}});
const data=new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(read('slime-pool.json')));
const raw=JSON.parse(read('slime-pool.json')),result={};
function keyTimes(value,all){
 if(!value||typeof value!=='object')return;
 if(typeof value.time==='number')all.add(value.time);
 Object.values(value).forEach(v=>keyTimes(v,all));
}
for(const a of data.animations){
 const duration=+a.duration.toFixed(5),keySet=new Set([0,duration]);keyTimes(raw.animations[a.name],keySet);
 const times=[...new Set([...Array.from({length:Math.floor(duration*40)+1},(_,i)=>i/40),...keySet])].sort((a,b)=>a-b);
 const rig=new Skeleton(data);const rows=[];let prev=-1;const events=[];
 for(const t of times){
  // Attachment keys are stored as Float32. Sample on the same representable
  // time as Spine so a key at 0.31 doesn't accidentally read the old skin.
  const sampleTime=Math.fround(t);
  rig.setToSetupPose();a.apply(rig,prev,sampleTime,false,events,1,MixBlend.replace,MixDirection.mixIn);prev=sampleTime;rig.updateWorldTransform(Physics.update);
  const parts=[];
  for(const slot of rig.slots){
   const mesh=slot.getAttachment();if(!mesh)continue;
   if(!mesh.bones)throw Error('Expected skinned mesh');
   const v=new Float32Array(mesh.worldVerticesLength);mesh.computeWorldVertices(slot,0,v.length,v,0,2);
   parts.push({s:slot.data.name,a:mesh.name,v:Array.from(v,(c,i)=>+(i%2?41-c:73+c).toFixed(4))});
  }
  const bones=rig.bones.map(b=>[+(b.worldX+73).toFixed(3),+(41-b.worldY).toFixed(3)]);
  rows.push({t,parts,bones});
 }
 
 result[a.name]=rows;
 console.log(a.name,rows.length,'official playback samples');
}

fs.writeFileSync(path.join(output,'samples.json'),JSON.stringify(result));
