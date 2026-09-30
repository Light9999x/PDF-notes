import { describe,it,expect,vi } from 'vitest';
import { createBlank } from '../src/core/blank';
import { addAsset,canonical,duplicate,edit,heads,merge,validate,type Annotation,type NoteDocument } from '../src/core/model';
import { editBatch } from '../src/core/batch';
import { completeGroupBatch,expandGroups,groupingChanges,groupState,repairGroupChanges } from '../src/core/groups';
import { editableObjects,rectangleRegion,selectRegion,selectionChanges } from '../src/core/selection';
import { clickSelection } from '../src/core/click-selection';
import { hitSelectionFrame,resizeGroup,rotateGroup } from '../src/core/manipulation';
import { annotationMatrix,transform } from '../src/core/geometry';
import { layerChanges,orderedAnnotations } from '../src/core/layers';
import { pack,unpack } from '../src/core/archive';
import { snapshot } from '../src/core/drive';
import { midpoint,nearestPage,pinchZoom } from '../src/core/document-gesture';
vi.mock('../src/core/storage',()=>({store:{}}));
const value:Annotation={kind:'text',page:1,x:0,y:0,width:20,height:30,color:'#123456',opacity:1,weight:3,fontSize:18,text:'保留文字'};
async function fixture(){let d=await createBlank('groups','portrait','A');for(const [i,id] of ['a','b','c','d'].entries())d=edit(d,id,{...value,x:i*100,layer:i+1},'A');return d;}
const selected=(d:NoteDocument,ids:string[])=>editableObjects(d).filter(o=>ids.includes(o.id));
const group=(d:NoteDocument,ids=['a','c'],device='A')=>editBatch(d,groupingChanges(d,ids),device);
const apply=(d:NoteDocument,changes:ReturnType<typeof selectionChanges>,device='A')=>editBatch(d,completeGroupBatch(d,changes),device);
const strip=(v:Annotation)=>{const a={...v};delete a.group;return a;};
describe('durable flat groups and causal membership',()=>{
  it('round-trips mixed pen, highlight, text and image members without flattening assets or points',async()=>{
    const asset=await addAsset(new Uint8Array([137,80,78,71]),'image/png');let d=await fixture();d={...d,assets:{...d.assets,[asset.hash]:asset}};
    for(const [i,kind] of (['pen','highlight','text','image'] as const).entries())d=edit(d,['a','b','c','d'][i],{...value,kind,angle:33,x:i*100,layer:i+1,...(kind==='image'?{asset:asset.hash}:{}),...(['pen','highlight'].includes(kind)?{points:[{x:0,y:0},{x:10,y:15}]}:{})},'A');
    const grouped=group(d,['a','b','c','d']),stored=await unpack(pack(grouped)),ungrouped=editBatch(stored,groupingChanges(stored,['a'],true),'A');
    for(const id of ['a','b','c','d'])expect(heads(ungrouped,id)[0].value).toEqual(heads(d,id)[0].value);expect(ungrouped.assets[asset.hash]).toEqual(asset);
  });
  it('preserves IDs, geometry and interleaved layers; a group cannot be redundantly grouped',async()=>{const before=await fixture(),d=group(before);expect(d.format).toBe(6);expect(groupState(d).issues).toEqual([]);for(const id of ['a','b','c','d'])expect(strip(heads(d,id)[0].value as Annotation)).toEqual(heads(before,id)[0].value);expect(orderedAnnotations(d).map(o=>o.id)).toEqual(['a','b','c','d']);expect(groupingChanges(d,['a'])).toEqual([]);await validate(d);});
  it('expands clicks, region hits and Shift toggles as complete groups',async()=>{const d=group(await fixture()),a=selected(d,['a'])[0];expect(clickSelection(d,[],a,false)).toEqual(['a','c']);expect(clickSelection(d,['a','c','b'],a,true)).toEqual(['b']);expect(selectRegion(d,1,rectangleRegion({x:1,y:1},{x:3,y:3})).selected.map(o=>o.id)).toEqual(['a','c']);});
  it('locks touch selection until explicitly cleared while mouse Shift/blank behavior stays intact',async()=>{const d=group(await fixture()),target=selected(d,['b'])[0];expect(clickSelection(d,['a','c'],target,false,true)).toEqual(['a','c']);expect(clickSelection(d,['a','c'],undefined,false,true)).toEqual(['a','c']);expect(clickSelection(d,[],target,false,true)).toEqual(['b']);expect(clickSelection(d,['a','c'],target,false,false)).toEqual(['b']);expect(clickSelection(d,['a','c'],undefined,false,false)).toEqual([]);});
  it('unions two groups and independent objects without nesting or changing appearance',async()=>{let d=group(group(await fixture()),['b','d']);d=group(d,['a','b']);expect(expandGroups(d,['d'])).toEqual(['a','b','c','d']);expect(groupState(d).groups.size).toBe(1);await validate(d);});
  it('ungroups, undoes, redoes and cannot resurrect membership from an older snapshot',async()=>{const d=group(await fixture()),changes=groupingChanges(d,['a'],true),un=editBatch(d,changes,'A');expect(expandGroups(un,['a'])).toEqual(['a']);expect(groupState(merge(un,d)).groups.size).toBe(0);const inverse=changes.map(c=>({id:c.id,value:heads(d,c.id)[0].value,expected:[heads(un,c.id)[0].id]})),undo=editBatch(un,inverse,'A');expect(expandGroups(undo,['a'])).toEqual(['a','c']);const redo=editBatch(undo,changes.map(c=>({...c,expected:[heads(undo,c.id)[0].id]})),'A');expect(groupState(redo).groups.size).toBe(0);});
  it.each(['move','resize','rotate','delete','layer'] as const)('%s is a complete guarded batch with one inverse snapshot',async kind=>{const d=group(await fixture()),set=selected(d,['a','c']);let changes;
    if(kind==='layer')changes=layerChanges(d,set,'top');else {const values=kind==='resize'?resizeGroup(set,'se',{x:400,y:100}):kind==='rotate'?rotateGroup(set,37):set.map(o=>kind==='delete'?null:{...o.value,x:o.value.x+30});changes=set.map((o,i)=>({id:o.id,value:values[i],expected:[o.head]}));}
    changes=completeGroupBatch(d,changes);const result=editBatch(d,changes,'A');expect(groupState(result).issues).toEqual([]);const inverse=changes.map(c=>({id:c.id,value:heads(d,c.id)[0].value,expected:[heads(result,c.id)[0].id]}));const undo=editBatch(result,inverse,'A');for(const c of changes)expect(heads(undo,c.id)[0].value).toEqual(heads(d,c.id)[0].value);
    const changed=edit(d,'c',{...value,text:'remote'},'B'),before=canonical(changed);expect(()=>editBatch(changed,changes,'A')).toThrow();expect(canonical(changed)).toBe(before);
  });
  it('rejects partial membership, partial deletion and missing guards without any mutation',async()=>{const d=await fixture(),changes=groupingChanges(d,['a','c']),before=canonical(d);expect(()=>editBatch(d,changes.slice(0,1),'A')).toThrow();expect(canonical(d)).toBe(before);const g=group(d);expect(()=>apply(g,[{id:'a',value:null,expected:[heads(g,'a')[0].id]}])).toThrow();});
  it('preserves both competing assignments regardless of merge order and blocks every related member',async()=>{const d=await fixture(),a=group(d,['a','b'],'A'),b=group(d,['a','c'],'B'),m=merge(a,b);expect(canonical(m)).toBe(canonical(merge(b,a)));expect(heads(m,'a')).toHaveLength(2);expect([...groupState(m).blocked].sort()).toEqual(['a','b','c']);expect(expandGroups(m,['b'])).toEqual([]);expect(()=>completeGroupBatch(m,[{id:'b',value:null,expected:[heads(m,'b')[0].id]}])).toThrow();await validate(m);});
  it.each(['ungroup','delete','modify','regroup'] as const)('keeps concurrent %s versus group movement; repair never chooses an unseen version',async kind=>{const d=group(await fixture()),set=selected(d,['a','c']),moved=apply(d,selectionChanges(set,a=>({...a,x:a.x+15})),'B');
    const other=kind==='ungroup'?editBatch(d,groupingChanges(d,['a'],true),'A'):kind==='delete'?apply(d,selectionChanges(set,()=>null)):kind==='regroup'?group(d,['a','b']):edit(d,'a',{...set[0].value,text:'changed'},'A');let m=merge(moved,other);expect(groupState(m).issues.length).toBeGreaterThan(0);expect(()=>repairGroupChanges(m,groupState(m).issues[0].id)).toThrow();
    for(const id of ['a','b','c'])if(heads(m,id).length>1)m=edit(m,id,heads(m,id)[0].value,'R',true);
    const issue=groupState(m).issues[0];if(issue){const repair=repairGroupChanges(m,issue.id);m=repair.reduce((next,c)=>edit(next,c.id,c.value,'R'),m);expect(groupState(m).issues).toEqual([]);}await validate(m);
  });
  it('retains concurrent conflict resolutions and blocks their complete groups again',async()=>{const d=await fixture(),m=merge(group(d,['a','b'],'A'),group(d,['a','c'],'B')),h=heads(m,'a');const r=merge(edit(m,'a',h[0].value,'A',true),edit(m,'a',h[1].value,'B',true));expect(heads(r,'a')).toHaveLength(2);expect(expandGroups(r,['b','c'])).toEqual([]);});
  it('propagates a dangling competing claim to the full otherwise-consistent group',async()=>{let d=group(await fixture(),['a','b']);d=edit(d,'c',{...value,group:{id:'broken',members:['a','c']}},'B');expect([...groupState(d).blocked].sort()).toEqual(['a','b','c']);expect(expandGroups(d,['b'])).toEqual([]);});
  it('preserves groups in archives, independent copies and Drive snapshots; old files stay old',async()=>{const old=await fixture(),d=group(old),round=await unpack(pack(d));expect(round).toEqual(d);const copy=duplicate(round);expect(copy.id).not.toBe(d.id);const un=editBatch(copy,groupingChanges(copy,['a'],true),'C');expect(groupState(un).groups.size).toBe(0);expect(groupState(d).groups.size).toBe(1);expect(JSON.parse(new TextDecoder().decode(snapshot(d))).operations).toEqual(JSON.parse(canonical([...d.operations].sort((a,b)=>a.id.localeCompare(b.id)))));expect((await unpack(pack(old))).format).toBe(5);await expect(validate({...d,format:5})).rejects.toThrow();});
  it('rejects malformed, duplicate, unknown, cross-page and noncanonical member references',async()=>{const d=await fixture();for(const members of [['a'],['a','a'],['a','missing'],['c','a'],['$document','a']])await expect(validate(edit(d,'a',{...value,group:{id:'g',members}},'A'))).rejects.toThrow();const two={...d,pageCount:2};const cross=edit(edit(two,'z',{...value,page:2},'A'),'a',{...value,group:{id:'g',members:['a','z']}},'A');await expect(validate(cross)).rejects.toThrow();});
});
describe('selection frame and document zoom geometry',()=>{
  it('hits rotated frame interiors rather than stroke pixels and rejects points outside',()=>{const a={...value,kind:'pen' as const,angle:70,points:[{x:0,y:0}]},set=[{id:'a',head:'h',value:a}];expect(hitSelectionFrame(set,transform(annotationMatrix(a),{x:15,y:25}))).toBe(true);expect(hitSelectionFrame(set,transform(annotationMatrix(a),{x:25,y:25}))).toBe(false);});
  it('includes multi-selection gaps occupied by unselected objects',()=>{const set=[{id:'a',head:'a',value},{id:'b',head:'b',value:{...value,x:200}}];expect(hitSelectionFrame(set,{x:100,y:15})).toBe(true);expect(hitSelectionFrame(set,{x:100,y:31})).toBe(false);});
  it('shares zoom limits and chooses a stable page at the gap midpoint',()=>{expect(pinchZoom(1,100,{x:0,y:0},{x:200,y:0})).toBe(2);expect(pinchZoom(3,10,{x:0,y:0},{x:200,y:0})).toBe(4);expect(pinchZoom(.3,100,{x:0,y:0},{x:1,y:0})).toBe(.25);expect(midpoint({x:0,y:20},{x:100,y:80})).toEqual({x:50,y:50});const pages=[{left:0,top:0,width:100,height:100},{left:0,top:180,width:200,height:100}];expect(nearestPage(pages,{x:50,y:140})).toBe(pages[0]);});
});
