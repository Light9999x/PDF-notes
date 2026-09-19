import { classification, folderParent, folders, type LibraryState } from './library';
export const isSpecialScope=(scope:string)=>['root','all','unfiled'].includes(scope);
export const scopeDestination=(scope:string)=>isSpecialScope(scope)?null:scope;
export function ancestry(state:LibraryState,scope:string):string[]{
  if(isSpecialScope(scope))return [];
  const result:string[]=[],seen=new Set<string>();let id:string|null=scope;
  while(id&&!seen.has(id)){seen.add(id);result.unshift(id);id=folderParent(state,id).parentId;}
  return result;
}
export function directFolders(state:LibraryState,scope:string,query=''){
  if(scope==='unfiled')return [];
  return folders(state).filter(f=>(scope==='all'||folderParent(state,f.id).parentId===scopeDestination(scope))&&f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
}
export function documentInScope(state:LibraryState,id:string,scope:string){return scope==='all'||classification(state,id).folderId===scopeDestination(scope);}
export type BrowseLocation={scope:string;query:string;scroll:number;ancestors:string[]};
export function recoverLocation(state:LibraryState,location:BrowseLocation):BrowseLocation {
  const live=new Set(folders(state).map(f=>f.id));
  if(isSpecialScope(location.scope)||live.has(location.scope))return {...location,ancestors:ancestry(state,location.scope)};
  const scope=[...location.ancestors].reverse().find(id=>live.has(id))||'root';
  return {scope,query:'',scroll:0,ancestors:ancestry(state,scope)};
}
export function previousLocation(state:LibraryState,history:BrowseLocation[],current:BrowseLocation){
  const remaining=[...history];while(remaining.length){const location=recoverLocation(state,remaining.pop()!);if(location.scope!==current.scope||location.query!==current.query)return {location,history:remaining};}
  return {location:current,history:remaining};
}
