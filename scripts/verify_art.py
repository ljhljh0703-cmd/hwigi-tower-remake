"""Validate the editable tower art against the PNGs loaded by the game. Requires Pillow."""
from pathlib import Path
import io, json, struct, zipfile, zlib, sys
from xml.etree import ElementTree
from PIL import Image

def aseprite(file):
    blob=file.read_bytes()
    total,magic,frames,w,h,depth=struct.unpack_from('<I5H',blob)
    assert magic==0xa5e0 and depth==32 and total==len(blob),file
    tags={};result={};start=128
    for frame in range(frames):
        size,magic,count=struct.unpack_from('<IHH',blob,start)
        assert magic==0xf1fa
        cur=start+16
        flat=Image.new('RGBA',(w,h))
        for _ in range(count):
            length,kind=struct.unpack_from('<IH',blob,cur)
            if kind==0x2018:
                number=struct.unpack_from('<H',blob,cur+6)[0]
                at=cur+16
                for _ in range(number):
                    first,last=struct.unpack_from('<HH',blob,at)
                    count_bytes=struct.unpack_from('<H',blob,at+17)[0]
                    assert first==last
                    tags[first]=blob[at+19:at+19+count_bytes].decode()
                    at+=19+count_bytes
            if kind==0x2005:
                _,x,y=struct.unpack_from('<Hhh',blob,cur+6)
                cw,ch=struct.unpack_from('<HH',blob,cur+22)
                pixels=zlib.decompress(blob[cur+26:cur+length])
                flat.alpha_composite(Image.frombytes('RGBA',(cw,ch),pixels),(x,y))
            cur+=length
        assert cur==start+size
        result[tags[frame]]=flat
        start+=size
    assert start==len(blob)
    return result

def verify_ora(path,target,opaque=True):
    with zipfile.ZipFile(path) as z:
        root=ElementTree.fromstring(z.read('stack.xml'))
        whole=Image.new('RGBA',(int(root.attrib['w']),int(root.attrib['h'])))
        for node in reversed(root.findall('.//layer')):
            assert node.get('opacity','1') in ('1.0','1','1.000000')
            piece=Image.open(io.BytesIO(z.read(node.attrib['src']))).convert('RGBA')
            whole.alpha_composite(piece,(int(node.get('x',0)),int(node.get('y',0))))
        assert whole.size==target.size and whole.tobytes()==target.tobytes(),path
        if opaque:assert whole.getchannel('A').getextrema()==(255,255),path

def validate(game):
    art=game/'public/art';source=game/'art-source'
    mf=json.loads((source/'enemy-motion/manifest.json').read_text(encoding='utf-8'))
    sheets={s['id']:s for s in mf['sheets']};count=0;contacts=0;fine_count=0
    editable=source/'monsters'
    # Upper-floor sheets are compiled from art-source/enemy-motion/raw by scripts/compile-enemy-motion-art.mjs.
    upper={k for k in sheets if k.startswith('upper-')}
    expected=set(sheets)-{'rage','slime-pool','effects'}-upper
    expected_fine={p.stem for p in (art/'motion/detail').glob('*.png')}
    assert {p.stem for p in editable.glob('*.aseprite')}==expected
    assert {p.stem for p in (editable/'detail').glob('*.aseprite')}==expected_fine
    for doc in sorted((source/'monsters').rglob('*.aseprite')):
        fine=doc.parent.name=='detail'
        key=doc.stem;sheet=sheets[key];k=2 if fine else 1
        ink=art/('motion/detail' if fine else 'motion')
        target=Image.open(ink/(key+'.png')).convert('RGBA')
        frames=aseprite(doc)
        expected_names={f['id'] for f in sheet['frames']}
        if key!='boss-special':expected_names.add('ready-alt')
        assert set(frames)==expected_names,(doc,set(frames)^expected_names)
        if fine:
            coarse=Image.open(art/'motion'/(key+'.png')).convert('RGBA')
            assert target.size==(coarse.width*2,coarse.height*2)
            alpha=target.getchannel('A').resize(coarse.size,Image.Resampling.BOX).point(lambda a:255 if a>0 else 0)
            assert alpha.tobytes()==coarse.getchannel('A').tobytes(),(doc,'silhouette')
            fine_count+=len(frames)
        for f in sheet['frames']:
            x,y,w,h=[v*k for v in f['rect']]
            sample=target.crop((x,y,x+w,y+h))
            assert frames[f['id']].tobytes()==sample.tobytes(),(doc,f['id'])
            if not fine:
                bb=sample.getbbox();assert bb and list((bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]))==f['bounds']
                assert bb[3]==sheet['pivot'][1],(key,f['id'],'ground')
            if 'candidateContact' in f:
                px,py=f['candidateContact']
                assert sample.getpixel((px*k+k//2,py*k+k//2))[3]>100,(doc,f['id'])
                if not fine:contacts+=1
        if key!='boss-special':
            alt=Image.open(ink/'idle-alt'/(key+'.png')).convert('RGBA')
            assert frames['ready-alt'].tobytes()==alt.tobytes() and alt.tobytes()!=frames['ready'].tobytes()
            y=sheet['pivot'][1]*k-k
            assert alt.crop((0,y,alt.width,y+k)).tobytes()==frames['ready'].crop((0,y,alt.width,y+k)).tobytes()
        count+=len(frames)
    # Stage-one walls in backgrounds/, stage-two walls and the rear ledge in backgrounds/upper/.
    backgrounds=list((source/'backgrounds').glob('*.ora'))+list((source/'backgrounds/upper').glob('*.ora'))
    assert {f.stem for f in backgrounds}=={'chamber','lobby-key'}|{f.stem for f in (art/'ui/backgrounds').glob('*.png')}
    for doc in backgrounds:
        path=art/('ui/backgrounds' if doc.parent.name=='upper' or doc.stem.startswith('floor-') else '')/(doc.stem+'.png')
        ledge=doc.stem=='upper-rear-ledge'
        target=Image.open(path).convert('RGBA')
        verify_ora(doc,target,opaque=not ledge)
        if ledge:
            # Translucent stone step: the rear rank stands on its opaque first row.
            assert any(target.getpixel((x,0))[3]==255 for x in range(target.width)),'ledge top row'
        elif doc.stem.startswith('floor-'):
            assert target.size==((144,144) if doc.stem.endswith('-compact') else (144,256)),doc
    print(f'{count} editable monster frames incl. {fine_count} high-resolution variants, {contacts} attack anchors, {len(backgrounds)} editable backgrounds verified.')
    validate_hero_and_pool(game)
    validate_authored_upper(game,sheets)

def validate_authored_upper(game,sheets):
    # The five upper sheets are painted in Aseprite; compile-authored-upper.mjs exports them.
    art=game/'public/art';source=game/'art-source/enemy-motion'
    keys=contacts=0
    for key in ['upper-dash','upper-support','upper-shield','upper-boss','upper-boss-special']:
        sheet=sheets[key];doc=source/'authored'/(key+'.aseprite')
        assert sheet['source']=='art-source/enemy-motion/authored/'+key+'.aseprite',key
        frames=aseprite(doc);assert list(frames)==[f['id'] for f in sheet['frames']],key
        motion=Image.open(art/'motion'/(key+'.png')).convert('RGBA')
        atlas=Image.open(game/sheet['sheet']).convert('RGBA')
        assert motion.tobytes()==atlas.tobytes() and motion.size==(sheet['width'],sheet['height']),key
        for f in sheet['frames']:
            x,y,w,h=f['rect'];cell=motion.crop((x,y,x+w,y+h))
            assert frames[f['id']].tobytes()==cell.tobytes(),(key,f['id'])
            assert sum(cell.getchannel('A').histogram()[1:])==f['alphaPixels'],(key,f['id'],'alphaPixels')
            if 'candidateContact' in f:
                assert cell.getpixel(tuple(f['candidateContact']))[3]==255,(key,f['id'],'contact');contacts+=1
            keys+=1
        if key!='upper-boss-special':
            assert Image.open(art/(key+'-idle.png')).size==(48,48),key
    assert (keys,contacts)==(76,14),(keys,contacts)
    print(f'{keys} authored upper keys with {contacts} attack contacts verified.')

def validate_hero_and_pool(game):
    art=game/'public/art';source=game/'art-source'
    # The swordsman: thirteen Aseprite keys plus the two part-layered guard heights.
    keys=aseprite(source/'hero/hero.aseprite')
    for key,image in keys.items():
        assert image.tobytes()==Image.open(art/f'hero-{key}.png').convert('RGBA').tobytes(),('hero',key)
    meta=json.loads((source/'hero/hero.json').read_text(encoding='utf-8'))
    parts=['Rear arm','Mantle','Legs','Coat','Head','Sword','Sword arm','Fingers']
    guards=[p.name for p in (source/'hero-guards').iterdir() if p.is_dir()]
    assert sorted(guards)==['guard-low','guard-middle'],guards
    for guard in guards:
        whole=Image.new('RGBA',(104,60))
        for part in parts:whole.alpha_composite(Image.open(source/'hero-guards'/guard/f'{part}.png').convert('RGBA'))
        assert whole.tobytes()==Image.open(art/f'hero-{guard}.png').convert('RGBA').tobytes(),('hero',guard)
    poses={p.stem[5:] for p in art.glob('hero-*.png')}
    assert poses==set(keys)|set(guards),poses^(set(keys)|set(guards))
    # Contact anchors the renderer uses must sit on painted pixels.
    rows=json.loads((game/'src/hero-contact-rows.json').read_text(encoding='utf-8'))
    anchors=0
    for key,points in rows.items():
        image=Image.open(art/f'hero-{key}.png').convert('RGBA')
        for point in points:
            assert image.getpixel(tuple(point))[3]>100,('hero contact',key,point);anchors+=1
    assert Image.open(art/'hero-attack.png').convert('RGBA').getpixel((94,42))[3]>100,'sword tip'
    for image in map(Image.open,art.glob('hero-*.png')):
        assert image.size==(104,60) and image.convert('RGBA').getchannel('A').getbbox()[3]==57,('hero ground',image.filename)
    # The slime pool: every clip cell lies inside the rig, the layer sheet holds three
    # passes of the same rig and the lash tip is opaque at the strike event.
    fmt=json.loads((game/'src/pool-format.json').read_text(encoding='utf-8'))
    clips=json.loads((game/'src/pool-clips.json').read_text(encoding='utf-8'))
    rig=Image.open(art/'motion/slime-pool-rig.png').convert('RGBA')
    layers=Image.open(art/'motion/slime-pool-layers.png').convert('RGBA')
    w,h=fmt['size'];assert layers.size==(rig.width,rig.height*3)
    cells=0
    for clip,frames in clips.items():
        times=[t for t,_,_ in frames];assert times==sorted(times),clip
        for _,x,y in frames:
            assert 0<=x and 0<=y and x+w<=rig.width and y+h<=rig.height,(clip,x,y);cells+=1
    event=[f for f in clips[fmt['event']['clip']] if f[0]<=fmt['event']['time']+1e-6][-1]
    cx,cy=(int(v) for v in fmt['contact'])
    assert rig.getpixel((event[1]+cx,event[2]+cy))[3]>100,'pool contact'
    assert layers.getpixel((event[1]+cx,event[2]+rig.height+cy))[3]>100,'pool lash contact'
    spine=json.loads((source/'slime-pool/slime-pool.json').read_text(encoding='utf-8'))
    assert set(clips)<=set(spine['animations']),set(clips)-set(spine['animations'])
    for attachment in {a.get('path',n) for skin in spine['skins'] for slot in skin['attachments'].values() for n,a in slot.items()}:
        assert (source/'slime-pool/images'/f'{attachment}.png').exists(),attachment
    print(f'{len(keys)+len(guards)} swordsman poses, {anchors} hero contact pixels, {cells} slime pool cells in {len(clips)} clips verified.')

if __name__=='__main__':
    validate(Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1])
