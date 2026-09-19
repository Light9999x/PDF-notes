import { maskSteps, type MaskJob } from './cutout';
const worker=globalThis as unknown as {onmessage:(e:MessageEvent<MaskJob>)=>void;postMessage:(value:unknown,transfer?:Transferable[])=>void};
worker.onmessage=e=>{try{const steps=maskSteps(e.data);let next=steps.next();while(!next.done){worker.postMessage({progress:next.value});next=steps.next();}worker.postMessage({mask:next.value},[next.value.buffer]);}catch(error){worker.postMessage({error:String(error)});}};
