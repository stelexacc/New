'use strict';
document.querySelector('#unlock-form').addEventListener('submit',async event=>{
  event.preventDefault();const input=document.querySelector('#code'),button=document.querySelector('#unlock'),status=document.querySelector('#status');
  if(button.disabled)return;button.disabled=true;status.textContent='Wird entsperrt …';
  try{const result=await window.stelexAdminUnlock.unlock(input.value);if(result.ok){input.value='';status.textContent='Admin-Tool wird geöffnet …';}else{status.textContent=result.error;input.value='';input.focus();}}
  catch{status.textContent='Das Admin-Tool konnte nicht geöffnet werden.';}finally{button.disabled=false;}
});
