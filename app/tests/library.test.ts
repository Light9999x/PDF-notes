import {describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {classification,cleanFolderName,emptyLibrary,folderKey,folders,libraryConflicts,libraryEdit,libraryHeads,memberKey,mergeLibrary,validateLibrary} from '../src/core/library';
import {createBlank} from '../src/core/blank';
import {duplicate,edit,merge,META,uid} from '../src/core/model';
import {pack,unpack} from '../src/core/archive';
const withFolder=(name='Study',id='f')=>libraryEdit(emptyLibrary(),folderKey(id),{name},'A');
describe('library causal graph',()=>{
  it('keeps offline additions, including same-name different IDs',()=>{
    const a=withFolder('Study','a'),b=withFolder('Study','b'),m=mergeLibrary(a,b);
    expect(folders(m)).toHaveLength(2);expect(mergeLibrary(m,a)).toEqual(m);expect(mergeLibrary(b,a)).toEqual(m);expect(()=>cleanFolderName(' Study ',m)).toThrow();
  });
  it('rejects local duplicate and blank names, permits own unchanged name',()=>{
    expect(()=>cleanFolderName(' ',emptyLibrary())).toThrow();expect(()=>cleanFolderName('study',withFolder())).toThrow();expect(cleanFolderName(' Study ',withFolder(),'f')).toBe('Study');
  });
  it('classifies old documents as unfiled without creating operations',()=>{expect(classification(emptyLibrary(),'old')).toEqual({folderId:null,issue:null});});
  it('preserves simultaneous rename candidates and reopens concurrent resolutions',()=>{
    const s=withFolder(),a=libraryEdit(s,folderKey('f'),{name:'One'},'A'),b=libraryEdit(s,folderKey('f'),{name:'Two'},'B'),m=mergeLibrary(a,b);
    expect(libraryConflicts(m)).toHaveLength(1);expect(()=>libraryEdit(m,folderKey('f'),{name:'X'},'C')).toThrow();
    const ra=libraryEdit(m,folderKey('f'),{name:'One'},'A',true),rb=libraryEdit(m,folderKey('f'),{name:'Two'},'B',true);
    expect(libraryHeads(mergeLibrary(ra,rb),folderKey('f'))).toHaveLength(2);
  });
  it('retains concurrent moves and resolves without deleting document content',()=>{
    const s=mergeLibrary(withFolder('A','a'),withFolder('B','b'));
    const m=mergeLibrary(libraryEdit(s,memberKey('doc'),{folderId:'a'},'A'),libraryEdit(s,memberKey('doc'),{folderId:'b'},'B'));
    expect(classification(m,'doc').issue).toContain('衝突');expect(classification(m,'doc').folderId).toBeNull();
    expect(classification(libraryEdit(m,memberKey('doc'),{folderId:'a'},'C',true),'doc').folderId).toBe('a');
  });
  it('folder deletion racing a move leaves document accessible in unfiled',()=>{
    const s=withFolder();const m=mergeLibrary(libraryEdit(s,folderKey('f'),null,'A'),libraryEdit(s,memberKey('doc'),{folderId:'f'},'B'));
    expect(classification(m,'doc')).toEqual({folderId:null,issue:'資料夾已刪除、尚未同步或有衝突，請重新分類'});expect(folders(mergeLibrary(m,s))).toHaveLength(0);
  });
  it('name and membership are independent, even when a folder is renamed',()=>{
    const s=withFolder();const m=mergeLibrary(libraryEdit(s,folderKey('f'),{name:'Renamed'},'A'),libraryEdit(s,memberKey('doc'),{folderId:'f'},'B'));
    expect(classification(m,'doc').folderId).toBe('f');expect(folders(m)[0].name).toBe('Renamed');expect(libraryConflicts(m)).toHaveLength(0);
  });
  it('validates parents and cycles; rejects contradictory IDs and future formats',()=>{
    const s=withFolder();const bad=structuredClone(s);bad.operations[0].parents=['missing'];expect(()=>validateLibrary(bad)).toThrow();bad.operations[0].parents=[bad.operations[0].id];expect(()=>validateLibrary(bad)).toThrow();
    const collision=structuredClone(s);collision.operations[0].value={name:'Different'};expect(()=>mergeLibrary(s,collision)).toThrow();expect(()=>validateLibrary({...s,format:3 as 1})).toThrow();
  });
});
describe('blank documents and archive boundary',()=>{
  it.each(['portrait','landscape'] as const)('creates true A4 %s dimensions without page rotation',async direction=>{
    const doc=await createBlank('',direction,'device');const pdf=await PDFDocument.load(doc.assets[doc.pdfHash].bytes),page=pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(direction==='portrait'?595.28:841.89);expect(page.getHeight()).toBeCloseTo(direction==='portrait'?841.89:595.28);expect(page.getRotation().angle).toBe(0);expect(doc.pdfHash).toBe(doc.originalHash);expect(doc.origin).toBe('blank');
    expect(await unpack(pack(doc))).toEqual(doc);
  });
  it('same-size new documents keep independent IDs, immutable assets and no library in archive',async()=>{
    const a=await createBlank('A','portrait','A'),b=await createBlank('A','portrait','A');expect(a.id).not.toBe(b.id);
    const moved=libraryEdit(withFolder(),memberKey(a.id),{folderId:'f'},'A');const changed=edit(a,META,{kind:'document',name:'Renamed'},'B');
    const restored=await unpack(pack(changed));expect('library' in restored).toBe(false);expect('folderId' in restored).toBe(false);expect(classification(moved,a.id).folderId).toBe('f');expect(merge(a,restored).pdfHash).toBe(a.pdfHash);expect(duplicate(restored).id).not.toBe(a.id);
  });
  it('all four annotation types survive blank-document roundtrip',async()=>{
    let doc=await createBlank('Notes','landscape','A');const imageHash=doc.pdfHash;
    // The image asset is already covered by the core archive test; use a real tiny PNG here.
    const {addAsset}=await import('../src/core/model');const png=await addAsset(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=','base64')),'image/png');doc.assets[png.hash]=png;
    for(const kind of ['text','pen','highlight','image'] as const)doc=edit(doc,uid(),{kind,page:1,x:10,y:20,width:100,height:70,color:'#123456',weight:2,opacity:kind==='highlight'?.3:1,text:'筆記',fontSize:18,points:[{x:0,y:0},{x:20,y:30}],asset:kind==='image'?png.hash:undefined},'A');
    const roundtrip=await unpack(pack(doc));expect(roundtrip).toEqual(doc);expect(roundtrip.pdfHash).toBe(imageHash);
  });
});
