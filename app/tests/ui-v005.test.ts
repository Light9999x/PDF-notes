import { describe, it, expect, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { editorKeyAction } from '../src/core/ui-policy';
import { activateDialog, dismissDialog } from '../src/core/dialog';
import { LibraryActions } from '../src/components/LibraryActions';
import { EditorToolbar } from '../src/components/EditorToolbar';
import { Button, Dialog, Field } from '../src/components/ui';

describe('editor keyboard precedence',()=>{
  const options={modal:false,control:false,editable:false,command:false,shift:false};
  it.each(['Escape','Delete','z'])('blocks background %s while any modal is open',key=>{
    expect(editorKeyAction(key,{...options,modal:true,command:true})).toBeUndefined();
  });
  it.each(['Delete','z'])('does not turn focused button keys into background edits: %s',key=>{
    expect(editorKeyAction(key,{...options,control:true,command:true})).toBeUndefined();
    expect(editorKeyAction(key,{...options,editable:true,command:true})).toBeUndefined();
  });
  it('retains canvas deletion and grouped history shortcuts outside controls',()=>{
    expect(editorKeyAction('Delete',options)).toBe('delete');
    expect(editorKeyAction('Z',{...options,command:true})).toBe('undo');
    expect(editorKeyAction('z',{...options,command:true,shift:true})).toBe('redo');
    expect(editorKeyAction('Escape',options)).toBe('escape');
    expect(editorKeyAction('Enter',options)).toBe('edit-text');
  });
});

describe('dialog lifecycle adapter (native browser trapping remains a manual check)',()=>{
  function fixture(){
    const trigger={isConnected:true,focus:vi.fn(),closest:()=>null,getClientRects:()=>[{}]};
    const heading={focus:vi.fn()};
    const fallback={...trigger,focus:vi.fn()};
    const node={open:false,ownerDocument:{activeElement:trigger,querySelector:()=>fallback},contains:vi.fn(()=>false),showModal:vi.fn(()=>{node.open=true;}),show:vi.fn(()=>{node.open=true;}),close:vi.fn(()=>{node.open=false;})};
    return {node:node as unknown as HTMLDialogElement,raw:node,trigger,heading:heading as unknown as HTMLElement,fallback};
  }
  it('opens modally, focuses the labelled heading and returns to a visible trigger',()=>{
    const f=fixture(),cleanup=activateDialog(f.node,{open:true,modal:true,heading:f.heading});
    expect(f.raw.showModal).toHaveBeenCalledOnce();expect(f.heading.focus).toHaveBeenCalledOnce();expect(f.raw.show).not.toHaveBeenCalled();cleanup();
    expect(f.raw.close).toHaveBeenCalledOnce();expect(f.trigger.focus).toHaveBeenCalledOnce();
  });
  it('desktop shelf never enters the modal top layer and does not steal the current focus',()=>{
    const f=fixture(),cleanup=activateDialog(f.node,{open:true,modal:false,heading:f.heading});
    expect(f.raw.show).toHaveBeenCalledOnce();expect(f.raw.showModal).not.toHaveBeenCalled();expect(f.heading.focus).not.toHaveBeenCalled();expect(f.trigger.focus).toHaveBeenCalledOnce();cleanup();
  });
  it('closing a shelf at the narrow breakpoint moves hidden focus to the drawer trigger',()=>{
    const f=fixture();f.raw.contains.mockReturnValue(true);
    activateDialog(f.node,{open:false,modal:true,heading:f.heading,returnFocusSelector:'[data-properties-trigger]'});
    expect(f.fallback.focus).toHaveBeenCalledOnce();expect(f.raw.showModal).not.toHaveBeenCalled();
  });
  it('does not restore a removed trigger, and uses the supplied responsive fallback',()=>{
    const f=fixture(),cleanup=activateDialog(f.node,{open:true,modal:true,heading:f.heading,returnFocusSelector:'[data-properties-trigger]'});
    f.trigger.isConnected=false;cleanup();expect(f.trigger.focus).not.toHaveBeenCalled();expect(f.fallback.focus).toHaveBeenCalledOnce();
  });
  it('always prevents native cancellation; recovery dialogs cannot be dismissed with Escape',()=>{
    const e={preventDefault:vi.fn()},close=vi.fn();dismissDialog(e,false,close);expect(e.preventDefault).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
    dismissDialog(e,true,close);expect(close).toHaveBeenCalledOnce();
  });
});

describe('reachable actions and contextual controls, rendered without starting the app',()=>{
  const noop=()=>{};
  it('keeps recycle-bin entry in the visible library action component and limits recycle-bin actions',()=>{
    const props={trash:false,onImport:noop,onTrash:noop,onLibrary:noop};
    const library=renderToStaticMarkup(createElement(LibraryActions,props));
    expect(library).toContain('已刪除文件');expect(library).toContain('匯入文件');expect(library).not.toContain('sidebar-bottom');
    const trash=renderToStaticMarkup(createElement(LibraryActions,{...props,trash:true}));expect(trash).toContain('返回文件庫');expect(trash).not.toContain('匯入文件');
  });
  const base:ComponentProps<typeof EditorToolbar>={name:'長文件名稱'.repeat(40),status:'已存至本機 · 尚未同步',tool:'read',onTool:noop,color:'#245cba',onColor:noop,weight:8,onWeight:noop,eraserSize:40,onEraser:noop,onBack:noop,onExport:noop,onImage:noop,ready:true,working:false,canUndo:true,canRedo:true,onUndo:noop,onRedo:noop,selectionMode:'box',onSelectionMode:noop,dirty:false,page:1,pages:3,onPage:noop,zoom:1,onZoom:noop,onFit:noop,onFitPage:noop,zoomMode:'manual',onRotate:noop,layout:'vertical',onLayout:noop,query:'',onQuery:noop,onSearch:noop};
  it.each(['read','select','pen','highlight','text','erase','image'] as const)('%s exposes only its relevant settings but always keeps export and history',tool=>{
    const html=renderToStaticMarkup(createElement(EditorToolbar,{...base,tool}));
    expect(html).toContain('class="tool-options" aria-label="目前工具設定"');
    const imageButton=html.match(/<button[^>]*aria-label="插入圖片"[^>]*>/)?.[0];expect(imageButton).toContain(`aria-pressed="${tool==='image'}"`);
    expect(html.includes('aria-label="橡皮擦直徑"')).toBe(tool==='erase');
    expect(html.includes('aria-label="直徑"')).toBe(tool==='pen'||tool==='highlight');
    expect(html.includes('aria-label="畫筆顏色"')).toBe(tool==='pen'||tool==='text'||tool==='highlight');
    expect(html.includes('aria-label="選取模式"')).toBe(tool==='select');
    for(const label of ['匯出文件','復原','重做','閱讀'])expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain('aria-label="搜尋 PDF 文字"');expect(html).toContain('aria-label="搜尋 PDF"');
  });
  it('supplies a titled dialog, blocks dismissal for protected recovery, and makes busy buttons non-submitting',()=>{
    const html=renderToStaticMarkup(createElement(Dialog,{title:'儲存失敗',alert:true,dismissible:false,onClose:noop,portal:false,children:createElement(Field,{label:'名稱',children:createElement('input')})}));
    expect(html).toContain('role="alertdialog"');expect(html).toContain('aria-modal="true"');expect(html).toMatch(/aria-labelledby="[^"]+"/);expect(html).toMatch(/aria-label="關閉儲存失敗"[^>]*disabled=""/);
    const button=renderToStaticMarkup(createElement(Button,{busy:true},'保存'));expect(button).toContain('type="button"');expect(button).toContain('disabled=""');expect(button).toContain('aria-busy="true"');
  });
});

describe('semantic token contrast',()=>{
  const ast=postcss.parse(readFileSync(new URL('../src/style.css',import.meta.url),'utf8'));
  const tokens=new Map<string,string>();ast.walkRules(':root',rule=>{rule.walkDecls(d=>{if(d.prop.startsWith('--'))tokens.set(d.prop,d.value);});});
  const luminance=(hex:string)=>{const c=hex.replace('#',''),full=c.length===3?[...c].map(x=>x+x).join(''):c;const rgb=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  it.each([['--text','--bg'],['--text-muted','--surface'],['--text-muted','--surface-soft'],['--text-muted','--bg'],['--brand-hover','--selected-bg'],['--success','--success-bg'],['--danger','--danger-bg'],['--warning','--warning-bg'],['#ffffff','--brand']])('%s on %s reaches the chosen 4.5:1 text target', (fg,bg)=>{
    const a=luminance(tokens.get(fg)||fg),b=luminance(tokens.get(bg)||bg);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
  });
});
