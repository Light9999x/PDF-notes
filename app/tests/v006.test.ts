import { describe,it,expect,vi } from 'vitest';
import { PDFDocument,degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { annotationMatrix,transform,pageMatrix,contains,sweptHit } from '../src/core/geometry';
import { intersectsRegion,rectangleRegion,makeRegion,editableObjects,selectRegion } from '../src/core/selection';
import { resizeGroup,rotateGroup,selectionFrame,uprightTextAt,visibleAngle } from '../src/core/manipulation';
import { indexText,findText,highlightRects } from '../src/core/search';
import { createBlank } from '../src/core/blank';
import { addAsset,edit,merge,validate,heads,canonical,type Annotation } from '../src/core/model';
import { pack,unpack } from '../src/core/archive';
import { editBatch } from '../src/core/batch';
import { galleryHashes } from '../src/components/ImageGallery';
import { parseNumber } from '../src/components/NumericControl';
import { readToolPreferences } from '../src/core/tool-preferences';

const base:Annotation={kind:'text',page:1,x:20,y:30,width:100,height:60,angle:0,color:'#123456',weight:10,opacity:1,text:'中文 ABC 123，測試',fontSize:18};
const selected=(a:Annotation,id='a')=>({id,head:'head-'+id,value:a});
const region=(x:number,y:number,w:number,h:number)=>rectangleRegion({x,y},{x:x+w,y:y+h});
const close=(a:{x:number;y:number},b:{x:number;y:number})=>{expect(a.x).toBeCloseTo(b.x,7);expect(a.y).toBeCloseTo(b.y,7);};
describe('v006 intersection geometry',()=>{
  it.each(['text','image'] as const)('%s selects partial, reverse containment and touching boundaries, including rotation',kind=>{
    const a={...base,kind};expect(intersectsRegion(a,region(119,40,30,20))).toBe(true);expect(intersectsRegion(a,region(120,40,1,1))).toBe(true);expect(intersectsRegion(a,region(60,50,1,1))).toBe(true);expect(intersectsRegion(a,region(121,40,1,1))).toBe(false);
    const rotated={...a,angle:37},p=transform(annotationMatrix(rotated),{x:100,y:30});expect(intersectsRegion(rotated,region(p.x-1,p.y-1,2,2))).toBe(true);
  });
  it.each(['pen','highlight'] as const)('%s uses capsules, round dots, actual rotated segments and ignores bbox gaps',kind=>{
    const a={...base,kind,points:[{x:0,y:0},{x:100,y:60}]};
    expect(intersectsRegion(a,region(15,29,1,2))).toBe(true);expect(intersectsRegion(a,region(25,75,5,5))).toBe(false);
    const rotated={...a,angle:90},p=transform(annotationMatrix(rotated),{x:50,y:30});expect(sweptHit(rotated,p,p,0)).toBe(true);expect(intersectsRegion(rotated,region(p.x,p.y,1,1))).toBe(true);
    expect(intersectsRegion({...a,points:[{x:0,y:0}]},region(15,29,1,2))).toBe(true);
  });
  it('respects evenodd holes, concavity, cancelled retraced edges and bowties',()=>{
    const hole=makeRegion([[0,0],[100,0],[100,100],[0,100],[0,0],[40,40],[60,40],[60,60],[40,60],[40,40],[0,0]].map(([x,y])=>({x,y})));
    expect(intersectsRegion({...base,x:45,y:45,width:10,height:10},hole)).toBe(false);expect(intersectsRegion({...base,x:59,y:45,width:10,height:10},hole)).toBe(true);
    const bow=makeRegion([[0,0],[100,100],[0,100],[100,0]].map(([x,y])=>({x,y})));
    expect(intersectsRegion({...base,x:5,y:45,width:5,height:5},bow)).toBe(false);expect(intersectsRegion({...base,x:40,y:5,width:10,height:10},bow)).toBe(true);
  });
  it('selectRegion uses intersection and protects conflict heads, tombstones and other pages',async()=>{
    let d=edit(await createBlank('v006','portrait','A'),'a',base,'A');d=edit(d,'b',base,'A');d=edit(d,'deleted',base,'A');d=edit(d,'deleted',null,'A');d=merge(edit(d,'b',{...base,x:21},'A'),edit(d,'b',{...base,x:22},'B'));
    const r=selectRegion(d,1,region(119,40,5,5));expect(r.selected.map(o=>o.id)).toEqual(['a']);expect(r.skipped).toBe(1);expect(selectRegion(d,2,region(119,40,5,5)).selected).toEqual([]);
  });
});
describe('persisted transformations',()=>{
  it.each(['pen','highlight','text','image'] as const)('%s keeps the opposite rotated corner fixed and positive after crossing it',kind=>{
    const a={...base,kind,angle:37,points:[{x:0,y:0},{x:100,y:60}]},m=annotationMatrix(a),anchor=transform(m,{x:0,y:0});
    const next=resizeGroup([selected(a)],'se',transform(m,{x:200,y:150}))[0];close(transform(annotationMatrix(next),{x:0,y:0}),anchor);
    if(kind==='text'){expect(next.width).toBeCloseTo(200);expect(next.height).toBeCloseTo(150);expect(next.fontSize).toBe(18);}else{expect(next.width/next.height).toBeCloseTo(a.width/a.height);expect(next.weight).toBeCloseTo(20);}
    const crossed=resizeGroup([selected(a)],'se',transform(m,{x:-100,y:-100}))[0];expect(crossed.width).toBeGreaterThan(0);expect(crossed.height).toBeGreaterThan(0);close(transform(annotationMatrix(crossed),{x:0,y:0}),anchor);
  });
  it('resizes a rotated text edge without changing its font or opposite midpoint',()=>{
    const a={...base,angle:-73},m=annotationMatrix(a),n=resizeGroup([selected(a)],'w',transform(m,{x:-80,y:30}))[0];
    close(transform(annotationMatrix(n),{x:n.width,y:n.height/2}),transform(m,{x:a.width,y:a.height/2}));expect(n.height).toBe(a.height);expect(n.fontSize).toBe(a.fontSize);
  });
  it('rotates mixed initial angles around one frozen group center and inverses to the original pose',()=>{
    const group=[selected({...base,angle:12}),selected({...base,kind:'image',x:250,angle:-63},'b')],frame=selectionFrame(group),values=rotateGroup(group,137.5,frame);
    expect(values.map(a=>a.angle)).toEqual([149.5,74.5]);const restored=rotateGroup(values.map((a,i)=>selected(a,String(i))),-137.5,frame);
    restored.forEach((a,i)=>{close(a,group[i].value);expect(a.angle).toBeCloseTo(group[i].value.angle!);});
  });
  it('scales mixed group positions, dimensions, pen points, weight and text font together',()=>{
    const group=[selected(base),selected({...base,kind:'pen',x:250,points:[{x:0,y:0},{x:100,y:60}]},'b')],f=selectionFrame(group),values=resizeGroup(group,'se',{x:f.x+f.width*2,y:f.y+f.height*2},f);
    expect(values[0].fontSize).toBe(36);expect(values[1].points?.[1]).toEqual({x:200,y:120});expect(values[1].weight).toBe(20);expect(values[1].x-values[0].x).toBe(460);
  });
  it('upgrades format for rotated nontext, preserves immutable old operations and round-trips all kinds',async()=>{
    let d=await createBlank('angles','portrait','A');const old=canonical(d.operations),image=await addAsset(new Uint8Array([1,2,3]),'image/png');d={...d,assets:{...d.assets,[image.hash]:image}};
    for(const kind of ['pen','highlight','image','text'] as const)d=edit(d,kind,{...base,kind,angle:53,asset:image.hash,points:[{x:0,y:0},{x:100,y:60}]},'A');
    expect(d.format).toBe(3);expect(canonical(d.operations.slice(0,1))).toBe(old);const restored=await unpack(pack(d));expect(restored.operations).toEqual(d.operations);
    await expect(validate({...d,format:2})).rejects.toThrow();
  });
  it('rejects the entire gesture batch when a later member changed remotely',async()=>{
    let d=edit(edit(await createBlank('atomic','portrait','A'),'a',base,'A'),'b',base,'A');const group=editableObjects(d),values=rotateGroup(group,38);d=edit(d,'b',{...base,text:'remote'},'B');const prior=canonical(d.operations);
    expect(()=>editBatch(d,group.map((o,i)=>({id:o.id,value:values[i],expected:[o.head]})),'A')).toThrow();expect(canonical(d.operations)).toBe(prior);
  });
});
describe('visible text orientation',()=>{
  it.each([0,90,180,270])('compensates actual native %i rotation with CropBox; later view changes rotate existing text',async(native)=>{
    const pdf=await PDFDocument.create(),page=pdf.addPage([650,850]);page.setCropBox(37,51,520,730);page.setRotation(degrees(native));const reader=await getDocument({data:await pdf.save()}).promise;
    try {const p=await reader.getPage(1);for(const extra of [0,90,180,270]){const v=p.getViewport({scale:1.5,rotation:(native+extra)%360}),m=pageMatrix(v.transform,p.view),a=uprightTextAt({x:70,y:80},m,base),am=annotationMatrix(a),origin=transform(m,transform(am,{x:0,y:0})),right=transform(m,transform(am,{x:20,y:0})),down=transform(m,transform(am,{x:0,y:20}));expect(visibleAngle(a,m)).toBeCloseTo(0);expect(right.x-origin.x).toBeCloseTo(30);expect(right.y-origin.y).toBeCloseTo(0);expect(down.y-origin.y).toBeCloseTo(30);expect(down.x-origin.x).toBeCloseTo(0);close(transform(am,{x:0,y:0}),{x:70,y:80});}}finally{await reader.loadingTask.destroy();}
  });
});
describe('document gallery durability',()=>{
  it('merges both unplaced assets, deduplicates hashes, round-trips and retains deleted instance images',async()=>{
    const d=await createBlank('gallery','portrait','A'),a=await addAsset(new Uint8Array([1]),'image/png'),b=await addAsset(new Uint8Array([2]),'image/jpeg');
    const left={...d,format:3 as const,gallery:[a.hash],assets:{...d.assets,[a.hash]:a}},right={...d,format:3 as const,gallery:[b.hash],assets:{...d.assets,[b.hash]:b}};
    let combined=await unpack(pack(merge(left,right)));expect(galleryHashes(combined).sort()).toEqual([a.hash,b.hash].sort());expect(combined.operations).toEqual(d.operations);
    combined=edit(combined,'image',{...base,kind:'image',asset:a.hash},'A');combined=edit(combined,'image',null,'A');expect(galleryHashes(combined)).toContain(a.hash);expect(galleryHashes(merge(combined,left))).toHaveLength(2);
  });
  it('rejects missing membership assets or nonimage membership',async()=>{const d=await createBlank('gallery','portrait','A');await expect(validate({...d,format:3,gallery:[d.pdfHash]})).rejects.toThrow();await expect(validate({...d,format:3,gallery:['0'.repeat(64)]})).rejects.toThrow();});
});
describe('mapped PDF search and committed numeric drafts',()=>{
  it('creates separate partial-item rectangles and never calls native Selection APIs',()=>{
    const ranges:any[]=[],nodes=['prefix MATCH','MATCH suffix'].map(textContent=>({nodeType:3,textContent}));
    vi.stubGlobal('document',{createRange:()=>{const value:any={setStart:(node:unknown,offset:number)=>{value.start=[node,offset];},setEnd:(node:unknown,offset:number)=>{value.end=[node,offset];},getClientRects:()=>[{left:110,top:220,width:30,height:12}]};ranges.push(value);return value;}});
    try{const hit={page:1,start:{item:0,offset:7},end:{item:1,offset:5}},rects=highlightRects(nodes.map(firstChild=>({firstChild})) as unknown as HTMLElement[],[hit],hit,{getBoundingClientRect:()=>({left:100,top:200})} as HTMLElement);
      expect(ranges.map(r=>[r.start[1],r.end[1]])).toEqual([[7,12],[0,5]]);expect(rects).toEqual([{left:10,top:20,width:30,height:12,current:true},{left:10,top:20,width:30,height:12,current:true}]);
    }finally{vi.unstubAllGlobals();}
  });
  it('migrates legacy highlighter preference once and keeps tool choices independent',()=>{
    const old={weight:8,eraserSize:24},prefs=readToolPreferences(old);expect(prefs.pen.weight).toBe(8);expect(prefs.highlight.weight).toBe(40);expect(old).toEqual({weight:8,eraserSize:24});
    prefs.highlight={color:'#123456',weight:17.5};expect(readToolPreferences({version:2,prefs})).toEqual(prefs);expect(readToolPreferences({version:2,prefs:{pen:{weight:NaN,color:'bad'}}}).pen).toEqual({color:'#245cba',weight:3});
  });
  it('maps Chinese and mixed case across items without inserting arbitrary spaces',()=>{
    const index=indexText([{str:'中文 A'},{str:'BC 123，測試 中文 ABC'}]);const hits=findText(index,'中文 abc',2);expect(hits).toHaveLength(2);expect(hits[0]).toEqual({page:2,start:{item:0,offset:0},end:{item:1,offset:2}});
  });
  it('matches Chinese words across a line wrap without manufacturing a word separator',()=>{
    const index=indexText([{str:'前文中',hasEOL:true},{str:'文測試'}]);expect(findText(index,'中文',1)).toEqual([{page:1,start:{item:0,offset:2},end:{item:1,offset:1}}]);
  });
  it('normalizes whitespace and line breaks but preserves source offsets and UTF16 surrogate pairs',()=>{
    const index=indexText([{str:'A  ',hasEOL:true},{str:'\tB 😀abc'}]),hit=findText(index,'a \n b',1)[0];expect(hit.end).toEqual({item:1,offset:2});expect(findText(index,'😀ABC',1)[0].start).toEqual({item:1,offset:3});expect(findText(index,'',1)).toEqual([]);
  });
  it.each(['','1.','-','NaN','201','0'])('does not commit the incomplete or invalid size draft %j',text=>{expect(parseNumber(text,1,200)).toBeUndefined();});
  it('allows fractional pt and validates complete page input without clamping intermediate input',()=>{expect(parseNumber('12',1,20,true)).toBe(12);expect(parseNumber('1.25',1,200)).toBe(1.25);expect(parseNumber('1.25',1,20,true)).toBeUndefined();expect(parseNumber('21',1,20,true)).toBeUndefined();});
});
