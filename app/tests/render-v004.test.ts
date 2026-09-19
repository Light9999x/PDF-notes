import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotationShape } from '../src/components/AnnotationShape';
import { annotationMatrix, annotationTransform } from '../src/core/geometry';
import { paint } from '../src/core/render';
import type { Annotation, NoteDocument } from '../src/core/model';

vi.mock('../src/core/pdf',()=>({checkExport:vi.fn(),loadPdf:vi.fn()}));
afterEach(()=>vi.unstubAllGlobals());
const doc={assets:{}} as NoteDocument;
const base:Annotation={kind:'text',page:1,x:20,y:30,width:300,height:120,color:'#123456',opacity:.7,weight:1,fontSize:18,text:'中文 ABC 123，測試'};
describe('SVG and Canvas share text transforms and glyph positions',()=>{
  it.each(['pen','highlight','image'] as const)('v006 shares %s rotation with PDF/preview painting and retains opacity/color',async kind=>{
    const ctx={save:vi.fn(),restore:vi.fn(),transform:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),drawImage:vi.fn(),globalAlpha:0,strokeStyle:'',lineWidth:0};
    const a={...base,kind,angle:53,weight:17.5,opacity:.35,points:[{x:0,y:0},{x:100,y:50}],asset:'image'};
    const imageDoc={assets:{image:{bytes:new Uint8Array([1]),mime:'image/png'}}} as unknown as NoteDocument;
    class FakeImage {onload?:()=>void;set src(_:string){queueMicrotask(()=>this.onload?.());}}
    vi.stubGlobal('Image',FakeImage);
    const html=renderToStaticMarkup(createElement('svg',null,createElement(AnnotationShape,{value:a,doc:imageDoc})));expect(html).toContain(`transform="${annotationTransform(a)}"`);
    await paint(ctx as unknown as CanvasRenderingContext2D,a,imageDoc);expect(ctx.transform).toHaveBeenCalledWith(...annotationMatrix(a));expect(ctx.globalAlpha).toBe(.35);expect(ctx.strokeStyle).toBe(a.color);expect(ctx.lineWidth).toBe(17.5);
    if(kind==='image')expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeImage),0,0,300,120);else expect(ctx.lineTo).toHaveBeenCalledWith(100,50);
  });
  it.each([0,90,180,270,37.25])('renders angle %i with the same local matrix and unmirrored text commands',async angle=>{
    const ctx={save:vi.fn(),restore:vi.fn(),transform:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),fillText:vi.fn(),measureText:(s:string)=>({width:s.length*10}),direction:'',textBaseline:'',textAlign:''};
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>ctx})});
    for(const writingMode of ['horizontal-tb','vertical-rl'] as const){
      const a={...base,angle,writingMode},markup=renderToStaticMarkup(createElement('svg',null,createElement(AnnotationShape,{value:a,doc})));
      expect(markup).toContain(`transform="${annotationTransform(a)}"`);
      expect(markup).toContain('writing-mode:horizontal-tb;direction:ltr');expect(markup).toContain('dominant-baseline="alphabetic"');
      ctx.fillText.mockClear();await paint(ctx as unknown as CanvasRenderingContext2D,a,doc);
      expect(ctx.transform).toHaveBeenLastCalledWith(...annotationMatrix(a));expect(ctx.direction).toBe('ltr');expect(ctx.textAlign).toBe('left');expect(ctx.textBaseline).toBe('alphabetic');
      const svgGlyphs=[...markup.matchAll(/<tspan x="([^"]+)" y="([^"]+)">([^<]*)<\/tspan>/g)].map(m=>[m[3],Number(m[1]),Number(m[2])]);
      expect(svgGlyphs).toEqual(ctx.fillText.mock.calls);
      expect(svgGlyphs.map(g=>g[0]).join('')).toBe(base.text);
      expect(ctx.rect).toHaveBeenLastCalledWith(0,0,a.width,a.height);
    }
  });
});
