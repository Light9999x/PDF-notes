import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
// Event-boundary tests run without a browser or server. They verify cancellation
// and commit routing, not real touch-action/viewport or native text-selection UX.
const harness=vi.hoisted(()=>({effects:[] as (()=>void|(()=>void))[]}));
vi.mock('react',()=>({useRef:(value:unknown)=>({current:value}),useEffect:(fn:()=>void|(()=>void))=>{harness.effects.push(fn);}}));
import { useDocumentGestures } from '../src/components/useDocumentGestures';
class Surface extends EventTarget {
  style:Record<string,string>={};dataset:Record<string,string>={};scrollLeft=0;scrollTop=0;
  ignored=false;paper=false;
  closest(){return this.ignored?this:null;}
  getBoundingClientRect(){return {left:10,top:100,width:500,height:700};}
  querySelector(){return this.stack;}
  querySelectorAll(){return this.pages;}
  setPointerCapture=vi.fn();
  stack?:Surface;pages:Surface[]=[];
}
let cleanup:(()=>void)[]=[],root:Surface,win:Surface,options:Parameters<typeof useDocumentGestures>[1];
function fire(type:string,id:number,x:number,y:number,target=root){const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,pointerType:'touch',clientX:x,clientY:y});target.dispatchEvent(event);return event;}
beforeEach(()=>{
  vi.useFakeTimers();harness.effects=[];root=new Surface();root.stack=new Surface();const page=new Surface();page.dataset.page='2';root.pages=[page];win=new Surface();
  vi.stubGlobal('window',Object.assign(win,{getSelection:()=>({isCollapsed:true,removeAllRanges:vi.fn()})}));vi.stubGlobal('Element',Surface);vi.stubGlobal('getComputedStyle',()=>({gap:'8px',flexDirection:'column'}));
  options={zoom:1,tool:'select',read:false,disabled:false,cancel:vi.fn(),onZoom:vi.fn(),menu:vi.fn(()=>true),onActivity:vi.fn()};
});
function mount(){const active=useDocumentGestures({current:root as unknown as HTMLDivElement},options);cleanup=harness.effects.map(f=>f()).filter((f):f is ()=>void=>!!f);vi.mocked(options.cancel).mockClear();return active;}
afterEach(()=>{cleanup.forEach(f=>f());cleanup=[];vi.unstubAllGlobals();vi.useRealTimers();});
describe('document pointer coordination',()=>{
  it('cancels single-pointer drafts on second touch, previews all layers, commits one anchored zoom on release',()=>{const active=mount();fire('pointerdown',1,110,200);fire('pointerdown',2,210,200);expect(options.cancel).toHaveBeenCalledTimes(1);expect(active.current).toBe(true);const move=fire('pointermove',2,310,200);expect(move.defaultPrevented).toBe(true);expect(root.stack!.style.transform).toContain('scale(2)');expect(options.onZoom).not.toHaveBeenCalled();fire('pointerup',2,310,200,win);expect(options.onZoom).toHaveBeenCalledExactlyOnceWith(2,{page:2,x:.3,y:100/700,client:{x:210,y:200}});expect(root.stack!.style.transform).toBe('');expect(active.current).toBe(false);});
  it('consumes remaining-finger motion/up and starts fresh only after all contacts release',()=>{mount();fire('pointerdown',1,100,200);fire('pointerdown',2,200,200);fire('pointerup',2,200,200,win);expect(fire('pointermove',1,200,250).defaultPrevented).toBe(true);expect(fire('pointerup',1,200,250,win).defaultPrevented).toBe(true);expect(fire('pointerdown',3,100,200).defaultPrevented).toBe(false);});
  it.each(['pointercancel','blur','third','lost'] as const)('%s aborts pinch without committing a zoom or a stroke',kind=>{mount();fire('pointerdown',1,100,200);fire('pointerdown',2,200,200);fire('pointermove',2,250,200);if(kind==='blur')win.dispatchEvent(new Event('blur'));else if(kind==='third')fire('pointerdown',3,300,200);else if(kind==='lost')fire('lostpointercapture',1,100,200);else fire('pointercancel',2,250,200,win);fire('pointerup',1,100,200,win);expect(options.onZoom).not.toHaveBeenCalled();expect(root.stack!.style.transform).toBe('');});
  it('holds one-finger pan in read/page mode and cancels object long press when dragged',()=>{options.read=true;options.tool='page';mount();fire('pointerdown',1,100,200);expect(fire('pointermove',1,120,240).defaultPrevented).toBe(true);expect(root.scrollTop).toBe(-40);expect(root.scrollLeft).toBe(-20);vi.advanceTimersByTime(600);expect(options.menu).toHaveBeenCalledTimes(1);expect(fire('pointerup',1,120,240,win).defaultPrevented).toBe(true);});
  it('fires idle long press once, consumes up and the follow-up click',()=>{mount();fire('pointerdown',1,100,200);vi.advanceTimersByTime(500);expect(options.menu).toHaveBeenCalledWith({x:100,y:200},true);expect(options.cancel).toHaveBeenCalledTimes(1);expect(fire('pointerup',1,100,200,win).defaultPrevented).toBe(true);const click=new Event('click',{cancelable:true});win.dispatchEvent(click);expect(click.defaultPrevented).toBe(true);expect(options.onZoom).not.toHaveBeenCalled();});
  it.each(['pointercancel','scroll','blur','move','second'] as const)('%s cancels a pending object menu',kind=>{mount();fire('pointerdown',1,100,200);if(kind==='blur')win.dispatchEvent(new Event('blur'));else if(kind==='scroll')root.dispatchEvent(new Event('scroll'));else if(kind==='move')fire('pointermove',1,109,200);else if(kind==='second')fire('pointerdown',2,200,200);else fire('pointercancel',1,100,200,win);vi.advanceTimersByTime(600);expect(options.menu).toHaveBeenCalledTimes(1);});
  it('leaves brush long-press straightening to the brush and form/control touches to their controls',()=>{options.tool='pen';mount();fire('pointerdown',1,100,200);vi.advanceTimersByTime(600);expect(options.menu).not.toHaveBeenCalled();fire('pointerup',1,100,200,win);root.ignored=true;fire('pointerdown',2,100,200);fire('pointerdown',3,200,200);expect(root.setPointerCapture).not.toHaveBeenCalled();});
  it('does not finalize text/property drafts to begin zoom',()=>{options.disabled=true;mount();fire('pointerdown',1,100,200);fire('pointerdown',2,200,200);fire('pointerup',2,200,200,win);expect(options.onZoom).not.toHaveBeenCalled();expect(options.menu).not.toHaveBeenCalled();});
});
