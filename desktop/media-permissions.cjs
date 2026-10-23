'use strict';
function allowAudio({trusted,local,admin=false,mainFrame=false,leaseUntil=0,mediaTypes,now=Date.now()}){return Boolean(trusted&&local&&!admin&&mainFrame&&leaseUntil>now&&Array.isArray(mediaTypes)&&mediaTypes.length>0&&mediaTypes.every(type=>type==='audio'));}
module.exports={allowAudio};
