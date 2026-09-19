export function menuPosition(anchor:{left:number;right:number;top:number;bottom:number},viewport:{left:number;top:number;width:number;height:number},desiredHeight:number){
  const margin=12,gap=6,width=Math.min(280,Math.max(1,viewport.width-margin*2)),left=Math.max(viewport.left+margin,Math.min(anchor.right-width,viewport.left+viewport.width-margin-width));
  const top=viewport.top+margin,bottom=viewport.top+viewport.height-margin,above=Math.max(0,anchor.top-gap-top),below=Math.max(0,bottom-anchor.bottom-gap);
  const up=above>=Math.min(desiredHeight,100)||above>=below,maxHeight=Math.max(1,up?above:below),height=Math.min(desiredHeight,maxHeight);
  return {left,top:Math.max(top,Math.min(bottom-height,up?anchor.top-gap-height:anchor.bottom+gap)),width,maxHeight};
}
