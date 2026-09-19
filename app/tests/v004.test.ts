import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { annotationCorners, annotationMatrix, inverse, pageMatrix, transform } from '../src/core/geometry';
import { applyCommon, commonValue, editableObjects, intersectsRegion, hitAnnotation, makeRegion, rectangleRegion, regionContains, selectRegion, selectionChanges, selectionIsCurrent, validRegion } from '../src/core/selection';
import { textLayout } from '../src/core/text';
import { assertExpected, editBatch } from '../src/core/batch';
import { createBlank } from '../src/core/blank';
import { edit, heads, merge, type Annotation } from '../src/core/model';
import { pack, unpack } from '../src/core/archive';

const text:Annotation={kind:'text',page:1,x:20,y:20,width:60,height:40,color:'#123456',opacity:1,weight:2,fontSize:10,text:'中文 ABC 123，測試'};
const points=(xy:number[][])=>xy.map(([x,y])=>({x,y}));
const box=rectangleRegion({x:0,y:0},{x:100,y:100});
const concave=makeRegion(points([[0,0],[100,0],[100,100],[60,100],[60,40],[40,40],[40,100],[0,100]]));
const stroke:Annotation={...text,kind:'pen',x:10,y:10,width:80,height:80,points:points([[0,0],[80,80]])};

describe('region selection and editable heads',()=>{
  it('selects all overlapping editable objects on the starting page, skips tombstones and reports conflicts',async()=>{
    let d=await createBlank('selection','portrait','A');d={...d,pageCount:2};
    for(const kind of ['pen','highlight','text','image'] as const)d=edit(d,kind,kind==='pen'||kind==='highlight'?{...stroke,kind}:{...text,kind},'A');
    d=edit(d,'gone',text,'A');d=edit(d,'gone',null,'A');d=edit(d,'elsewhere',{...text,page:2},'A');d=edit(d,'conflict',text,'A');
    d=merge(edit(d,'conflict',{...text,color:'#ff0000'},'A'),edit(d,'conflict',{...text,color:'#0000ff'},'B'));
    const r=selectRegion(d,1,box);expect(r.selected.map(o=>o.id).sort()).toEqual(['highlight','image','pen','text']);expect(r.skipped).toBe(1);
    expect(selectRegion(d,1,rectangleRegion({x:200,y:200},{x:300,y:300})).selected).toEqual([]);
  });
});

describe('observed selection batches',()=>{
  const setup=async()=>edit(edit(await createBlank('batch','portrait','A'),'a',text,'A'),'b',{...text,x:50,color:'#ff0000',opacity:.5,angle:37.25,writingMode:'vertical-rl'},'A');
  it('shows mixed fields and only changes explicitly requested properties',async()=>{
    const d=await setup(),s=editableObjects(d);expect(commonValue(s,'color')).toBeUndefined();expect(commonValue(s,'writingMode')).toBeUndefined();
    const result=editBatch(d,applyCommon(s,{opacity:.7}),'A');
    for(const o of s)expect(heads(result,o.id)[0].value).toEqual({...o.value,opacity:.7});
    expect(d.operations).toEqual(result.operations.slice(0,-2));
  });
  it('rejects fields that do not apply to every selected type',async()=>{
    const s=editableObjects(await setup());s[1]={...s[1],value:{...stroke,kind:'image'}};
    expect(()=>applyCommon(s,{color:'#ffffff'})).toThrow();expect(()=>applyCommon(s,{angle:90})).toThrow();expect(()=>applyCommon(s,{weight:8})).toThrow();
    expect(applyCommon(s,{opacity:.2})).toHaveLength(2);
  });
  it('keeps relative offsets when moved and retains independent tombstones for group deletion',async()=>{
    const d=await setup(),s=editableObjects(d),m=editBatch(d,selectionChanges(s,a=>({...a,x:a.x+25,y:a.y-10})),'A');
    expect((heads(m,'b')[0].value as Annotation).x-(heads(m,'a')[0].value as Annotation).x).toBe(30);
    const removed=editBatch(m,selectionChanges(editableObjects(m),()=>null),'A');
    expect(editableObjects(merge(removed,d))).toEqual([]);
    // One grouped restore request, checked against both deletion heads.
    const restored=editBatch(removed,s.map(o=>({id:o.id,value:o.value,expected:heads(removed,o.id).map(h=>h.id)})),'A');
    expect(editableObjects(restored).map(o=>o.value)).toEqual(s.map(o=>o.value));
    const redone=editBatch(restored,selectionChanges(editableObjects(restored),()=>null),'A');expect(editableObjects(redone)).toEqual([]);
  });
  it('aborts the entire batch if the LAST object changes, including an unseen conflict',async()=>{
    const d=await setup(),s=editableObjects(d),changes=selectionChanges(s,()=>null),snapshot=structuredClone(d.operations);
    const remote=edit(d,s[1].id,{...s[1].value,text:'remote'},'B');
    expect(selectionIsCurrent(remote,s)).toBe(false);expect(()=>editBatch(remote,changes,'A')).toThrow('其他修改');expect(()=>assertExpected(remote,changes)).toThrow();
    expect(heads(remote,s[0].id)[0].value).toEqual(s[0].value);expect(d.operations).toEqual(snapshot);
    const conflict=merge(remote,edit(d,s[1].id,null,'C'));expect(()=>editBatch(conflict,changes,'A')).toThrow();
    expect(()=>editBatch(d,[changes[0],changes[0]],'A')).toThrow('重複');
  });
  it('reads old direction defaults without mutating history and round-trips arbitrary angles',async()=>{
    const d=await setup(),before=structuredClone(d.operations),s=editableObjects(d);
    expect(commonValue([s[0]],'angle')).toBe(0);expect(commonValue([s[0]],'writingMode')).toBe('horizontal-tb');
    textLayout(s[0].value,t=>t.length*10);annotationMatrix(s[0].value);expect(d.operations).toEqual(before);
    const loaded=await unpack(pack(d));expect(loaded.operations).toEqual(before);
    const reset=editBatch(d,applyCommon(s,{angle:0}),'A');expect((heads(reset,'b')[0].value as Annotation).writingMode).toBe('vertical-rl');
  });
});

describe('text axes on real PDF page viewports',()=>{
  it('lays out horizontal mixed text left to right; vertical writing and angle remain independent',()=>{
    expect(textLayout({...text,width:200},t=>t.length*10)).toEqual([{text:text.text,x:0,y:0}]);
    const vertical={...text,width:50,height:30,writingMode:'vertical-rl' as const,text:'中AB1'};
    expect(textLayout(vertical)).toEqual([{text:'中',x:40,y:0},{text:'A',x:40,y:13.5},{text:'B',x:26.5,y:0},{text:'1',x:26.5,y:13.5}]);
    expect(textLayout({...vertical,angle:90})).toEqual(textLayout(vertical));
    expect(textLayout({...text,text:'ABCDEF',width:30},t=>t.length*10).map(g=>g.text)).toEqual(['ABC','DEF']);
  });
  it.each([0,90,180,270])('native rotation %i: crop, portrait/landscape, app rotations, zoom and local angles stay consistent',async native=>{
    const pdf=await PDFDocument.create();for(const [w,h] of [[600,800],[800,600]]){const p=pdf.addPage([w,h]);p.setCropBox(25,35,w-70,h-90);p.setRotation(degrees(native));}
    const loading=getDocument({data:await pdf.save(),useSystemFonts:true});const reader=await loading.promise;
    try {for(let n=1;n<=2;n++){const p=await reader.getPage(n);
      for(const appRotation of [0,90,180,270])for(const zoom of [.5,1,2]){
        const total=(native+appRotation)%360,v=p.getViewport({scale:zoom,rotation:total}),m=pageMatrix(v.transform,p.view);
        const a=transform(m,{x:20,y:20}),b=transform(m,{x:21,y:20});const radians=total*Math.PI/180;
        expect(b.x-a.x).toBeCloseTo(Math.cos(radians)*zoom);expect(b.y-a.y).toBeCloseTo(Math.sin(radians)*zoom);
        expect(m[0]*m[3]-m[1]*m[2]).toBeCloseTo(zoom*zoom); // no mirrored glyphs
        for(const angle of [0,90,180,270,37.25,-22]){const local=annotationMatrix({...text,angle});
          for(const q of [{x:0,y:0},{x:30,y:10}]){const pagePoint=transform(local,q),screen=transform(m,pagePoint),back=inverse(local,inverse(m,screen));expect(back.x).toBeCloseTo(q.x);expect(back.y).toBeCloseTo(q.y);}
          const annotation={...text,angle};const corners=annotationCorners(annotation).map(q=>inverse(m,transform(m,q)));
          expect(intersectsRegion(annotation,makeRegion(corners))).toBe(true);
        }
      }
    }}finally{await loading.destroy();}
  });
});
