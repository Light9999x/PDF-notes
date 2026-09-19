import { editGallery, type GalleryChange } from './core/gallery';
import { ancestry, directFolders, documentInScope, previousLocation, recoverLocation, scopeDestination, type BrowseLocation } from './core/library-browser';
import { LibraryActions } from './components/LibraryActions';
import { ActionMenu, Button, Dialog, EmptyState, Field, Notification, StatusBadge } from './components/ui';
import { editBatch } from './core/batch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Library, GitBranch, Cloud, Plus, Search, ArrowUpRight, MoreHorizontal, ShieldCheck, FolderOpen, Download, RefreshCw, Check, X, FileText, Trash2, Settings2 } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { conflicts, deleted, duplicate, edit, heads, META, merge, nameOf, sha256, uid, type EditRequest, type NoteDocument, type Operation, type Value } from './core/model';
import { store } from './core/storage';
import { importFile, loadPdf } from './core/pdf';
import { pack, unpackFile } from './core/archive';
import { downloadFile, exportPdf } from './core/render';
import { authorized, loadIdentity, signIn, signOut, snapshot, librarySnapshot, syncDrive } from './core/drive';
import { startDrag, endDrag, suppressDragClick } from './core/drag';
import { createBlank } from './core/blank';
import { hierarchyIssues, parentKey, folderPath, classification, emptyLibrary, folderName, libraryConflicts, libraryEdit, type LibraryState } from './core/library';
import { LibraryPanel, type LibraryGuard } from './components/LibraryPanel';
import { LibraryConflicts } from './components/LibraryConflicts';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Conflicts } from './components/Conflicts';
type Route='library'|'conflicts'|'settings'|'trash';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function App() {
  const [documents,setDocuments]=useState<NoteDocument[]>([]),[route,setRoute]=useState<Route>('library'),[openId,setOpenId]=useState<string>();
  const [device,setDevice]=useState(''),[filter,setFilter]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [localStatus,setLocalStatus]=useState('已存至本機'),[syncStatus,setSyncStatus]=useState('尚未連結 Google Drive'),[clientId,setClientId]=useState('');
  const [connected,setConnected]=useState(false),[identityReady,setIdentityReady]=useState(false),[install,setInstall]=useState<InstallEvent>();
  const [incoming,setIncoming]=useState<NoteDocument>(),[rename,setRename]=useState<NoteDocument>(),[newName,setNewName]=useState(''),[remove,setRemove]=useState<NoteDocument>();
  const [storage,setStorage]=useState(''),[offlineReady,setOfflineReady]=useState(false),[update,setUpdate]=useState<()=>void>();
  const [unsaved,setUnsaved]=useState<NoteDocument>();
  const [offlineIssue,setOfflineIssue]=useState('');
  const [library,setLibrary]=useState<LibraryState>(emptyLibrary),[scope,setScope]=useState('root'),[move,setMove]=useState<NoteDocument>();
  const creating=useRef(false),unsavedCreate=useRef<{folderId:string|null;device:string}|undefined>(undefined);
  const destination=scopeDestination(scope);
  const browseLocation=useRef<BrowseLocation>({scope:'root',query:'',scroll:0,ancestors:[]});
  const [browseHistory,setBrowseHistory]=useState<BrowseLocation[]>([]);
  const restoreBrowse=useRef(false);
  function captureBrowse(){return {...browseLocation.current,scope,query:filter,scroll:window.scrollY,ancestors:ancestry(library,scope)};}
  function navigateScope(id:string){if(id===scope)return;const current=captureBrowse();setBrowseHistory(history=>[...history,current]);browseLocation.current={scope:id,query:'',scroll:0,ancestors:ancestry(library,id)};restoreBrowse.current=true;setScope(id);setFilter('');}
  function backScope(){const last=browseHistory.at(-1);if(last&&recoverLocation(library,last).scope!==last.scope)setNotice('先前位置已不存在，已返回仍可使用的位置。');const result=previousLocation(library,browseHistory,captureBrowse());setBrowseHistory(result.history);browseLocation.current=result.location;restoreBrowse.current=true;setScope(result.location.scope);setFilter(result.location.query);}
  function openDocument(id:string){browseLocation.current=captureBrowse();setOpenId(id);}
  useEffect(()=>{const recovered=recoverLocation(library,browseLocation.current);if(recovered.scope!==scope){browseLocation.current=recovered;restoreBrowse.current=true;setScope(recovered.scope);setFilter(recovered.query);setNotice('原資料夾已不存在，已返回最近仍可使用的上層位置。');}else browseLocation.current={...recovered,scope,query:filter};},[library]);
  useEffect(()=>{if(openId)return;if(!restoreBrowse.current)return;const frame=requestAnimationFrame(()=>{window.scrollTo({top:browseLocation.current.scroll,behavior:'instant'});restoreBrowse.current=false;});return ()=>cancelAnimationFrame(frame);},[openId,scope,filter,route]);
  const input=useRef<HTMLInputElement>(null);const docsRef=useRef(documents);docsRef.current=documents;
  const syncBusy=useRef(false);const retries=useRef(0);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const saveQueue=useRef(Promise.resolve());
  const channel=useRef<BroadcastChannel|undefined>(undefined);const connectedRef=useRef(false);connectedRef.current=connected;
  const fail=useCallback((e:unknown)=>{setError(e instanceof Error?e.message:String(e));},[]);
  const refresh=useCallback(async()=>{const [docs,lib]=await Promise.all([store.list(),store.library()]);docsRef.current=docs;setDocuments(docs);setLibrary(lib);},[]);
  useEffect(()=>{void (async()=>{
    let id=await store.setting('device','');if(!id){id=uid();await store.set('device',id);}setDevice(id);setClientId(await store.setting('oauthClientId',''));await refresh();
    const persisted=await navigator.storage?.persisted?.();setStorage(persisted?'已啟用持久儲存':'建議啟用持久儲存，並定期匯出 .pdfnote 備份');
  })().catch(fail);
    channel.current=new BroadcastChannel('pdfnote');channel.current.onmessage=()=>void refresh().catch(fail);
    const installListener=(e:Event)=>{e.preventDefault();setInstall(e as InstallEvent);};window.addEventListener('beforeinstallprompt',installListener);
    if(import.meta.env.PROD){const updater=registerSW({onOfflineReady:()=>setOfflineReady(true),onNeedRefresh:()=>setUpdate(()=>()=>void updater(true)),onRegisterError:()=>setOfflineIssue('此瀏覽器未能啟用離線快取。仍可編輯已載入的本機文件；離線重開前請改用允許 Service Worker 的瀏覽器。')});void navigator.serviceWorker?.ready.then(()=>setOfflineReady(true));}
    return ()=>{channel.current?.close();window.removeEventListener('beforeinstallprompt',installListener);};
  },[]);
  useEffect(()=>{if(route==='settings')void loadIdentity().then(()=>setIdentityReady(true)).catch(()=>setIdentityReady(false));},[route]);
  useEffect(()=>{if(!unsaved&&localStatus!=='正在儲存…'&&!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[unsaved,localStatus,busy]);
  async function sync() {
    if(syncBusy.current||!connectedRef.current)return;
    if(!navigator.onLine){setSyncStatus('離線 · 變更待同步');return;}
    if(!authorized()){setConnected(false);setSyncStatus('授權已到期 · 請重新連結');return;}
    syncBusy.current=true;
    try {await navigator.locks.request('pdfnote-sync',async()=>{await syncDrive(setSyncStatus);});await refresh();channel.current?.postMessage('sync');
      const pending=await Promise.all((await store.list()).map(async doc=>(await sha256(snapshot(doc)))!==(await store.setting('synced:'+doc.id,''))));
      pending.push((await sha256(librarySnapshot(await store.library())))!==(await store.setting('synced:library','')));
      setSyncStatus(pending.some(Boolean)?'已存至本機 · 尚有變更待同步':'同步完成 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));retries.current=0;}
    catch(e){setSyncStatus(e instanceof Error?e.message:'同步失敗，本機變更已保留');retries.current=Math.min(retries.current+1,6);}
    finally{syncBusy.current=false;clearTimeout(timer.current);timer.current=setTimeout(()=>void sync(),Math.min(300000,30000*2**retries.current));}
  }
  useEffect(()=>{if(connected)void sync();const wake=()=>{if(document.visibilityState==='visible')void sync();};const online=()=>void sync();window.addEventListener('online',online);document.addEventListener('visibilitychange',wake);return ()=>{window.removeEventListener('online',online);document.removeEventListener('visibilitychange',wake);clearTimeout(timer.current);};},[connected]);
  const persist=useCallback(async(doc:NoteDocument,create?:{folderId:string|null;device:string},expected?:EditRequest[])=>{
    setLocalStatus('正在儲存…');
    try {const result=await store.save(doc,create,expected);await refresh();setUnsaved(undefined);unsavedCreate.current=undefined;channel.current?.postMessage('saved');setLocalStatus('已存至本機');if(connectedRef.current){setSyncStatus('已存至本機 · 待同步');clearTimeout(timer.current);timer.current=setTimeout(()=>void sync(),1800);}return result;}
    catch(e){if(!create){setUnsaved(doc);unsavedCreate.current=undefined;setLocalStatus('儲存失敗 · 請保留此畫面並重試');}else setLocalStatus('建立未完成，請重試');throw e;}
  },[]);
  async function changeLibrary(next:LibraryState,guard?:LibraryGuard){
    setLocalStatus('正在儲存…');
    try{await store.saveLibrary(next,guard);await refresh();channel.current?.postMessage('saved');setLocalStatus('已存至本機');if(connectedRef.current){setSyncStatus('已存至本機 · 分類待同步');clearTimeout(timer.current);timer.current=setTimeout(()=>void sync(),1800);}}
    catch(e){setLocalStatus('分類變更未儲存，請重試');throw e;}
  }
  async function newBlank(name:string,orientation:'portrait'|'landscape'){
    if(!device)throw new Error('本機資料正在初始化，請稍後再試。');
    if(creating.current)return;creating.current=true;setBusy('正在建立空白文件…');
    try{const doc=await createBlank(name,orientation,device);await persist(doc,{folderId:destination,device});openDocument(doc.id);setNotice('已建立空白文件並保存至本機。');}
    finally{creating.current=false;setBusy('');}
  }
  async function changeBatch(changes:EditRequest[],assets?:NoteDocument['assets'],gallery?:GalleryChange[]):Promise<NoteDocument> {
    const result=saveQueue.current.then(async()=>{
      const doc=await store.get(openId!);if(!doc)throw new Error('文件未開啟。');
      let next=editBatch({...doc,assets:{...doc.assets,...assets}},changes,device);
      for(const change of gallery||[])next=editGallery(next,change,device);
      return persist(next,undefined,changes);
    });saveQueue.current=result.then(()=>{},()=>{});return result;
  }
  async function importDocument(file:File) {
    if(!device)throw new Error('本機資料正在初始化，請稍後再試。');
    setBusy('正在匯入 '+file.name+'…');
    try {
      const doc=file.name.toLowerCase().endsWith('.pdfnote')?await unpackFile(file):await importFile(file,device);
      if(file.name.toLowerCase().endsWith('.pdfnote')){const pdf=await loadPdf(doc.assets[doc.pdfHash].bytes);try{if(pdf.numPages!==doc.pageCount)throw new Error('存檔頁數與 PDF 不一致。');}finally{await pdf.loadingTask.destroy();}}
      const old=await store.get(doc.id);if(old){setIncoming(doc);return;}
      await persist(doc,{folderId:destination,device});openDocument(doc.id);setNotice('已保留初始內容，所有筆記將儲存在 App 中。');
    }finally{setBusy('');}
  }
  async function importChoice(copy:boolean) {
    if(!incoming)return;const old=await store.get(incoming.id);const result=copy?duplicate(incoming):old?merge(old,incoming):incoming;
    await persist(result,copy||!old?{folderId:destination,device}:undefined);setIncoming(undefined);openDocument(result.id);
  }
  async function exportCurrent(kind:'pdf'|'note') {
    const doc=docsRef.current.find(d=>d.id===openId);if(!doc)return;setBusy('正在準備匯出…');
    try{const bytes=kind==='note'?pack(doc):await exportPdf(doc,setBusy);downloadFile(bytes,nameOf(doc)+(kind==='note'?'.pdfnote':'.pdf'),kind==='note'?'application/octet-stream':'application/pdf');setNotice('已產生'+(kind==='note'?'可編輯工作存檔':'合併 PDF')+'，請確認下載位置。');}finally{setBusy('');}
  }
  async function resolve(doc:NoteDocument,id:string,op:Operation) {
    // Use the viewed candidate set. A newly arriving unseen version will remain a conflict.
    if(!heads(doc,id).some(h=>h.id===op.id))throw new Error('候選版本已改變，請重新選擇。');
    await persist(edit(doc,id,op.value,device,true));
  }
  const current=documents.find(d=>d.id===openId);const managementCount=libraryConflicts(library).length+hierarchyIssues(library).length;const count=documents.reduce((n,d)=>n+conflicts(d).length,0)+managementCount;
  const visible=documents.filter(d=>route==='trash'?deleted(d):!deleted(d)).filter(d=>route==='trash'||documentInScope(library,d.id,scope)).filter(d=>nameOf(d).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>b.created.localeCompare(a.created));
  const savedIndicator=localStatus+(connected?(syncStatus.replace(/已存至本機[ ·，]*/g,'').trim()?' · '+syncStatus.replace(/已存至本機[ ·，]*/g,'').trim():''):' · 未連結同步');
  return <><div className="app-shell">
    {!current&&<aside className="sidebar"><a href="#" className="brand" onClick={e=>{e.preventDefault();setRoute('library');}}><div className="brand-mark"><BookOpen size={26}/></div><div>頁間<span>PDFnote</span></div></a><div className="workspace-label">個人工作空間</div><nav>{([['library',Library,'我的文件'],['conflicts',GitBranch,'衝突管理'],['settings',Cloud,'同步與設定']] as const).map(([id,Icon,label])=><button key={id} onClick={()=>setRoute(id)} aria-current={route===id?'page':undefined} className={route===id?'active':''}><Icon size={19}/>{label}{id==='conflicts'&&count>0&&<b className="nav-badge">{count}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={20}/><div><strong>先儲存在你的裝置</strong><p>沒有網路，也不打斷思考。</p></div></div><div className="sidebar-version"><span className="status-dot"/>頁間 v0.8.1 · 本機優先</div></div></aside>}
    <main className={current?'reader-main':'main-content'}>
      {current?<Editor key={current.id} doc={current} onBack={()=>{restoreBrowse.current=true;setOpenId(undefined);}} onEditBatch={changeBatch} onError={fail} onExport={k=>void exportCurrent(k).catch(fail)} status={savedIndicator}/>:<>
      <div className="topbar"><span>你的閱讀，自己的節奏。</span><div><span className="status-dot"/><span>{connected?syncStatus:'本機編輯可用'}</span><button className="avatar" aria-label="開啟設定" onClick={()=>setRoute('settings')}><Settings2 size={17}/></button></div></div>
      {(route==='library'||route==='trash')&&<><header className="content-header"><div><h1>{route==='trash'?'已刪除文件':'我的文件'}</h1>{route==='trash'&&<p>刪除紀錄保留，可還原文件。</p>}</div><LibraryActions trash={route==='trash'} onImport={()=>input.current?.click()} onTrash={()=>{setRoute('trash');setFilter('');}} onLibrary={()=>{setRoute('library');setFilter('');}}/></header>
      <LibraryPanel browse={route==='library'} library={library} documents={documents} scope={scope} device={device} query={filter} onQuery={setFilter} canBack={!!browseHistory.length} onBack={backScope} onScope={navigateScope} onChange={changeLibrary} onCreate={newBlank} move={move} onCloseMove={()=>setMove(undefined)} onError={fail}/>
      <div className="library-controls"><div><h2>{route==='trash'?'保留的刪除紀錄':scope==='root'?'根目錄內容':scope==='all'?'全部文件':scope==='unfiled'?'未分類':folderName(library,scope)}</h2><span>{visible.length} 份文件</span></div>{route==='trash'&&<label className="search-box"><Search size={18}/><input placeholder="搜尋文件名稱…" aria-label="搜尋文件名稱" value={filter} onChange={e=>setFilter(e.target.value)}/></label>}</div>
      {visible.length?<div className="document-grid">{visible.map(doc=><article className="document-card" draggable onDragStart={e=>startDrag(e,{kind:'document',id:doc.id})} onDragEnd={endDrag} key={doc.id}><button className="document-open" onClick={()=>{if(!suppressDragClick())openDocument(doc.id);}} aria-label={'開啟 '+nameOf(doc)}><div className="cover"><Preview doc={doc}/><span className="file-tag">{doc.origin==='blank'?'新建 · PDF':'PDF'}</span>{conflicts(doc).length>0&&<span className="conflict-tag">有待處理衝突</span>}</div><div className="document-title"><h3>{nameOf(doc)}</h3><p>{doc.pageCount} 頁 <span>·</span> {new Date(doc.created).toLocaleDateString('zh-TW')}</p></div></button>{classification(library,doc.id).issue&&<p className="classification-warning">{classification(library,doc.id).issue}</p>}<div className="card-bottom"><span title={folderPath(library,classification(library,doc.id).folderId)}><span className="status-dot"/>{folderPath(library,classification(library,doc.id).folderId)}</span><ActionMenu label={'管理 '+nameOf(doc)}><button onClick={()=>setMove(doc)}>移動到資料夾</button><button onClick={()=>{setRename(doc);setNewName(nameOf(doc));}}>重新命名</button><button onClick={()=>{downloadFile(doc.assets[doc.originalHash].bytes,doc.originalName,doc.assets[doc.originalHash].mime);}}>{doc.origin==='blank'?'匯出初始空白 PDF':'匯出原始檔'}</button>{deleted(doc)?<button onClick={()=>void persist(edit(doc,META,{kind:'document',name:doc.originalName.replace(/\.[^.]+$/,'')},device)).catch(fail)}>還原文件</button>:<button className="danger" onClick={()=>setRemove(doc)}>刪除文件</button>}</ActionMenu></div>{deleted(doc)&&<Button className="restore-document" onClick={()=>void persist(edit(doc,META,{kind:'document',name:doc.originalName.replace(/\.[^.]+$/,'')},device)).catch(fail)}>還原文件</Button>}</article>)}</div>:route==='library'&&directFolders(library,scope,filter).length?null:<EmptyState title={filter?'沒有符合的資料夾或文件':route==='trash'?'沒有已刪除的文件':scope==='root'?'你的第一份筆記，從一份文件開始':scope==='all'||scope==='unfiled'?'目前沒有文件':'此資料夾尚無內容'} actions={filter?<Button onClick={()=>setFilter('')}>清除搜尋</Button>:undefined}>{filter?'試試其他關鍵字，或清除搜尋以查看此範圍的全部文件。':route==='trash'?'刪除後的文件會保留在這裡，可隨時還原。':'從上方匯入 PDF、圖片、.pdfnote，或新建空白文件。'}</EmptyState>}
      <div className="library-footnote"><ShieldCheck size={15}/>原始檔完整保留，筆記獨立儲存。<span>Word 轉換尚未提供</span></div></>}
      {route==='conflicts'&&<Conflicts documents={documents} managementCount={managementCount} management={<LibraryConflicts library={library} documents={documents} onRoot={id=>changeLibrary(libraryEdit(library,parentKey(id),{parentId:null},device,true),{moveFolder:id,target:null})} onResolve={(entity,op)=>changeLibrary(libraryEdit(library,entity,op.value,device,true))}/>} onResolve={resolve}/>}
      {route==='settings'&&<><header className="content-header"><div><h1>同步與設定</h1></div></header><div className="settings-grid"><section className="settings-card"><div className="setting-icon"><Cloud size={25}/></div><h2>Google Drive</h2><p>使用你自己的帳號，將文件與筆記同步至 App 專用隱藏資料區。</p><div className="status-list"><StatusBadge>本機：{localStatus}</StatusBadge><StatusBadge tone={connected?'success':'warning'}>Google：{connected?'已連結（授權到期需重連）':'尚未授權或需重新連結'}</StatusBadge><div role="status">同步：{syncStatus}</div></div>
      <details className="advanced-settings"><summary>進階連線設定{!clientId.trim()?' · 首次使用請先設定':''}</summary><Field label="Google OAuth 用戶端 ID" hint="只填公開用戶端 ID，不需要 client secret。"><input aria-label="Google OAuth 用戶端 ID" value={clientId} placeholder="…apps.googleusercontent.com" onChange={e=>setClientId(e.target.value)}/></Field><div className="setup-help"><h3>首次設定方式</h3><ol><li>在 Google Cloud 專案啟用 Google Drive API，設定 OAuth 同意畫面與測試使用者。</li><li>建立網頁應用程式用戶端，加入目前網站來源（本機為 http://127.0.0.1:4173），兩台裝置使用同一專案。</li><li>授權範圍只需 drive.appdata，複製公開用戶端 ID 到上方，再按「連結 Google Drive」。</li></ol><p>本機功能不需 Google 帳號。連結需要網路；權杖到期或重開 App 後需再次連結。不需購買服務或提供私密金鑰。</p></div></details><div className="settings-actions"><button className="primary" disabled={!identityReady||!clientId} onClick={()=>{void signIn(clientId.trim()).then(async()=>{await store.set('oauthClientId',clientId.trim());setConnected(true);}).catch(fail);}}><Cloud size={17}/>{connected?'重新授權':'連結 Google Drive'}</button>{connected&&<><button onClick={()=>void sync()}><RefreshCw size={16}/>立即同步</button><button onClick={()=>{signOut();setConnected(false);setSyncStatus('已中斷連結 · 本機資料保留');}}>中斷連結</button></>}</div><p className="muted small">授權到期或重開 App 後需重新連結；關閉後不保證背景同步。</p></section>
      <section className="settings-card"><div className="setting-icon"><Download size={25}/></div><h2>安裝與離線使用</h2><p>可透過 Windows Edge／Chrome，或 Android Chrome 安裝到裝置。</p><button className="primary" disabled={!install} onClick={()=>{void install?.prompt();setInstall(undefined);}}>安裝頁間 App</button><p className="muted small">若按鈕未啟用，請使用瀏覽器選單的「安裝應用程式」。Android 必須從 HTTPS 網址開啟。</p><div className="sync-state">{offlineReady?'App 已快取，可離線開啟':offlineIssue?offlineIssue:import.meta.env.DEV?'開發模式；正式建置才啟用離線快取':'正在準備離線快取，完成前請勿斷網'}</div>{update&&<button disabled={!!unsaved||localStatus==='正在儲存…'} onClick={()=>update()}>重新載入更新（筆記已自動儲存）</button>}<h3>本機儲存</h3><p className="muted small">{storage}</p><button onClick={()=>void navigator.storage.persist().then(ok=>setStorage(ok?'已啟用持久儲存':'瀏覽器尚未授予持久儲存，請保留匯出備份。')).catch(fail)}><ShieldCheck size={16}/>保留本機資料</button><p className="muted small">清除瀏覽器的網站資料會刪除本機文件。請定期匯出 .pdfnote 備份；本機資料與 Drive 隱藏資料區均未提供 App 端加密。</p></section>
      <section className="settings-card full"><details><summary>支援範圍與待驗收項目</summary><div className="support-row"><span><Check size={17}/>PDF、PNG／JPG 本機匯入</span><span><Check size={17}/>四類註記與兩種匯出</span><span><Check size={17}/>.pdfnote 完整備份</span></div><p className="muted">此版本尚不支援 Word 轉換。未提供 OCR；掃描頁不能搜尋文字。Windows／Galaxy S24+ 實機、觸控筆、Google 帳號端到端同步驗收仍待完成。</p></details></section></div></>}
      </>}
    </main>
  </div><input type="file" hidden ref={input} accept=".pdf,.pdfnote,.png,.jpg,.jpeg" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importDocument(file).catch(fail);}}/>
  {busy&&<div className="busy-bar" role="status"><RefreshCw className="spin" size={18}/>{busy}</div>}
  {unsaved&&<Dialog title="儲存失敗" alert dismissible={false}><h3>尚有變更未能寫入本機</h3><p>請保留此畫面，重試儲存；也可以先匯出包含這次變更的救援存檔。</p><div className="modal-actions"><button onClick={()=>downloadFile(pack(unsaved),nameOf(unsaved)+'-recovery.pdfnote','application/octet-stream')}>匯出救援存檔</button><button className="primary" disabled={localStatus==='正在儲存…'} onClick={()=>void persist(unsaved,unsavedCreate.current).catch(fail)}>重試儲存</button></div></Dialog>}
  {error&&<Notification error onClose={()=>setError('')}>{error}</Notification>}
  {notice&&!error&&<Notification onClose={()=>setNotice('')}>{notice}</Notification>}
  {incoming&&<Dialog title="這份文件已在你的文件庫" onClose={()=>setIncoming(undefined)} dismissible={localStatus!=='正在儲存…'}><p>以文件 ID 辨識到「{nameOf(incoming)}」。你可以建立獨立副本，或合併雙方物件與版本；現有文件不會被直接覆寫。</p><div className="modal-actions"><button disabled={localStatus==='正在儲存…'} onClick={()=>setIncoming(undefined)}>取消</button><button disabled={localStatus==='正在儲存…'} onClick={()=>void importChoice(true).catch(fail)}>建立副本</button><button disabled={localStatus==='正在儲存…'} className="primary" onClick={()=>void importChoice(false).catch(fail)}>合併</button></div></Dialog>}
  {rename&&<Dialog title="重新命名" onClose={()=>setRename(undefined)} dismissible={localStatus!=='正在儲存…'}><form onSubmit={e=>{e.preventDefault();void persist(edit(rename,META,{kind:'document',name:newName.trim()},device)).then(()=>setRename(undefined)).catch(fail);}}><Field label="文件名稱"><input aria-label="文件名稱" value={newName} maxLength={200} onChange={e=>setNewName(e.target.value)}/></Field><div className="modal-actions"><button type="button" disabled={localStatus==='正在儲存…'} onClick={()=>setRename(undefined)}>取消</button><button className="primary" disabled={!newName.trim()||localStatus==='正在儲存…'}>儲存名稱</button></div></form></Dialog>}
  {remove&&<Dialog title={`刪除「${nameOf(remove)}」？`} onClose={()=>setRemove(undefined)} dismissible={localStatus!=='正在儲存…'}><p>文件會移至「已刪除文件」並同步刪除狀態。App 內的副本、筆記與刪除紀錄會保留，方便還原；你匯入前的原始檔不受影響。</p><div className="modal-actions"><button disabled={localStatus==='正在儲存…'} onClick={()=>setRemove(undefined)}>取消</button><button className="danger" disabled={localStatus==='正在儲存…'} onClick={()=>void persist(edit(remove,META,null,device)).then(()=>setRemove(undefined)).catch(fail)}>刪除文件</button></div></Dialog>}
  </>;
}
