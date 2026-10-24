const TRINKEY_VENDOR = 0x239a;
const TRINKEY_PRODUCTS = [0x8158, 0x8157];
const filters = TRINKEY_PRODUCTS.map(usbProductId => ({usbVendorId:TRINKEY_VENDOR,usbProductId}));
const isTrinkey = info => info.usbVendorId === TRINKEY_VENDOR && TRINKEY_PRODUCTS.includes(info.usbProductId);

export class SerialDevice extends EventTarget {
 constructor(serial=globalThis.navigator?.serial){super();this.serial=serial;this.pending=new Map();this.sequence=0;this.buffer='';this.closing=false;this.writeQueue=Promise.resolve();}
 async connect(){
  if(!this.serial)throw new Error('Open this page in desktop Chrome or Edge to connect a Trinkey.');
  const known=this.serial.getPorts ? (await this.serial.getPorts()).filter(port=>isTrinkey(port.getInfo())) : [];
  this.port=known.length===1 ? known[0] : await this.serial.requestPort({filters});
  const usbInfo=this.port.getInfo?.() || {};
  try{if(usbInfo.usbProductId!==undefined&&!isTrinkey(usbInfo))throw new Error('Select a TRRS Trinkey in normal operating mode. If it is showing a BOOT drive, unplug and reconnect it first.');await this.port.open({baudRate:115200,bufferSize:2048});await this.port.setSignals({dataTerminalReady:true});this.writer=this.port.writable.getWriter();this.reader=this.port.readable.getReader();this.reading=this.readLoop();
   let hello;
   try{hello=await this.request('HELLO',8000);}catch(error){
    if(error.code!=='RESPONSE_TIMEOUT')throw error;
    if(usbInfo.usbProductId===0x8157)throw new Error('Trinkey found, but its current device software did not answer this configurator. Open First-time setup to update this unit directly from the site. Your bindings have not been changed.');
    throw new Error('Trinkey found, but its configurator software did not respond. If setup just finished, unplug and reconnect it. Otherwise, use First-time setup. Your bindings have not been changed.');
   }
   if(hello[0]!=='HELLO'||hello[1]!=='NARBE_TRRS'||hello[2]!=='1')throw new Error('This device needs the NARBE setup files. Open First-time setup.');
   this.info={version:hello[3],id:hello[4]};return this.info;
  }catch(error){await this.close();throw error;}
 }
 async readLoop(){const decoder=new TextDecoder();try{while(!this.closing){const {value,done}=await this.reader.read();if(done)break;this.accept(decoder.decode(value,{stream:true}));}}catch(error){if(!this.closing)this.failure=error;}finally{this.reader?.releaseLock();this.reader=null;if(!this.closing){this.rejectPending(new Error('Trinkey disconnected. Reconnect before saving.'));this.dispatchEvent(new Event('disconnect'));void this.close();}}}
 accept(chunk){this.buffer+=chunk;if(this.buffer.length>4096){this.buffer='';this.rejectPending(new Error('Unexpected serial data. Check the selected port.'));return;}let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end+1);const parts=line.split(/\s+/);if(parts[0]==='EVENT'){this.dispatchEvent(new CustomEvent('deviceevent',{detail:parts.slice(1)}));continue;}const pending=this.pending.get(parts[0]);if(!pending)continue;clearTimeout(pending.timer);this.pending.delete(parts[0]);if(parts[1]==='OK')pending.resolve(parts.slice(2));else pending.reject(new Error(parts[2]==='STARTUP'?'The Trinkey could not start its configuration software. Open First-time setup to repair it.':'The Trinkey rejected the request. Your new settings were not confirmed.'));}}
 request(command,timeout=3500){if(!this.writer||this.closing)return Promise.reject(new Error('Connect your Trinkey first.'));const id=String(++this.sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Object.assign(new Error('The Trinkey did not respond. Reconnect before trying again.'),{code:'RESPONSE_TIMEOUT'}));},timeout);this.pending.set(id,{resolve,reject,timer});const packet=new TextEncoder().encode(id+' '+command+'\n');this.writeQueue=this.writeQueue.catch(()=>{}).then(()=>this.writer.write(packet));this.writeQueue.catch(error=>{const entry=this.pending.get(id);if(entry){clearTimeout(entry.timer);this.pending.delete(id);entry.reject(error);}});});}
 rejectPending(error){for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(error);}this.pending.clear();}
 async close(){if(this.closeTask)return this.closeTask;this.closing=true;this.closeTask=(async()=>{this.rejectPending(new Error('Connection closed.'));try{await this.reader?.cancel();}catch{}try{await this.reading;}catch{}try{await this.writeQueue;}catch{}try{this.writer?.releaseLock();}catch{}this.writer=null;try{await this.port?.close();}catch{}})();return this.closeTask;}
}
