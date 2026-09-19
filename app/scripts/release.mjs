import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
await fs.mkdir('release',{recursive:true});
const files={};
for(const file of await fs.readdir('dist',{recursive:true})){const full=path.join('dist',file);if((await fs.stat(full)).isFile())files[file.replaceAll('\\','/')]=new Uint8Array(await fs.readFile(full));}
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));let notices='PDFnote third-party dependency notices\n\n';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
for(const [location,info] of Object.entries(lock.packages)){
  if(!location)continue;let dir;try{dir=await fs.readdir(location);}catch{continue;}
  const license=dir.find(f=>/^licen[cs]e(\..*)?$/i.test(f));
  notices+='\n\n--- '+location+' @ '+info.version+' ('+(info.license||'see license')+') ---\n';
  if(license)notices+=await fs.readFile(path.join(location,license),'utf8');
}
files['THIRD_PARTY_NOTICES.txt']=strToU8(notices);
files['INSTALL.txt']=strToU8('PDFnote '+version+' PWA\nDeploy this directory to an HTTPS static site root. Open in Edge/Chrome and install.\nNo native APK/EXE is included. See README.md and GOOGLE_DRIVE_SETUP.md, including shutdown instructions.\n');
files['README.md']=strToU8((await fs.readFile('README.md','utf8')).replaceAll('(../prompts/','(prompts/'));
files['GOOGLE_DRIVE_SETUP.md']=new Uint8Array(await fs.readFile('GOOGLE_DRIVE_SETUP.md'));
files['AGENTS.md']=new Uint8Array(await fs.readFile('../AGENTS.md'));
// v005 links to the three project skills and the inspected source files. Bundle
// those references so its documentation also works when the ZIP is read offline.
for(const skill of ['frontend-design','responsive-layout','design-system-architect'])files['.agents/skills/'+skill+'/SKILL.md']=new Uint8Array(await fs.readFile('../.agents/skills/'+skill+'/SKILL.md'));
for(const file of ['src/App.tsx','src/style.css','src/components/Editor.tsx','src/components/LibraryPanel.tsx','src/components/Conflicts.tsx'])files[file]=new Uint8Array(await fs.readFile(file));
for(const directory of ['docs','prompts'])for(const file of await fs.readdir(directory==='prompts'?'../prompts':directory)){if(file.endsWith('.md'))files[directory+'/'+file]=strToU8((await fs.readFile(path.join(directory==='prompts'?'../prompts':directory,file),'utf8')).replaceAll('(../../prompts/','(../prompts/').replaceAll('(../../AGENTS.md)','(../AGENTS.md)').replaceAll('(../app/','(../'));}
const bytes=zipSync(files,{level:6});const filename='pdfnote-'+version+'-pwa.zip';await fs.writeFile('release/'+filename,bytes);await fs.writeFile('release/SHA256SUMS.txt',createHash('sha256').update(bytes).digest('hex')+'  '+filename+'\n');
console.log(filename+': '+(bytes.length/1024/1024).toFixed(2)+' MB');
