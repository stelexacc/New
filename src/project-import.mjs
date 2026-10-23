// Import a bounded source snapshot, not dependencies, secrets or executable binaries.
const ignored=new Set(['node_modules','.git','.svn','dist','build','venv','.venv','__pycache__','.idea','.next','vendor']);
const source=/\.(txt|md|json|csv|py|js|mjs|cjs|jsx|ts|tsx|html?|css|scss|xml|svg|ya?ml|sql|sh|ps1|bat|c|cpp|h|hpp|cs|java|rs|go|ini|toml)$/i;
export function includeProjectPath(path){const parts=path.replaceAll('\\','/').split('/');return !parts.some(p=>ignored.has(p)||p==='..'||/^\.env(?:\.|$)/i.test(p)||/\.(pem|key|pfx|p12)$/i.test(p))&&source.test(path);}
export async function collectDrop(dataTransfer){
 const entries=Array.from(dataTransfer.items||[]).filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
 if(!entries.length)return Array.from(dataTransfer.files||[]);
 const result=[];let examined=0;
 async function visit(entry,prefix=''){
  if(++examined>3000)throw Error('Der Ordner enthält zu viele Einträge. Bitte einen kleineren Quellcode-Ordner wählen.');
  const relative=prefix+entry.name;
  if(entry.isDirectory){if(ignored.has(entry.name)||entry.name.startsWith('.env'))return;const reader=entry.createReader();let batch;do{batch=await new Promise((ok,no)=>reader.readEntries(ok,no));for(const child of batch)await visit(child,relative+'/');}while(batch.length);}
  else if(entry.isFile&&(!prefix||includeProjectPath(relative))){const file=await new Promise((ok,no)=>entry.file(ok,no));if(prefix)Object.defineProperty(file,'projectRelativePath',{value:relative});result.push(file);if(result.length>200)throw Error('Maximal 200 Projektdateien. Bitte einen kleineren Ordner wählen.');}
 }
 for(const entry of entries)await visit(entry);return result;
}
export async function bundleProjects(files){
 const plain=[],groups=new Map();
 for(const file of Array.from(files||[])){const path=file.projectRelativePath||file.webkitRelativePath;if(!path){plain.push(file);continue;}if(!includeProjectPath(path))continue;const root=path.split('/')[0];if(!groups.has(root))groups.set(root,[]);groups.get(root).push({file,path});}
 for(const [root,entries] of groups){if(entries.length>200)throw Error('Maximal 200 Projektdateien.');let total=0;const blocks=[];for(const {file,path} of entries.sort((a,b)=>a.path.localeCompare(b.path))){if((total+=file.size)>90*1024)throw Error('Projekt-Snapshot maximal 90 KB. Bitte einen kleineren Unterordner wählen.');const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw Error('Binärdatei im Projekt: '+path);blocks.push('--- FILE '+JSON.stringify(path)+' ---\n'+text+'\n--- END FILE ---');}const text='PROJECT SNAPSHOT: '+root+'\nOnly source files; dependencies, build output and secret files excluded.\n'+blocks.join('\n');if(new TextEncoder().encode(text).length>100*1024)throw Error('Projekt-Snapshot zu groß.');plain.push(new File([text],root.slice(0,100)+'-projekt.txt',{type:'text/plain'}));}
 if(!plain.length)throw Error('Keine unterstützten Quellcode-Dateien im Ordner gefunden.');return plain;
}
