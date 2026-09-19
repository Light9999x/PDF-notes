import { assertExpected } from './batch';
import { openDB } from 'idb';
import { heads, merge, type EditRequest, type NoteDocument } from './model';
import { canMoveFolder, folderParent, folders, parentKey, cleanFolderName, emptyLibrary, folderKey, libraryEdit, libraryHeads, memberKey, mergeLibrary, validateLibrary, type LibraryState } from './library';
const db = openDB('pdfnote-v1',7,{upgrade(db){
  if(!db.objectStoreNames.contains('documents'))db.createObjectStore('documents',{keyPath:'id'});
  if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings');
  if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets');
  if(!db.objectStoreNames.contains('library'))db.createObjectStore('library');
},blocking(){void db.then(database=>database.close());}});
async function hydrate(doc:NoteDocument|undefined):Promise<NoteDocument|undefined> {
  if(!doc)return;
  const database=await db;const assets:NoteDocument['assets']={};
  for(const [key,info] of Object.entries(doc.assets)) {
    const asset=info.bytes?info:await database.get('assets',key);
    if(!asset)throw new Error('本機資產遺失，請從 .pdfnote 備份還原。');
    assets[key]=asset;
  }
  return {...doc,assets};
}
export const store = {
  async list():Promise<NoteDocument[]> {return Promise.all((await (await db).getAll('documents')).map(async d=>(await hydrate(d))!));},
  async get(id:string):Promise<NoteDocument|undefined> {return hydrate(await (await db).get('documents',id));},
  async save(doc:NoteDocument,create?:{folderId:string|null;device:string},expected?:EditRequest[]):Promise<NoteDocument> {
    const tx=(await db).transaction(['documents','assets','library'],'readwrite');
    void tx.done.catch(()=>{});
    const existing=await tx.objectStore('documents').get(doc.id) as NoteDocument|undefined;
    if(expected&&existing){try{assertExpected(existing,expected);}catch(error){tx.abort();throw error;}}
    if(create){
      if(existing){tx.abort();throw new Error('此文件已存在，請選擇建立副本或合併。');}
      const library:LibraryState=await tx.objectStore('library').get('main')||emptyLibrary();
      if(create.folderId){const h=libraryHeads(library,folderKey(create.folderId));if(h.length!==1||!h[0].value||folderParent(library,create.folderId).issue){tx.abort();throw new Error('目的資料夾已刪除或有衝突，請重新選擇。');}}
      await tx.objectStore('library').put(libraryEdit(library,memberKey(doc.id),{folderId:create.folderId},create.device),'main');
    }
    if(existing){for(const [key,info] of Object.entries(existing.assets))existing.assets[key]=info.bytes?info:doc.assets[key]||await tx.objectStore('assets').get(key);}
    const next=existing?merge(existing,doc):doc;
    for(const asset of Object.values(next.assets))if(!(await tx.objectStore('assets').getKey(asset.hash)))await tx.objectStore('assets').put(asset,asset.hash);
    const {assets,...record}=next;
    await tx.objectStore('documents').put({...record,assets:Object.fromEntries(Object.values(assets).map(a=>[a.hash,{hash:a.hash,mime:a.mime}]))});
    await tx.done; return next;
  },
  async library():Promise<LibraryState>{return await (await db).get('library','main')||emptyLibrary();},
  async saveLibrary(delta:LibraryState,guard?:{name?:string;folderId?:string;emptyFolder?:string;target?:string|null;parentId?:string|null;moveFolder?:string}):Promise<LibraryState>{
    validateLibrary(delta);
    const tx=(await db).transaction(['library','documents'],'readwrite');
    void tx.done.catch(()=>{});
    const current:LibraryState=await tx.objectStore('library').get('main')||emptyLibrary();
    try {
      if(guard?.name!==undefined)cleanFolderName(guard.name,current,guard.folderId,guard.parentId);
      if(guard?.moveFolder)canMoveFolder(current,guard.moveFolder,guard.target||null);
      if(guard?.target){const h=libraryHeads(current,folderKey(guard.target));if(h.length!==1||!h[0].value||folderParent(current,guard.target).issue)throw new Error('目的資料夾已刪除或有衝突。');}
      if(guard?.emptyFolder){
        if(folders(current).some(f=>libraryHeads(current,parentKey(f.id)).some(o=>o.value&&'parentId' in o.value&&o.value.parentId===guard.emptyFolder)))throw new Error('此資料夾含子資料夾，請先移出。');
        const docs:NoteDocument[]=await tx.objectStore('documents').getAll();
        if(docs.some(d=>libraryHeads(current,memberKey(d.id)).some(o=>o.value&&'folderId' in o.value&&o.value.folderId===guard.emptyFolder)))throw new Error('此資料夾不是空的，請先移出文件（包含已刪除文件及待處理的分類版本）。');
      }
      const next=mergeLibrary(current,delta);await tx.objectStore('library').put(next,'main');await tx.done;return next;
    }catch(e){try{tx.abort();}catch{}throw e;}
  },
  async setting<T>(key:string,fallback:T):Promise<T> {return (await db).get('settings',key).then(v=>v??fallback);},
  async set(key:string,value:unknown) {await (await db).put('settings',value,key);},
};
