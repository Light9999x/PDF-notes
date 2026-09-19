// Kept independent from the DOM so keyboard precedence can be tested without a
// browser/server. The caller determines whether focus is in a control or modal.
export function editorKeyAction(key:string,options:{modal:boolean;control:boolean;editable:boolean;command:boolean;shift:boolean}):'undo'|'redo'|'delete'|'escape'|'edit-text'|undefined {
  if(options.modal||options.editable)return;
  if(key==='Escape')return 'escape';
  if(options.control)return;
  if(options.command&&key.toLowerCase()==='z')return options.shift?'redo':'undo';
  if(!options.command&&(key==='Enter'||key==='F2'))return 'edit-text';
  if(key==='Delete')return 'delete';
}
export function toolSettings(tool:string){return {color:tool==='pen'||tool==='text'||tool==='highlight',weight:tool==='pen'||tool==='highlight',eraser:tool==='erase',selection:tool==='select'};}
