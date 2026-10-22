import { createHash, randomUUID } from 'node:crypto';

export const ATTACHMENT_LIMITS = { count: 4, imageBytes: 5 * 1024 * 1024, imageTotalBytes: 10 * 1024 * 1024, textBytes: 64 * 1024, textTotalBytes: 100 * 1024 };
const IMAGE_TYPES = new Set(['image/png','image/jpeg','image/webp']);
const TEXT_TYPES = new Set(['application/json','application/xml','application/yaml','application/x-yaml','application/javascript','application/typescript','application/x-python-code']);
class AttachmentError extends Error {
  constructor(status,message,code='INVALID_ATTACHMENT') { super(message);this.status=status;this.code=code; }
}
function base64(value,maxBytes) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes/3)*4 || value.length%4) throw new AttachmentError(400,'The attachment has invalid base64 data.');
  // Scan once: repeated-group regexes can exhaust V8's stack on valid multi-MiB images.
  let contentEnd=value.length;
  if(value.endsWith('=='))contentEnd-=2;else if(value.endsWith('='))contentEnd--;
  for(let index=0;index<contentEnd;index++) {
    const code=value.charCodeAt(index);
    if(!(code>=65&&code<=90||code>=97&&code<=122||code>=48&&code<=57||code===43||code===47)) throw new AttachmentError(400,'The attachment has invalid base64 data.');
  }
  const bytes=Buffer.from(value,'base64');
  if (bytes.length > maxBytes) throw new AttachmentError(413,'The attachment exceeds its size limit.','ATTACHMENT_TOO_LARGE');
  if (bytes.toString('base64') !== value) throw new AttachmentError(400,'The attachment has non-canonical base64 data.');
  return bytes;
}

function imageDimensions(bytes,mime) {
  if (mime==='image/png') {
    if (bytes.length<24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16)!=='IHDR') throw new AttachmentError(400,'Invalid PNG attachment.');
    return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  }
  if (mime==='image/webp') {
    if (bytes.length<25 || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WEBP') throw new AttachmentError(400,'Invalid WebP attachment.');
    const kind=bytes.toString('ascii',12,16);
    if (kind==='VP8X' && bytes.length>=30) return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
    if (kind==='VP8L' && bytes[20]===0x2f) {const value=bytes.readUInt32LE(21);return [1+(value&0x3fff),1+((value>>>14)&0x3fff)];}
    if (kind==='VP8 ' && bytes.length>=30 && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) return [bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];
    throw new AttachmentError(400,'Unsupported WebP image structure.');
  }
  if (bytes.length<4 || bytes[0]!==0xff || bytes[1]!==0xd8) throw new AttachmentError(400,'Invalid JPEG attachment.');
  let offset=2;
  while (offset+4<=bytes.length) {
    if (bytes[offset++]!==0xff) throw new AttachmentError(400,'Invalid JPEG image structure.');
    while (offset<bytes.length && bytes[offset]===0xff) offset++;
    const marker=bytes[offset++];
    if (marker===0xd9 || marker===0xda) break;
    if (marker===0x01 || marker>=0xd0&&marker<=0xd7) continue;
    if (offset+2>bytes.length) break;
    const length=bytes.readUInt16BE(offset);
    if (length<2 || offset+length>bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length>=7) return [bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];
    offset+=length;
  }
  throw new AttachmentError(400,'The JPEG attachment has no readable dimensions.');
}
export function validateAttachments(value) {
  if (value===undefined) return [];
  if (!Array.isArray(value) || value.length>ATTACHMENT_LIMITS.count) throw new AttachmentError(400,'Attach at most four files.');
  let imageTotal=0,textTotal=0;
  return value.map(item=>{
    if (!item || typeof item!=='object' || Array.isArray(item) || typeof item.name!=='string' || !item.name.trim() || item.name.length>180 || /[\x00-\x1f\x7f/\\]/.test(item.name) || /[\uD800-\uDFFF]/u.test(item.name) || typeof item.mime!=='string' || typeof item.content!=='string') throw new AttachmentError(400,'Use a valid attachment name, MIME type and content.');
    const name=item.name.trim(),mime=item.mime.toLowerCase().split(';')[0].trim();
    const image=IMAGE_TYPES.has(mime),text=mime.startsWith('text/')||TEXT_TYPES.has(mime);
    if (!image && !text) throw new AttachmentError(415,'This file type is not supported. Attach text/code or a PNG, JPEG or WebP image.','ATTACHMENT_UNSUPPORTED');
    const max=image?ATTACHMENT_LIMITS.imageBytes:ATTACHMENT_LIMITS.textBytes;
    const encoding=item.encoding || (image?'base64':'utf8');
    if (!['utf8','base64'].includes(encoding) || image&&encoding!=='base64') throw new AttachmentError(400,'Images require base64; text requires UTF-8 or base64.');
    if (item.content.length>Math.ceil(max/3)*4) throw new AttachmentError(413,'The attachment exceeds its size limit.','ATTACHMENT_TOO_LARGE');
    if(encoding==='utf8' && /[\uD800-\uDFFF]/u.test(item.content))throw new AttachmentError(400,'The text attachment is not valid Unicode.');
    const bytes=encoding==='base64'?base64(item.content,max):Buffer.from(item.content,'utf8');
    if (!bytes.length || bytes.length>max) throw new AttachmentError(413,'The attachment is empty or exceeds its size limit.','ATTACHMENT_TOO_LARGE');
    let content,estimatedTokens=0;
    if (image) {
      imageTotal+=bytes.length;
      const [width,height]=imageDimensions(bytes,mime);
      if (!width || !height || width>10000 || height>10000 || width*height>40_000_000) throw new AttachmentError(400,'The image dimensions are unsupported.');
      // Image tokenization varies by provider. Reserve a bounded patch estimate;
      // settle against reported usage, just as for text input and output.
      estimatedTokens=Math.max(2048,Math.min(32768,Math.ceil(width/28)*Math.ceil(height/28)*2+256));
      content=bytes.toString('base64');
    } else {
      textTotal+=bytes.length;
      try {content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);} catch {throw new AttachmentError(400,'The text attachment is not valid UTF-8.');}
      if (content!==bytes.toString('utf8') || content.includes('\0')) throw new AttachmentError(400,'Binary data cannot be attached as text.');
    }
    if (imageTotal>ATTACHMENT_LIMITS.imageTotalBytes || textTotal>ATTACHMENT_LIMITS.textTotalBytes) throw new AttachmentError(413,'The attachments exceed the combined size limit.','ATTACHMENT_TOO_LARGE');
    return {name,mime,kind:image?'image':'text',encoding:image?'base64':'utf8',content,size:bytes.length,estimatedTokens,hash:createHash('sha256').update(bytes).digest('hex')};
  });
}
export function providerContent(text,attachments) {
  const textParts=[text];
  for (const item of attachments) if(item.kind==='text') textParts.push(`Attached file: ${item.name}\n${item.content}`);
  const images=attachments.filter(item=>item.kind==='image');
  const combined=textParts.filter(Boolean).join('\n\n');
  if (!images.length) return combined;
  return [{type:'text',text:combined||'Describe the attached image.'},...images.map(item=>({type:'image_url',image_url:{url:`data:${item.mime};base64,${item.content}`}}))];
}
export function estimatedMessageTokens(message,attachments=[]) {
  const content=typeof message.content==='string'?message.content:message.content.filter(part=>part.type==='text').map(part=>part.text).join('\n');
  return Buffer.byteLength(content,'utf8')+32+attachments.reduce((sum,item)=>sum+(item.kind==='image'?item.estimatedTokens:0),0);
}
export function initializeAttachments(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY,messageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,kind TEXT NOT NULL,encoding TEXT NOT NULL,content TEXT NOT NULL,size INTEGER NOT NULL,estimatedTokens INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS attachments_message ON attachments(messageId);`);
  const metadata=item=>({id:item.id,name:item.name,mime:item.mime,kind:item.kind,encoding:item.encoding,size:item.size,url:`/api/attachments/${item.id}`});
  return {
    list(messageId,full=false) {const rows=db.prepare('SELECT * FROM attachments WHERE messageId=? ORDER BY rowid').all(messageId);return full?rows:rows.map(metadata);},
    save(messageId,items) {return items.map(item=>{const stored={...item,id:randomUUID(),messageId};db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?)').run(stored.id,messageId,item.name,item.mime,item.kind,item.encoding,item.content,item.size,item.estimatedTokens);return metadata(stored);});},
    owned(id,userId) {return db.prepare('SELECT a.* FROM attachments a JOIN messages m ON m.id=a.messageId JOIN conversations c ON c.id=m.conversationId WHERE a.id=? AND c.userId=?').get(id,userId);},
    historyMessages(history,currentAttachments=[]) {
      let imageCount=currentAttachments.filter(a=>a.kind==='image').length,imageBytes=currentAttachments.filter(a=>a.kind==='image').reduce((n,a)=>n+a.size,0),textBytes=currentAttachments.filter(a=>a.kind==='text').reduce((n,a)=>n+a.size,0);
      const included=new Map();
      for (const item of [...history].reverse()) {
        const files=[];
        for (const file of this.list(item.id,true)) {
          if (file.kind==='image') {if(imageCount>=4||imageBytes+file.size>ATTACHMENT_LIMITS.imageTotalBytes)continue;imageCount++;imageBytes+=file.size;}
          else {if(textBytes+file.size>ATTACHMENT_LIMITS.textTotalBytes)continue;textBytes+=file.size;}
          files.push(file);
        }
        included.set(item.id,files);
      }
      return history.map(item=>({message:{role:item.role,content:providerContent(item.content,included.get(item.id)||[])},attachments:included.get(item.id)||[]}));
    },
  };
}
