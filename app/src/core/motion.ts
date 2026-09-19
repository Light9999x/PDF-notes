// One cancellable transition; layout is released only when closing completes.
export function slideMotion(node:HTMLElement,open:boolean,offset:string,reduced:boolean,finish:()=>void){
  const duration=reduced?0:180,animation=duration&&typeof node.animate==='function'?node.animate(open?[{opacity:0,transform:offset},{opacity:1,transform:'none'}]:[{opacity:1,transform:'none'},{opacity:0,transform:offset}],{duration,easing:'ease-out',fill:'both'}):undefined;
  const timer=setTimeout(()=>{finish();animation?.cancel();},duration);
  return ()=>{clearTimeout(timer);animation?.cancel();};
}
