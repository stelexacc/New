import React from 'react';
import { FileText, Image, Paperclip, X } from 'lucide-react';

export const attachmentText = {
  de: { add: 'Dateien oder Bilder hinzufügen', remove: 'Anhang entfernen', count: 'Anhänge', tooMany: 'Du kannst höchstens vier Dateien anhängen.', imageSize: 'Bilder dürfen je 5 MB und zusammen 10 MB groß sein.', textSize: 'Textdateien dürfen je 100 KB und zusammen 100 KB groß sein.', unsupported: 'Dieses Format wird nicht unterstützt. Wähle ein PNG-, JPEG-, WebP-Bild oder eine Text-/Code-Datei.', invalidText: 'Diese Datei enthält keinen gültigen UTF-8-Text.', failed: 'Die Datei konnte nicht gelesen werden.', imageModel: 'Das gewählte Modell unterstützt keine Bilder. Wähle ein Modell mit Bildunterstützung.', help: 'Bilder und Text-/Code-Dateien · bis zu 4 Anhänge', attached: 'Datei angehängt', image: 'Bild', text: 'Textdatei' },
  en: { add: 'Add files or images', remove: 'Remove attachment', count: 'Attachments', tooMany: 'You can attach up to four files.', imageSize: 'Images may be up to 5 MB each and 10 MB combined.', textSize: 'Text files may be up to 100 KB each and 100 KB combined.', unsupported: 'This format is not supported. Choose a PNG, JPEG or WebP image, or a text/code file.', invalidText: 'This file does not contain valid UTF-8 text.', failed: 'The file could not be read.', imageModel: 'The selected model does not support images. Choose a model with image support.', help: 'Images and text/code files · up to 4 attachments', attached: 'File attached', image: 'Image', text: 'Text file' }
};
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const textExtension = /\.(?:txt|md|markdown|json|csv|tsv|log|py|js|mjs|cjs|jsx|ts|tsx|html?|css|scss|xml|svg|ya?ml|sql|sh|ps1|bat|c|cpp|h|hpp|cs|java|rs|go|ini|toml|env|gitignore)$/i;
export const ACCEPT_ATTACHMENTS = 'image/png,image/jpeg,image/webp,text/*,.txt,.md,.json,.csv,.py,.js,.jsx,.ts,.tsx,.html,.css,.xml,.yaml,.yml,.sql,.sh,.ps1,.bat,.c,.cpp,.h,.cs,.java,.rs,.go,.log,.toml';
const byteSize = item => item.bytes ?? (item.encoding === 'base64' ? Math.floor(item.content.length * 3 / 4) : new TextEncoder().encode(item.content || '').length);
const isImage = item => imageTypes.has(item.mime);
function base64(bytes) { let text = ''; for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(text); }
export async function readAttachments(files, existing, lang, allowImages = true) {
  const c = attachmentText[lang];
  const incoming = Array.from(files || []);
  if (existing.length + incoming.length > 4) throw new Error(c.tooMany);
  let images = existing.filter(isImage).reduce((n, item) => n + byteSize(item), 0);
  let texts = existing.filter(item => !isImage(item)).reduce((n, item) => n + byteSize(item), 0);
  const result = [];
  for (const file of incoming) {
    const declaredMime = String(file.type || '').split(';')[0].toLowerCase();
    const imageExtension = file.name.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
    const mime = (!declaredMime || declaredMime === 'application/octet-stream') && imageExtension ? (imageExtension === 'png' ? 'image/png' : imageExtension === 'webp' ? 'image/webp' : 'image/jpeg') : declaredMime;
    const image = imageTypes.has(mime);
    if (image && !allowImages) throw new Error(c.imageModel);
    if (!image && !mime.startsWith('text/') && !textExtension.test(file.name)) throw new Error(c.unsupported);
    if (image ? file.size > 5 * 1024 * 1024 || (images += file.size) > 10 * 1024 * 1024 : file.size > 100 * 1024 || (texts += file.size) > 100 * 1024) throw new Error(image ? c.imageSize : c.textSize);
    let data; try { data = new Uint8Array(await file.arrayBuffer()); } catch { throw new Error(c.failed); }
    let content;
    if (image) content = base64(data);
    else { try { content = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw new Error(c.invalidText); } }
    result.push({ id: crypto.randomUUID(), name: file.name.slice(0, 160), mime: image ? mime : 'text/plain', content, encoding: image ? 'base64' : 'utf8', bytes: file.size });
  }
  return result;
}
function safeUrl(item){return typeof item.url==='string'&&/^\/api\/attachments\/[a-f0-9-]{36}$/i.test(item.url)?item.url:null;}
function imageUrl(item) {
  const persisted=safeUrl(item);if(isImage(item)&&persisted)return persisted;
  if (!isImage(item) || item.encoding !== 'base64' || typeof item.content !== 'string' || item.content.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.content)) return null;
  return `data:${item.mime};base64,${item.content}`;
}
export function AttachmentButton({ onClick, disabled, lang }) { return <button type="button" className="attachment-add" onClick={onClick} disabled={disabled} aria-label={attachmentText[lang].add} title={attachmentText[lang].help}><Paperclip size={16}/></button>; }
export function AttachmentList({ attachments = [], onRemove, disabled, lang, message = false }) {
  const c = attachmentText[lang];
  if (!attachments.length) return null;
  return <div className={`attachment-list ${message ? 'message-attachments' : 'pending-attachments'}`} aria-label={c.count}>{attachments.map((item, index) => {
    const url = imageUrl(item);
    return <div className={`attachment-chip ${url ? 'with-preview' : ''}`} key={item.id || index}>{url ? <img src={url} alt={`${c.image}: ${item.name}`} loading="lazy"/> : isImage(item) ? <Image size={16}/> : <FileText size={16}/>}<span><strong title={item.name}>{safeUrl(item)?<a href={safeUrl(item)} download={item.name}>{item.name}</a>:item.name}</strong><small>{isImage(item) ? c.image : c.text}{(item.bytes||item.size) ? ` · ${((item.bytes||item.size) / 1024).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })} KB` : ''}</small></span>{onRemove && <button type="button" onClick={() => onRemove(index)} disabled={disabled} aria-label={`${c.remove}: ${item.name}`}><X size={13}/></button>}</div>;
  })}</div>;
}
