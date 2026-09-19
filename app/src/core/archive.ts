import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { canonical, validate, type NoteDocument, type Asset } from './model';
import { assetEntries, isRecord, MAX_ASSETS, MAX_DOCUMENT_BYTES, readFileBounded } from './untrusted';
export const MAX_ARCHIVE=MAX_DOCUMENT_BYTES;
export async function unpackFile(file:File):Promise<NoteDocument>{return unpack(await readFileBounded(file,MAX_ARCHIVE));}
export function pack(doc: NoteDocument): Uint8Array {
  const {assets,...data}=doc;
  const manifest={...data,assets:Object.fromEntries(Object.values(assets).map(a=>[a.hash,{hash:a.hash,mime:a.mime,size:a.bytes.length}]))};
  const files: Record<string,Uint8Array>={'manifest.json':strToU8(canonical(manifest))};
  for(const asset of Object.values(assets)) files['assets/'+asset.hash]=asset.bytes;
  return zipSync(files,{level:0});
}
export async function unpack(bytes: Uint8Array): Promise<NoteDocument> {
  if(bytes.length>MAX_ARCHIVE) throw new Error('目前存檔上限為 150 MB。');
  let total=0;const names=new Set<string>();
  const files=unzipSync(bytes,{filter:file=>{
    total+=file.originalSize;
    if(!Number.isSafeInteger(file.originalSize)||file.originalSize<0||total>MAX_ARCHIVE||names.size>=MAX_ASSETS+1||names.has(file.name)||
      ![0,8].includes(file.compression)||(file.compression===0&&file.size!==file.originalSize)||
      !/^(manifest\.json|assets\/[a-f0-9]{64})$/.test(file.name)) throw new Error('存檔過大或包含不支援的項目。');
    names.add(file.name);
    return true;
  }});
  if(!files['manifest.json']) throw new Error('找不到 .pdfnote 格式資訊。');
  const manifest=JSON.parse(strFromU8(files['manifest.json']));
  const assets: Record<string,Asset>={};
  if(!isRecord(manifest))throw new Error('存檔格式無效。');
  const entries=assetEntries(manifest.assets);
  if(Object.keys(files).length!==entries.length+1)throw new Error('存檔含未宣告的資產。');
  for(const [key,info] of entries) {
    const content=files['assets/'+key];
    if(!content || content.length!==info.size) throw new Error('資產遺失或大小不符。');
    assets[key]={hash:key,mime:info.mime,bytes:content};
  }
  const doc={...manifest,assets} as NoteDocument;
  await validate(doc); return doc;
}
