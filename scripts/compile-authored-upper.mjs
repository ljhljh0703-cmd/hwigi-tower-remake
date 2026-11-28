import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

// These two native rigs use binary transparency, normal blending, and unlinked RGBA cels.
// Reject unsupported editor features instead of silently degrading the exported artwork.
function readCels(buf) {
  const width = buf.readUInt16LE(8), height = buf.readUInt16LE(10)
  assert.equal(buf.readUInt32LE(0), buf.length)
  assert.equal(buf.readUInt16LE(4), 0xa5e0)
  assert.equal(buf.readUInt16LE(12), 32)
  const frames = [], labels = []
  let cursor = 128
  for (let i = 0; i < buf.readUInt16LE(6); i++) {
    const end = cursor + buf.readUInt32LE(cursor)
    assert.equal(buf.readUInt16LE(cursor + 4), 0xf1fa)
    const count = buf.readUInt32LE(cursor + 12) || buf.readUInt16LE(cursor + 6)
    const cels = new Map()
    let c = cursor + 16
    for (let j = 0; j < count; j++) {
      const length = buf.readUInt32LE(c), type = buf.readUInt16LE(c + 4), d = c + 6
      if (type === 0x2004) {
        assert.equal(buf.readUInt16LE(d) & 1, 1, 'Unhide all exported layers')
        assert.equal(buf.readUInt16LE(d+2), 0, 'Group layers before export are unsupported')
        assert.equal(buf.readUInt16LE(d+10), 0, 'Use normal blending')
        assert.equal(buf[d+12], 255, 'Use full layer opacity')
      }
      if (type === 0x2018) {
        let p=d+10
        for(let k=0;k<buf.readUInt16LE(d);k++) {
          const start=buf.readUInt16LE(p),last=buf.readUInt16LE(p+2),n=buf.readUInt16LE(p+17)
          assert.equal(start,last,'Name each key with its own tag')
          labels[start]=buf.toString('utf8',p+19,p+19+n);p+=19+n
        }
      }
      if (type === 0x2005) {
        const layer=buf.readUInt16LE(d),x=buf.readInt16LE(d+2),y=buf.readInt16LE(d+4)
        assert.equal(buf[d+6],255,'Use full cel opacity')
        assert.equal(buf.readUInt16LE(d+7),2,'Use unlinked compressed cels')
        assert.equal(buf.readInt16LE(d+9),0,'Reset individual cel z-index overrides')
        const w=buf.readUInt16LE(d+16),h=buf.readUInt16LE(d+18)
        const data=inflateSync(buf.subarray(d+20,c+length))
        assert.equal(data.length,w*h*4)
        assert.ok(x>=0&&y>=0&&x+w<=width&&y+h<=height)
        cels.set(layer,{x,y,w,h,data})
      }
      c += length
    }
    assert.equal(c,end)
    const pixels=Buffer.alloc(width*height*4)
    for(const [,cel] of [...cels].sort(([a],[b])=>a-b)) {
      for(let y=0;y<cel.h;y++)for(let x=0;x<cel.w;x++) {
        const src=4*(y*cel.w+x),dst=4*((y+cel.y)*width+x+cel.x),alpha=cel.data[src+3]
        if (!alpha) continue
        assert.equal(alpha,255,'Use hard, fully opaque combat pixels')
        cel.data.copy(pixels,dst,src,src+4)
      }
    }
    frames.push(pixels);cursor=end
  }
  assert.equal(cursor,buf.length)
  return {width,height,frames,labels}
}
// Upper-floor sheets authored in art-source/enemy-motion/authored/<id>.aseprite. The light
// pair (upper-dash, upper-support) and the heavy trio (upper-shield, upper-boss and its
// special sheet) share this exporter. Rect, pivot, bounds and contacts stay in the
// manifest; only alphaPixels and drawing are refreshed from the painted cells.
export const AUTHORED_UPPER = ['upper-dash', 'upper-support', 'upper-shield', 'upper-boss', 'upper-boss-special']
// The special boss sheet has never had its own map/codex portrait.
const portraitless = new Set(['upper-boss-special'])
// Recorded bounds that the runtime layout was tuned with, wider than the painted ink
// since the first stage-two compile. Keep the recorded box; the painted ink must match.
const recordedBounds = { 'upper-shield/down': { recorded: [4, 30, 25, 13], painted: [5, 30, 24, 13] } }

export async function compileAuthoredUpper(id, root, sharp) {
  assert.ok(AUTHORED_UPPER.includes(id), 'Not an authored upper sheet ' + id)
  const source='art-source/enemy-motion/authored/'+id+'.aseprite'
  const path=rel=>fileURLToPath(new URL(rel,root))
  const metadata=(JSON.parse(await readFile(path('art-source/enemy-motion/manifest.json'),'utf8'))).sheets.find(s=>s.id===id)
  const {width,height,frames,labels}=readCels(await readFile(path(source)))
  assert.equal(frames.length,metadata.frames.length)
  const sheet=Buffer.alloc(metadata.width*metadata.height*4)
  let portrait
  const updated=metadata.frames.map((cell,i)=>{
    assert.equal(labels[i],cell.id,'Preserve the state/tag order')
    const legacy=recordedBounds[id+'/'+cell.id]
    const [sx,sy,w,h]=cell.rect,[bx,by,bw,bh]=legacy?.painted??cell.bounds,pixels=frames[i]
    assert.equal(width,w);assert.equal(height,h)
    let count=0,x0=w,x1=-1,y0=h,y1=-1
    for(let y=0;y<h;y++){
      pixels.copy(sheet,4*((sy+y)*metadata.width+sx),4*y*w,4*(y+1)*w)
      for(let x=0;x<w;x++)if(pixels[4*(y*w+x)+3]){
        count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)
      }
    }
    if(legacy)assert.deepEqual(cell.bounds,legacy.recorded,'Recorded layout bounds changed')
    assert.deepEqual([x0,y0,x1+1-x0,y1+1-y0],legacy?.painted??cell.bounds,'Body and floor bounds changed: review the metadata')
    if(cell.candidateContact){const [x,y]=cell.candidateContact;assert.equal(pixels[4*(y*w+x)+3],255,'The registered contact must remain opaque')}
    const crop=Buffer.alloc(bw*bh*4)
    for(let y=0;y<bh;y++)pixels.copy(crop,4*y*bw,4*((y+by)*w+bx),4*((y+by)*w+bx+bw))
    if(i===0&&!portraitless.has(id)){
      assert.ok(bw<=48&&bh<=43,'The first key must fit the 48x48 portrait')
      portrait=Buffer.alloc(48*48*4)
      for(let y=0;y<bh;y++)crop.copy(portrait,4*((43-bh+y)*48+Math.floor((48-bw)/2)),4*y*bw,4*(y+1)*bw)
    }
    return {...cell,alphaPixels:count,drawing:createHash('sha256').update(crop).digest('hex').slice(0,12)}
  })
  // Keep the approved file bytes when the decoded RGBA is unchanged, so a rebuild
  // never swaps an approved PNG for a different encoding of the same pixels.
  async function save(file,pixels,w,h){
    await mkdir(dirname(file),{recursive:true})
    try {
      const {data,info}=await sharp(await readFile(file)).ensureAlpha().raw().toBuffer({resolveWithObject:true})
      if(info.width===w&&info.height===h&&Buffer.compare(data,pixels)===0)return 'kept'
    } catch (error) { if (error.code !== 'ENOENT' && !/unsupported image format|Input file is missing/i.test(error.message)) throw error }
    await writeFile(file,await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer())
    return 'written'
  }
  const written={}
  written.atlas=await save(path(metadata.sheet),sheet,metadata.width,metadata.height)
  written.motion=await save(path('public/art/motion/'+id+'.png'),sheet,metadata.width,metadata.height)
  if(portrait)written.portrait=await save(path('public/art/'+id+'-idle.png'),portrait,48,48)
  console.log(id,'authored',JSON.stringify(written))
  return {...metadata,source,frames:updated}
}
