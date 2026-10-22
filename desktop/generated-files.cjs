'use strict';
const path=require('node:path');
const {decodeArtifact}=require('./output-files.cjs');
const EXT={python:'py',py:'py',javascript:'js',js:'js',typescript:'ts',ts:'ts',jsx:'jsx',tsx:'tsx',html:'html',css:'css',json:'json',powershell:'ps1',ps1:'ps1',bash:'sh',sh:'sh',c:'c',cpp:'cpp','c++':'cpp',csharp:'cs',java:'java',go:'go',rust:'rs',sql:'sql',yaml:'yaml',yml:'yml',text:'txt',txt:'txt',markdown:'md',md:'md'};
function parseGeneratedFiles(content,requestText=''){
 if(typeof content!=='string'||content.length>1000000||typeof requestText!=='string'||requestText.length>20000)throw Error('Invalid generated response.');
 const wantsExe=/\.exe\b|\bexe[- ]?datei\b|\bexecutable\b|ausführbar/i.test(requestText);
 const requested=requestText.match(/\b([\wäöüÄÖÜß-]{1,100}\.(?:py|exe|js|ts|html|css|json|txt|ps1|cpp|c|cs|java|go|rs))\b/i)?.[1];
 const files=[],names=new Set();const pattern=/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;let match;
 while((match=pattern.exec(content))!==null){if(files.length>=20)throw Error('Maximal 20 Dateien pro Antwort.');const header=match[1].trim(),language=header.split(/\s+/)[0].toLowerCase(),extension=EXT[language]||(/\.[a-z0-9]{1,8}$/i.test(language)?language.split('.').pop():null);if(!extension)continue;
  const named=header.match(/(?:filename|file|title)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);let name=named&&(named[1]||named[2]||named[3]);
  if(!name){const comment=match[2].split('\n')[0].match(/^(?:#|\/\/)\s*(?:file|filename|datei)\s*:\s*(\S+)/i);name=comment?.[1];}
  if(!name && /\.[a-z0-9]{1,8}$/i.test(language)){name=language;}
  if(!name && files.length===0&&requested && (path.extname(requested).slice(1).toLowerCase()===extension || /\.exe$/i.test(requested)&&extension==='py'))name=requested.replace(/\.exe$/i,'.py');
  if(!name)name=`stelex-${files.length+1}.${extension}`;
  // Executable output must be compiled, never supplied as renamed text.
  if(/\.(?:exe|dll|com|scr|msi)$/i.test(name))throw Error('EXE-Dateien werden aus Python gebaut, nicht als Text gespeichert.');
  decodeArtifact({name,content:match[2]});if(names.has(name.toLowerCase()))throw Error(`Doppelter Dateiname: ${name}`);names.add(name.toLowerCase());files.push({name,content:match[2],encoding:'utf8'});
 }
 const entry=files.find(f=>/^(?:main|app)\.py$/i.test(f.name))||files.find(f=>/\.py$/i.test(f.name));
 return{files,wantsExe,entryName:entry?.name||null,exeName:wantsExe?(requested&&/\.exe$/i.test(requested)?requested.replace(/\.exe$/i,'.exe'):(entry?path.parse(entry.name).name+'.exe':'stelex-app.exe')):null};
}
module.exports={parseGeneratedFiles};
