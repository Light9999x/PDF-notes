import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fitZoom, readerSpace, pageVisibilityScore } from '../src/core/reader-fit';
import { StraightStroke, nearStraight, strokeDraft } from '../src/core/straight-stroke';
import { selectedText, textCaret, textChanged } from '../src/core/text-edit';
import { editorKeyAction } from '../src/core/ui-policy';
import { ancestry, directFolders, documentInScope, previousLocation, recoverLocation, scopeDestination } from '../src/core/library-browser';
import { emptyLibrary, libraryEdit, folderKey, parentKey, memberKey, mergeLibrary } from '../src/core/library';
import { createBlank } from '../src/core/blank';
import { edit, heads, merge, type Annotation } from '../src/core/model';
import { editableObjects } from '../src/core/selection';
import { editBatch } from '../src/core/batch';
import { pack, unpack } from '../src/core/archive';
import { LibraryPanel } from '../src/components/LibraryPanel';

// SSR has no browser; drag event handlers are not exercised by this rendering check.
vi.mock('../src/core/drag',()=>({dragged:()=>undefined,startDrag:()=>{},endDrag:()=>{},suppressDragClick:()=>false}));

const text:Annotation={kind:'text',page:1,x:10,y:20,width:120,height:100,color:'#123456',weight:1,opacity:1,fontSize:10,text:'中文 ABC',angle:37};
const point=(x:number,y=0)=>({x,y});
afterEach(()=>vi.useRealTimers());

describe('single selected text identity and keyboard isolation',()=>{
  it('edits the selected ID even when another text overlaps, and rejects multi / nontext / stale heads',async()=>{
    let doc=edit(edit(await createBlank('v007','portrait','A'),'first',text,'A'),'overlap',text,'A');
    const selected=editableObjects(doc).filter(o=>o.id==='first');
    expect(selectedText(doc,selected)?.id).toBe('first');expect(selectedText(doc,editableObjects(doc))).toBeUndefined();
    doc=edit(doc,'first',{...text,text:'remote'},'B');expect(selectedText(doc,selected)).toBeUndefined();
    doc=edit(doc,'pen',{...text,kind:'pen',points:[point(0),point(50)]},'B');expect(selectedText(doc,editableObjects(doc).filter(o=>o.id==='pen'))).toBeUndefined();
  });
  it('one content change preserves geometry/identity and guarded batch rejects a remote branch',async()=>{
    const doc=edit(await createBlank('edit','portrait','A'),'text',text,'A'),head=heads(doc,'text')[0].id;
    expect(textChanged(text.text,{...text})).toBe(false);expect(textChanged('',{...text,text:undefined})).toBe(false);
    const next={...text,text:'新內容\n第二行'},change={id:'text',value:next,expected:[head]},result=editBatch(doc,[change],'A');
    expect(result.operations).toHaveLength(doc.operations.length+1);expect(heads(result,'text')[0].value).toEqual(next);
    expect(()=>editBatch(merge(result,edit(doc,'text',{...text,text:'B'},'B')),[change],'A')).toThrow();
    expect(change.value.text).toBe('新內容\n第二行');expect(doc.operations.at(-1)?.value).toEqual(text);
  });
  it.each(['Enter','F2'])('%s opens only from the canvas and never intercepts form/modal controls',key=>{
    const options={modal:false,control:false,editable:false,command:false,shift:false};expect(editorKeyAction(key,options)).toBe('edit-text');
    for(const field of ['modal','control','editable','command'])expect(editorKeyAction(key,{...options,[field]:true})).toBeUndefined();
  });
  it('maps wrapped Chinese, blank lines and UTF16 caret offsets without modifying text',()=>{
    const measure=(s:string)=>[...s].length*10;
    expect(textCaret({...text,text:'中文AB',width:20},point(11,16),measure)).toBe(3);
    expect(textCaret({...text,text:'AB\n\nCD'},point(0,16),measure)).toBe(3);
    expect(textCaret({...text,text:'😀AB'},point(11,0),measure)).toBe(2);
    expect(textCaret({...text,text:'中文\nAB',writingMode:'vertical-rl',height:27},point(92,0),measure)).toBe(3);
  });
});

describe('fit modes use rotated current page and unobscured reader dimensions',()=>{
  it.each([0,90,180,270])('fits mixed CropBox pages at native rotation %i including extreme pages',async rotation=>{
    const pdf=await PDFDocument.create();for(const [w,h] of [[600,800],[1200,400],[8000,12000]]){const page=pdf.addPage([w+100,h+100]);page.setCropBox(30,40,w,h);page.setRotation(degrees(rotation));}
    const reader=await getDocument({data:await pdf.save()}).promise;
    try{for(let n=1;n<=3;n++){const viewport=(await reader.getPage(n)).getViewport({scale:1}),space=readerSpace(800,350,240),zoom=fitZoom('page',viewport.width,viewport.height,space.width,space.height)!;
      expect(viewport.width*zoom).toBeLessThanOrEqual(space.width+.00001);expect(viewport.height*zoom).toBeLessThanOrEqual(space.height+.00001);expect(zoom).toBeGreaterThan(0);if(n===3)expect(zoom).toBeLessThan(.25);
    }}finally{await reader.loadingTask.destroy();}
  });
  it('center scoring keeps a fitted small page active beside a much larger page',()=>{
    const viewport={left:0,top:0,width:800,height:600},current={left:390,top:200,width:20,height:200},next={left:0,top:420,width:800,height:3000};
    expect(pageVisibilityScore(current,viewport,'vertical','page')).toBeGreaterThan(pageVisibilityScore(next,viewport,'vertical','page'));expect(pageVisibilityScore(next,viewport,'vertical','manual')).toBeGreaterThan(pageVisibilityScore(current,viewport,'vertical','manual'));
  });
  it('width mode ignores valid height changes; page mode reacts to height/overlay/panel width',()=>{
    expect(fitZoom('width',600,800,720,200)).toBe(fitZoom('width',600,800,720,700));
    expect(fitZoom('page',600,800,720,200)).toBe(.25);
    const before=readerSpace(600,800,240),after=readerSpace(600,800);expect(before.width).toBeLessThan(after.width);
    expect(fitZoom('page',600,800,before.width,before.height)).toBeLessThan(fitZoom('page',600,800,after.width,after.height)!);
  });
  it.each([0,-1,NaN,Infinity])('waits instead of persisting invalid dimension %s',value=>{
    for(const index of [0,1,2,3]){const sizes=[600,800,500,400];sizes[index]=value;expect(fitZoom('page',...sizes as [number,number,number,number])).toBeUndefined();}
  });
});

describe('stroke endpoint dwell and cancellation',()=>{
  it('triggers at 1000 ms without another pointermove, with a fixed jitter anchor',()=>{
    vi.useFakeTimers();const done=vi.fn(),stroke=new StraightStroke(done);stroke.move(point(0));stroke.move(point(100));
    vi.advanceTimersByTime(700);stroke.move(point(102,1));vi.advanceTimersByTime(299);expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);expect(done).toHaveBeenCalledOnce();expect(stroke.straight).toBe(true);stroke.move(point(30,200));vi.advanceTimersByTime(1000);expect(done).toHaveBeenCalledOnce();
  });
  it('starts a timer at exactly the minimum chord even if last sample was within jitter radius',()=>{
    vi.useFakeTimers();const done=vi.fn(),stroke=new StraightStroke(done);for(let x=0;x<=20;x++)stroke.move(point(x));vi.advanceTimersByTime(1000);expect(done).toHaveBeenCalledOnce();
  });
  it('does not count total time drawing or allow small steps to drift past a fixed dwell anchor',()=>{
    vi.useFakeTimers();const done=vi.fn(),stroke=new StraightStroke(done);stroke.move(point(0));stroke.move(point(40));
    for(let x=41;x<100;x++){vi.advanceTimersByTime(180);stroke.move(point(x));}expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);expect(done).toHaveBeenCalledOnce();
  });
  it('cancellation invalidates an old timer before the next gesture',()=>{
    vi.useFakeTimers();const done=vi.fn(),stroke=new StraightStroke(done);stroke.move(point(0));stroke.move(point(50));vi.advanceTimersByTime(999);stroke.cancel();vi.advanceTimersByTime(1000);expect(done).not.toHaveBeenCalled();expect(stroke.straight).toBe(false);
    const next=new StraightStroke(done);next.move(point(0));next.move(point(60));vi.advanceTimersByTime(1000);next.cancel();expect(done).toHaveBeenCalledOnce();
  });
  it.each([
    [point(0),point(19)],
    [point(0),point(50,20),point(100)],
    [point(0),point(100),point(40),point(120)],
    [point(0),point(100),point(100,100),point(0,100),point(0)],
  ])('rejects tiny strokes, curves, reversals and loops: %j',(...points)=>{expect(nearStraight(points)).toBe(false);});
  it.each(['pen','highlight'] as const)('%s keeps its style and final free endpoint as one ordinary persisted object',async kind=>{
    const base={...text,kind,color:'#00aaff',weight:37.5,opacity:kind==='highlight'?.35:1},points=[point(150,70),point(20,230)],value=strokeDraft(base,points),doc=await createBlank('line','portrait','A');
    expect(value.points).toHaveLength(2);expect(value.points!.map(p=>point(p.x+value.x,p.y+value.y))).toEqual(points);expect(value).toMatchObject({kind,color:base.color,weight:37.5,opacity:base.opacity});
    const saved=editBatch(doc,[{id:'line',value,expected:[]}],'A'),restored=await unpack(pack(saved));expect(restored.operations).toHaveLength(doc.operations.length+1);expect(heads(restored,'line')[0].value).toEqual(value);
    const undone=editBatch(restored,[{id:'line',value:null,expected:[heads(restored,'line')[0].id]}],'A');expect(heads(undone,'line')[0].value).toBeNull();
  });
});

function libraryFixture(){let s=emptyLibrary();for(const [id,parent] of [['a',null],['b','a'],['c','b'],['other',null]] as const){s=libraryEdit(s,folderKey(id),{name:id.toUpperCase()},'A');if(parent)s=libraryEdit(s,parentKey(id),{parentId:parent},'A');}return libraryEdit(s,memberKey('doc'),{folderId:'b'},'A');}
describe('direct folder browsing and navigation are read-only',()=>{
  it('distinguishes root/direct children/all/unfiled without writing synthetic folder IDs',()=>{
    const s=libraryFixture(),prior=JSON.stringify(s);
    expect(directFolders(s,'root').map(f=>f.id)).toEqual(['a','other']);expect(directFolders(s,'a').map(f=>f.id)).toEqual(['b']);expect(directFolders(s,'b','C').map(f=>f.id)).toEqual(['c']);expect(directFolders(s,'all','C').map(f=>f.id)).toEqual(['c']);expect(directFolders(s,'unfiled')).toEqual([]);
    expect(documentInScope(s,'doc','root')).toBe(false);expect(documentInScope(s,'doc','all')).toBe(true);expect(documentInScope(s,'doc','b')).toBe(true);expect(documentInScope(s,'loose','root')).toBe(true);
    for(const scope of ['root','all','unfiled'])expect(scopeDestination(scope)).toBeNull();expect(scopeDestination('c')).toBe('c');expect(JSON.stringify(s)).toBe(prior);
  });
  it('back restores the searched all-files location, not the folder parent',()=>{
    const s=libraryFixture(),all={scope:'all',query:'C',scroll:430,ancestors:[]},current={scope:'c',query:'',scroll:0,ancestors:ancestry(s,'c')};
    const result=previousLocation(s,[all],current);expect(result.location).toEqual(all);expect(result.history).toEqual([]);expect(ancestry(s,'c')).toEqual(['a','b','c']);
  });
  it('keeps IDs on rename/move and falls back to closest surviving ancestor on deletion',()=>{
    let s=libraryFixture();const current={scope:'c',query:'q',scroll:90,ancestors:ancestry(s,'c')};
    s=libraryEdit(s,folderKey('b'),{name:'Renamed'},'B');expect(recoverLocation(s,current)).toEqual(current);
    s=libraryEdit(s,parentKey('b'),{parentId:'other'},'B');expect(recoverLocation(s,current).ancestors).toEqual(['other','b','c']);
    s=libraryEdit(s,folderKey('c'),null,'B');expect(recoverLocation(s,current)).toMatchObject({scope:'b',query:'',scroll:0});s=libraryEdit(s,folderKey('b'),null,'B');expect(recoverLocation(s,current).scope).toBe('a');s=libraryEdit(s,folderKey('a'),null,'B');expect(recoverLocation(s,current).scope).toBe('root');
  });
  it('skips invalid history loops and leaves anomalous folders/docs reachable at root',()=>{
    let s=libraryFixture();s=libraryEdit(s,parentKey('a'),{parentId:'c'},'B');expect(directFolders(s,'root').map(f=>f.id)).toEqual(expect.arrayContaining(['a','b','c']));expect(ancestry(s,'c')).toHaveLength(1);
    s=mergeLibrary(libraryEdit(s,folderKey('b'),{name:'One'},'A'),libraryEdit(s,folderKey('b'),{name:'Two'},'B'));expect(documentInScope(s,'doc','root')).toBe(true);expect(directFolders(s,'root').some(f=>f.id==='b'&&f.conflicted)).toBe(true);
    const root={scope:'root',query:'',scroll:0,ancestors:[]},invalid={...root,scope:'gone'};expect(previousLocation(s,[invalid,invalid],root)).toEqual({location:root,history:[]});
  });
  it('renders direct child cards, reachable breadcrumbs and search without a navigation tree',()=>{
    const noop=()=>{},library=libraryFixture(),html=renderToStaticMarkup(createElement(LibraryPanel,{library,documents:[],scope:'a',query:'',device:'A',canBack:true,onBack:noop,onScope:noop,onChange:async()=>{},onCreate:async()=>{},onCloseMove:noop,onError:noop}));
    expect(html).toContain('data-folder-id="b"');expect(html).not.toContain('data-folder-id="c"');expect(html).not.toContain('folder-navigation');expect(html).toContain('aria-label="資料夾路徑"');expect(html).toContain('搜尋資料夾與文件名稱');
  });
});
