import { describe, it, expect } from 'vitest';
import { addAsset, conflicts, duplicate, edit, heads, merge, META, objects, validate, type Annotation, type NoteDocument } from '../src/core/model';
import { pack, unpack } from '../src/core/archive';
import { inverse, pageMatrix, transform } from '../src/core/geometry';
const note=(text='hello'):Annotation=>({kind:'text',page:1,x:20,y:30,width:200,height:60,color:'#123456',weight:1,opacity:1,text,fontSize:18});
async function base():Promise<NoteDocument> {const asset=await addAsset(new TextEncoder().encode('%PDF-1.7 test'),'application/pdf');return edit({format:1,id:'doc',originalName:'source.pdf',originalHash:asset.hash,pdfHash:asset.hash,pageCount:1,created:new Date().toISOString(),operations:[],assets:{[asset.hash]:asset}},META,{kind:'document',name:'Test'},'initial');}
describe('causal operation graph',()=>{
  it('retains four independently created objects from two offline devices',async()=>{
    const d=await base();const win=edit(edit(d,'pen1',note(),'Windows'),'pen2',note(),'Windows');const android=edit(edit(d,'text',note(),'Android'),'image',note(),'Android');
    const result=merge(win,android);expect(objects(result).length).toBe(5);expect(conflicts(result)).toHaveLength(0);await validate(result);
  });
  it('is commutative, associative and idempotent under arbitrary delivery',async()=>{
    const d=await base();const a=edit(d,'x',note('a'),'A'),b=edit(d,'x',note('b'),'B'),c=edit(d,'y',note('c'),'C');
    const norm=(d:NoteDocument)=>d.operations.map(o=>o.id).sort();
    expect(norm(merge(a,b))).toEqual(norm(merge(b,a)));expect(norm(merge(merge(a,b),c))).toEqual(norm(merge(a,merge(b,c))));expect(norm(merge(a,a))).toEqual(norm(a));
  });
  it('preserves both concurrent modifications regardless of wall-clock time',async()=>{
    const d=edit(await base(),'x',note(),'origin');const a=edit(d,'x',note('A'),'A'),b=edit(d,'x',note('B'),'B');b.operations.at(-1)!.time='1999-01-01';
    const m=merge(a,b);expect(heads(m,'x').map(o=>(o.value as Annotation).text).sort()).toEqual(['A','B']);expect(()=>edit(m,'x',note(),'C')).toThrow();
  });
  it('does not resurrect deleted objects when an old archive returns',async()=>{
    const old=edit(await base(),'x',note(),'A');const removed=edit(old,'x',null,'B');expect(heads(merge(removed,old),'x')[0].value).toBeNull();
  });
  it('keeps a delete/edit conflict and synchronizes an explicit resolution',async()=>{
    const d=edit(await base(),'x',note(),'O');const a=edit(d,'x',null,'A'),b=edit(d,'x',note('changed'),'B');const m=merge(a,b);expect(heads(m,'x')).toHaveLength(2);
    const fixed=edit(m,'x',null,'A',true);expect(heads(merge(fixed,b),'x')).toHaveLength(1);expect(heads(fixed,'x')[0].parents).toHaveLength(2);
  });
  it('reopens conflicts for simultaneous different resolutions',async()=>{
    const d=edit(await base(),'x',note(),'O');const m=merge(edit(d,'x',note('A'),'A'),edit(d,'x',note('B'),'B'));
    const a=edit(m,'x',note('A'),'A',true),b=edit(m,'x',note('B'),'B',true);expect(heads(merge(a,b),'x')).toHaveLength(2);
  });
  it('does not suppress an unseen later branch on resolution',async()=>{
    const d=edit(await base(),'x',note(),'O');const a=edit(d,'x',note('A'),'A'),b=edit(d,'x',note('B'),'B');
    const fixed=edit(merge(a,b),'x',note('A'),'A',true);const later=edit(b,'x',note('C'),'B');expect(heads(merge(fixed,later),'x')).toHaveLength(2);
  });
  it('handles reversed operation arrays',async()=>{const d=edit(edit(await base(),'x',note(),'A'),'x',note('new'),'A');d.operations.reverse();await validate(d);expect((heads(d,'x')[0].value as Annotation).text).toBe('new');});
  it('rejects missing parents, cycles and contradictory operation IDs',async()=>{
    const d=edit(await base(),'x',note(),'A');const bad=structuredClone(d);bad.operations.at(-1)!.parents=['missing'];await expect(validate(bad)).rejects.toThrow();
    const cycle=structuredClone(d);cycle.operations.at(-1)!.parents=[cycle.operations.at(-1)!.id];await expect(validate(cycle)).rejects.toThrow();
    const collision=structuredClone(d);collision.operations.at(-1)!.value=note('forged');expect(()=>merge(d,collision)).toThrow();
  });
});
describe('portable .pdfnote',()=>{
  it('round-trips original bytes, image assets, conflict candidates and tombstones',async()=>{
    const d=edit(await base(),'x',note(),'O');const m=merge(edit(d,'x',null,'A'),edit(d,'x',note('B'),'B'));const image=await addAsset(new Uint8Array([1,2,3]),'image/png');m.assets[image.hash]=image;
    const imageDoc=edit(m,'picture',{...note(),kind:'image',asset:image.hash},'B');const loaded=await unpack(pack(imageDoc));expect(loaded).toEqual(imageDoc);expect(conflicts(loaded)).toHaveLength(1);
  });
  it('rejects tampered asset bytes without modifying the original document',async()=>{const d=await base();const bad=structuredClone(d);bad.assets[bad.pdfHash].bytes[0]=0;await expect(unpack(pack(bad))).rejects.toThrow();expect(d.assets[d.pdfHash].bytes[0]).toBe(37);});
  it('makes copies independent while retaining conflict history',async()=>{const d=await base();const copy=duplicate(d);expect(copy.id).not.toBe(d.id);expect(copy.assets).toEqual(d.assets);expect(copy.operations).toEqual(d.operations);});
  it('refuses to merge different base PDFs or document IDs',async()=>{const d=await base();expect(()=>merge(d,{...d,pdfHash:'other'})).toThrow();expect(()=>merge(d,duplicate(d))).toThrow();});
  it('rejects invalid page references and unsupported future formats',async()=>{const d=edit(await base(),'x',{...note(),page:2},'A');await expect(validate(d)).rejects.toThrow();await expect(unpack(pack({...await base(),format:6 as 1}))).rejects.toThrow();});
});
describe('PDF crop / rotation coordinates',()=>{
  it.each([0,90,180,270])('round-trips cropped-page coordinates at %i degrees',rotation=>{
    const s=1.75,r=rotation*Math.PI/180,c=Math.round(Math.cos(r))*s,sn=Math.round(Math.sin(r))*s;
    const m=pageMatrix([c,sn,sn,-c,40,900],[17,29,612,821]);const p={x:153.5,y:201.25};const restored=inverse(m,transform(m,p));expect(restored.x).toBeCloseTo(p.x);expect(restored.y).toBeCloseTo(p.y);
  });
});
