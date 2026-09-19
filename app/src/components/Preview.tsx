import { orderedAnnotations } from '../core/layers';
import { useEffect, useRef, useState } from 'react';
import { loadPdf } from '../core/pdf';
import { paint } from '../core/render';
import { pageMatrix } from '../core/geometry';
import { type NoteDocument, type Operation } from '../core/model';
export function Preview({doc,page=1,candidate}:{doc:NoteDocument;page?:number;candidate?:Operation}) {
  const ref=useRef<HTMLCanvasElement>(null);const [error,setError]=useState('');
  useEffect(()=>{let cancelled=false;let destroy:(()=>void)|undefined;
    (async()=>{const pdf=await loadPdf(doc.assets[doc.pdfHash].bytes);destroy=()=>{void pdf.loadingTask.destroy();};if(cancelled){destroy();return;}
      const p=await pdf.getPage(page);const v0=p.getViewport({scale:1});const viewport=p.getViewport({scale:Math.min(1,600/v0.width)});
      // Render offscreen to prevent cancellation / strict-mode races on visible canvas.
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d')!;
      await p.render({canvas,viewport}).promise;ctx.transform(...pageMatrix(viewport.transform,p.view));
      const annotations=orderedAnnotations(doc,page,candidate).map(o=>o.value);
      for(const a of annotations)await paint(ctx,a,doc);
      if(!cancelled&&ref.current){ref.current.width=canvas.width;ref.current.height=canvas.height;ref.current.getContext('2d')!.drawImage(canvas,0,0);}destroy();
    })().catch(e=>{if(!cancelled)setError(String(e));});
    return ()=>{cancelled=true;destroy?.();};
  },[doc.pdfHash,doc.operations,page,candidate]);
  return error?<div className="preview-error">預覽無法載入</div>:<canvas ref={ref} className="preview-canvas" aria-label="文件頁面預覽"/>;
}
