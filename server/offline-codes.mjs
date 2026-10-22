import {createPrivateKey,createPublicKey,sign,verify,createHash,randomUUID} from 'node:crypto';
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function issuerId(publicKey){return createHash('sha256').update(createPublicKey(publicKey).export({type:'spki',format:'der'})).digest('hex').slice(0,24);}
export function mintOfflineCode(privatePem,{type='credits',credits=0,planId=null,durationDays=null}){
 const privateKey=createPrivateKey(privatePem);if(privateKey.asymmetricKeyType!=='ed25519')throw Error('Invalid issuer key.');
 const payload={v:1,issuer:issuerId(createPublicKey(privateKey).export({type:'spki',format:'pem'})),id:randomUUID(),type,credits:type==='credits'?credits:0,planId:type==='plan'?planId:null,durationDays:type==='plan'?durationDays:null,issuedAt:Date.now()};
 validate(payload);const data=Buffer.from(JSON.stringify(payload)).toString('base64url');const signature=sign(null,Buffer.from(`STELEX-OFFLINE-1:${data}`),privateKey).toString('base64url');
 return{code:`STXO1.${data}.${signature}`,payload};
}
function validate(p){if(!p||p.v!==1||!/^[a-f0-9]{24}$/.test(p.issuer)||!/^[a-f0-9-]{36}$/.test(p.id)||!integer(p.issuedAt,0,Number.MAX_SAFE_INTEGER)||!['credits','plan'].includes(p.type)||p.type==='credits'&&(!integer(p.credits,1,1000000000)||p.planId!==null||p.durationDays!==null)||p.type==='plan'&&(p.credits!==0||!['starter','pro','max'].includes(p.planId)||!integer(p.durationDays,1,366)))throw Error('Invalid offline code.');}
export function verifyOfflineCode(code,publicPem){
 if(typeof code!=='string'||code.length>2048)throw Error('Invalid offline code.');
 const match=/^STXO1\.([A-Za-z0-9_-]{1,1500})\.([A-Za-z0-9_-]{86})$/.exec(code);if(!match)throw Error('Invalid offline code.');
 const payloadBytes=Buffer.from(match[1],'base64url'),sig=Buffer.from(match[2],'base64url');
 if(payloadBytes.toString('base64url')!==match[1]||sig.toString('base64url')!==match[2]||!verify(null,Buffer.from(`STELEX-OFFLINE-1:${match[1]}`),publicPem,sig))throw Error('Invalid offline signature.');
 const payload=JSON.parse(payloadBytes.toString('utf8'));validate(payload);if(payload.issuer!==issuerId(publicPem))throw Error('Unknown issuer.');return payload;
}
