const ttl=15*60*1000;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function get(store,key){const object=await store.get(key);return object?await object.json():null;}
async function put(store,key,value){await store.put(key,JSON.stringify(value));}
async function revoke(store,pair){if(!pair)return;await store.delete('pair/'+pair.id);let cursor;do{const page=await store.list({prefix:'job/'+pair.id+'/',limit:1000,...(cursor?{cursor}:{})});for(const object of page.objects)await store.delete(object.key);cursor=page.truncated?page.cursor:null;}while(cursor);}
async function body(request){if(Number(request.headers.get('content-length')||0)>15000000)throw Error('Datei zu gross.');const text=await request.text();if(text.length>15000000)throw Error('Datei zu gross.');return JSON.parse(text);}
export function permittedPath(path){return typeof path==='string'&&path.startsWith('/api/')&&!/\/api\/(?:admin|desktop)(?:\/|$)/.test(path)&&!path.includes('\\')&&!path.includes('..')&&!/[\x00-\x1f]/.test(path)&&path.length<2000;}
function visitor(request){const user=request.headers.get('oai-authenticated-user-id');if(user)return user;const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>/^stelex_web_visitor=[a-f0-9]{64}$/.test(s));return cookie?'browser:'+cookie.slice('stelex_web_visitor='.length):null;}
export function createRelayWorker(assets={}){return{async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,store=env.BUCKET;
 const origin=request.headers.get('Origin');
 if(!['GET','HEAD','OPTIONS'].includes(request.method)&&!path.startsWith('/bridge/agent/')&&((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'Cross-origin writes are not allowed.'},403);
 try{
  if(/^\/(?:admin|api\/admin)(?:[/.]|$)/i.test(decodeURIComponent(path)))return json({error:'Not found'},404);
  if(path.startsWith('/api/')){
    const uid=visitor(request);if(!uid)return json({error:'Zuerst die Website öffnen und deinen PC verbinden.'},401);
    if(!store)return json({error:'Verbindung noch nicht eingerichtet.'},503);
    const link=await get(store,'owner/'+await sha(uid));const pair=link?await get(store,'pair/'+link.id):null;
    if(!pair||Date.now()-pair.seen>20000)return json({error:{message:'Dein PC ist offline. Stelex starten.',code:'PC_OFFLINE'}},503);
    if(!permittedPath(path+url.search)||!['GET','POST','PUT','DELETE'].includes(request.method))return json({error:'API-Pfad nicht erlaubt.'},403);
    const text=['GET','HEAD'].includes(request.method)?null:await request.text();if(text&&text.length>15000000)return json({error:'Datei zu gross.'},413);
    const id=crypto.randomUUID(),key='job/'+pair.id+'/'+id;
    const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>/^stelex_session=/.test(s))||'';
    await put(store,key,{id,created:Date.now(),state:'queued',payload:{kind:'http',path:path+url.search,method:request.method,body:text,cookie}});
    const until=Date.now()+650000;
    try{while(Date.now()<until){if(request.signal.aborted)throw Error('Anfrage abgebrochen.');const job=await get(store,key);if(!job)return json({error:{message:'Verbindung widerrufen oder Auftrag abgebrochen.',code:'BRIDGE_REVOKED'}},410);if(job?.state==='done'){
      const r=job.result;if(r.error)return json({error:{message:r.error,code:'BRIDGE_ERROR'}},r.status||502);
      const headers={'Content-Type':r.contentType||'application/json','Cache-Control':'no-store'};
      if(r.cookie)headers['Set-Cookie']=String(r.cookie).split(';').filter(s=>!/^\s*(?:domain|secure)/i.test(s)).join(';')+'; Secure';
      return new Response(Uint8Array.from(atob(r.body||''),c=>c.charCodeAt(0)),{status:r.status||200,headers});
    }await new Promise(r=>setTimeout(r,650));}return json({error:{message:'Zeitlimit der PC-Verbindung erreicht.',code:'BRIDGE_TIMEOUT'}},504);}finally{await store.delete(key);}
  }
  if(path.startsWith('/bridge/')){
   if(!store)return json({error:'Der Verbindungs-Speicher ist noch nicht bereit.'},503);
   const isAgent=path.startsWith('/bridge/agent/');let pair,owner;
   if(isAgent){const id=request.headers.get('X-Stelex-Bridge');if(!/^[a-f0-9]{64}$/.test(id||''))return json({error:'Nicht verbunden.'},401);pair=await get(store,'pair/'+id);if(!pair||await sha((request.headers.get('Authorization')||'').replace(/^Bearer /,''))!==pair.secretHash)return json({error:'Verbindung beendet oder ungueltig.'},401);}
   else{const user=visitor(request);if(!user){if(path==='/bridge/status'){const id=token();return json({paired:false,online:false,siteUrl:url.origin},200,{'Set-Cookie':'stelex_web_visitor='+id+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000'});}return json({error:'Website neu laden und deinen PC verbinden.'},401);}owner=await sha(user);const id=await get(store,'owner/'+owner);pair=id?await get(store,'pair/'+id.id):null;}
   if(path==='/bridge/status')return json({paired:Boolean(pair),online:Boolean(pair&&Date.now()-pair.seen<20000),siteUrl:url.origin});
   if(path==='/bridge/pair'&&request.method==='POST'){
    if(!env.STELEX_SERVICE_ACCESS)return json({error:'Desktop-Dienstzugang noch nicht konfiguriert.'},503);
    if(pair)await revoke(store,pair);
    const id=token(),secret=token();await put(store,'pair/'+id,{id,owner,secretHash:await sha(secret),seen:0});await put(store,'owner/'+owner,{id});return json({version:1,siteUrl:url.origin,bridgeId:id,secret,serviceAccess:env.STELEX_SERVICE_ACCESS},200);
   }
   if(path==='/bridge/disconnect'&&request.method==='POST'){if(pair)await revoke(store,pair);await store.delete('owner/'+owner);return json({ok:true});}
   if(!pair)return json({error:'Zuerst deinen PC verbinden.'},409);
   if(path==='/bridge/agent/poll'){
    pair.seen=Date.now();await put(store,'pair/'+pair.id,pair);const listed=await store.list({prefix:'job/'+pair.id+'/',limit:100});const jobs=[];
    for(const object of listed.objects){const j=await get(store,object.key);if(!j)continue;if(Date.now()-j.created>ttl){await store.delete(object.key);continue;}if(j.state==='queued'){j.state='running';await put(store,object.key,j);jobs.push(j);if(jobs.length===6)break;}}
    return json({jobs});
   }
   if(path==='/bridge/agent/result'&&request.method==='POST'){
    const result=await body(request);if(!/^[a-f0-9-]{36}$/i.test(result.id||''))return json({error:'Auftrag ungueltig.'},400);const key='job/'+pair.id+'/'+result.id,j=await get(store,key);if(!j||Date.now()-j.created>ttl)return json({error:'Auftrag abgelaufen.'},410);j.result=result.result;j.state='done';delete j.payload;await put(store,key,j);return json({ok:true});
   }
   if(path==='/bridge/jobs'&&request.method==='POST'){
    if(Date.now()-pair.seen>20000)return json({error:'Dein PC ist offline. Stelex starten und Verbindung aktivieren.'},503);
    const p=await body(request);if(!['http','voice','generate','folder','generation-status','save','cancel-voice'].includes(p.kind))return json({error:'Vorgang nicht erlaubt.'},400);if(p.kind==='http'&&!permittedPath(p.path))return json({error:'API-Pfad nicht erlaubt.'},403);
    if(p.kind==='http'&&!['GET','POST','PUT','DELETE'].includes(p.method))return json({error:'Methode ungueltig.'},400);
    const pending=await store.list({prefix:'job/'+pair.id+'/',limit:150});if(pending.objects.length>=100)return json({error:'Zu viele offene Auftraege. Kurz warten.'},429);
    const session=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>/^stelex_session=/.test(s));
    const id=crypto.randomUUID();await put(store,'job/'+pair.id+'/'+id,{id,created:Date.now(),state:'queued',payload:{...p,cookie:session||''}});return json({id},202);
   }
   const match=path.match(/^\/bridge\/jobs\/([a-f0-9-]{36})$/i);
   if(match){const key='job/'+pair.id+'/'+match[1];if(request.method==='DELETE'){await store.delete(key);return json({ok:true});}const j=await get(store,key);if(!j||Date.now()-j.created>ttl)return json({error:'Auftrag abgelaufen.'},410);if(j.state!=='done')return json({pending:true},202);const result=j.result;const headers={};if(result?.cookie){const c=String(result.cookie).split(';').filter(s=>!/^\s*(?:domain|secure)/i.test(s)).join(';');headers['Set-Cookie']=c+'; Secure';}return json(result,200,headers);}
   return json({error:'Nicht gefunden.'},404);
  }
  const asset=assets[path==='/'?'/index.html':path]||(!path.includes('.')?assets['/index.html']:null);if(!asset)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':asset.type,'Cache-Control':path.includes('/assets/')?'public,max-age=31536000,immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com; base-uri 'self'"}});
 }catch(e){return json({error:e.message||'Verbindungsfehler.'},400);}
}};}
