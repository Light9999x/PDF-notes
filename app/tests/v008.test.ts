import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createBlank } from '../src/core/blank';
import { addAsset, canonical, duplicate, edit, heads, merge, validate, type Annotation, type NoteDocument } from '../src/core/model';
import { galleryChange, galleryHashes, galleryHeads, editGallery } from '../src/core/gallery';
import { pack, unpack } from '../src/core/archive';
import { snapshot } from '../src/core/drive';
import { editableObjects } from '../src/core/selection';
import { clickSelection } from '../src/core/click-selection';
import { annotationCorners, annotationMatrix, inverse, pageMatrix, transform } from '../src/core/geometry';
import { screenRotationControl, selectionFrame, uprightAt, visibleAngle } from '../src/core/manipulation';
import { checkPixelBudget, imageDimensions, MaskHistory, maskPixels, maskSteps, pixelPoint, type MaskJob } from '../src/core/cutout';
import { runMask } from '../src/core/cutout-runner';
import { readerSpace } from '../src/core/reader-fit';
vi.mock('../src/core/storage',()=>({store:{}}));
const base:Annotation={kind:'text',page:1,x:50,y:60,width:160,height:80,color:'#123456',weight:2,opacity:1,fontSize:18,text:'選取'};
async function withImages(){const doc=await createBlank('gallery','portrait','A'),asset=await addAsset(await sharp({create:{width:8,height:4,channels:4,background:'#ffaa00'}}).png().toBuffer(),'image/png');return {...doc,format:3 as const,gallery:[asset.hash],assets:{...doc.assets,[asset.hash]:asset}};}
const apply=(job:MaskJob)=>{const steps=maskSteps(job);let value=steps.next();while(!value.done)value=steps.next();return value.value;};
const rectangle=(x:number,y:number,w:number,h:number)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];

describe('v008 pointerup selection policy',()=>{
  it('single click replaces, Shift toggles, and crossing pages starts a new selection',async()=>{
    let doc={...await createBlank('selection','portrait','A'),pageCount:2};for(const [id,page] of [['a',1],['b',1],['other',2]] as const)doc=edit(doc,id,{...base,page},'A');const values=editableObjects(doc),a=values.find(o=>o.id==='a')!,b=values.find(o=>o.id==='b')!,other=values.find(o=>o.id==='other')!,before=canonical(doc);
    expect(clickSelection(doc,['a','b'],b,false)).toEqual(['b']);expect(clickSelection(doc,['a'],b,true)).toEqual(['a','b']);expect(clickSelection(doc,['a','b'],b,true)).toEqual(['a']);expect(clickSelection(doc,['a'],a,true)).toEqual([]);expect(clickSelection(doc,['a'],other,true)).toEqual(['other']);expect(clickSelection(doc,['a'],undefined,false)).toEqual([]);expect(clickSelection(doc,['a'],undefined,true)).toEqual(['a']);expect(canonical(doc)).toBe(before);
  });
  it('does not select a version changed, deleted or conflicted after pointerdown',async()=>{
    const doc=edit(await createBlank('click','portrait','A'),'a',base,'A'),target=editableObjects(doc)[0];
    expect(clickSelection(edit(doc,'a',null,'B'),[],target,true)).toEqual([]);const conflict=merge(edit(doc,'a',{...base,x:80},'A'),edit(doc,'a',{...base,x:90},'B'));expect(clickSelection(conflict,[],target,false)).toEqual([]);expect(clickSelection(edit(doc,'a',{...base,text:'new'},'B'),[],target,false)).toEqual([]);
  });
});
describe('image library causal removal and restoration',()=>{
  it('removing an old inferred member preserves placed images and all bytes through archive/duplicate',async()=>{
    const initial=await withImages(),hash=initial.gallery[0],legacy=edit(initial,'image',{...base,kind:'image',asset:hash},'A'),removed=editGallery(legacy,galleryChange(legacy,hash,false),'A');
    expect(removed.format).toBe(4);expect(galleryHashes(removed)).toEqual([]);expect(removed.operations).toEqual(legacy.operations);expect(removed.assets).toEqual(legacy.assets);
    const restored=await unpack(pack(removed));expect(galleryHashes(restored)).toEqual([]);expect(heads(restored,'image')[0].value).toMatchObject({asset:hash});const copy=duplicate(restored);expect(copy.id).not.toBe(restored.id);expect(copy.galleryOps).toEqual(restored.galleryOps);expect(galleryHashes(copy)).toEqual([]);
  });
  it('is commutative/idempotent and old archive reimport cannot resurrect a removal',async()=>{
    const old=await withImages(),hash=old.gallery[0],removed=editGallery(old,galleryChange(old,hash,false),'A');
    expect(canonical(merge(removed,old))).toBe(canonical(merge(old,removed)));const once=merge(removed,old);expect(canonical(merge(once,old))).toBe(canonical(once));expect(galleryHashes(once)).toEqual([]);expect(galleryHashes(await unpack(pack(once)))).toEqual([]);
  });
  it('concurrent removal wins; explicit observed restore works except against an unseen removal',async()=>{
    const doc=await withImages(),hash=doc.gallery[0],a=editGallery(doc,galleryChange(doc,hash,false),'A'),b=editGallery(doc,galleryChange(doc,hash,true),'B'),hidden=merge(a,b);
    expect(galleryHashes(hidden)).toEqual([]);const restore=editGallery(hidden,galleryChange(hidden,hash,true),'A');expect(galleryHashes(restore)).toEqual([hash]);
    const unseen=editGallery(doc,galleryChange(doc,hash,false),'C'),combined=merge(restore,unseen);expect(galleryHashes(combined)).toEqual([]);const explicit=editGallery(combined,galleryChange(combined,hash,true),'A');expect(galleryHashes(explicit)).toEqual([hash]);expect(galleryHeads(explicit,hash)).toHaveLength(1);
  });
  it('retains unused removals in deterministic Drive snapshots independently from page operations',async()=>{
    const doc=await withImages(),hash=doc.gallery[0],removed=editGallery(doc,galleryChange(doc,hash,false),'A');const json=JSON.parse(new TextDecoder().decode(snapshot(removed)));expect(json.format).toBe(4);expect(json.galleryOps[0].present).toBe(false);expect(json.operations).toEqual(doc.operations);expect(json.assets[hash].bytes).toBeUndefined();expect(snapshot(merge(removed,removed))).toEqual(snapshot(removed));
  });
  it('rejects downgrades, missing assets/parents, cyclic or reused operation identities',async()=>{
    const doc=await withImages(),hash=doc.gallery[0],removed=editGallery(doc,galleryChange(doc,hash,false),'A');await expect(validate({...removed,format:3})).rejects.toThrow();
    const op=removed.galleryOps![0];for(const bad of [{...op,parents:['missing']},{...op,parents:[op.id]},{...op,hash:'0'.repeat(64)},{...op,present:'false' as unknown as boolean}])await expect(validate({...removed,galleryOps:[bad]})).rejects.toThrow();
    await expect(validate({...removed,galleryOps:[op,op]})).rejects.toThrow();expect(()=>merge(removed,{...removed,galleryOps:[{...op,present:true}]})).toThrow();
  });
});
describe('visible image orientation and rotation controls',()=>{
  it.each([0,90,180,270])('renders asymmetric UP/color fixture upright on native rotation %i and all reading rotations',async native=>{
    const pdf=await PDFDocument.create(),p=pdf.addPage([600,800]);p.setCropBox(25,35,530,710);p.setRotation(degrees(native));const reader=await getDocument({data:await pdf.save()}).promise;
    const image=createCanvas(80,40),ic=image.getContext('2d');ic.fillStyle='#0000ff';ic.fillRect(0,0,80,40);ic.fillStyle='#ff0000';ic.fillRect(0,0,80,20);ic.fillStyle='#00ff00';ic.fillRect(0,0,20,20);ic.fillStyle='#000';ic.font='10px sans-serif';ic.fillText('UP ↑',35,15);
    try{for(const rotation of [0,90,180,270])for(const zoom of [.5,1.5]){const page=await reader.getPage(1),v=page.getViewport({scale:zoom,rotation:(native+rotation)%360}),m=pageMatrix(v.transform,page.view),anchor={x:200,y:200},a=uprightAt(inverse(m,anchor),m,{...base,kind:'image'}),out=createCanvas(600,600),ctx=out.getContext('2d');ctx.transform(...m);ctx.transform(...annotationMatrix(a));ctx.drawImage(image,0,0,a.width,a.height);
      const sample=(x:number,y:number)=>[...ctx.getImageData(Math.round(anchor.x+x*zoom),Math.round(anchor.y+y*zoom),1,1).data];expect(sample(10,10)).toEqual([0,255,0,255]);expect(sample(130,10)).toEqual([255,0,0,255]);expect(sample(100,60)).toEqual([0,0,255,255]);expect(visibleAngle(a,m)).toBeCloseTo(0);
      const corner=transform(m,transform(annotationMatrix(a),{x:0,y:0}));expect(corner.x).toBeCloseTo(anchor.x);expect(corner.y).toBeCloseTo(anchor.y);
    }}finally{await reader.loadingTask.destroy();}
  });
  it.each([0,90,180,270,37])('positions rotation control above transformed bounds for object angle %s and groups',angle=>{
    for(const m of [[0,2,-2,0,600,0],[1,0,0,1,0,0],[-1,0,0,-1,600,800]] as [number,number,number,number,number,number][]){for(const frame of [{...base,angle},selectionFrame([{id:'a',head:'a',value:{...base,angle}},{id:'b',head:'b',value:{...base,x:350,angle:123}}])]){const ps=annotationCorners(frame).map(p=>transform(m,p)),control=screenRotationControl(frame,m),position=transform(m,control.handle);expect(position.x).toBeCloseTo((Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x)))/2);expect(position.y).toBeCloseTo(Math.min(...ps.map(p=>p.y))-48);}}
  });
  it('keeps edge controls reachable and left overlay shifts the start of usable space',()=>{
    const m:[number,number,number,number,number,number]=[1,0,0,1,0,0],control=screenRotationControl({...base,x:0,y:0},m,48,{top:0,left:240,right:600});expect(control.handle.y).toBeGreaterThanOrEqual(22);expect(control.handle.x).toBeGreaterThanOrEqual(262);const space=readerSpace(700,500,240);expect(space.left).toBe(240);expect(space.left+space.visibleWidth).toBe(700);
  });
});
describe('offline cutout prototype, shared mask and PNG transparency',()=>{
  const image=()=>{const rgba=new Uint8ClampedArray(3*3*4);for(let i=0;i<9;i++)rgba.set(i%3===1?[0,0,0,255]:[250,250,250,255],i*4);return {width:3,height:3,rgba,mask:new Uint8Array(9).fill(255)};};
  it('flood removes only connected color, global is explicit and tolerance controls membership',()=>{
    const job=image(),action={kind:'color' as const,point:{x:0,y:0},tolerance:0,global:false};expect([...apply({...job,action})]).toEqual([0,255,255,0,255,255,0,255,255]);expect([...apply({...job,action:{...action,global:true}})]).toEqual([0,255,0,0,255,0,0,255,0]);
    job.rgba.set([240,245,248,255],8);expect(apply({...job,action:{...action,global:true,tolerance:9}})[2]).toBe(255);expect(apply({...job,action:{...action,global:true,tolerance:10}})[2]).toBe(0);
  });
  it('region removal accumulates; keep explicitly replaces the mask and preserves source alpha',()=>{
    const source=image();source.rgba[3]=128;source.rgba[7]=0;const mask=apply({...source,action:{kind:'remove',polygon:rectangle(0,0,1,3)}}),next=apply({...source,mask,action:{kind:'remove',polygon:rectangle(2,0,1,3)}});expect([...next]).toEqual([0,255,0,0,255,0,0,255,0]);const keep=apply({...source,mask:next,action:{kind:'keep',polygon:rectangle(0,0,2,3)}}),pixels=maskPixels(source.rgba,keep);expect(pixels[3]).toBe(128);expect(pixels[7]).toBe(0);expect(pixels[11]).toBe(0);expect(source.mask.every(v=>v===255)).toBe(true);expect(source.rgba[3]).toBe(128);
  });
  it('supports free polygons, rejects zero area, and clamps outside selections safely',()=>{
    const job=image();expect([...apply({...job,action:{kind:'remove',polygon:[{x:0,y:0},{x:3,y:0},{x:0,y:3}]}})]).toEqual([0,0,255,0,255,255,255,255,255]);expect(()=>apply({...job,action:{kind:'keep',polygon:rectangle(0,0,0,3)}})).toThrow();expect(()=>apply({...job,action:{kind:'remove',polygon:rectangle(-20,-20,2,2)}})).toThrow();
  });
  it('maps display zoom/scroll coordinates to source pixels; undo/redo/reset never changes source',()=>{
    expect(pixelPoint({x:160,y:190},{left:100,top:150,width:120,height:80},600,400)).toEqual({x:300,y:200});const history=new MaskHistory(9);history.push(new Uint8Array(9));expect(history.canUndo).toBe(true);history.undo();expect(history.current[0]).toBe(255);history.redo();expect(history.current[0]).toBe(0);history.reset();expect(history.current[0]).toBe(255);history.undo();expect(history.current[0]).toBe(0);history.push(new Uint8Array(9).fill(128));expect(history.canRedo).toBe(false);
  });
  it('checks dimensions before decoding and rejects oversized sources without resampling',async()=>{
    const png=await sharp({create:{width:17,height:11,channels:4,background:'#aabbcc'}}).png().toBuffer(),jpeg=await sharp(png).jpeg().toBuffer();expect(imageDimensions(png,'image/png')).toEqual({width:17,height:11});expect(imageDimensions(jpeg,'image/jpeg')).toEqual({width:17,height:11});expect(()=>checkPixelBudget(5000,3000)).toThrow();expect(()=>imageDimensions(new Uint8Array([1,2,3]),'image/png')).toThrow();
  });
  it('cancels yielding fallback work, then accepts a new independent job',async()=>{
    const controller=new AbortController(),job={...image(),action:{kind:'keep' as const,polygon:rectangle(0,0,2,3)}};await expect(runMask(job,controller.signal,()=>controller.abort())).rejects.toMatchObject({name:'AbortError'});expect(await runMask(job,new AbortController().signal,()=>{})).toEqual(apply(job));
  });
  it('terminates worker jobs, ignores late replies and cleans up failed dispatch',async()=>{
    const workers:FakeWorker[]=[];
    class FakeWorker {
      onmessage:((e:{data:any})=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;
      constructor(){workers.push(this);}postMessage(){if(failDispatch)throw new Error('dispatch failed');}terminate(){this.terminated=true;}
    }
    let failDispatch=false;vi.stubGlobal('Worker',FakeWorker);
    try{
      const controller=new AbortController(),progress=vi.fn(),job={...image(),action:{kind:'color' as const,point:{x:0,y:0},tolerance:0,global:false}};
      const cancelled=runMask(job,controller.signal,progress),old=workers[0].onmessage!;controller.abort();await expect(cancelled).rejects.toMatchObject({name:'AbortError'});old({data:{progress:.9}});expect(progress).not.toHaveBeenCalled();expect(workers[0].terminated).toBe(true);expect(workers[0].onmessage).toBeNull();
      const next=runMask(job,new AbortController().signal,progress);workers[1].onmessage!({data:{mask:apply(job)}});expect(await next).toEqual(apply(job));expect(workers[1].terminated).toBe(true);
      failDispatch=true;await expect(runMask(job,new AbortController().signal,progress)).rejects.toThrow('dispatch failed');expect(workers[2].terminated).toBe(true);expect(workers[2].onmessage).toBeNull();
    }finally{vi.unstubAllGlobals();}
  });
  it('round-trips a same-size transparent PNG through archive and embeds a PDF alpha mask',async()=>{
    const job=image();job.rgba[3]=128;const mask=apply({...job,action:{kind:'remove',polygon:rectangle(2,0,1,3)}}),pixels=maskPixels(job.rgba,mask),png=await sharp(Buffer.from(pixels),{raw:{width:3,height:3,channels:4}}).png().toBuffer(),decoded=await sharp(png).raw().toBuffer();expect([...decoded]).toEqual([...pixels]);
    let doc:NoteDocument=await withImages();const sourceHash=doc.gallery![0],asset=await addAsset(png,'image/png');doc={...doc,assets:{...doc.assets,[asset.hash]:asset}};doc=editGallery(doc,galleryChange(doc,asset.hash,true),'A');doc=edit(doc,'one',{...base,kind:'image',asset:asset.hash},'A');doc=edit(doc,'two',{...base,kind:'image',asset:sourceHash},'A');const restored=await unpack(pack(doc));expect(restored.assets[asset.hash].bytes).toEqual(new Uint8Array(png));expect(heads(restored,'two')[0].value).toMatchObject({asset:sourceHash});
    const pdf=await PDFDocument.create(),embedded=await pdf.embedPng(png);pdf.addPage([100,100]).drawImage(embedded,{x:0,y:0,width:30,height:30});await pdf.save();const stream=pdf.context.lookup(embedded.ref) as any;expect(stream.dict.get(PDFName.of('SMask'))).toBeDefined();
  });
});
