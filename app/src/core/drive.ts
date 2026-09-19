import { strToU8, strFromU8 } from 'fflate';
import { canonical, sha256, validate, type NoteDocument, type Asset } from './model';
import { store } from './storage';
import { validateLibrary, type LibraryState } from './library';
import { assetEntries, drivePage, isRecord, MAX_DOCUMENT_BYTES, readResponseBounded, type RemoteFile } from './untrusted';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const API='https://www.googleapis.com/drive/v3/files';
const APP='pdfnote-v1';
type TokenResponse={access_token?:string;expires_in?:number;error?:string;scope?:string};
type GoogleAPI={accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;callback:(r:TokenResponse)=>void;error_callback:(e:{type:string})=>void})=>{requestAccessToken:(options:{prompt:string})=>void};revoke:(token:string,done:()=>void)=>void}}};
declare global {interface Window {google?:GoogleAPI}}
let token='',expires=0,loader:Promise<void>|undefined;
export const authorized=()=>!!token && Date.now()<expires;
export function loadIdentity():Promise<void> {
  if(window.google) return Promise.resolve();
  return loader??=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{loader=undefined;script.remove();reject(new Error('無法載入 Google 登入，仍可離線編輯。'));};document.head.append(script);
  });
}
export function signIn(clientId:string):Promise<void> {
  if(!window.google) throw new Error('Google 登入尚未載入，請稍後再試。');
  if(!clientId.endsWith('.apps.googleusercontent.com')) throw new Error('請先填入這個 App 的 Google OAuth 用戶端 ID。');
  return new Promise((resolve,reject)=>{
    window.google!.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,
      callback:r=>{if(!r.access_token || r.error || !r.scope?.split(' ').includes(SCOPE))return reject(new Error('未取得 Drive 隱藏資料區授權。'));token=r.access_token;expires=Date.now()+(r.expires_in||3600)*1000-60000;resolve();},
      error_callback:e=>reject(new Error('Google 登入未完成：'+e.type))
    }).requestAccessToken({prompt:''});
  });
}
export function signOut(){token='';expires=0;}
async function request(url:string,init:RequestInit={}):Promise<Response> {
  if(!authorized())throw new Error('Google 授權已到期，請在同步設定重新連結；本機資料已保留。');
  // Bound requests and never enable billing or request a quota increase.
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(45000),headers:{...init.headers,Authorization:'Bearer '+token}});
  if(!response.ok) {
    if(response.status===401){signOut();throw new Error('Google 授權失效，請重新連結。');}
    if([403,429].includes(response.status))throw new Error('Drive 權限、容量或額度不足，同步已暫停，本機變更仍保留。');
    throw new Error('Drive 暫時無法同步（'+response.status+'），稍後會重試。');
  }
  return response;
}
async function list():Promise<RemoteFile[]> {
  let pageToken='';const files:RemoteFile[]=[],tokens=new Set<string>();
  do {
    const p=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='app' and value='"+APP+"' }",fields:'nextPageToken,files(id,name,size,appProperties)',pageSize:'1000'});
    if(pageToken)p.set('pageToken',pageToken);
    const result=drivePage(JSON.parse(strFromU8(await readResponseBounded(await request(API+'?'+p),10*1024*1024))));
    files.push(...result.files);pageToken=result.nextPageToken;
    if(files.length>10000||tokens.size>=100||pageToken&&tokens.has(pageToken))throw new Error('雲端清單超過安全處理限制，同步已暫停。');
    if(pageToken)tokens.add(pageToken);
  }while(pageToken);
  return files;
}
async function upload(bytes:Uint8Array,hash:string,type:'asset'|'snapshot'|'library',mime:string) {
  const boundary='pdfnote-'+crypto.randomUUID();
  const metadata={name:type+'-'+hash,parents:['appDataFolder'],appProperties:{app:APP,hash,type}};
  const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',new Uint8Array(bytes),'\r\n--'+boundary+'--']);
  await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
}
async function download(file:RemoteFile,limit=MAX_DOCUMENT_BYTES):Promise<Uint8Array> {
  if(Number(file.size)>150*1024*1024)throw new Error('雲端檔案超過目前大小限制。');
  const bytes=await readResponseBounded(await request(API+'/'+encodeURIComponent(file.id)+'?alt=media'),limit);
  if(await sha256(bytes)!==file.appProperties.hash)throw new Error('雲端資料完整性檢查失敗，本機資料未覆寫。');
  return bytes;
}
export function snapshot(doc:NoteDocument):Uint8Array {
  const {assets,...rest}=doc;
  return strToU8(canonical({...rest,...(doc.galleryOps?{galleryOps:[...doc.galleryOps].sort((a,b)=>a.id.localeCompare(b.id))}:{}),operations:[...doc.operations].sort((a,b)=>a.id.localeCompare(b.id)),assets:Object.fromEntries(Object.values(assets).map(a=>[a.hash,{hash:a.hash,mime:a.mime}]))}));
}
export const librarySnapshot=(state:LibraryState)=>strToU8(canonical({...state,operations:[...state.operations].sort((a,b)=>a.id.localeCompare(b.id))}));
// Append-only, content-addressed snapshots. Each contains the causal graph, not a
// winning full-file replacement. Asset uploads precede publishing the snapshot.
export async function syncDrive(onProgress:(s:string)=>void):Promise<void> {
  const files=await list();
  const remote=new Map(files.map(f=>[f.appProperties.type+':'+f.appProperties.hash,f]));
  const locals=await store.list();
  const assetCache=new Map<string,Asset>(locals.flatMap(d=>Object.entries(d.assets)));
  const seen=new Set(await store.setting<string[]>('driveSeen',[]));
  for(const file of files.filter(f=>f.appProperties.type==='library')){
    const key='library:'+file.appProperties.hash;if(seen.has(key))continue;
    onProgress('正在合併資料夾與文件分類…');
    const state=JSON.parse(strFromU8(await download(file))) as LibraryState;
    validateLibrary(state);await store.saveLibrary(state);seen.add(key);await store.set('driveSeen',[...seen]);
  }
  for(const file of files.filter(f=>f.appProperties.type==='snapshot')) {
    if(seen.has(file.appProperties.hash))continue;
    onProgress('正在下載變更與資產…');
    const data=JSON.parse(strFromU8(await download(file)));
    const assets:Record<string,Asset>={};
    if(!isRecord(data))throw new Error('雲端文件格式無效。');
    let assetBytes=0;
    for(const [hash,info] of assetEntries(data.assets)) {
      let asset=assetCache.get(hash);
      if(!asset) {
        const ref=remote.get('asset:'+hash);if(!ref)throw new Error('雲端資產尚未齊全，等待下一次同步。');
        asset={hash,mime:info.mime,bytes:await download(ref,MAX_DOCUMENT_BYTES-assetBytes)};
      }
      assetBytes+=asset.bytes.byteLength;if(assetBytes>MAX_DOCUMENT_BYTES)throw new Error('雲端文件資產總量過大。');
      if(asset.mime!==info.mime)throw new Error('雲端資產類型不一致。');
      assets[hash]=asset;
    }
    const doc={...data,assets} as NoteDocument;
    await validate(doc);await store.save(doc);for(const asset of Object.values(assets))assetCache.set(asset.hash,asset);seen.add(file.appProperties.hash);
    await store.set('driveSeen',[...seen]);
  }
  for(const doc of await store.list()) {
    onProgress('正在上傳本機變更…');
    for(const asset of Object.values(doc.assets)) {
      const key='asset:'+asset.hash;
      if(remote.has(key))continue;
      await upload(asset.bytes,asset.hash,'asset',asset.mime);remote.set(key,{id:'',name:'',appProperties:{type:'asset',hash:asset.hash}});
    }
    const bytes=snapshot(doc);const hash=await sha256(bytes);
    if(!remote.has('snapshot:'+hash))await upload(bytes,hash,'snapshot','application/json');
    seen.add(hash);await store.set('driveSeen',[...seen]);
    // Records the exact locally durable state uploaded, so edits during upload
    // remain pending instead of being falsely marked as synchronized.
    await store.set('synced:'+doc.id,hash);
  }
  const library=librarySnapshot(await store.library()),hash=await sha256(library);
  if(!remote.has('library:'+hash))await upload(library,hash,'library','application/json');
  seen.add('library:'+hash);await store.set('driveSeen',[...seen]);await store.set('synced:library',hash);
}
