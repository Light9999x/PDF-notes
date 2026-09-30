export const MAX_PAGE_PIXELS=8_000_000,MAX_CACHED_PIXELS=32_000_000,MAX_CACHED_PAGES=12,MAX_CANVAS_SIDE=8192;
export function rasterSize(width:number,height:number,dpr:number){
  const scale=Math.min(Math.max(1,dpr),2,MAX_CANVAS_SIDE/width,MAX_CANVAS_SIDE/height,Math.sqrt(MAX_PAGE_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export const abortError=()=>new DOMException('Render superseded','AbortError');
type Job={priority:number;start:()=>void;cancel:()=>void};
// One coordinator per open PDF. Only two jobs allocate staging canvases. Queued
// jobs have no bitmap allocation and visible pages run before nearby pages.
export class RenderCoordinator {
  private running=0;private queue:Job[]=[];private disposed=false;
  private controllers=new Set<AbortController>();
  private frames=new Map<object,{pixels:number;priority:number;release:()=>void}>();
  schedule<T>(priority:number,signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    return new Promise((resolve,reject)=>{
      if(this.disposed||signal.aborted){reject(abortError());return;}
      const controller=new AbortController();this.controllers.add(controller);
      const finish=()=>{signal.removeEventListener('abort',cancel);this.controllers.delete(controller);};
      const cancel=()=>{controller.abort();const at=this.queue.indexOf(job);if(at>=0){this.queue.splice(at,1);finish();reject(abortError());}};
      const job:Job={priority,cancel:()=>{controller.abort();finish();reject(abortError());},start:()=>{
        this.running++;
        void Promise.resolve().then(()=>{if(controller.signal.aborted)throw abortError();return work(controller.signal);}).then(resolve,reject).finally(()=>{finish();this.running--;this.drain();});
      }};
      signal.addEventListener('abort',cancel,{once:true});this.queue.push(job);this.drain();
    });
  }
  private drain(){while(!this.disposed&&this.running<2&&this.queue.length){this.queue.sort((a,b)=>b.priority-a.priority);this.queue.shift()!.start();}}
  retain(key:object,pixels:number,priority:number,release:()=>void){
    this.frames.delete(key);this.frames.set(key,{pixels,priority,release});
    while(this.frames.size>MAX_CACHED_PAGES||this.pixels>MAX_CACHED_PIXELS){
      const candidate=[...this.frames].sort((a,b)=>a[1].priority-b[1].priority)[0];if(!candidate)break;
      this.frames.delete(candidate[0]);candidate[1].release();
    }
  }
  priority(key:object,priority:number){const frame=this.frames.get(key);if(frame)frame.priority=priority;}
  forget(key:object){this.frames.delete(key);}
  get pixels(){return [...this.frames.values()].reduce((sum,f)=>sum+f.pixels,0);}
  get size(){return this.frames.size;}
  dispose(){this.disposed=true;for(const controller of this.controllers)controller.abort();this.queue.splice(0).forEach(j=>j.cancel());for(const frame of this.frames.values())frame.release();this.frames.clear();}
}
// The old completed value survives errors and aborted work. A result is not
// visible until its complete bitmap/text pair is ready and still current.
export class LatestFrame<T> {
  private request?:AbortController;private generation=0;current?:T;
  constructor(private disposeFrame:(frame:T)=>void){}
  async render(work:(signal:AbortSignal)=>Promise<T>,commit:(frame:T)=>void,error:(error:unknown)=>void){
    this.cancel();const controller=new AbortController(),generation=++this.generation;this.request=controller;
    try{const frame=await work(controller.signal);if(controller.signal.aborted||generation!==this.generation){this.disposeFrame(frame);return;}
      const old=this.current;this.current=frame;commit(frame);if(old)this.disposeFrame(old);
    }catch(reason){if(!controller.signal.aborted&&generation===this.generation)error(reason);}
  }
  cancel(){this.request?.abort();this.request=undefined;this.generation++;}
  clear(){this.cancel();if(this.current)this.disposeFrame(this.current);this.current=undefined;}
}
