import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
const DEFINITIONS=[
 ['github','GitHub','Code','Repositories und Textdateien','https://github.com/settings/personal-access-tokens','Fine-grained Token: Contents read, Metadata read'],
 ['dropbox','Dropbox','Dateien','Ordner und Textdateien','https://www.dropbox.com/developers/apps','Access Token: account_info.read, files.metadata.read, files.content.read'],
 ['gitlab','GitLab','Code','Projekte und Repository-Dateien','https://gitlab.com/-/user_settings/personal_access_tokens','Personal Access Token: read_api, read_repository'],
 ['google-drive','Google Drive','Dateien','Dateien und Google-Dokumente','https://developers.google.com/drive/api/guides/api-specific-auth','OAuth Access Token: drive.readonly; läuft ab, manuell erneuern'],
 ['onedrive','OneDrive','Dateien','Microsoft-Drive: Ordner und Dateimetadaten','https://learn.microsoft.com/graph/auth/','Delegierter OAuth Access Token: User.Read, Files.Read; manuell erneuern'],
 ['box','Box','Dateien','Ordner und Dateimetadaten','https://developer.box.com/guides/authentication/','Developer/OAuth Access Token mit Lesezugriff; manuell erneuern'],
 ['notion','Notion','Wissen','Freigegebene Seiten und Seitenblöcke','https://www.notion.so/profile/integrations','Integration Token: Read content; Seiten für Integration freigeben'],
 ['slack','Slack','Kommunikation','Kanäle und deren letzte Nachrichten','https://api.slack.com/apps','Bot/User Token: channels:read, channels:history; nur zugängliche Kanäle'],
 ['linear','Linear','Projekte','Issues und Beschreibungen','https://linear.app/settings/api','Personal API Key mit Lesezugriff'],
 ['todoist','Todoist','Projekte','Aufgaben und Beschreibungen','https://app.todoist.com/app/settings/integrations/developer','Persönlicher API Token'],
 ['figma','Figma','Design','Dateistruktur und Texte per Dateischlüssel','https://www.figma.com/developers/api#access-tokens','Personal Access Token: current_user:read, file_content:read'],
].map(([id,name,category,description,documentation,credentialHint])=>({id,name,category,description,documentation,credentialHint,readOnly:true}));
const definition=id=>{const d=DEFINITIONS.find(x=>x.id===id);if(!d)throw fail(404,'Plugin nicht vorhanden.');return d;};
const fail=(status,message,code='PLUGIN_ERROR')=>Object.assign(new Error(message),{status,code});
const ident=value=>{if(typeof value!=='string'||value.length<1||value.length>600||/[\x00-\x1f]/.test(value))throw fail(400,'Ungültige Element-ID.');return value;};
const e=value=>encodeURIComponent(ident(value));
const textItem=(id,name,kind='document',extra={})=>({id:String(id),name:String(name||id).slice(0,180),kind,...extra});
const rich=parts=>(parts||[]).map(p=>p.plain_text||p.text?.content||'').join('');
export function createPlugins({db,dataDirectory,fetchImpl=fetch}) {
 db.exec('CREATE TABLE IF NOT EXISTS plugin_connections(userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,pluginId TEXT NOT NULL,credential TEXT NOT NULL,connectedAt TEXT NOT NULL,PRIMARY KEY(userId,pluginId))');
 let key;
 if(dataDirectory){mkdirSync(dataDirectory,{recursive:true});const file=join(dataDirectory,'plugins.key');try{key=readFileSync(file);}catch(error){if(error.code!=='ENOENT')throw error;key=randomBytes(32);writeFileSync(file,key,{flag:'wx',mode:0o600});}chmodSync(file,0o600);}else key=randomBytes(32);
 if(key.length!==32)throw new Error('Invalid plugin encryption key.');
 function seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64');}
 function open(value){const b=Buffer.from(value,'base64'),c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8');}
 async function request(plugin,token,path,{method='GET',body,raw=false,maxBytes=2*1024*1024,content=false}={}) {
  const roots={github:'https://api.github.com',dropbox:content?'https://content.dropboxapi.com':'https://api.dropboxapi.com',gitlab:'https://gitlab.com/api/v4','google-drive':'https://www.googleapis.com',onedrive:'https://graph.microsoft.com/v1.0',box:'https://api.box.com/2.0',notion:'https://api.notion.com/v1',slack:'https://slack.com/api',linear:'https://api.linear.app',todoist:'https://api.todoist.com/api/v1',figma:'https://api.figma.com/v1'};
  const headers={Accept:raw?'*/*':'application/json','User-Agent':'Stelex-GPT'};
  if(plugin==='figma')headers['X-Figma-Token']=token;else headers.Authorization=(plugin==='linear'&&!token.startsWith('lin_oauth_')?'':'Bearer ')+token;
  if(plugin==='notion')headers['Notion-Version']='2022-06-28';
  if(body!==undefined){if(content)headers['Dropbox-API-Arg']=JSON.stringify(body).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));else headers['Content-Type']='application/json';}
  let res;try{res=await fetchImpl(roots[plugin]+path,{method,headers,body:body===undefined||content?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw fail(502,'Dienst nicht erreichbar. Netzwerk oder Verbindung prüfen.');}
  if(!res.ok){await res.body?.cancel();throw fail(res.status===401||res.status===403?409:502,'Dienst antwortet mit HTTP '+res.status+'. Token, Freigaben und Berechtigungen prüfen.');}
  if(Number(res.headers.get('content-length'))>maxBytes){await res.body?.cancel();throw fail(413,'Antwort zu groß. Bitte Auswahl eingrenzen.');}
  const reader=res.body?.getReader();let chunks=[],size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw fail(413,'Antwort zu groß. Bitte Auswahl eingrenzen.');}chunks.push(Buffer.from(value));}}catch(error){if(error.status)throw error;throw fail(502,'Übertragung wurde unterbrochen.');}
  const bytes=Buffer.concat(chunks);let value;
  if(raw){try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail(415,'Nur UTF-8-Textdateien werden unterstützt.');}if(value.includes('\0'))throw fail(415,'Binärdateien können nicht als Text importiert werden.');return value;}
  try{value=JSON.parse(bytes.toString('utf8'));}catch{throw fail(502,'Dienst lieferte ungültiges JSON.');}
  if(plugin==='slack'&&!value.ok)throw fail(409,'Slack: Berechtigungen prüfen ('+String(value.error||'unknown').replace(/[^a-z_]/g,'').slice(0,80)+').');
  if(plugin==='linear'&&value.errors)throw fail(409,'Linear: Zugriff oder Abfrage wurde abgelehnt.');
  return value;
 }
 const gql=(token,query,variables={})=>request('linear',token,'/graphql',{method:'POST',body:{query,variables}});
 const credential=(uid,id)=>{definition(id);const row=db.prepare('SELECT credential FROM plugin_connections WHERE userId=? AND pluginId=?').get(uid,id);if(!row)throw fail(409,'Plugin zuerst verbinden.','PLUGIN_NOT_CONNECTED');return open(row.credential);};
 async function verify(id,t){switch(id){case'github':return request(id,t,'/user');case'dropbox':return request(id,t,'/2/users/get_current_account',{method:'POST',body:null});case'gitlab':return request(id,t,'/user');case'google-drive':return request(id,t,'/drive/v3/about?fields=user');case'onedrive':return request(id,t,'/me?$select=id,displayName');case'box':return request(id,t,'/users/me');case'notion':return request(id,t,'/users/me');case'slack':return request(id,t,'/auth.test',{method:'POST'});case'linear':return gql(t,'query { viewer { id name } }');case'todoist':return request(id,t,'/user');case'figma':return request(id,t,'/me');}}
 const result=(items,cursor='')=>({items:items.slice(0,100),cursor:cursor||null});
 async function items(uid,id,query='',cursor='') {
  const t=credential(uid,id);if(typeof query!=='string'||query.length>500||typeof cursor!=='string'||cursor.length>2048)throw fail(400,'Suchanfrage zu lang.');
  switch(id){
   case'github':{const d=await request(id,t,'/user/repos?per_page=100&sort=updated');return result(d.filter(x=>!query||x.full_name.toLowerCase().includes(query.toLowerCase())).map(x=>textItem(x.full_name,x.full_name,'repository')));}
   case'dropbox':{const d=await request(id,t,cursor?'/2/files/list_folder/continue':'/2/files/list_folder',{method:'POST',body:cursor?{cursor}:{path:query||'',limit:100}});return result(d.entries.map(x=>textItem(x.path_lower||x.id,x.name,x['.tag'])),d.has_more?d.cursor:'');}
   case'gitlab':{if(query&&/^\d+$/.test(query)){const d=await request(id,t,`/projects/${e(query)}/repository/tree?per_page=100`);return result(d.map(x=>textItem(query+':'+x.path,x.path,x.type==='tree'?'folder':'file')));}const d=await request(id,t,'/projects?membership=true&per_page=100&search='+encodeURIComponent(query));return result(d.map(x=>textItem(x.id,x.path_with_namespace,'project')));}
   case'google-drive':{const search=query?"trashed = false and name contains '"+query.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'":"trashed = false";const d=await request(id,t,'/drive/v3/files?pageSize=100&fields=files(id,name,mimeType),nextPageToken&q='+encodeURIComponent(search)+(cursor?'&pageToken='+encodeURIComponent(cursor):''));return result(d.files.map(x=>textItem(x.id,x.name,x.mimeType==='application/vnd.google-apps.folder'?'folder':'file',{mime:x.mimeType})),d.nextPageToken);}
   case'onedrive':{const path=query?`/me/drive/root/search(q='${encodeURIComponent(query.replace(/'/g,"''"))}')`:'/me/drive/root/children';const d=await request(id,t,path+'?$top=100');return result(d.value.map(x=>textItem(x.id,x.name,x.folder?'folder':'file')));}
   case'box':{const d=await request(id,t,'/folders/'+e(query||'0')+'/items?limit=100&fields=id,name,type');return result(d.entries.map(x=>textItem(x.id,x.name,x.type)));}
   case'notion':{const d=await request(id,t,'/search',{method:'POST',body:{query,page_size:100,...(cursor?{start_cursor:cursor}:{})}});return result(d.results.map(x=>textItem(x.id,rich(Object.values(x.properties||{}).find(p=>p.type==='title'||Array.isArray(p.title))?.title||x.title)||x.id,'page')),d.has_more?d.next_cursor:'');}
   case'slack':{const d=await request(id,t,'/conversations.list?exclude_archived=true&limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));return result(d.channels.filter(x=>!query||x.name.toLowerCase().includes(query.toLowerCase())).map(x=>textItem(x.id,'#'+x.name,'channel')),d.response_metadata?.next_cursor);}
   case'linear':{const d=await gql(t,'query($after:String){ issues(first:50, after:$after) { nodes { id identifier title } pageInfo { hasNextPage endCursor } } }',{after:cursor||null});return result(d.data.issues.nodes.filter(x=>!query||(x.title+' '+x.identifier).toLowerCase().includes(query.toLowerCase())).map(x=>textItem(x.id,x.identifier+' '+x.title,'issue')),d.data.issues.pageInfo.hasNextPage?d.data.issues.pageInfo.endCursor:'');}
   case'todoist':{const d=await request(id,t,'/tasks?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));return result(d.results.filter(x=>!query||x.content.toLowerCase().includes(query.toLowerCase())).map(x=>textItem(x.id,x.content,'task')),d.next_cursor);}
   case'figma':{if(!query)return {items:[],hint:'Dateischlüssel aus der Figma-Datei-URL eingeben.'};if(!/^[A-Za-z0-9_-]{5,100}$/.test(query))throw fail(400,'Figma-Dateischlüssel eingeben.');const d=await request(id,t,'/files/'+e(query)+'?depth=1');return result([textItem(query,d.name,'design')]);}
  }
 }
 async function read(uid,id,body){
  const t=credential(uid,id);if(!body||typeof body!=='object')throw fail(400,'Element auswählen.');const item=ident(body.id);let content,name=String(body.name||item).slice(0,160),source=id+':'+item;
  switch(id){
   case'github':{if(!/^[-\w.]+\/[-\w.]+$/.test(item))throw fail(400,'Repository als owner/name angeben.');const path=body.path;if(!path)return {items:(await request(id,t,'/repos/'+item+'/contents')).filter(x=>['file','dir'].includes(x.type)).map(x=>textItem(item,x.path,x.type==='dir'?'folder':'file',{path:x.path})),hint:'Dateipfad auswählen oder eingeben.'};if(typeof path!=='string'||path.length>500||path.split('/').some(x=>!x||x==='..'||x==='.')||/[\\\x00-\x1f]/.test(path))throw fail(400,'Ungültiger Repository-Pfad.');const d=await request(id,t,'/repos/'+item+'/contents/'+path.split('/').map(encodeURIComponent).join('/'));if(Array.isArray(d))return {items:d.filter(x=>['file','dir'].includes(x.type)).map(x=>textItem(item,x.path,x.type==='dir'?'folder':'file',{path:x.path}))};if(d.type!=='file'||d.encoding!=='base64'||d.size>100000)throw fail(413,'Nur Textdateien bis 100 KB.');content=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(d.content,'base64'));source+='/'+path;name=path;break;}
   case'dropbox':{if(body.kind==='folder')return items(uid,id,item);content=await request(id,t,'/2/files/download',{method:'POST',body:{path:item},content:true,raw:true,maxBytes:100000});break;}
   case'gitlab':{if(!item.includes(':'))return items(uid,id,item);const [project,...parts]=item.split(':');const path=parts.join(':');if(body.kind==='folder'){const d=await request(id,t,`/projects/${e(project)}/repository/tree?per_page=100&path=${e(path)}`);return {items:d.map(x=>textItem(project+':'+x.path,x.path,x.type==='tree'?'folder':'file'))};}content=await request(id,t,`/projects/${e(project)}/repository/files/${e(path)}/raw?ref=HEAD`,{raw:true,maxBytes:100000});break;}
   case'google-drive':{const meta=await request(id,t,'/drive/v3/files/'+e(item)+'?fields=name,mimeType');name=meta.name;const url=meta.mimeType==='application/vnd.google-apps.document'?'/drive/v3/files/'+e(item)+'/export?mimeType=text/plain':'/drive/v3/files/'+e(item)+'?alt=media';if(meta.mimeType.startsWith('application/vnd.google-apps.')&&meta.mimeType!=='application/vnd.google-apps.document')throw fail(415,'Bitte eine Textdatei oder ein Google-Dokument auswählen.');content=await request(id,t,url,{raw:true,maxBytes:100000});break;}
   case'onedrive':{const meta=await request(id,t,'/me/drive/items/'+e(item)+'?$select=id,name,folder');if(meta.folder){const d=await request(id,t,'/me/drive/items/'+e(item)+'/children?$top=100');return result(d.value.map(x=>textItem(x.id,x.name,x.folder?'folder':'file')));}content=JSON.stringify(meta,null,2);break;}
   case'box':{if(body.kind==='folder')return items(uid,id,item);const d=await request(id,t,'/files/'+e(item)+'?fields=id,name,description,size,modified_at');content=JSON.stringify(d,null,2);break;}
   case'notion':{const d=await request(id,t,'/blocks/'+e(item)+'/children?page_size=100');content=d.results.map(b=>rich(b[b.type]?.rich_text)||b.child_page?.title||'['+b.type+']').join('\n');if(d.has_more)content+='\n[Weitere Blöcke vorhanden; Vorschau zeigt die ersten 100.]';break;}
   case'slack':{const d=await request(id,t,'/conversations.history?channel='+e(item)+'&limit=50');content=d.messages.map(m=>'['+m.ts+'] '+(m.user||'Bot')+': '+(m.text||'')).join('\n');if(d.has_more)content+='\n[Weitere Nachrichten vorhanden; Vorschau zeigt die letzten 50.]';break;}
   case'linear':{const d=await gql(t,'query($id:String!){ issue(id:$id){ identifier title description url } }',{id:item});content=JSON.stringify(d.data.issue,null,2);break;}
   case'todoist':{const d=await request(id,t,'/tasks/'+e(item));content=d.content+'\n\n'+(d.description||'');break;}
   case'figma':{const d=await request(id,t,'/files/'+e(item)+'?depth=3');let lines=[d.name];let count=0;const visit=n=>{if(++count>2000)return;lines.push((n.type||'')+': '+(n.name||'')+(n.characters?'\n'+n.characters:''));for(const c of n.children||[])visit(c);};visit(d.document);content=lines.join('\n');break;}
  }
  if(typeof content!=='string'||content.includes('\0'))throw fail(415,'Kein lesbarer Text.');if(Buffer.byteLength(content)>100000)throw fail(413,'Text ist größer als 100 KB.');
  return {name,source,content,readOnly:true};
 }
 return {
  catalog(uid){const rows=db.prepare('SELECT pluginId,connectedAt FROM plugin_connections WHERE userId=?').all(uid);return DEFINITIONS.map(d=>({...d,connected:rows.some(r=>r.pluginId===d.id),connectedAt:rows.find(r=>r.pluginId===d.id)?.connectedAt||null}));},
  async connect(uid,id,body){definition(id);const token=body?.token;if(typeof token!=='string'||token.length<10||token.length>3000||/[\x00-\x20\x7f]/.test(token))throw fail(400,'Gültigen Access Token eingeben.');await verify(id,token);db.prepare('INSERT INTO plugin_connections VALUES(?,?,?,?) ON CONFLICT(userId,pluginId) DO UPDATE SET credential=excluded.credential,connectedAt=excluded.connectedAt').run(uid,id,seal(token),new Date().toISOString());return {ok:true};},
  disconnect(uid,id){definition(id);db.prepare('DELETE FROM plugin_connections WHERE userId=? AND pluginId=?').run(uid,id);},items,read
 };
}
