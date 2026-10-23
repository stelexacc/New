'use strict';
const catalog=require('../config/models.json');
function localModels(installedNames=[],details={}){
 const installed=new Set(installedNames);
 return catalog.map(item=>{const capabilities=details[item.id]?.capabilities||[];return {...item,available:installed.has(item.id),vision:!item.textOnly&&capabilities.includes('vision'),supportsThinking:capabilities.includes('thinking')||/qwen3\.5|qwen35|gemma4/.test(item.id)};});
}
module.exports={catalog,localModels};
