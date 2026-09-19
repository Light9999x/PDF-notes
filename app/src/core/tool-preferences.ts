export type ToolPreferences=Record<'pen'|'highlight'|'text',{color:string;weight:number}>;
export const defaultPreferences:ToolPreferences={pen:{color:'#245cba',weight:3},highlight:{color:'#efc44a',weight:15},text:{color:'#245cba',weight:3}};
export function readToolPreferences(settings:any):ToolPreferences {
  const size=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(1,Math.min(200,n)):fallback;
  const legacy=size(settings?.weight,3);
  return Object.fromEntries(Object.entries(defaultPreferences).map(([tool,defaultValue])=>{
    const saved=settings?.version===2?settings.prefs?.[tool]:undefined;
    return [tool,{color:/^#[0-9a-f]{6}$/i.test(saved?.color)?saved.color:defaultValue.color,weight:size(saved?.weight,settings?.version===2?defaultValue.weight:tool==='highlight'?Math.min(200,legacy*5):tool==='pen'?legacy:3)}];
  })) as ToolPreferences;
}
