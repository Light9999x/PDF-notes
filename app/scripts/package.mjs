import fs from 'node:fs/promises';
import path from 'node:path';
const root='dist';
const all=await fs.readdir(root,{recursive:true});
const files=[];for(const file of all){if((await fs.stat(path.join(root,file))).isFile())files.push(file.replaceAll('\\','/'));}
const pdfAssets=files.filter(f=>f.startsWith('pdfjs/'));
await fs.writeFile(path.join(root,'pdf-assets.json'),JSON.stringify(pdfAssets));
const sw=await fs.readFile(path.join(root,'sw.js'),'utf8');
const required=pdfAssets.filter(f=>/\.(bcmap|ttf|pfb|wasm)$/.test(f));
const cutoutWorkers=files.filter(f=>/^assets\/cutout\.worker-.*\.js$/.test(f));
if(cutoutWorkers.length!==1)throw new Error('Expected one offline cutout worker');
required.push(...cutoutWorkers);
for(const file of required)if(!sw.includes(file))throw new Error('Offline asset missing from service worker: '+file);
console.log('Offline PDF assets:',pdfAssets.length);
console.log('Offline cutout worker:',cutoutWorkers[0]);
