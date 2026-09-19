import { PDFDocument } from 'pdf-lib';
import { addAsset, edit, META, uid, type NoteDocument } from './model';
export async function createBlank(name:string,orientation:'portrait'|'landscape',device:string):Promise<NoteDocument> {
  if(!['portrait','landscape'].includes(orientation))throw new Error('請選擇直式或橫式。');
  const title=name.trim()||'空白筆記 '+new Date().toLocaleString('zh-TW',{hour12:false});
  if(title.length>200)throw new Error('文件名稱最多 200 個字。');
  const pdf=await PDFDocument.create();const a4:[number,number]=[595.28,841.89];
  pdf.addPage(orientation==='portrait'?a4:[a4[1],a4[0]]);
  const asset=await addAsset(await pdf.save(),'application/pdf');
  return edit({format:1,id:uid(),origin:'blank',originalName:title+'.pdf',originalHash:asset.hash,pdfHash:asset.hash,pageCount:1,created:new Date().toISOString(),operations:[],assets:{[asset.hash]:asset}},META,{kind:'document',name:title},device);
}
