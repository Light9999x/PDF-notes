// Shared limits at the file/network boundary, before parsing or saving data.
export const MAX_DOCUMENT_BYTES=150*1024*1024;
export const MAX_ASSETS=10000;
export const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const isHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function assetEntries(value:unknown):[string,{hash:string;mime:string;size?:number}][]{
  if(!isRecord(value)||Object.keys(value).length>MAX_ASSETS)throw new Error('資產清單無效或超過數量限制。');
  return Object.entries(value).map(([hash,info])=>{
    if(!isHash(hash)||!isRecord(info)||info.hash!==hash||typeof info.mime!=='string'||!info.mime.length||info.mime.length>128||
      (info.size!==undefined&&(!Number.isSafeInteger(info.size)||Number(info.size)<0||Number(info.size)>MAX_DOCUMENT_BYTES)))throw new Error('資產資訊無效。');
    return [hash,info as {hash:string;mime:string;size?:number}];
  });
}
export async function readFileBounded(file:File,limit:number):Promise<Uint8Array>{
  if(file.size>limit)throw new Error('檔案超過目前大小限制。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length>limit)throw new Error('檔案超過目前大小限制。');
  return bytes;
}
export async function readResponseBounded(response:Response,limit:number):Promise<Uint8Array>{
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit)){
    await response.body?.cancel();throw new Error('雲端資料超過目前大小限制。');
  }
  if(!response.body)throw new Error('雲端回應缺少資料。');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
      if(total>limit)throw new Error('雲端資料超過目前大小限制。');chunks.push(value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
export type RemoteFile={id:string;name:string;size?:string;appProperties:{hash:string;type:'asset'|'snapshot'|'library'}};
export function drivePage(value:unknown):{files:RemoteFile[];nextPageToken:string}{
  if(!isRecord(value)||!Array.isArray(value.files)||value.files.length>1000||
    (value.nextPageToken!==undefined&&(typeof value.nextPageToken!=='string'||value.nextPageToken.length>4096)))throw new Error('雲端檔案清單無效。');
  for(const file of value.files){
    if(!isRecord(file)||typeof file.id!=='string'||!file.id.length||file.id.length>512||typeof file.name!=='string'||file.name.length>1024||
      !isRecord(file.appProperties)||!isHash(file.appProperties.hash)||!['asset','snapshot','library'].includes(String(file.appProperties.type))||
      (file.size!==undefined&&(typeof file.size!=='string'||!/^\d+$/.test(file.size)||Number(file.size)>MAX_DOCUMENT_BYTES)))throw new Error('雲端檔案資訊無效或過大。');
  }
  return {files:value.files as RemoteFile[],nextPageToken:(value.nextPageToken as string)||''};
}
