import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT,validateConfig,captureBinding,fromResponse,bindingLabel} from '../lib/bindings.mjs';
import {SerialDevice} from '../lib/device.mjs';
import {inspectDrive,installPayload} from '../lib/installer.mjs';
import {zip} from '../lib/zip.mjs';
test('Tab, arrows and Shift+Tab capture as physical HID keys',()=>{assert.deepEqual(captureBinding({code:'Tab',shiftKey:true}),['K',43,2]);assert.deepEqual(captureBinding({code:'ArrowRight'}),['K',79,0]);assert.equal(captureBinding({code:'Fn'}),null);});
test('configuration rejects invalid mouse/key/modifier/contact data',()=>{assert.deepEqual(validateConfig(DEFAULT),DEFAULT);for(const input of [['M',3,0,'K',40,0,'A'],['K',0,0,'K',40,0,'A'],['K',44,16,'K',40,0,'A'],['M',1,2,'K',40,0,'A'],['K',44,0,'K',40,0,'X']])assert.throws(()=>validateConfig(input));});
test('response parser and labels preserve mouse and keyboard actions',()=>{assert.deepEqual(fromResponse(['CONFIG','K','43','2','M','2','0','R']),['K',43,2,'M',2,0,'R']);assert.equal(bindingLabel(['K',43,2,'M',2,0,'R'],0),'Shift + Tab');assert.equal(bindingLabel(['K',43,2,'M',2,0,'R'],1),'Right mouse button');assert.throws(()=>fromResponse(['HELLO']));});
test('serial parser handles split replies and unsolicited switch events',async()=>{const d=new SerialDevice();let packet;d.writer={write:async value=>{packet=new TextDecoder().decode(value);}};let event;d.addEventListener('deviceevent',e=>event=e.detail);const reply=d.request('GET');await Promise.resolve();await Promise.resolve();d.accept('EVENT SWITCH 1 DOWN\n1 O');d.accept('K CONFIG K 44 0 K 40 0 A\n');assert.deepEqual(await reply,['CONFIG','K','44','0','K','40','0','A']);assert.deepEqual(event,['SWITCH','1','DOWN']);await d.writeQueue;assert.equal(packet,'1 GET\n');});
test('serial timeout and rejection never resolve as successful saves',async()=>{const d=new SerialDevice();d.writer={write:async()=>{}};await assert.rejects(d.request('SET K 43 0 M 1 0 A',10),/did not respond/);const rejected=d.request('SET INVALID');d.accept('2 ERR REJECTED\n');await assert.rejects(rejected,/rejected/);});
class MemoryDirectory{constructor(entries){this.entries=new Map(Object.entries(entries));this.writes=[];this.corrupt=false;}async getFileHandle(name,options={}){if(!this.entries.has(name)&&!options.create)throw new DOMException('Missing','NotFoundError');const owner=this;return {getFile:async()=>new Blob([owner.entries.get(name)||'']),createWritable:async()=>({write:async data=>{owner.writes.push(name);owner.entries.set(name,owner.corrupt?'corrupt':data);},close:async()=>{},abort:async()=>{}})};}}
const identity='Adafruit CircuitPython 10.0.3\nBoard ID:adafruit_trrs_trinkey_m0\nUID:abcdef0123456789\n';
test('installer refuses wrong drive and non-target firmware before writing',async()=>{for(const info of ['',identity.replace('trrs_trinkey_m0','qtpy_m0'),identity.replace('10.0.3','9.2.0')]){const dir=new MemoryDirectory({'boot_out.txt':info});await assert.rejects(inspectDrive(dir));assert.equal(dir.writes.length,0);}});
test('installer backs up original programs and identifies the board',async()=>{const dir=new MemoryDirectory({'boot_out.txt':identity,'boot.py':'old boot','code.py':'old code'});const result=await inspectDrive(dir);assert.equal(result.id,'abcdef0123456789');assert.equal(new TextDecoder().decode(result.entries.find(([name])=>name==='code.py')[1]),'old code');assert.equal(dir.writes.length,0);});
test('installer writes sequentially, reads back each file and detects corruption',async()=>{const dir=new MemoryDirectory({});const payload=[['boot.py',new TextEncoder().encode('boot')],['code.py',new TextEncoder().encode('code')]];await installPayload(dir,payload);assert.deepEqual(dir.writes,['boot.py','code.py']);dir.corrupt=true;await assert.rejects(installPayload(dir,payload),/verification failed/);});
test('backup ZIP contains standard headers and exact original bytes',async()=>{const data=new Uint8Array(await zip([['code.py','original code']]).arrayBuffer());assert.equal(new DataView(data.buffer).getUint32(0,true),0x04034b50);assert.ok(new TextDecoder().decode(data).includes('original code'));assert.equal(new DataView(data.buffer).getUint32(data.length-22,true),0x06054b50);});

test('complete Web Serial connection asserts DTR and reads persistent settings',async()=>{let controller,dtr=false,current=[...DEFAULT];const encoder=new TextEncoder(),decoder=new TextDecoder();const port={readable:new ReadableStream({start(c){controller=c;}}),writable:new WritableStream({write(data){const [id,command,...args]=decoder.decode(data).trim().split(' ');let response;if(command==='HELLO')response='HELLO NARBE_TRRS 1 0.1.0 abcdef';else if(command==='GET')response='CONFIG '+current.join(' ');else if(command==='SET'){current=validateConfig(args);response='CONFIG '+current.join(' ');}controller.enqueue(encoder.encode(id+' OK '+response+'\n'));}}),open:async()=>{},setSignals:async signals=>{dtr=signals.dataTerminalReady;},close:async()=>{}};const device=new SerialDevice({requestPort:async options=>{assert.deepEqual(options.filters,[{usbVendorId:0x239a,usbProductId:0x8158},{usbVendorId:0x239a,usbProductId:0x8157}]);return port;}});await device.connect();assert.ok(dtr);assert.equal(device.info.version,'0.1.0');await device.request('SET K 43 0 M 1 0 A');assert.deepEqual(fromResponse(await device.request('GET')),['K',43,0,'M',1,0,'A']);await device.close();assert.equal(device.pending.size,0);});

test('one previously paired Trinkey is reused; unrelated and bootloader ports are ignored',async()=>{
 let opened=0,controller;
 const port={getInfo:()=>({usbVendorId:0x239a,usbProductId:0x8158}),open:async()=>{opened++;},setSignals:async()=>{},close:async()=>{},
 readable:new ReadableStream({start(c){controller=c;}}),
 writable:new WritableStream({write(){controller.enqueue(new TextEncoder().encode('1 OK HELLO NARBE_TRRS 1 0.1.0 test\n'));}})};
 const other={getInfo:()=>({usbVendorId:0x239a,usbProductId:0x0157})};
 const device=new SerialDevice({getPorts:async()=>[other,port],requestPort:async()=>{assert.fail('Should reuse the paired Trinkey');}});
 await device.connect();assert.equal(opened,1);await device.close();
});
test('bootloader port is rejected before opening or sending commands',async()=>{
 let opened=false;const port={getInfo:()=>({usbVendorId:0x239a,usbProductId:0x0157}),open:async()=>{opened=true;},close:async()=>{}};
 const device=new SerialDevice({requestPort:async()=>port});
 await assert.rejects(device.connect(),/BOOT drive/);assert.equal(opened,false);
});
test('silent legacy firmware gives a specific explanation and releases the port',async()=>{
 let closed=false;const port={getInfo:()=>({usbVendorId:0x239a,usbProductId:0x8157}),open:async()=>{},setSignals:async()=>{},close:async()=>{closed=true;},readable:new ReadableStream(),writable:new WritableStream()};
 const device=new SerialDevice({requestPort:async()=>port});
 device.request=async()=>{throw Object.assign(new Error('timeout'),{code:'RESPONSE_TIMEOUT'});};
 await assert.rejects(device.connect(),/First-time setup to update/);assert.ok(closed);assert.equal(port.readable.locked,false);assert.equal(port.writable.locked,false);
});
test('multiple paired Trinkeys still require an explicit device choice',async()=>{
 let selected=false;const port={getInfo:()=>({usbVendorId:0x239a,usbProductId:0x8158})};
 const device=new SerialDevice({getPorts:async()=>[port,port],requestPort:async()=>{selected=true;throw new DOMException('Canceled','NotFoundError');}});
 await assert.rejects(device.connect(),{name:'NotFoundError'});assert.ok(selected);
});
