import { PDFDocument } from 'pdf-lib';
import { objects, type Annotation, type NoteDocument } from './model';
import { checkExport, loadPdf } from './pdf';
import { annotationMatrix } from './geometry';
import { FONT, textLayout } from './text';
const imageFrom=(bytes:Uint8Array,mime:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime}));const img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('無法解碼圖片資產。'));};img.src=url;
});
export async function paint(ctx:CanvasRenderingContext2D,a:Annotation,doc:NoteDocument) {
  ctx.save();ctx.transform(...annotationMatrix(a));ctx.globalAlpha=a.opacity;
  ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.lineWidth=a.weight;ctx.lineCap='round';ctx.lineJoin='round';
  if(a.kind==='pen'||a.kind==='highlight') {
    const points=a.points||[];ctx.beginPath();
    points.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
    if(points.length===1){ctx.arc(points[0].x,points[0].y,a.weight/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();
  }else if(a.kind==='text') {
    const size=a.fontSize||18;ctx.font=size+'px '+FONT;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.direction='ltr';
    ctx.beginPath();ctx.rect(0,0,a.width,a.height);ctx.clip();
    textLayout(a,s=>ctx.measureText(s).width).forEach(g=>ctx.fillText(g.text,g.x,g.y+size));
  }else if(a.kind==='image' && a.asset) {
    const asset=doc.assets[a.asset];if(!asset)throw new Error('圖片資產遺失。');
    ctx.drawImage(await imageFrom(asset.bytes,asset.mime),0,0,a.width,a.height);
  }
  ctx.restore();
}
export async function exportPdf(doc:NoteDocument,progress:(s:string)=>void):Promise<Uint8Array> {
  checkExport(doc);
  const pdf=await PDFDocument.load(doc.assets[doc.pdfHash].bytes);
  const reader=await loadPdf(doc.assets[doc.pdfHash].bytes);
  try {
    const effective=objects(doc).filter(o=>o.id!=='$document'&&o.versions.length===1&&o.versions[0].value).map(o=>({id:o.id,value:o.versions[0].value as Annotation})).sort((a,b)=>a.id.localeCompare(b.id));
    for(let i=0;i<pdf.getPageCount();i++) {
      const annotations=effective.filter(o=>o.value.page===i+1);if(!annotations.length)continue;
      progress('正在匯出第 '+(i+1)+' / '+doc.pageCount+' 頁…');
      const page=await reader.getPage(i+1);const [x0,y0,x1,y1]=page.view;const w=x1-x0,h=y1-y0;
      const scale=Math.min(2,4096/Math.max(w,h));
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);
      const ctx=canvas.getContext('2d')!;ctx.scale(canvas.width/w,canvas.height/h);
      for(const {value} of annotations)await paint(ctx,value,doc);
      const bytes=await new Promise<Uint8Array>((resolve,reject)=>canvas.toBlob(async blob=>blob?resolve(new Uint8Array(await blob.arrayBuffer())):reject(new Error('無法產生匯出影像。')),'image/png'));
      const overlay=await pdf.embedPng(bytes);pdf.getPage(i).drawImage(overlay,{x:x0,y:y0,width:w,height:h});
      canvas.width=canvas.height=1;
    }
    return await pdf.save();
  }finally{await reader.loadingTask.destroy();}
}
export function downloadFile(bytes:Uint8Array,name:string,mime:string) {
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
