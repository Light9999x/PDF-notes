import sharp from 'sharp';
import { addAsset } from '../src/core/model';
import { editGallery,galleryChange } from '../src/core/gallery';
import { slideMotion } from '../src/core/motion';
import { describe,it,expect,vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCanvas } from '@napi-rs/canvas';
import { createBlank } from '../src/core/blank';
import { canonical,conflicts,duplicate,edit,heads,merge,validate,type Annotation,type NoteDocument } from '../src/core/model';
import { editBatch } from '../src/core/batch';
import { compareLayers,layerChanges,nextLayer,orderedAnnotations,type LayerAction } from '../src/core/layers';
import { editableObjects,hitAnnotation } from '../src/core/selection';
import { pack,unpack } from '../src/core/archive';
import { menuPosition } from '../src/core/menu-position';
import { paint } from '../src/core/render';
import { snapshot } from '../src/core/drive';
import { SlideRegion,ActionMenu } from '../src/components/ui';
vi.mock('../src/core/storage',()=>({store:{}}));
const value:Annotation={kind:'text',page:1,x:20,y:30,width:100,height:100,color:'#123456',opacity:1,weight:3,fontSize:18,text:'圖層'};
async function fixture(){let doc=await createBlank('layers','portrait','A');for(const id of ['d','b','a','c'])doc=edit(doc,id,value,'A');return doc;}
const ids=(doc:NoteDocument)=>orderedAnnotations(doc).map(o=>o.id);
const select=(doc:NoteDocument,chosen:string[])=>editableObjects(doc).filter(o=>chosen.includes(o.id));
const reorder=(doc:NoteDocument,chosen:string[],action:LayerAction,device='A')=>editBatch(doc,layerChanges(doc,select(doc,chosen),action),device);
describe('persistent layers',()=>{
  it('keeps old ID order without rewriting and new annotations can be placed on top',async()=>{const doc=await fixture(),before=canonical(doc);expect(ids(doc)).toEqual(['a','b','c','d']);expect(canonical(doc)).toBe(before);const newDoc=edit(doc,'0',{...value,layer:nextLayer(doc,1)},'A');expect(ids(newDoc).at(-1)).toBe('0');expect(newDoc.format).toBe(5);await validate(newDoc);});
  it.each([['up',['a','c','b','d']],['down',['b','a','c','d']],['top',['a','c','d','b']],['bottom',['b','a','c','d']]] as [LayerAction,string[]][])('%s changes overlap only',async(action,expected)=>{const doc=await fixture(),result=reorder(doc,['b'],action);expect(ids(result)).toEqual(expected);for(const id of ids(doc)){const {layer,...rest}=heads(result,id)[0].value as Annotation;expect(rest).toEqual(value);}});
  it('preserves selected relative order for runs and separated selections, and detects boundaries',async()=>{const doc=await fixture();expect(ids(reorder(doc,['a','b'],'up'))).toEqual(['c','a','b','d']);expect(ids(reorder(doc,['b','d'],'down'))).toEqual(['b','a','d','c']);expect(ids(reorder(doc,['a','c'],'top'))).toEqual(['b','d','a','c']);expect(ids(reorder(doc,['b','d'],'bottom'))).toEqual(['b','d','a','c']);expect(layerChanges(doc,select(doc,['d']),'up')).toEqual([]);expect(layerChanges(doc,select(doc,['a']),'bottom')).toEqual([]);expect(layerChanges(doc,select(doc,ids(doc)),'top')).toEqual([]);});
  it('keeps pages isolated, rejects stale versions and atomically validates the whole batch',async()=>{let doc={...await fixture(),pageCount:2};doc=edit(doc,'other',{...value,page:2},'A');const changes=layerChanges(doc,select(doc,['a']),'top');expect(changes.some(c=>c.id==='other')).toBe(false);const stale=edit(doc,'a',{...value,text:'changed'},'B'),before=canonical(stale);expect(()=>editBatch(stale,changes,'A')).toThrow();expect(canonical(stale)).toBe(before);expect(()=>layerChanges(doc,select(doc,['a','other']),'up')).toThrow();});
  it('restores the full original order in one inverse batch and round-trips archive/copy/snapshot',async()=>{const doc=await fixture(),changes=layerChanges(doc,select(doc,['a','c']),'top'),changed=editBatch(doc,changes,'A');const inverse=changes.map(c=>({id:c.id,value:heads(doc,c.id)[0].value,expected:[heads(changed,c.id)[0].id]}));expect(ids(editBatch(changed,inverse,'A'))).toEqual(ids(doc));const stored=await unpack(pack(changed));expect(ids(stored)).toEqual(ids(changed));expect(ids(duplicate(stored))).toEqual(ids(changed));expect(JSON.parse(new TextDecoder().decode(snapshot(changed))).format).toBe(5);});
  it('merges independent updates, stable concurrent additions, same-object reorder/delete conflicts and resolutions',async()=>{let doc=reorder(await fixture(),['a'],'top');const a=edit(doc,'new-a',{...value,layer:nextLayer(doc,1)},'A'),b=edit(doc,'new-b',{...value,layer:nextLayer(doc,1)},'B');expect(ids(merge(a,b)).slice(-2)).toEqual(['new-a','new-b']);expect(ids(merge(a,b))).toEqual(ids(merge(b,a)));expect(canonical(merge(merge(a,b),a))).toBe(canonical(merge(a,b)));
    const sorted=orderedAnnotations(doc),bottom=sorted[0].id,top=sorted.at(-1)!.id;const independent=merge(edit(doc,bottom,{...value,layer:-1},'A'),edit(doc,top,{...value,layer:100},'B'));expect(conflicts(independent)).toHaveLength(0);
    const reordered=reorder(doc,[top],'bottom'),deleted=edit(doc,top,null,'B'),mixed=merge(reordered,deleted);expect(conflicts(mixed).some(o=>o.id===top)).toBe(true);const selected=heads(mixed,top).find(o=>o.value)!;expect(orderedAnnotations(mixed,1,selected).find(o=>o.id===top)?.value).toEqual(selected.value);const resolvedA=edit(mixed,top,selected.value,'A',true),resolvedB=edit(mixed,top,null,'B',true);expect(conflicts(merge(resolvedA,resolvedB))).toHaveLength(1);
  });
  it('orders all four annotation kinds and gallery operations cannot downgrade a ranked document',async()=>{
    const asset=await addAsset(await sharp({create:{width:2,height:2,channels:4,background:'#ff0000'}}).png().toBuffer(),'image/png');let doc:NoteDocument=await createBlank('mixed','portrait','A');doc={...doc,assets:{...doc.assets,[asset.hash]:asset}};
    for(const [i,kind] of (['image','text','highlight','pen'] as const).entries())doc=edit(doc,String(i),{...value,kind,asset:kind==='image'?asset.hash:undefined,points:kind==='pen'||kind==='highlight'?[{x:0,y:0},{x:30,y:30}]:undefined,layer:i+1},'A');
    doc=reorder(doc,['0'],'top');expect(orderedAnnotations(doc).map(o=>o.value.kind)).toEqual(['text','highlight','pen','image']);doc=editGallery(doc,galleryChange(doc,asset.hash,false),'A');expect(doc.format).toBe(5);await validate(doc);expect(ids(await unpack(pack(doc)))).toEqual(ids(doc));
  });
  it('rejects unsupported rank values and downgraded schemas',async()=>{const doc=await fixture();for(const layer of [NaN,Infinity,1.5,1e13])await expect(validate(edit(doc,'a',{...value,layer},'A'))).rejects.toThrow();const ranked=edit(doc,'a',{...value,layer:3},'A');await expect(validate({...ranked,format:4})).rejects.toThrow();});
  it('uses identical topmost hit and Canvas paint ordering',async()=>{let doc=await fixture();for(const [id,color] of [['a','#ff0000'],['b','#00ff00'],['c','#0000ff'],['d','#ffffff']] as const)doc=edit(doc,id,{...value,kind:'pen',color,points:[{x:50,y:50}],weight:80},'A');doc=reorder(doc,['a'],'top');const sorted=editableObjects(doc).sort(compareLayers);expect([...sorted].reverse().find(o=>hitAnnotation(o.value,{x:70,y:80},0))?.id).toBe('a');const canvas=createCanvas(160,160),ctx=canvas.getContext('2d');for(const item of orderedAnnotations(doc))await paint(ctx as unknown as CanvasRenderingContext2D,item.value,doc);expect([...ctx.getImageData(70,80,1,1).data]).toEqual([255,0,0,255]);});
});
describe('overlay bounds and retained collapsible controls',()=>{
  it('prefers upward, scrolls a tall menu and flips only when above is insufficient',()=>{const v={left:0,top:0,width:360,height:800};const up=menuPosition({left:250,right:294,top:500,bottom:544},v,300);expect(up.top+300).toBe(494);const tall=menuPosition({left:250,right:294,top:200,bottom:244},v,600);expect(tall.maxHeight).toBe(182);const flipped=menuPosition({left:250,right:294,top:20,bottom:64},v,300);expect(flipped.top).toBe(70);});
  it.each([320,360,412,1366])('stays inside visual viewport and has no dependency on document scroll at width %i',width=>{const v={left:40,top:100,width,height:350},p=menuPosition({left:width-10,right:width+30,top:180,bottom:224},v,900);expect(p.left).toBeGreaterThanOrEqual(v.left);expect(p.left+p.width).toBeLessThanOrEqual(v.left+v.width);expect(p.top).toBeGreaterThanOrEqual(v.top);expect(p.top+p.maxHeight).toBeLessThanOrEqual(v.top+v.height);});
  it('keeps closed form state mounted but hidden and inert; menus expose an expanded trigger',()=>{const html=renderToStaticMarkup(createElement(SlideRegion,{open:false,children:createElement('input',{defaultValue:'草稿'})}));expect(html).toContain('hidden="" inert="" aria-hidden="true"');expect(html).toContain('value="草稿"');const menu=renderToStaticMarkup(createElement(ActionMenu,{label:'管理圖片',children:createElement('button',null,'移除')}));expect(menu).toContain('aria-expanded="false"');expect(menu).not.toContain('<details');});
});

describe('panel motion lifecycle',()=>{
  it('cancels a closing timer when reversed and settles only the latest animation',()=>{
    vi.useFakeTimers();try{const cancel=vi.fn(),animate=vi.fn(()=>({cancel})),node={animate} as unknown as HTMLElement,closed=vi.fn(),opened=vi.fn();const stop=slideMotion(node,false,'translateX(-220px)',false,closed);vi.advanceTimersByTime(90);stop();slideMotion(node,true,'translateX(-220px)',false,opened);vi.advanceTimersByTime(180);expect(closed).not.toHaveBeenCalled();expect(opened).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledTimes(2);}finally{vi.useRealTimers();}
  });
  it('reduced motion does not animate or delay closing',()=>{vi.useFakeTimers();try{const animate=vi.fn(),done=vi.fn();slideMotion({animate} as unknown as HTMLElement,false,'translateY(-12px)',true,done);vi.runAllTimers();expect(animate).not.toHaveBeenCalled();expect(done).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}});
});
