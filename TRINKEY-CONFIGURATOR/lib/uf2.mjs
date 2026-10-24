// Fixed target: Adafruit TRRS Trinkey M0 / SAMD21E18A (256 KiB).
export const FLASH_END=0x40000, APP_START=0x2000, FAMILY=0x68ed2b88;
export function parseUF2(data,{complete=false,allowFamilyless=false}={}){
 if(!(data instanceof Uint8Array)||!data.length||data.length%512)throw new Error('Invalid Trinkey firmware file.');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),blocks=[],seen=new Set();
 for(let p=0;p<data.length;p+=512){
  const flags=view.getUint32(p+8,true),address=view.getUint32(p+12,true),size=view.getUint32(p+16,true);
  if(view.getUint32(p,true)!==0x0a324655||view.getUint32(p+4,true)!==0x9e5d5157||view.getUint32(p+508,true)!==0x0ab16f30||
    !(flags===0x2000&&view.getUint32(p+28,true)===FAMILY||allowFamilyless&&flags===0&&view.getUint32(p+28,true)===0)||size!==256||address%256||address+size>FLASH_END||seen.has(address))
   throw new Error('Firmware is not a valid SAMD21 Trinkey image.');
  seen.add(address);blocks.push({address,data:data.slice(p+32,p+32+size)});
 }
 blocks.sort((a,b)=>a.address-b.address);
 if(complete&&(blocks.length!==FLASH_END/256||blocks.some((b,i)=>b.address!==i*256)))throw new Error('The recovery copy is incomplete. Nothing was installed.');
 if(complete)validateApplication(blocks);
 return blocks;
}
export function validateApplication(blocks){
 const block=blocks.find(b=>b.address===APP_START);
 if(!block)throw new Error('The recovery image is missing its startup header.');
 const view=new DataView(block.data.buffer,block.data.byteOffset,block.data.byteLength),stack=view.getUint32(0,true),reset=view.getUint32(4,true);
 if(stack<=0x20000000||stack>0x20008000||stack%4||!(reset&1)||reset<APP_START+8||reset>=FLASH_END)throw new Error('The original software has no valid startup header. A restorable backup cannot be made. Nothing was changed. Contact NARBE for recovery.');
}
export function encodeUF2(blocks){
 const result=new Uint8Array(blocks.length*512),view=new DataView(result.buffer);
 blocks.forEach((block,i)=>{
  const p=i*512;
  [0x0a324655,0x9e5d5157,0x2000,block.address,256,i,blocks.length,FAMILY].forEach((n,j)=>view.setUint32(p+j*4,n,true));
  result.set(block.data,p+32);view.setUint32(p+508,0x0ab16f30,true);
 });return result;
}
export function prepareCircuitPython(data){
 const blocks=parseUF2(data,{allowFamilyless:true});
 // This exact release leaves flash from 0x2f600 onward for storage.
 if(blocks[0].address!==APP_START||blocks.at(-1).address+256!==0x2f600||blocks.some((b,i)=>b.address!==APP_START+i*256))
  throw new Error('Unexpected CircuitPython flash layout. Nothing was installed.');
 for(let address=0x2f600;address<FLASH_END;address+=256)blocks.push({address,data:new Uint8Array(256).fill(255)});
 return encodeUF2(blocks);
}
export function prepareRestore(data){return encodeUF2(parseUF2(data,{complete:true}).filter(b=>b.address>=APP_START));}
export async function inspectBootDrive(directory){
 let info;try{info=await(await(await directory.getFileHandle('INFO_UF2.TXT')).getFile()).text();}
 catch{throw new Error('Choose the TRINKEYBOOT drive itself. Double-press the small reset button to show it.');}
 if(!/^Board-ID:\s*SAMD21E18A-TRRSTrinkey-v0\s*$/m.test(info))throw new Error('This is not an Adafruit TRRS Trinkey M0. Nothing was changed.');
 const file=await(await directory.getFileHandle('CURRENT.UF2')).getFile();
 if(file.size!==FLASH_END*2)throw new Error('Cannot make a complete recovery copy of this Trinkey.');
 const data=new Uint8Array(await file.arrayBuffer());parseUF2(data,{complete:true});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
 return {directory,id:'uf2-'+digest,kind:'uf2',entries:[['CURRENT.UF2',data],['INFO_UF2.TXT',info]],version:'Original TRRS Trinkey firmware'};
}
export async function writeUF2(directory,data){
 // UF2 drives reboot during the final write; only the next device handshake verifies success.
 parseUF2(data);
 const file=await directory.getFileHandle('NARBE.UF2',{create:true});
 const writer=await file.createWritable();let submitted=false;
 try{await writer.write(data);submitted=true;await writer.close();return {submitted:true};}
 catch(error){try{await writer.abort();}catch{}return {submitted,uncertain:true,error};}
}
