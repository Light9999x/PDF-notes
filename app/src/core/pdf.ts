import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { addAsset, conflicts, edit, META, uid, type NoteDocument } from './model';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
export const loadPdf=(bytes:Uint8Array)=>pdfjs.getDocument({data:bytes.slice(),cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:import.meta.env.BASE_URL+'pdfjs/standard_fonts/',wasmUrl:import.meta.env.BASE_URL+'pdfjs/wasm/'}).promise;
export { pdfjs };
export async function importFile(file:File,device:string):Promise<NoteDocument> {
  if(file.size>100*1024*1024) throw new Error('目前單一來源檔上限為 100 MB。');
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(!['pdf','png','jpg','jpeg'].includes(ext||'')) throw new Error('目前支援 PDF、PNG、JPG 與 .pdfnote。Word 本機轉換依規劃延後。');
  const source=await addAsset(new Uint8Array(await file.arrayBuffer()),ext==='pdf'?'application/pdf':ext==='png'?'image/png':'image/jpeg');
  let pdfAsset=source;
  if(ext!=='pdf') {
    const converted=await PDFDocument.create();
    const img=ext==='png'?await converted.embedPng(source.bytes):await converted.embedJpg(source.bytes);
    const size=img.scale(Math.min(1,1600/Math.max(img.width,img.height)));
    converted.addPage([size.width,size.height]).drawImage(img,{x:0,y:0,...size});
    pdfAsset=await addAsset(await converted.save(),'application/pdf');
  }
  let pages:number;
  try {const reader=await loadPdf(pdfAsset.bytes);pages=reader.numPages;await reader.getPage(1);await reader.loadingTask.destroy();}
  catch(e) {if(e instanceof Error && e.name==='PasswordException')throw new Error('此 PDF 已加密，請先在其他工具解除密碼後匯入。');throw new Error('PDF 損毀或無法讀取，未建立文件。');}
  const doc:NoteDocument={format:1,id:uid(),originalName:file.name,originalHash:source.hash,pdfHash:pdfAsset.hash,pageCount:pages,created:new Date().toISOString(),operations:[],assets:{[source.hash]:source,[pdfAsset.hash]:pdfAsset}};
  return edit(doc,META,{kind:'document',name:file.name.replace(/\.[^.]+$/,'')},device);
}
export function checkExport(doc:NoteDocument) { if(conflicts(doc).length)throw new Error('請先處理此文件的衝突，再匯出合併 PDF；.pdfnote 可完整保留未解決版本。'); }
