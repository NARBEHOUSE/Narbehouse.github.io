import {inspectBootDrive,prepareCircuitPython,prepareRestore,writeUF2} from './uf2.mjs';
import {zip,download} from './zip.mjs';
const FILES=['narbe_settings.mpy','narbe_device.mpy','boot.py','code.py'];
export async function inspectDrive(directory){
 let info;try{info=await (await (await directory.getFileHandle('boot_out.txt')).getFile()).text();}catch{throw new Error('Select the CIRCUITPY drive itself. A BOOT drive or ordinary folder cannot be used.');}
 if(!/^Board ID:\s*adafruit_trrs_trinkey_m0\s*$/m.test(info))throw new Error('This is not an Adafruit TRRS Trinkey M0. No files were changed.');
 if(!/Adafruit CircuitPython 10\./.test(info))throw new Error('This preview targets CircuitPython 10.x. Check the installed version before proceeding. No files were changed.');
 const entries=[];
 for(const name of FILES){try{const file=await (await directory.getFileHandle(name)).getFile();if(file.size>128*1024)throw new Error('Unexpectedly large device file.');entries.push([name,new Uint8Array(await file.arrayBuffer())]);}catch(error){if(error.name!=='NotFoundError')throw error;}}
 entries.push(['RESTORE.txt','To restore: enter CircuitPython safe mode, then copy the backed-up boot.py and code.py to CIRCUITPY. Copy any other backed-up .py files too. Leave lib/ in place. Eject and unplug/replug. This backup contains only the files the configurator installer replaces.']);
 const uid=info.match(/^UID:\s*([a-f0-9]+)\s*$/im)?.[1];if(!uid)throw new Error('Cannot read a device ID. No files were changed.');return {directory,entries,id:uid.toLowerCase(),version:info.split(/\r?\n/)[0]};
}
export async function loadPayload(){const manifest=await fetch('./firmware/manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Cannot load the installation manifest.');return r.json();});const payload=[];for(const name of FILES){const response=await fetch('./firmware/'+name,{cache:'no-store'});if(!response.ok)throw new Error('Cannot load '+name);const data=new Uint8Array(await response.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');if(manifest.files[name]!==hash)throw new Error('Installation file verification failed. Reload the page and try again.');payload.push([name,data]);}return payload;}
export async function installPayload(directory,payload,progress=()=>{}){for(const [name,data]of payload){progress(name);const file=await directory.getFileHandle(name,{create:true});const writer=await file.createWritable();try{await writer.write(data);await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}const readback=new Uint8Array(await (await file.getFile()).arrayBuffer());if(readback.length!==data.length||readback.some((v,i)=>v!==data[i]))throw new Error('Read-back verification failed for '+name+'. Stay in safe mode and retry.');}}
function openBackups(){return new Promise((resolve,reject)=>{const request=indexedDB.open('narbe-trinkey-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('originals',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Browser recovery storage is unavailable. Allow site storage and try again.'));});}
export async function readBackup(id){const db=await openBackups();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('originals','readonly');const request=tx.objectStore('originals').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function keepBackup(device){const existing=await readBackup(device.id);if(existing)return existing;const backup={id:device.id,entries:device.entries,kind:device.kind||'files',date:new Date().toISOString()};const db=await openBackups();try{await new Promise((resolve,reject)=>{const tx=db.transaction('originals','readwrite');tx.objectStore('originals').add(backup);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('Could not save a recovery copy. No installation files were written.'));tx.onabort=()=>reject(new Error('Recovery storage was interrupted.'));});}finally{db.close();}return backup;}
export async function loadBaseFirmware(){
 const manifest=await fetch('./firmware/manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Cannot load setup information.');return r.json();});
 if(manifest.base?.file!=='circuitpython-10.0.3.uf2')throw new Error('Unsupported setup image.');
 const response=await fetch('./firmware/'+manifest.base.file,{cache:'no-store'});
 if(!response.ok)throw new Error('Cannot load the device update.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.base.sha256)throw new Error('Device update verification failed. Reload and try again.');
 return prepareCircuitPython(bytes);
}
async function firmwareBackups(){const db=await openBackups();try{return await new Promise((resolve,reject)=>{const request=db.transaction('originals','readonly').objectStore('originals').getAll();request.onsuccess=()=>resolve(request.result.filter(b=>b.kind==='uf2'));request.onerror=()=>reject(request.error);});}finally{db.close();}}
export function setupInstaller(){
 const $=selector=>document.querySelector(selector),dialog=$('#setup-dialog'),status=$('#install-status'),select=$('#select-drive'),restore=$('#restore-original'),check=$('#safe-confirm'),downloadButton=$('#download-backup'),prepare=$('#prepare-device'),finish=$('#finish-setup'),restoreFirmware=$('#restore-firmware'),backupSelect=$('#firmware-backup');
 let busy=false,backup=null;
 const tell=(message,error=false)=>{status.hidden=false;status.textContent=message;status.classList.toggle('error',error);};
 const controls=()=>{select.disabled=!check.checked||busy;restore.disabled=busy||!check.checked;check.disabled=busy;prepare.disabled=busy;finish.disabled=busy;restoreFirmware.disabled=busy||!backupSelect.value;$('#setup-close').disabled=busy;};
 const refreshBackups=async()=>{const backups=await firmwareBackups();backupSelect.replaceChildren(new Option('Select a recovery copy',''),...backups.map(item=>new Option(new Date(item.date).toLocaleString()+' · '+(item.deviceId?.slice(-6)||item.id.slice(-6)),item.id)));if(backup?.kind==='uf2')backupSelect.value=backup.id;controls();};
 const open=()=>{dialog.showModal();void refreshBackups().catch(()=>{});};
 $('#setup-open').onclick=open;$('#setup-hero').onclick=open;$('#setup-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});check.onchange=controls;backupSelect.onchange=controls;
 const pickDirectory=async()=>{if(!window.showDirectoryPicker)throw new Error('Use desktop Chrome or Edge to set up your Trinkey directly from this site.');return window.showDirectoryPicker({mode:'readwrite'});};
 const pick=async()=>inspectDrive(await pickDirectory());
 const perform=async action=>{busy=true;controls();try{await action();}catch(error){if(error.name!=='AbortError')tell(error.message,true);}finally{busy=false;controls();}};
 prepare.onclick=()=>perform(async()=>{
  const device=await inspectBootDrive(await pickDirectory());
  tell('Trinkey verified. Preparing the update and saving its original software…');
  const image=await loadBaseFirmware();
  backup=await keepBackup(device);
  // Persist the recovery pointer before any flash write; storage failure stops the update.
  localStorage.setItem('narbe-pending-setup',backup.id);
  downloadButton.hidden=false;
  const result=await writeUF2(device.directory,image);
  await refreshBackups();
  tell(result.uncertain?'The device restarted or the transfer was interrupted. If CIRCUITPY appears, choose Finish setup below. If TRINKEYBOOT remains, choose it again to retry. Your recovery copy is saved.':'Update sent. Wait for the drive named CIRCUITPY, then choose Finish setup below. Keep the Trinkey plugged in.');
 });
 finish.onclick=()=>perform(async()=>{
  const device=await pick();
  const pending=localStorage.getItem('narbe-pending-setup');
  if(!pending)throw new Error('Start with Choose TRINKEYBOOT above, or use the CircuitPython setup option below if this unit already runs CircuitPython.');
  backup=await readBackup(pending);
  if(!backup?.kind||backup.kind!=='uf2')throw new Error('The original firmware recovery copy is missing. Use the browser and website where you began setup.');
  const payload=await loadPayload();
  await installPayload(device.directory,payload,()=>tell('Finishing setup… Keep your Trinkey plugged in.'));
  localStorage.removeItem('narbe-pending-setup');
  downloadButton.hidden=false;
  tell('Setup files installed and verified. Eject CIRCUITPY, unplug and reconnect the Trinkey, then close this guide and click Connect. Connection confirms that setup is working. Defaults are Space and Enter.');
 });
 select.onclick=()=>{if(check.checked)void perform(async()=>{
  const device=await pick();const payload=await loadPayload();backup=await keepBackup(device);downloadButton.hidden=false;
  await installPayload(device.directory,payload,()=>tell('Setting up your Trinkey… Keep it plugged in.'));
  tell('Setup files installed and verified. Eject CIRCUITPY, unplug and reconnect, then close this guide and click Connect.');check.checked=false;
 });};
 restore.onclick=()=>{if(check.checked)void perform(async()=>{
  const device=await pick();backup=await readBackup(device.id);
  if(!backup)throw new Error('No startup-file recovery copy for this Trinkey exists in this browser. For a full firmware copy, use Restore original device software above.');
  const files=FILES.filter(name=>backup.entries.some(([entry])=>entry===name)).map(name=>backup.entries.find(([entry])=>entry===name));
  if(!files.some(([name])=>name==='code.py')||!files.some(([name])=>name==='boot.py'))throw new Error('The recovery copy is missing original startup files.');
  await installPayload(device.directory,files);downloadButton.hidden=false;tell('Original startup files restored. Eject CIRCUITPY, then unplug and reconnect.');
 });};
 restoreFirmware.onclick=()=>perform(async()=>{
  backup=await readBackup(backupSelect.value);
  if(backup?.kind!=='uf2')throw new Error('Choose an original firmware recovery copy first.');
  const image=prepareRestore(backup.entries.find(([name])=>name==='CURRENT.UF2')[1]);
  const target=await inspectBootDrive(await pickDirectory());
  const result=await writeUF2(target.directory,image);
  downloadButton.hidden=false;
  tell(result.uncertain?'The device restarted or restoration was interrupted. Unplug and reconnect, then check its original switch behavior. If it stays in TRINKEYBOOT, retry restoration.':'Original firmware sent. Unplug and reconnect, then check the original switch behavior. The bootloader was preserved.');
 });
 downloadButton.onclick=()=>{if(backup)download(zip(backup.entries),'Trinkey-recovery-'+backup.id.slice(-6)+'.zip');};controls();
}
