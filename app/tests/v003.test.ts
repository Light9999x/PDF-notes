import {describe,it,expect} from 'vitest';
import {clipSegment,contains,inverse,pageMatrix,sweptHit,transform} from '../src/core/geometry';
import {createBlank} from '../src/core/blank';
import {edit,heads,merge,validate,type Annotation} from '../src/core/model';
import {pack,unpack} from '../src/core/archive';
import {canMoveFolder,cleanFolderName,emptyLibrary,folderKey,folderParent,folderTree,hierarchyIssues,libraryEdit,mergeLibrary,parentKey,validateLibrary} from '../src/core/library';
const stroke:Annotation={kind:'pen',page:1,x:10,y:10,width:100,height:100,color:'#123456',weight:2,opacity:1,points:[{x:0,y:0},{x:100,y:100}]};
describe('swept eraser geometry',()=>{
  it('hits a thin segment between widely spaced mouse events',()=>{expect(sweptHit(stroke,{x:0,y:100},{x:120,y:0},2)).toBe(true);});
  it('does not erase an empty corner of the bounding box',()=>{expect(sweptHit(stroke,{x:15,y:105},{x:20,y:105},5)).toBe(false);});
  it('includes round endcaps, single dots, width and highlighter but excludes text',()=>{
    expect(sweptHit(stroke,{x:8,y:10},{x:8,y:10},1)).toBe(true);
    expect(sweptHit({...stroke,points:[{x:0,y:0}]},{x:10,y:12},{x:10,y:12},1)).toBe(true);
    expect(sweptHit({...stroke,kind:'highlight',weight:20},{x:10,y:23},{x:10,y:23},1)).toBe(true);
    expect(sweptHit({...stroke,kind:'text'},{x:20,y:20},{x:20,y:20},100)).toBe(false);
  });
  it('changing radius changes real hit distance and gaps are clipped out',()=>{
    expect(sweptHit(stroke,{x:30,y:10},{x:30,y:10},2)).toBe(false);expect(sweptHit(stroke,{x:30,y:10},{x:30,y:10},20)).toBe(true);
    expect(clipSegment({x:-30,y:50},{x:-10,y:50},100,100)).toBeNull();expect(clipSegment({x:-30,y:50},{x:130,y:50},100,100)).toEqual([{x:0,y:50},{x:100,y:50}]);
  });
  it.each([0,90,180,270])('preserves hit geometry under crop, rotation %i, zoom and DPR-independent CSS coordinates',r=>{
    const radians=r*Math.PI/180,c=Math.round(Math.cos(r))*2.5,s=Math.round(Math.sin(r))*2.5,m=pageMatrix([c,s,s,-c,70,900],[25,35,555,745]);
    const a={x:0,y:100},b={x:120,y:0};expect(sweptHit(stroke,inverse(m,transform(m,a)),inverse(m,transform(m,b)),2)).toBe(true);
  });
});
describe('text format and rotation',()=>{
  it('uses rotated local bounds, not the enclosing axis-aligned rectangle',()=>{
    const a={...stroke,kind:'text' as const,x:0,y:0,width:100,height:20,angle:90};expect(contains(a,{x:50,y:50})).toBe(true);expect(contains(a,{x:5,y:5})).toBe(false);
  });
  it('round trips independent angle and writing mode without rewriting old operations',async()=>{
    const old=edit(await createBlank('old','portrait','A'),'text',{...stroke,kind:'text',text:'中Ab12，\n第二欄',fontSize:18},'A');const snapshot=structuredClone(old.operations);
    const current=edit(old,'text',{...heads(old,'text')[0].value as Annotation,writingMode:'vertical-rl',angle:37.25},'B');
    expect(current.format).toBe(2);expect(current.operations.slice(0,-1)).toEqual(snapshot);expect(await unpack(pack(current))).toEqual(current);expect(merge(current,old).format).toBe(2);
    await expect(validate({...current,format:1})).rejects.toThrow();
    const broken=structuredClone(current);(broken.operations.at(-1)!.value as Annotation).angle=Infinity;await expect(validate(broken)).rejects.toThrow();
    const badMode=structuredClone(current);(badMode.operations.at(-1)!.value as any).writingMode='sideways';await expect(validate(badMode)).rejects.toThrow();
  });
});
describe('folder hierarchy causality',()=>{
  const base=()=>libraryEdit(libraryEdit(emptyLibrary(),folderKey('a'),{name:'A'},'A'),folderKey('b'),{name:'B'},'A');
  it('retains concurrent legal moves forming a cycle and offers root recovery',()=>{
    const s=base();canMoveFolder(s,'a','b');canMoveFolder(s,'b','a');
    const a=libraryEdit(s,parentKey('a'),{parentId:'b'},'A'),b=libraryEdit(s,parentKey('b'),{parentId:'a'},'B'),merged=mergeLibrary(a,b);
    expect(hierarchyIssues(merged)).toHaveLength(2);expect(folderTree(merged)).toHaveLength(2);expect(mergeLibrary(merged,a)).toEqual(merged);validateLibrary(merged);
    const fixed=libraryEdit(merged,parentKey('a'),{parentId:null},'A',true);expect(hierarchyIssues(fixed)).toHaveLength(0);expect(folderTree(fixed).map(f=>f.depth)).toEqual([0,1]);
  });
  it('prevents self/descendant drops and limits duplicates to siblings',()=>{
    const s=libraryEdit(base(),parentKey('b'),{parentId:'a'},'A');expect(()=>canMoveFolder(s,'a','b')).toThrow();expect(()=>canMoveFolder(s,'a','a')).toThrow();
    expect(()=>cleanFolderName('B',s,undefined,null)).not.toThrow();expect(()=>cleanFolderName('B',s,undefined,'a')).toThrow();
  });
  it('defaults old folders to root; name and parent edits merge independently',()=>{
    const s=base();expect(folderParent(s,'a')).toEqual({parentId:null,issue:null});
    const m=mergeLibrary(libraryEdit(s,folderKey('b'),{name:'Renamed'},'A'),libraryEdit(s,parentKey('b'),{parentId:'a'},'B'));
    expect(folderTree(m).find(f=>f.id==='b')).toMatchObject({name:'Renamed',depth:1});expect(m.format).toBe(2);expect(()=>validateLibrary({...m,format:1})).toThrow();
  });
  it('keeps children visible when the parent is deleted or missing',()=>{
    const s=libraryEdit(base(),parentKey('b'),{parentId:'a'},'A'),removed=libraryEdit(s,folderKey('a'),null,'B');expect(folderTree(removed)).toHaveLength(1);expect(folderParent(removed,'b').parentId).toBeNull();expect(folderParent(removed,'b').issue).toBeTruthy();
  });
});
