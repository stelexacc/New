'use strict';
function outputContract(requestText='') {
 if(typeof requestText!=='string')throw new Error('Invalid output request.');
 const noExe=/\b(?:kein(?:e|en|es)?|ohne|nicht\s+als|no)\s+(?:eine?\s+)?\.?exe\b/i.test(requestText);
 const wantsExe=!noExe&&/(?:\bexe\b|\.exe\b|\bexecutable\b|\bausf(?:ü|ue)hrbar(?:e|en|es)?\b)/i.test(requestText);
 const wantsPython=wantsExe||/\.py\b|\bpython(?:[- ]?(?:datei|skript|script|code|programm|app))?\b/i.test(requestText)&&/(?:\.py\b|erstelle|erstell|schreib|programmiere|entwickle|speicher|gib|mach|baue?|create|build|save|write|als\s+python|in\s+python)/i.test(requestText);
 const filenames=[...requestText.matchAll(/\b([\p{L}\p{N}_-]{1,100}\.(?:py|exe))\b/giu)].map(m=>m[1]);
 const requestedExe=filenames.find(n=>/\.exe$/i.test(n));
 const requestedPy=filenames.find(n=>/\.py$/i.test(n));
 return {wantsExe,wantsPython,requestedPy:requestedPy||(requestedExe?requestedExe.replace(/\.exe$/i,'.py'):null),requestedExe};
}
module.exports={outputContract};
