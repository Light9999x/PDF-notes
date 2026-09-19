import { compareLayers, layerChanges, layerLabels, nextLayer, type LayerAction } from '../core/layers';
import { ImageCutout } from './ImageCutout';
import { clickSelection } from '../core/click-selection';
import { galleryChange, galleryHashes, type GalleryChange } from '../core/gallery';
import { StraightStroke, strokeDraft } from '../core/straight-stroke';
import { fitZoom, readerSpace, pageVisibilityScore, type ZoomMode } from '../core/reader-fit';
import { selectedText, textCaret, textChanged } from '../core/text-edit';
import { FONT } from '../core/text';
import { defaultPreferences, readToolPreferences } from '../core/tool-preferences';
import { SelectionControls } from './SelectionControls';
import { InlineText, type TextDraft } from './InlineText';
import { ImageGallery, ImageDropPreview } from './ImageGallery';
import { usePdfSearch } from './usePdfSearch';
import { resizeGroup, rotateGroup, selectionFrame, uprightAt, uprightTextAt, visibleAngle, type Handle } from '../core/manipulation';
import { EditorToolbar, type Tool } from './EditorToolbar';
import { Button, Dialog, useMedia, useSlide } from './ui';
import { editorKeyAction } from '../core/ui-policy';
import { useEffect, useRef, useState } from 'react';
import { addAsset, heads, nameOf, objects, uid, type EditRequest, type Annotation, type NoteDocument, type Point, type Value } from '../core/model';
import { loadPdf } from '../core/pdf';
import { clipSegment, sweptHit, inverse, pageMatrix, annotationMatrix, transform } from '../core/geometry';
import { editableObjects, hitAnnotation, makeRegion, selectRegion, selectionChanges, selectionIsCurrent, validRegion, type SelectedObject } from '../core/selection';
import { PropertiesPanel } from './PropertiesPanel';
import { ReaderPage, type PageView } from './ReaderPage';
import { AnnotationShape } from './AnnotationShape';
import { store } from '../core/storage';
import type { PDFDocumentProxy } from 'pdfjs-dist';
type Props={doc:NoteDocument;onBack:()=>void;onEditBatch:(changes:EditRequest[],assets?:NoteDocument['assets'],gallery?:GalleryChange[])=>Promise<NoteDocument>;onError:(e:unknown)=>void;onExport:(kind:'pdf'|'note')=>void;status:string};
type History={id:string;before:Value;after:Value;head:string};
export function Editor({doc,onBack,onEditBatch,onError,onExport,status}:Props) {
  const [cutout,setCutout]=useState<{hash:string;object?:SelectedObject}>();
  const narrow=useMedia('(max-width: 600px)');
  const [propertiesDirty,setPropertiesDirty]=useState(false),[panelRevision,setPanelRevision]=useState(0);
  const [pendingAction,setPendingAction]=useState<(()=>void)>();
  function confirmAction(action:()=>void){if(propertiesDirty)setPendingAction(()=>action);else action();}

  const [reader,setReader]=useState<PDFDocumentProxy>();const [page,setPage]=useState(1);const [zoom,setZoom]=useState(1);const [rotation,setRotation]=useState(0);
  const [tool,setTool]=useState<Tool>('read');const [prefs,setPrefs]=useState<Record<string,{color:string;weight:number}>>(defaultPreferences);const color=prefs[tool]?.color||'#245cba',weight=prefs[tool]?.weight||3;const setColor=(color:string)=>setPrefs(p=>({...p,[tool]:{...p[tool],color}}));const setWeight=(weight:number)=>setPrefs(p=>({...p,[tool]:{...p[tool],weight}}));
  const [moveHover,setMoveHover]=useState(false);const [selected,setSelected]=useState<string[]>([]);const [draft,setDraft]=useState<Annotation>();const [selectionMode,setSelectionMode]=useState<'box'|'lasso'>('box');const [marquee,setMarquee]=useState<{page:number;points:Point[]}>();const [groupDraft,setGroupDraft]=useState<Map<string,Annotation>>(new Map());const [panelOpen,setPanelOpen]=useState(true);const [zoomMode,setZoomMode]=useState<ZoomMode>('manual');const [geometryRevision,setGeometryRevision]=useState(0);const [space,setSpace]=useState({width:1,height:1,padX:72,padY:72,visibleWidth:1,cover:0,left:0});
  const [loading,setLoading]=useState(true);const [query,setQuery]=useState('');const [searchStatus,setSearchStatus]=useState('');
  const [undo,setUndo]=useState<History[][]>([]),[redo,setRedo]=useState<History[][]>([]);const [textDraft,setTextDraft]=useState<TextDraft>();const textRef=useRef<TextDraft|undefined>(undefined);const textSaving=useRef<Promise<boolean>|undefined>(undefined);
  const [panel,setPanel]=useState<'properties'|'images'>('properties'),[placing,setPlacing]=useState<string>(),[landing,setLanding]=useState<{page:number;point:Point;hash:string}>(),[imageDragging,setImageDragging]=useState(false),[groupAngle,setGroupAngle]=useState(0);const groupPreview=useRef(new Map<string,Annotation>());const composing=useRef(false);const rotationPivot=useRef<Point|undefined>(undefined);
  const [ready,setReady]=useState(false);const [layout,setLayout]=useState<'vertical'|'horizontal'>('vertical');const [views,setViews]=useState<PageView[]>([]);const pendingAnchor=useRef<{page:number;x:number;y:number}>({page:1,x:0,y:0});const restoring=useRef(true);const legacyScroll=useRef<number|null>(null);const [eraserSize,setEraserSize]=useState(24);const [hover,setHover]=useState<{page:number;point:Point}>();const [erased,setErased]=useState<Set<string>>(new Set());const [working,setWorking]=useState(false);const workingRef=useRef(false);
  const placementEpoch=useRef(0),draggedImage=useRef<string|undefined>(undefined);
  const scroll=useRef<HTMLDivElement>(null),panelContent=useRef<HTMLDivElement>(null);
  const deferredView=useRef<(()=>void)|undefined>(undefined),scrollTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const panelVisible=panelOpen&&!(narrow&&!!placing);
  const panelPresent=useSlide(panelVisible,panelContent,'x');
  const manipulating=tool==='select'||tool==='image';
  const gesture=useRef<{start:Point;rect?:{left:number;top:number;width:number;height:number};points?:Point[];straight?:StraightStroke;pointer:number;page:number;rotate?:boolean;resize?:Handle;frame?:Annotation;delta?:number;lastClient?:Point;erasing?:Map<string,History>;selecting?:'box'|'lasso';selectionPoints?:Point[];dragged?:boolean;clientStart?:Point;group?:SelectedObject[];beforeSelection?:string[];clickTarget?:SelectedObject;shift?:boolean}|undefined>(undefined);
  const liveDraft=useRef<Annotation|undefined>(undefined);const lastLocalOperations=useRef(new Set<string>());const currentDoc=useRef(doc);currentDoc.current=doc;
  useEffect(()=>{let disposed=false;let pdf:PDFDocumentProxy|undefined;setReady(false);setLoading(true);setPanelOpen(true);
    void Promise.all([loadPdf(doc.assets[doc.pdfHash].bytes),store.setting<any>('position:'+doc.id,{}),store.setting<any>('tools',{weight:3,eraserSize:24})]).then(([p,pos,settings])=>{
      pdf=p;if(disposed){void p.loadingTask.destroy();return;}
      const pg=Math.max(1,Math.min(p.numPages,Math.floor(Number(pos.page)||1)));
      setZoomMode(['width','page'].includes(pos.zoomMode)?pos.zoomMode:'manual');setPage(pg);setZoom(Math.max(.25,Math.min(4,Number(pos.zoom)||1)));setRotation([0,90,180,270].includes(pos.rotation)?pos.rotation:0);setLayout(pos.layout==='horizontal'?'horizontal':'vertical');
      pendingAnchor.current={page:pg,x:Number(pos.anchor?.x)||0,y:Number(pos.anchor?.y)||0};legacyScroll.current=pos.anchor?null:typeof pos.scroll==='number'&&Number.isFinite(pos.scroll)?pos.scroll:null;
      setPrefs(readToolPreferences(settings));setEraserSize(Math.max(2,Math.min(200,Number(settings.eraserSize)||24)));setReader(p);setReady(true);
    }).catch(onError);return ()=>{disposed=true;void pdf?.loadingTask.destroy();};
  },[doc.id,doc.pdfHash]);
  useEffect(()=>{if(ready)void store.set('tools',{version:2,prefs,eraserSize}).catch(onError);},[prefs,eraserSize,ready]);
  useEffect(()=>{if(!reader)return;let disposed=false;setLoading(true);
    void (async()=>{const next:PageView[]=[];for(let n=1;n<=reader.numPages;n++){const p=await reader.getPage(n);if(disposed)return;const viewport=p.getViewport({scale:zoom,rotation:(p.rotate+rotation)%360});next.push({width:viewport.width,height:viewport.height,scale:zoom,matrix:pageMatrix(viewport.transform,p.view),bounds:p.view,rotation:viewport.rotation});}
      if(!disposed){setViews(next);setLoading(false);}
    })().catch(onError);return ()=>{disposed=true;};
  },[reader,zoom,rotation]);
  const view=views[page-1];
  const search=usePdfSearch(reader,query,goPage);
  useEffect(()=>{setGroupAngle(0);rotationPivot.current=undefined;if(selected.length&&tool!=='image')setPanel('properties');},[selected.join('|')]);
  function remember(){const root=scroll.current;if(!root||!ready||restoring.current||gesture.current||textRef.current)return;
    const r=root.getBoundingClientRect();let best=page,bestArea=-Infinity;
    for(const node of root.querySelectorAll<HTMLElement>('.paper')){const b=node.getBoundingClientRect();const area=pageVisibilityScore(b,{left:r.left+space.left,top:r.top,width:space.visibleWidth,height:root.clientHeight},layout,zoomMode);if(area>bestArea){bestArea=area;best=Number(node.dataset.page);}}
    const node=root.querySelector<HTMLElement>('[data-page="'+best+'"]');if(!node)return;const b=node.getBoundingClientRect();
    const anchor={page:best,x:(r.left+space.left-b.left)/b.width,y:(r.top-b.top)/b.height};pendingAnchor.current=anchor;setPage(best);
    void store.set('position:'+doc.id,{page:best,zoom,zoomMode,rotation,layout,anchor:{x:anchor.x,y:anchor.y}}).catch(onError);
  }
  function restore(){const root=scroll.current,a=pendingAnchor.current;if(!root||gesture.current||textRef.current||imageDragging)return;const node=root.querySelector<HTMLElement>('[data-page="'+a.page+'"]');if(!node)return;const r=root.getBoundingClientRect(),b=node.getBoundingClientRect();if(legacyScroll.current!==null){a.y=(legacyScroll.current-parseFloat(getComputedStyle(root).paddingTop))/b.height;legacyScroll.current=null;}if(zoomMode==='page'){root.scrollLeft+=b.left-r.left-space.left-(space.visibleWidth-b.width)/2;root.scrollTop+=b.top-r.top-(root.clientHeight-b.height)/2;}else{root.scrollLeft+=b.left-r.left-space.left+a.x*b.width;root.scrollTop+=b.top-r.top+a.y*b.height;}setPage(a.page);restoring.current=false;remember();}
  useEffect(()=>{if(!views.length||loading)return;restoring.current=true;const frame=requestAnimationFrame(restore);return ()=>cancelAnimationFrame(frame);},[views,layout,loading]);
  function goPage(n:number){if(textRef.current||gesture.current){deferredView.current=()=>goPage(n);return;}pendingAnchor.current={page:n,x:0,y:0};restoring.current=true;setPage(n);setGeometryRevision(v=>v+1);requestAnimationFrame(()=>restoreRef.current());}
  function changeView(action:()=>void){if(textRef.current||gesture.current){deferredView.current=()=>changeView(action);return;}remember();restoring.current=true;action();setGeometryRevision(v=>v+1);}
  useEffect(()=>{const root=scroll.current;if(!root)return;const wheel=(e:WheelEvent)=>{if(layout!=='horizontal'||e.ctrlKey||e.metaKey)return;e.preventDefault();const amount=e.deltaMode===1?20:e.deltaMode===2?root.clientWidth:1;root.scrollLeft+=(Math.abs(e.deltaX)>0?e.deltaX:e.deltaY)*amount;};root.addEventListener('wheel',wheel,{passive:false});return ()=>root.removeEventListener('wheel',wheel);},[layout]);
  const effective=editableObjects(doc).sort(compareLayers);
  const selection=effective.filter(o=>selected.includes(o.id));
  const selectionKey=selection.map(o=>o.id+':'+o.head).join('|');
  const draftVersion=useRef(selectionKey),applyingProperties=useRef(false);
  useEffect(()=>{
    if(draftVersion.current!==selectionKey){
      if(propertiesDirty&&!applyingProperties.current)setSearchStatus('物件版本或選取已更新，屬性欄已重載最新內容；先前未套用的暫存已捨棄。');
      draftVersion.current=selectionKey;applyingProperties.current=false;
    }
  },[selectionKey]);
  useEffect(()=>{
    if(gesture.current?.group&&!selectionIsCurrent(doc,gesture.current.group)){
      cancelGesture();setSearchStatus('選取物件收到其他修改，已取消尚未完成的移動，請重新操作。');
    }
    setSelected(ids=>{const next=ids.filter(id=>effective.some(o=>o.id===id));return next.length===ids.length?ids:next;});
    // Key the panel by viewed versions so remote updates discard stale inputs.
    if(doc.operations.some(o=>!lastLocalOperations.current.has(o.id))){setGroupAngle(0);rotationPivot.current=undefined;}
  },[doc.operations]);
  function cancelGesture(){gesture.current?.straight?.cancel();setGeometryRevision(v=>v+1);setMoveHover(false);const old=gesture.current?.beforeSelection;if(old)setSelected(old.filter(id=>editableObjects(currentDoc.current).some(o=>o.id===id)));gesture.current=undefined;liveDraft.current=undefined;setDraft(undefined);setErased(new Set());setHover(undefined);setMarquee(undefined);setGroupDraft(new Map());groupPreview.current=new Map();}
  useEffect(()=>{cancelGesture();},[tool,selectionMode]);
  useEffect(()=>{const cancel=()=>{placementEpoch.current++;cancelGesture();setPlacing(undefined);setLanding(undefined);setImageDragging(false);};window.addEventListener('blur',cancel);return ()=>{placementEpoch.current++;window.removeEventListener('blur',cancel);gesture.current?.straight?.cancel();clearTimeout(scrollTimer.current);};},[]);
  function clearSelection(){cancelGesture();setSelected([]);}
  async function deleteSelection(){const snapshot=selection;await commitGroup(selectionChanges(snapshot,()=>null));setSelected([]);}
  function fit(){
    const root=scroll.current;if(!root||!view||loading||gesture.current||textRef.current||imageDragging)return;
    const cover=narrow&&panelPresent?Math.min(root.clientWidth,panelContent.current?.getBoundingClientRect().width||0):0;
    const next={...readerSpace(root.clientWidth,root.clientHeight,cover),cover};
    if(!next.width||!next.height)return;
    setSpace(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    if(zoomMode==='manual'){requestAnimationFrame(()=>restoreRef.current());return;}
    const scale=fitZoom(zoomMode,view.width/(view.scale||zoom),view.height/(view.scale||zoom),next.width,next.height);
    if(scale&&Math.abs(scale-zoom)>Math.max(.000001,zoom*.00001)){restoring.current=true;setZoom(scale);}
    else requestAnimationFrame(()=>restoreRef.current());
  }
  const restoreRef=useRef(restore);restoreRef.current=restore;
  const fitRef=useRef(fit);fitRef.current=fit;
  useEffect(()=>{const root=scroll.current;if(!root)return;let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{fitRef.current();});});observer.observe(root);return ()=>{observer.disconnect();cancelAnimationFrame(frame);};},[]);
  useEffect(()=>{if(!gesture.current&&!textRef.current&&deferredView.current){const action=deferredView.current;deferredView.current=undefined;action();return;}fitRef.current();},[geometryRevision,zoomMode,page,views,loading,panelVisible,panelPresent,narrow,imageDragging,textDraft?.id]);
  function scrolled(){if(restoring.current)return;clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(remember,zoomMode==='page'?180:60);}
  async function commitGroup(changes:EditRequest[],assets?:NoteDocument['assets'],gallery?:GalleryChange[]){
    if(!changes.length&&!assets&&!gallery?.length)return;if(workingRef.current)throw new Error('正在儲存，請稍候。');
    changes=changes.map(c=>c.value&&c.value.kind!=='document'&&!heads(currentDoc.current,c.id).length?{...c,value:{...c.value,layer:nextLayer(currentDoc.current,c.value.page)}}:c);
    workingRef.current=true;setWorking(true);
    try{const entries=changes.map(c=>({id:c.id,before:heads(currentDoc.current,c.id)[0]?.value??null,after:c.value,head:''}));const result=await onEditBatch(changes,assets,gallery);currentDoc.current=result;lastLocalOperations.current=new Set(result.operations.map(o=>o.id));
      if(entries.length)setUndo(h=>[...h,entries.map(e=>({...e,head:heads(result,e.id)[0].id}))]);if(entries.length)setRedo([]);
    }finally{workingRef.current=false;setWorking(false);}
  }
  async function commit(id:string,value:Value,assets?:NoteDocument['assets']) {
    const old=heads(currentDoc.current,id);if(old.length>1)throw new Error('此物件出現衝突，請先處理衝突。');
    await commitGroup([{id,value,expected:old.map(h=>h.id)}],assets);
  }
  async function history(reverse:boolean) {
    const list=reverse?redo:undo,entry=list.at(-1);if(!entry||workingRef.current)return;
    for(const e of entry){const now=heads(currentDoc.current,e.id);if(now.length!==1||now[0].id!==e.head)throw new Error('此物件已收到其他修改，為保留新版本，不能套用這次復原。');}
    workingRef.current=true;setWorking(true);
    try{const result=await onEditBatch(entry.map(e=>({id:e.id,value:reverse?e.after:e.before,expected:[e.head]})));currentDoc.current=result;lastLocalOperations.current=new Set(result.operations.map(o=>o.id));
      setGroupAngle(0);rotationPivot.current=undefined;const next=entry.map(e=>({...e,head:heads(result,e.id)[0].id}));const update=(v:History[][])=>v.map(group=>group.map(e=>({...e,head:next.find(n=>n.id===e.id)?.head||e.head})));
      if(reverse){setRedo(v=>update(v.slice(0,-1)));setUndo(v=>[...update(v),next]);}else{setUndo(v=>update(v.slice(0,-1)));setRedo(v=>[...update(v),next]);}
    }finally{workingRef.current=false;setWorking(false);}
  }
  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    const target=e.target instanceof Element?e.target:null;
    const action=editorKeyAction(e.key,{modal:!!document.querySelector('dialog[open][data-modal="true"]'),control:!!target?.closest('button,a,summary,[role="button"]'),editable:!!target?.closest('input,textarea,select,[contenteditable="true"]'),command:e.ctrlKey||e.metaKey,shift:e.shiftKey});
    if(!action||action==='delete'&&target?.closest('.context-panel')||action==='edit-text'&&(tool!=='select'||!selectedText(currentDoc.current,selection)))return;
    e.preventDefault();
    if(action==='undo'||action==='redo')confirmAction(()=>void history(action==='redo').catch(onError));
    if(action==='edit-text'&&tool==='select')confirmAction(()=>editSelectedText(selection));
    if(action==='delete'&&selected.length)confirmAction(()=>void deleteSelection().catch(onError));
    if(action==='escape'){placementEpoch.current++;setPlacing(undefined);setLanding(undefined);setImageDragging(false);if(gesture.current)cancelGesture();else confirmAction(clearSelection);}
  };window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);});
  function point(e:React.PointerEvent<SVGSVGElement>,number:number):Point {const r=(gesture.current?.page===number?gesture.current.rect:undefined)||e.currentTarget.getBoundingClientRect(),v=views[number-1];return inverse(v.matrix,{x:(e.clientX-r.left)*v.width/r.width,y:(e.clientY-r.top)*v.height/r.height});}
  function sweep(start:Point,end:Point){const g=gesture.current;if(!g?.erasing)return;
    for(const node of scroll.current!.querySelectorAll<HTMLElement>('.paper')){const n=Number(node.dataset.page),v=views[n-1],r=node.getBoundingClientRect();const clipped=clipSegment({x:start.x-r.left,y:start.y-r.top},{x:end.x-r.left,y:end.y-r.top},r.width,r.height);if(!clipped)continue;
      const [a,b]=clipped.map(p=>inverse(v.matrix,{x:p.x*v.width/r.width,y:p.y*v.height/r.height}));
      for(const obj of objects(currentDoc.current)){for(const version of obj.versions){const value=version.value;if(!value||value.kind==='document'||value.page!==n||!sweptHit(value,a,b,eraserSize/2))continue;
        if(obj.versions.length>1){setSearchStatus('範圍內有衝突筆跡；請先到衝突管理處理，橡皮擦會略過。');continue;}
        if(!g.erasing.has(obj.id))g.erasing.set(obj.id,{id:obj.id,before:value,after:null,head:version.id});
      }}
    }setErased(new Set(g.erasing.keys()));
  }
  function down(e:React.PointerEvent<SVGSVGElement>,number:number) {
    if((tool==='read'&&!placing)||loading||workingRef.current||e.button!==0||gesture.current)return;
    if((manipulating||tool==='text'||!!placing)&&propertiesDirty){e.preventDefault();confirmAction(()=>setSearchStatus('已捨棄未套用屬性，請重新選取或拖曳物件。'));return;}
    if(textRef.current){const p=point(e,number);e.preventDefault();void finishText().then(ok=>{if(ok&&tool==='text')openText(undefined,number,p);});return;}
    e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);const p=point(e,number);setPage(number);
    if(placing){if(propertiesDirty){confirmAction(()=>void placeImage(placing,number,p).catch(onError));return;}void placeImage(placing,number,p).catch(onError);return;}
    const clickTarget=[...effective].reverse().find(o=>o.value.page===number&&hitAnnotation(o.value,p,0)),id=clickTarget?.id;
    const handle=(e.target as Element).closest('[data-rotate]')?.getAttribute('data-rotate');
    const resizeHandle=(e.target as Element).closest('[data-resize]')?.getAttribute('data-resize') as Handle|undefined;
    if(manipulating){
      const base={start:p,pointer:e.pointerId,page:number,clientStart:{x:e.clientX,y:e.clientY},beforeSelection:[...selected],clickTarget,shift:e.shiftKey};
      const group=selection.filter(o=>o.value.page===number);
      if((handle||resizeHandle)&&group.length)gesture.current={...base,group,rotate:!!handle,resize:resizeHandle,frame:gestureFrame(group,!!handle)};
      else if(clickTarget&&group.some(o=>o.id===clickTarget.id))gesture.current={...base,group};
      else gesture.current={...base,selecting:selectionMode,selectionPoints:[p]};
    }
    else if(tool==='erase'){const client={x:e.clientX,y:e.clientY};gesture.current={start:p,pointer:e.pointerId,page:number,lastClient:client,erasing:new Map()};sweep(client,client);}
    else if(tool==='text'){openText(effective.find(o=>o.id===id)?.value.kind==='text'?id:undefined,number,p);}
    else if(tool==='pen'||tool==='highlight'){const g={start:p,points:[p],pointer:e.pointerId,page:number,straight:undefined as StraightStroke|undefined};gesture.current=g;g.straight=new StraightStroke(()=>{if(gesture.current!==g||!liveDraft.current)return;g.points=[g.start,g.points.at(-1)!];liveDraft.current=strokeDraft(liveDraft.current,g.points);setDraft(liveDraft.current);});g.straight.move(transform(views[number-1].matrix,p));liveDraft.current={kind:tool==='highlight'?'highlight':'pen',page:number,x:p.x,y:p.y,width:1,height:1,color,weight,opacity:tool==='highlight'?0.35:1,points:[{x:0,y:0}]};setDraft(liveDraft.current);}
    if(gesture.current)gesture.current.rect=e.currentTarget.getBoundingClientRect();
  }
  function move(e:React.PointerEvent<SVGSVGElement>,number:number) {
    if(manipulating&&!gesture.current)setMoveHover(selection.some(o=>o.value.page===number&&hitAnnotation(o.value,point(e,number),0)));
    if(placing&&!gesture.current){const target=dropPoint({x:e.clientX,y:e.clientY});setLanding(target?{...target,hash:placing}:undefined);}
    if(tool==='erase'){const node=[...scroll.current!.querySelectorAll<HTMLElement>('.paper')].find(n=>{const r=n.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});if(node){const n=Number(node.dataset.page),r=node.getBoundingClientRect(),v=views[n-1];setHover({page:n,point:inverse(v.matrix,{x:(e.clientX-r.left)*v.width/r.width,y:(e.clientY-r.top)*v.height/r.height})});}else setHover(undefined);}
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
    if(g.erasing){const client={x:e.clientX,y:e.clientY};sweep(g.lastClient!,client);g.lastClient=client;return;}
    let p=point(e,number);const v=views[g.page-1];if(!g.group)p={x:Math.max(0,Math.min(v.bounds[2]-v.bounds[0],p.x)),y:Math.max(0,Math.min(v.bounds[3]-v.bounds[1],p.y))};
    if(g.selecting){
      g.dragged ||= Math.hypot(e.clientX-g.clientStart!.x,e.clientY-g.clientStart!.y)>=5;
      if(g.selecting==='box')g.selectionPoints=[g.start,{x:p.x,y:g.start.y},p,{x:g.start.x,y:p.y}];
      else {const ps=g.selectionPoints!,last=ps.at(-1)!;if(Math.hypot(p.x-last.x,p.y-last.y)*zoom>=2){ps.push(p);if(ps.length>512)g.selectionPoints=ps.filter((_,i)=>i%2===0||i===ps.length-1);}}
      if(g.dragged)setMarquee({page:g.page,points:g.selectionPoints!});return;
    }
    if(g.group){if(Math.hypot(e.clientX-g.clientStart!.x,e.clientY-g.clientStart!.y)>=5)g.dragged=true;
      if(g.dragged){let values:Annotation[];
        if(g.rotate){const f=g.frame!,c={x:f.x+f.width/2,y:f.y+f.height/2};g.delta=(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(g.start.y-c.y,g.start.x-c.x))*180/Math.PI;values=rotateGroup(g.group,g.delta,f);}
        else if(g.resize)values=resizeGroup(g.group,g.resize,p,g.frame);
        else values=g.group.map(o=>({...o.value,x:o.value.x+p.x-g.start.x,y:o.value.y+p.y-g.start.y}));
        groupPreview.current=new Map(g.group.map((o,i)=>[o.id,values[i]]));setGroupDraft(groupPreview.current);
      }return;
    }
    if(g.points){g.points=g.straight?.straight?[g.start,p]:[...g.points,p];g.straight?.move(transform(v.matrix,p));liveDraft.current=strokeDraft(liveDraft.current!,g.points);}
    setDraft(liveDraft.current);
  }
  function applyClick(g:NonNullable<typeof gesture.current>){
    setSelected(clickSelection(currentDoc.current,g.beforeSelection||[],g.clickTarget,!!g.shift));
  }
  function up(e:React.PointerEvent<SVGSVGElement>,number:number) {
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;move(e,number);g.straight?.cancel();setGeometryRevision(v=>v+1);
    if(g.selecting){
      const region=makeRegion(g.selectionPoints||[]);
      if(g.dragged&&validRegion(region)){const result=selectRegion(currentDoc.current,g.page,region);setSelected(result.selected.map(o=>o.id));if(result.skipped)setSearchStatus(`略過 ${result.skipped} 個衝突物件，請先到衝突管理處理。`);}
      else if(!g.dragged)applyClick(g);else setSelected([]);
      gesture.current=undefined;setMarquee(undefined);return;
    }
    if(g.group){if(!g.dragged&&!g.rotate&&!g.resize){gesture.current=undefined;if(!g.shift&&g.beforeSelection?.length===1&&g.clickTarget?.id===g.beforeSelection[0]&&g.clickTarget.value.kind==='text'&&tool==='select')confirmAction(()=>editSelectedText([g.clickTarget!],point(e,number)));else applyClick(g);return;}const changes=g.group.map(o=>({id:o.id,value:groupPreview.current.get(o.id)||o.value,expected:[o.head]}));gesture.current=undefined;
      void (g.dragged?commitGroup(changes).then(()=>{if(g.rotate)setGroupAngle(a=>a+(g.delta||0));else if(rotationPivot.current){const old=g.group![0].value,next=changes[0].value,factor=next.width/old.width;rotationPivot.current={x:next.x+next.width/2+(rotationPivot.current.x-old.x-old.width/2)*factor,y:next.y+next.height/2+(rotationPivot.current.y-old.y-old.height/2)*factor};}}):Promise.resolve()).catch(onError).finally(()=>{setGroupDraft(new Map());groupPreview.current=new Map();});return;
    }
    const changes=g.erasing?[...g.erasing.values()].map(h=>({id:h.id,value:null,expected:[h.head]})):undefined;
    const value=liveDraft.current;gesture.current=undefined;liveDraft.current=undefined;
    const save=changes?commitGroup(changes):value?commit(uid(),value):Promise.resolve();
    void save.catch(onError).finally(()=>{setDraft(undefined);setErased(new Set());});
  }
  useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(textRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return ()=>window.removeEventListener('beforeunload',leave);},[]);
  function updateText(next:TextDraft|undefined){textRef.current=next;setTextDraft(next);if(!next)setGeometryRevision(v=>v+1);}
  async function finishText():Promise<boolean>{
    if(composing.current)return false;if(textSaving.current)return textSaving.current;const d=textRef.current;if(!d)return true;
    if(d.expected.length&&!textChanged(d.originalText,d.value)){updateText(undefined);setSelected([d.id]);return true;}
    if(!d.expected.length&&!d.value.text?.trim()){updateText(undefined);return true;}
    const task=commitGroup([{id:d.id,value:d.value,expected:d.expected}]).then(()=>{updateText(undefined);setSelected([d.id]);return true;}).catch(e=>{updateText({...textRef.current!,error:'文字尚未保存：'+String(e)+'。可複製草稿後取消並重開最新版本。'});return false;});
    textSaving.current=task;try{return await task;}finally{textSaving.current=undefined;}
  }
  function openText(id:string|undefined,number:number,p:Point){
    const object=[...editableObjects(currentDoc.current)].sort(compareLayers).reverse().find(o=>o.value.kind==='text'&&o.value.page===number&&(id?o.id===id:hitAnnotation(o.value,p,0)));
    if(id&&!object){setSearchStatus('文字版本已改變，請重新選取。');return;}
    if(!object&&objects(currentDoc.current).some(o=>o.versions.length>1&&o.versions.some(h=>h.value?.kind==='text'&&h.value.page===number&&hitAnnotation(h.value,p)))){setSearchStatus('文字有衝突，請先處理版本。');return;}
    const value=object?.value||uprightTextAt(p,views[number-1].matrix,{kind:'text',page:number,x:p.x,y:p.y,width:240,height:140,writingMode:'horizontal-tb',fontSize:18,text:'',color,weight:1,opacity:1});
    setSelected(object?[object.id]:[]);setPanel('properties');updateText({id:object?.id||uid(),expected:object?[object.head]:[],value,originalText:object?.value.text||''});
  }
  function editSelectedText(snapshot:SelectedObject[],p?:Point){
    if(selected.length!==1||selected[0]!==snapshot[0]?.id)return;
    const object=selectedText(currentDoc.current,snapshot);if(!object)return;
    let caret:number|undefined;
    if(p){const context=document.createElement('canvas').getContext('2d');if(context){context.font=(object.value.fontSize||18)+'px '+FONT;caret=textCaret(object.value,inverse(annotationMatrix(object.value),p),text=>context.measureText(text).width);}}
    setSelected([object.id]);setPanel('properties');updateText({id:object.id,expected:[object.head],value:object.value,originalText:object.value.text||'',caret});
  }
  async function insertImage(file:File){
    const observed=currentDoc.current;
    if(!['image/png','image/jpeg'].includes(file.type))throw new Error('圖片支援 PNG／JPG。');if(file.size>30*1024*1024)throw new Error('圖片上限為 30 MB。');
    const bitmap=await createImageBitmap(file);bitmap.close();const asset=await addAsset(new Uint8Array(await file.arrayBuffer()),file.type);
    await commitGroup([],{[asset.hash]:asset},[galleryChange(observed,asset.hash,true)]);
  }
  async function changeMembership(hash:string,present:boolean){
    if(!present){placementEpoch.current++;setPlacing(undefined);setLanding(undefined);setImageDragging(false);}
    await commitGroup([],undefined,[galleryChange(currentDoc.current,hash,present)]);
  }
  function openCutout(hash:string,object?:SelectedObject){confirmAction(()=>{cancelGesture();placementEpoch.current++;setPlacing(undefined);setLanding(undefined);setImageDragging(false);setCutout({hash,object});});}
  async function applyCutout(bytes:Uint8Array){
    const target=cutout;if(!target)return;const observed=currentDoc.current,asset=await addAsset(bytes,'image/png');
    const changes:EditRequest[]=target.object?[{id:target.object.id,value:{...target.object.value,asset:asset.hash},expected:[target.object.head]}]:[];
    await commitGroup(changes,{[asset.hash]:asset},[galleryChange(observed,asset.hash,true)]);
  }
  function dropPoint(client:Point){for(const node of scroll.current?.querySelectorAll<HTMLElement>('.paper')||[]){const r=node.getBoundingClientRect();if(client.x>=r.left&&client.x<=r.right&&client.y>=r.top&&client.y<=r.bottom){const page=Number(node.dataset.page),v=views[page-1];return {page,point:inverse(v.matrix,{x:(client.x-r.left)*v.width/r.width,y:(client.y-r.top)*v.height/r.height})};}}}
  async function placeImage(hash:string,number:number,p:Point){
    const epoch=placementEpoch.current,asset=currentDoc.current.assets[hash];if(!asset)return;const bitmap=await createImageBitmap(new Blob([new Uint8Array(asset.bytes)],{type:asset.mime})),ratio=bitmap.height/bitmap.width;bitmap.close();if(epoch!==placementEpoch.current)return;
    const width=Math.min(240,(views[number-1].bounds[2]-views[number-1].bounds[0])*.7),id=uid();
    await commit(id,uprightAt(p,views[number-1].matrix,{kind:'image',page:number,x:p.x,y:p.y,width,height:width*ratio,color:'#000000',weight:1,opacity:1,asset:hash}));setPlacing(undefined);setLanding(undefined);setSelected([id]);
  }
  function imageDrag(hash:string,phase:'move'|'up'|'cancel',client:Point){
    draggedImage.current=phase==='move'?hash:undefined;const target=phase==='cancel'?undefined:dropPoint(client);setLanding(target?{...target,hash}:undefined);setImageDragging(phase==='move');

    if(phase==='up'){setLanding(undefined);if(target)confirmAction(()=>void placeImage(hash,target.page,target.point).catch(onError));}if(phase==='cancel'){setPlacing(undefined);setLanding(undefined);}
  }
  useEffect(()=>{const visible=galleryHashes(doc);if(placing&&!visible.includes(placing)||draggedImage.current&&!visible.includes(draggedImage.current)){placementEpoch.current++;draggedImage.current=undefined;setPlacing(undefined);setLanding(undefined);setImageDragging(false);}},[doc.galleryOps,doc.gallery,placing]);
  function changeTool(next:Tool){confirmAction(()=>{const apply=()=>{placementEpoch.current++;cancelGesture();setPlacing(undefined);setLanding(undefined);setImageDragging(false);setTool(next);setPanel(next==='image'?'images':'properties');if(next==='image')setPanelOpen(true);};if(textRef.current)void finishText().then(ok=>{if(ok)apply();});else apply();});}
  async function changeLayer(action:LayerAction){await commitGroup(layerChanges(currentDoc.current,selection,action));}
  function gestureFrame(group:SelectedObject[],rotating:boolean){const f=selectionFrame(group);if(!rotating||group.length===1)return f;rotationPivot.current ||= {x:f.x+f.width/2,y:f.y+f.height/2};return {...f,x:rotationPivot.current.x-f.width/2,y:rotationPivot.current.y-f.height/2};}
  async function turnSelection(angle:number){if(!selection.length||workingRef.current||!Number.isFinite(angle))return;angle=((angle%360)+360)%360;const delta=selection.length===1?angle-visibleAngle(selection[0].value,views[selection[0].value.page-1].matrix):angle-groupAngle;if(Math.abs(delta)<.00001)return;const values=rotateGroup(selection,selection.length===1?angle-visibleAngle(selection[0].value,views[selection[0].value.page-1].matrix):angle-groupAngle,gestureFrame(selection,true));await commitGroup(selection.map((o,i)=>({id:o.id,value:values[i],expected:[o.head]})));setGroupAngle(angle);}
  return <section className="editor">
    <EditorToolbar name={nameOf(doc)} status={status} tool={tool} onTool={changeTool} color={color} onColor={setColor} weight={weight} onWeight={setWeight} eraserSize={eraserSize} onEraser={setEraserSize}
      onBack={()=>{if(textRef.current)void finishText().then(ok=>{if(ok)confirmAction(onBack);});else confirmAction(onBack);}} onExport={kind=>{if(textRef.current)void finishText().then(ok=>{if(ok)onExport(kind);});else onExport(kind);}} onImage={()=>changeTool('image')} ready={!!view&&ready} working={working} canUndo={!!undo.length&&!textDraft} canRedo={!!redo.length&&!textDraft}
      onUndo={()=>confirmAction(()=>void history(false).catch(onError))} onRedo={()=>confirmAction(()=>void history(true).catch(onError))} selectionMode={selectionMode} onSelectionMode={setSelectionMode}
      dirty={propertiesDirty||!!textDraft} page={page} pages={doc.pageCount} onPage={goPage} zoom={zoom}
      zoomMode={zoomMode} onZoom={n=>changeView(()=>{setZoomMode('manual');setZoom(n);})} onFit={()=>changeView(()=>setZoomMode('width'))} onFitPage={()=>changeView(()=>setZoomMode('page'))} onRotate={()=>changeView(()=>setRotation(v=>(v+90)%360))}
      layout={layout} onLayout={value=>changeView(()=>setLayout(value))} query={query} onQuery={setQuery} onSearch={()=>search.step(1)} onPrevious={()=>search.step(-1)} searchSummary={search.summary}/>
    {searchStatus&&<div className="search-status" role="status">{searchStatus}<button onClick={()=>setSearchStatus('')}>關閉</button></div>}
    <div data-panel-open={panelVisible} className={'editor-body'+(!panelPresent?' panel-collapsed':'')}>    <aside className={'context-panel properties'+(narrow?' narrow':'')+(panelPresent?' expanded':'')+(imageDragging?' dragging':'')} aria-label={panel==='images'?'圖片庫':'物件屬性'}>

      <div id="context-content" ref={panelContent} className="context-content" hidden={!panelPresent} inert={!panelVisible}><header><h2>{panel==='images'?'圖片':'物件屬性'}</h2>{panel==='images'&&<button onClick={()=>changeTool('select')}>屬性</button>}</header>
      <div hidden={panel!=='images'}><ImageGallery doc={doc} busy={working} onImport={insertImage} onRemove={hash=>changeMembership(hash,false)} onCutout={hash=>openCutout(hash)} onPick={hash=>{confirmAction(()=>{setPlacing(hash);});}} onDrag={imageDrag}/></div>
      <div hidden={panel!=='properties'}>{textDraft?<><p>正在頁面編輯文字</p><button data-text-action disabled={working} onClick={()=>void finishText()}>完成文字</button><button data-text-action disabled={working} onClick={()=>updateText(undefined)}>取消編輯</button></>:<>
      {!!selection.length&&<div className="angle-control">{gesture.current?.rotate&&groupDraft.size>0&&<output aria-label="旋轉預覽">{Math.round((selection.length===1?visibleAngle(groupDraft.values().next().value!,views[selection[0].value.page-1].matrix):groupAngle+(gesture.current.delta||0))*10)/10}°</output>}<label>{selection.length>1?'相對選取起點角度':'旋轉角度'}<input disabled={working||propertiesDirty} aria-label="物件旋轉角度" type="text" inputMode="decimal" key={selectionKey+groupAngle} defaultValue={Math.round((selection.length===1&&views[selection[0].value.page-1]?visibleAngle(selection[0].value,views[selection[0].value.page-1].matrix):groupAngle)*10)/10} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n))void turnSelection(n).catch(onError);}}/></label><button disabled={working||propertiesDirty} onClick={()=>void turnSelection(0).catch(onError)}>{selection.length>1?'回復群組起始方向':'水平 0°'}</button></div>}
      {!!selection.length&&<div className="layer-actions" role="group" aria-label="物件圖層">{(Object.keys(layerLabels) as LayerAction[]).map(action=><button key={action} disabled={working||!layerChanges(doc,selection,action).length} onClick={()=>confirmAction(()=>void changeLayer(action).catch(onError))}>{layerLabels[action]}</button>)}</div>}
      {selection.length===1&&selection[0].value.kind==='image'&&<button disabled={working} onClick={()=>openCutout(selection[0].value.asset!,selection[0])}>去背此圖片</button>}
      <PropertiesPanel key={selectionKey+':'+panelRevision} selection={selection} working={working} onDirty={setPropertiesDirty} onCommit={changes=>{applyingProperties.current=true;return commitGroup(changes).catch(error=>{applyingProperties.current=false;throw error;});}} onDelete={()=>confirmAction(()=>void deleteSelection().catch(onError))} onError={onError}/></>}
      </div></div>
    </aside>      <button data-panel-toggle className="panel-toggle" aria-label={panelOpen?'收合側面板':'展開側面板'} aria-controls="context-content" aria-expanded={panelOpen} onPointerDown={e=>{if(textRef.current)e.preventDefault();}} onClick={()=>{remember();if(panelContent.current?.contains(document.activeElement))document.querySelector<HTMLButtonElement>('[data-panel-toggle]')?.focus();setPanelOpen(v=>!v);}}>{panelOpen?'‹':'›'}</button><div ref={scroll} className={'page-scroll '+layout} style={{'--reader-pad-x':space.padX+'px','--reader-pad-y':space.padY+'px','--panel-cover':space.cover+'px'} as React.CSSProperties} onScroll={scrolled}><div className="page-stack" style={zoomMode==='page'?{paddingBlock:layout==='vertical'?Math.max(0,(space.height-(view?.height||0))/2):0,paddingLeft:layout==='horizontal'?Math.max(0,(space.width-(view?.width||0))/2)+space.cover:0,paddingRight:layout==='horizontal'?Math.max(0,(space.width-(view?.width||0))/2):0}:undefined}>
      {reader&&views.map((v,i)=>{const n=i+1;return <ReaderPage key={n} reader={reader} number={n} view={v} zoom={zoom} read={tool==='read'&&!placing&&!imageDragging} hits={search.hits.filter(h=>h.page===n)} currentHit={search.currentHit} pinned={gesture.current?.page===n||textDraft?.value.page===n||search.currentHit?.page===n||selection.some(o=>o.value.page===n)}>
        <svg tabIndex={0} className="annotation-layer" aria-label={n===page?'註記畫布':'第 '+n+' 頁註記畫布'} width={v.width} height={v.height} style={{pointerEvents:tool==='read'&&!placing?'none':'auto',touchAction:tool==='read'&&!placing?'auto':'none',cursor:tool==='pen'||tool==='highlight'?'crosshair':tool==='erase'?'none':tool==='text'?'text':manipulating&&moveHover?'move':'default'}} onContextMenu={e=>{if(tool==='pen'||tool==='highlight')e.preventDefault();}} onPointerDown={e=>down(e,n)} onPointerMove={e=>move(e,n)} onPointerUp={e=>up(e,n)} onPointerCancel={cancelGesture} onLostPointerCapture={e=>{if(gesture.current?.pointer===e.pointerId)cancelGesture();}} onPointerLeave={()=>{if(!gesture.current)setHover(undefined);}}>
          <g transform={`matrix(${v.matrix.join(' ')})`}>{effective.filter(o=>o.value.page===n&&!erased.has(o.id)&&o.id!==textDraft?.id).map(({id,value})=>{const a=groupDraft.get(id)||value;return <g key={id} data-object={id}><AnnotationShape value={a} doc={doc}/></g>;})}{draft&&draft.page===n&&<AnnotationShape value={draft} doc={doc}/>} {manipulating&&marquee?.page===n&&<path className="selection-marquee" d={marquee.points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')+' Z'} fill="#1b776922" fillRule="evenodd" stroke="#1b7769" strokeWidth={1/zoom} strokeDasharray={`${5/zoom} ${3/zoom}`} pointerEvents="none"/>}
            {manipulating&&!textDraft&&<SelectionControls selection={selection.filter(o=>o.value.page===n).map(o=>({...o,value:groupDraft.get(o.id)||o.value}))} zoom={zoom} matrix={v.matrix}/>}
            {landing?.page===n&&<ImageDropPreview doc={doc} hash={landing.hash} page={n} point={landing.point} matrix={v.matrix} width={Math.min(240,(v.bounds[2]-v.bounds[0])*.7)}/>}
 {tool==='erase'&&hover?.page===n&&<circle className="eraser-cursor" cx={hover.point.x} cy={hover.point.y} r={eraserSize/2} fill="#ffffff33" stroke="#245cba" strokeWidth={1/zoom} pointerEvents="none"/>}</g>
        </svg>
        {textDraft?.value.page===n&&<InlineText draft={textDraft} matrix={v.matrix} busy={working} onComposition={value=>{composing.current=value;}} onChange={text=>updateText({...textRef.current!,value:{...textRef.current!.value,text},error:undefined})} onFinish={()=>void finishText()} onCancel={()=>{if(!workingRef.current)updateText(undefined);}}/>}
      </ReaderPage>;})}{loading&&<p role="status">正在準備連續頁面…</p>}
    </div></div>

    </div><footer className="reader-footer"><span>{tool==='read'?'閱讀模式 · 可捲動、縮放與選取文字':'編輯模式 · 單指／滑鼠操作，切換「閱讀」即可捲動'}</span><span>{effective.filter(o=>o.value.page===page).length} 個物件 · 第 {page} 頁</span></footer>
    {placing&&<div className="placement-notice" role="status">點頁面放置圖片<button onClick={()=>{placementEpoch.current++;setPlacing(undefined);setLanding(undefined);}}>取消放置</button></div>}
    {textDraft?.error&&<div className="text-rescue" role="alert"><p>{textDraft.error}</p><textarea aria-label="未保存文字救援" readOnly value={textDraft.value.text}/><button data-text-action onClick={()=>void finishText()}>重試保存</button><button data-text-action onClick={()=>updateText(undefined)}>取消編輯</button></div>}
    {cutout&&doc.assets[cutout.hash]&&<ImageCutout asset={doc.assets[cutout.hash]} instance={!!cutout.object} onApply={applyCutout} onClose={()=>setCutout(undefined)}/>}
    {pendingAction&&<Dialog title="屬性尚未套用" onClose={()=>setPendingAction(undefined)}><p>此操作會捨棄尚未套用的屬性。你可以返回屬性面板套用，或明確捨棄後繼續。</p><div className="modal-actions"><Button onClick={()=>{setPendingAction(undefined);setPanelOpen(true);}}>返回屬性</Button><Button variant="danger" onClick={()=>{const action=pendingAction;setPendingAction(undefined);setPropertiesDirty(false);setPanelRevision(n=>n+1);action();}}>捨棄暫存並繼續</Button></div></Dialog>}

  </section>;
}
