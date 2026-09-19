import { Plus, Trash2 } from 'lucide-react';
import { Button } from './ui';
export function LibraryActions({trash,onImport,onTrash,onLibrary}:{trash:boolean;onImport:()=>void;onTrash:()=>void;onLibrary:()=>void}){
  return <div className="library-header-actions">{trash?<Button onClick={onLibrary}>返回文件庫</Button>:<><Button variant="primary" onClick={onImport}><Plus size={19}/>匯入文件</Button><Button onClick={onTrash}><Trash2 size={18}/>已刪除文件</Button></>}</div>;
}
