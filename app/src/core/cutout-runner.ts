import { maskSteps, type MaskJob } from './cutout';
export async function runMask(job:MaskJob,signal:AbortSignal,progress:(n:number)=>void):Promise<Uint8Array>{
  signal.throwIfAborted();
  if(typeof Worker!=='undefined'){
    let worker:Worker|undefined;try{worker=new Worker(new URL('./cutout.worker.ts',import.meta.url),{type:'module'});}catch{/* Restricted browser: use yielding fallback below. */}
    if(worker)return new Promise((resolve,reject)=>{
      let settled=false;
      const done=()=>{settled=true;worker!.onmessage=null;worker!.onerror=null;worker!.terminate();signal.removeEventListener('abort',abort);},abort=()=>{done();reject(new DOMException('已取消處理','AbortError'));};
      signal.addEventListener('abort',abort,{once:true});worker!.onerror=()=>{done();reject(new Error('本機圖片處理失敗，草稿已保留。'));};
      worker!.onmessage=e=>{if(settled||signal.aborted)return;if(e.data.error){done();reject(new Error(e.data.error));}else if(e.data.mask){done();resolve(e.data.mask);}else progress(e.data.progress);};
      try{worker!.postMessage(job);}catch(error){done();reject(error);}
    });
  }
  const steps=maskSteps(job);for(;;){signal.throwIfAborted();const step=steps.next();if(step.done)return step.value;progress(step.value);await new Promise(resolve=>setTimeout(resolve,0));}
}
