const strings = {
  de: {
    creditControl:'Credit-Verwaltung',ownerOnly:'Nur für Betreiber.\nKein Kundenzugang.',console:'ADMIN-KONSOLE',logout:'Abmelden',ownerConsole:'OWNER CONSOLE',title:'Deine Credits. Deine Kontrolle.',subtitle:'Erstelle einmalig einlösbare Codes mit genau dem gewünschten Guthaben.',connectTitle:'Sicher verbinden',protected:'GESCHÜTZT',connectDescription:'Verbinde dich mit deinem Stelex-Server. Der Admin-Schlüssel bleibt nur bis zum Abmelden oder Schließen im Arbeitsspeicher.',serverUrl:'Serveradresse',adminToken:'Admin-Schlüssel',connect:'Verbinden',sameServer:'Dieses Tool muss auf demselben Server wie die API geöffnet sein. Zugangsdaten gehören niemals in die Kunden-App.',openServer:'Admin-Tool auf diesem Server öffnen ↗',issued:'Ausgestellte Credits',issuedCaption:'Summe aller erstellten Codes',redeemed:'Eingelöste Credits',redeemedCaption:'Guthaben bei deinen Kunden',availableCodes:'Verfügbare Codes',registeredUsers:'registrierte Konten',generatorTitle:'Codes erstellen',generatorDescription:'Du bestimmst das Guthaben. Jeder Code kann genau einmal eingelöst werden.',creditsPerCode:'Credits pro Code',quantity:'Anzahl der Codes',internalNote:'Interne Notiz',optional:'optional',notePlaceholder:'Zum Beispiel: Discord-Bestellung #1024',totalCredits:'Gesamtes Guthaben',generate:'Codes generieren',keySecurity:'Kryptografisch zufällig. Auf dem Server nur als Hash gespeichert.',generatedTitle:'Deine neuen Codes',emptyTitle:'Bereit für den ersten Code.',emptyDescription:'Neue Codes erscheinen hier. Kopiere oder exportiere sie direkt nach dem Erstellen.',saveWarning:'Jetzt sichern: Vollständige Codes werden nur einmal angezeigt und sind später nicht wiederherstellbar.',copyAll:'Alle kopieren',exportCsv:'CSV exportieren ↓',historyTitle:'Code-Verlauf',refresh:'Aktualisieren',historyDescription:'Status und Guthaben deiner zuletzt erstellten Codes. Vollständige Codes bleiben verborgen.',search:'Verlauf durchsuchen',searchPlaceholder:'Notiz oder Kennung suchen …',keyId:'Code-Kennung',credits:'Credits',status:'Status',created:'Erstellt',note:'Notiz',historyEmpty:'Noch keine Codes erstellt.',noMatches:'Keine passenden Codes gefunden.',footer:'Guthaben wird erst beim Einlösen einem Konto gutgeschrieben.',copy:'Kopieren',available:'Verfügbar',used:'Eingelöst',connecting:'Verbinde …',generating:'Wird erstellt …',connected:'Sicher verbunden.',loggedOut:'Abgemeldet. Der Admin-Schlüssel wurde aus dem Arbeitsspeicher entfernt.',copied:'Codes kopiert.',copyError:'Kopieren nicht möglich. Markiere und kopiere den Code manuell.',generated:'{count} Code(s) mit je {credits} Credits erstellt. Jetzt sichern.',invalidUrl:'Gib eine HTTPS-Serveradresse ein. HTTP ist nur für localhost erlaubt.',originMismatch:'Öffne zuerst das Admin-Tool auf der angegebenen Serveradresse. Der Schlüssel wurde nicht übertragen.',invalidNumbers:'Credits müssen eine ganze Zahl zwischen 1 und 1.000.000.000 sein. Erstelle 1 bis 100 Codes gleichzeitig.',networkError:'Verbindung fehlgeschlagen. Prüfe die Serveradresse und ob der Stelex-Server läuft.',unauthorized:'Der Admin-Schlüssel ist ungültig oder abgelaufen.',requestError:'Die Anfrage ist fehlgeschlagen.',unsaved:'Neue Codes sind nur in dieser Sitzung sichtbar. Sichere sie vor dem Verlassen.',downloaded:'CSV-Datei heruntergeladen.',sessionExpired:'Sitzung beendet. Verbinde dich erneut.',newCodesNotice:'Die neu erstellten Codes wurden oben hinzugefügt. Sichere sie jetzt.'
  },
  en: {
    creditControl:'Credit control',ownerOnly:'For operators only.\nNo customer access.',console:'ADMIN CONSOLE',logout:'Disconnect',ownerConsole:'OWNER CONSOLE',title:'Your credits. Your control.',subtitle:'Create single-use redemption codes with exactly the balance you choose.',connectTitle:'Connect securely',protected:'PROTECTED',connectDescription:'Connect to your Stelex server. Your admin key stays in memory only until you disconnect or close this window.',serverUrl:'Server address',adminToken:'Admin key',connect:'Connect',sameServer:'Open this tool on the same server as the API. Never include admin credentials in the customer app.',openServer:'Open the admin tool on this server ↗',issued:'Credits issued',issuedCaption:'Total value of all generated codes',redeemed:'Credits redeemed',redeemedCaption:'Balance delivered to your customers',availableCodes:'Available codes',registeredUsers:'registered accounts',generatorTitle:'Create codes',generatorDescription:'You choose the balance. Each code can be redeemed exactly once.',creditsPerCode:'Credits per code',quantity:'Number of codes',internalNote:'Internal note',optional:'optional',notePlaceholder:'For example: Discord order #1024',totalCredits:'Total credits',generate:'Generate codes',keySecurity:'Cryptographically random. Only hashes are stored on the server.',generatedTitle:'Your new codes',emptyTitle:'Ready for your first code.',emptyDescription:'New codes appear here. Copy or export them immediately after generation.',saveWarning:'Save now: full codes are displayed only once and cannot be recovered later.',copyAll:'Copy all',exportCsv:'Export CSV ↓',historyTitle:'Code history',refresh:'Refresh',historyDescription:'Status and balance of your most recent codes. Full codes remain hidden.',search:'Search history',searchPlaceholder:'Search note or identifier …',keyId:'Code identifier',credits:'Credits',status:'Status',created:'Created',note:'Note',historyEmpty:'No codes created yet.',noMatches:'No matching codes found.',footer:'Credits are added to an account only when its code is redeemed.',copy:'Copy',available:'Available',used:'Redeemed',connecting:'Connecting …',generating:'Generating …',connected:'Securely connected.',loggedOut:'Disconnected. The admin key has been removed from memory.',copied:'Codes copied.',copyError:'Clipboard unavailable. Select and copy the code manually.',generated:'Created {count} code(s), each worth {credits} credits. Save them now.',invalidUrl:'Enter an HTTPS server address. HTTP is allowed only for localhost.',originMismatch:'First open the admin tool on the specified server. Your key has not been sent.',invalidNumbers:'Credits must be a whole number from 1 to 1,000,000,000. Create between 1 and 100 codes at a time.',networkError:'Connection failed. Check the server address and whether your Stelex server is running.',unauthorized:'The admin key is invalid or has expired.',requestError:'The request failed.',unsaved:'New codes are visible only during this session. Save them before leaving.',downloaded:'CSV file downloaded.',sessionExpired:'Session ended. Please connect again.',newCodesNotice:'Your new codes were added above. Save them now.'
  }
};

const $ = (selector) => document.querySelector(selector);
let language = 'de';
let token = '';
let serverUrl = location.origin;
let keys = [];
let generatedKeys = [];
let lastStats = null;
let toastTimer;
let generating = false;
let connecting = false;

const t = (key,values={}) => Object.entries(values).reduce((value,[name,replacement])=>value.replaceAll(`{${name}}`,String(replacement)),strings[language][key] ?? key);
const number = (value) => new Intl.NumberFormat(language==='de'?'de-DE':'en-GB').format(Number(value)||0);
const date = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat(language==='de'?'de-DE':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(parsed);
};

function toast(message,type='') {
  clearTimeout(toastTimer);
  const node=$('#toast');
  node.textContent=message;
  node.className=`toast ${type}`;
  node.hidden=false;
  toastTimer=setTimeout(()=>{node.hidden=true;},type==='error'?9500:6000);
}

function setLanguage(next) {
  language=next==='en'?'en':'de';
  document.documentElement.lang=language;
  document.title=`Stelex GPT — ${t('creditControl')}`;
  document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t(node.dataset.i18n);});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node=>{node.placeholder=t(node.dataset.i18nPlaceholder);});
  document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
  $('#login-submit span:first-child').textContent=t(connecting?'connecting':'connect');
  $('#generate-submit span:first-child').textContent=t(generating?'generating':'generate');
  renderStats();renderGenerated();renderHistory();updateTotal();
}

function parseServer(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error(t('invalidUrl')); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.pathname!=='/'||url.search||url.hash) throw new Error(t('invalidUrl'));
  return url.origin;
}

async function request(path,{method='GET',body}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(`${serverUrl}/api${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:controller.signal});
    let data;
    try {data=await response.json();} catch {throw new Error(t('requestError'));}
    if(!response.ok) {
      if(response.status===401||data.code==='ADMIN_REQUIRED') throw new Error(t('unauthorized'));
      if(data.code==='INVALID_KEY_AMOUNT') throw new Error(t('invalidNumbers'));
      if(data.code==='ORIGIN_REJECTED') throw new Error(t('originMismatch'));
      throw new Error(typeof data.error==='string'?data.error:data.error?.message||t('requestError'));
    }
    return data;
  } catch(error) {
    if(error.name==='AbortError'||error instanceof TypeError) throw new Error(t('networkError'));
    throw error;
  } finally {clearTimeout(timer);}
}

function renderStats() {
  if(!lastStats) return;
  $('#stat-issued').textContent=number(lastStats.creditsIssued);
  $('#stat-redeemed').textContent=number(lastStats.creditsRedeemed);
  $('#stat-available').textContent=number(lastStats.unredeemedKeys);
  $('#stat-users').textContent=number(lastStats.users);
}

function makeText(tag,text,className) {
  const element=document.createElement(tag);
  element.textContent=text;
  if(className) element.className=className;
  return element;
}

function renderGenerated() {
  $('#generated-count').textContent=number(generatedKeys.length);
  $('#generated-empty').hidden=generatedKeys.length>0;
  $('#generated-content').hidden=generatedKeys.length===0;
  $('#generated-list').replaceChildren();
  generatedKeys.forEach(key=>{
    const row=document.createElement('div');row.className='code-row';
    const detail=document.createElement('div');
    detail.append(makeText('code',key.code));
    detail.append(makeText('div',`${number(key.credits)} ${t('credits')} · ${date(key.createdAt)}`,'code-meta'));
    const copy=makeText('button',t('copy'),'copy-one');copy.type='button';
    copy.setAttribute('aria-label',`${t('copy')}: ${key.code}`);
    copy.addEventListener('click',()=>copyText(key.code));
    row.append(detail,copy);$('#generated-list').append(row);
  });
}

function renderHistory() {
  const search=$('#search').value.trim().toLocaleLowerCase();
  const filtered=keys.filter(key=>`${key.id} ${key.note||''}`.toLocaleLowerCase().includes(search));
  $('#history-body').replaceChildren();
  filtered.forEach(key=>{
    const row=document.createElement('tr');
    row.append(makeText('td',String(key.id||'—')));
    row.append(makeText('td',number(key.credits)));
    const status=document.createElement('td');
    status.append(makeText('span',t(key.status==='redeemed'?'used':'available'),`key-status ${key.status==='redeemed'?'redeemed':''}`));
    if(key.redeemedAt) status.title=date(key.redeemedAt);
    row.append(status,makeText('td',date(key.createdAt)),makeText('td',key.note||'—'));
    $('#history-body').append(row);
  });
  $('#history-empty').hidden=filtered.length>0;
  $('#history-empty').textContent=t(keys.length?'noMatches':'historyEmpty');
}

function updateTotal() {
  const credits=Number($('#credits').value),quantity=Number($('#quantity').value);
  $('#total-credits').textContent=number(Number.isSafeInteger(credits)&&Number.isSafeInteger(quantity)&&credits>0&&quantity>0?credits*quantity:0);
}

async function refresh() {
  const [stats,keyData]=await Promise.all([request('/admin/stats'),request('/admin/keys')]);
  lastStats=stats;keys=Array.isArray(keyData.keys)?keyData.keys:[];
  renderStats();renderHistory();
}

async function copyText(text) {
  try {await navigator.clipboard.writeText(text);toast(t('copied'),'success');}
  catch {toast(t('copyError'),'error');}
}

function logout(showToast=true) {
  token='';keys=[];generatedKeys=[];lastStats=null;
  $('#admin-token').value='';$('#workspace').hidden=true;$('#login-panel').hidden=false;$('#logout').hidden=true;
  renderGenerated();renderHistory();
  if(showToast) toast(t('loggedOut'));
}

$('#server-url').value=serverUrl;
$('#year').textContent=String(new Date().getFullYear());
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.lang)));
$('#credits').addEventListener('input',updateTotal);
$('#quantity').addEventListener('input',updateTotal);
$('#search').addEventListener('input',renderHistory);
$('#logout').addEventListener('click',()=>{
  if(generating) return;
  logout();
});

$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();if(connecting) return;
  $('#open-server').hidden=true;
  try {
    const chosen=parseServer($('#server-url').value.trim());
    if(chosen!==location.origin) {
      $('#open-server').href=`${chosen}/admin`;
      $('#open-server').hidden=false;
      throw new Error(t('originMismatch'));
    }
    connecting=true;$('#login-submit').disabled=true;$('#login-submit span:first-child').textContent=t('connecting');
    serverUrl=chosen;token=$('#admin-token').value.trim();
    await refresh();
    $('#admin-token').value='';$('#login-panel').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;
    toast(t('connected'),'success');
  } catch(error) {token='';toast(error.message,'error');}
  finally {connecting=false;$('#login-submit').disabled=false;$('#login-submit span:first-child').textContent=t('connect');}
});

$('#generate-form').addEventListener('submit',async event=>{
  event.preventDefault();if(generating||!token) return;
  const credits=Number($('#credits').value),count=Number($('#quantity').value);
  if(!Number.isSafeInteger(credits)||credits<1||credits>1000000000||!Number.isInteger(count)||count<1||count>100) return toast(t('invalidNumbers'),'error');
  generating=true;$('#generate-submit').disabled=true;$('#logout').disabled=true;$('#generate-submit span:first-child').textContent=t('generating');
  try {
    const result=await request('/admin/keys',{method:'POST',body:{credits,count,note:$('#note').value.trim()}});
    if(!Array.isArray(result.keys)||result.keys.some(key=>typeof key.code!=='string')) throw new Error(t('requestError'));
    generatedKeys=[...result.keys,...generatedKeys];renderGenerated();
    toast(t('generated',{count:result.keys.length,credits:number(credits)}),'success');
    try {await refresh();} catch(error){toast(`${t('newCodesNotice')} ${error.message}`,'error');}
  } catch(error) {toast(error.message,'error');}
  finally {generating=false;$('#generate-submit').disabled=false;$('#logout').disabled=false;$('#generate-submit span:first-child').textContent=t('generate');}
});

$('#refresh').addEventListener('click',async()=>{
  $('#refresh').disabled=true;
  try {await refresh();} catch(error){toast(error.message,'error');}
  finally {$('#refresh').disabled=false;}
});
$('#copy-all').addEventListener('click',()=>copyText(generatedKeys.map(key=>`${key.code}\t${key.credits} ${t('credits')}`).join('\n')));
$('#export-csv').addEventListener('click',()=>{
  const cell=value=>{
    const raw=String(value??'');
    const safe=/^\s*[=+\-@]|^[\t\r\n]/.test(raw)?`'${raw}`:raw;
    return `"${safe.replaceAll('"','""')}"`;
  };
  const rows=[['code','credits','created_at'],...generatedKeys.map(key=>[key.code,key.credits,key.createdAt])];
  const blob=new Blob(['\uFEFF',rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download=`stelex-codes-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.csv`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(t('downloaded'),'success');
});
window.addEventListener('beforeunload',event=>{if(generatedKeys.length||generating){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{token='';});
window.addEventListener('pageshow',event=>{if(event.persisted) logout(false);});
setLanguage(language);
