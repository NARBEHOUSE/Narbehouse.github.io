import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseUF2,prepareCircuitPython,prepareRestore,encodeUF2,inspectBootDrive,writeUF2,FLASH_END,APP_START} from '../lib/uf2.mjs';
const complete=()=>{const blocks=Array.from({length:FLASH_END/256},(_,i)=>({address:i*256,data:new Uint8Array(256).fill(i%256)}));const view=new DataView(blocks[APP_START/256].data.buffer);view.setUint32(0,0x20008000,true);view.setUint32(4,0x2101,true);return encodeUF2(blocks);};
test('official base image produces a complete application flash without touching the bootloader',async()=>{
 const raw=new Uint8Array(await fs.readFile(new URL('../firmware/circuitpython-10.0.3.uf2',import.meta.url)));
 const blocks=parseUF2(prepareCircuitPython(raw));assert.equal(blocks[0].address,APP_START);assert.equal(blocks.at(-1).address+256,FLASH_END);
 assert.ok(blocks.filter(b=>b.address>=0x2f600).every(b=>b.data.every(n=>n===255)));
});
test('full recovery requires every flash block and restore excludes the bootloader',()=>{
 const original=complete();assert.equal(parseUF2(original,{complete:true}).length,1024);
 const restore=parseUF2(prepareRestore(original));assert.equal(restore[0].address,APP_START);assert.equal(restore.at(-1).address+256,FLASH_END);
 assert.deepEqual(restore[0].data,parseUF2(original)[32].data);assert.throws(()=>prepareRestore(original.slice(512)),/incomplete/);
});
test('UF2 validation refuses wrong family, duplicate addresses, invalid sizes and out-of-range writes',()=>{
 for(const [offset,value]of [[28,0x1234],[16,512],[12,FLASH_END],[512+12,0]]){const raw=complete();new DataView(raw.buffer).setUint32(offset,value,true);assert.throws(()=>parseUF2(raw));}
 assert.throws(()=>parseUF2(new Uint8Array(513)));
});
test('boot drive must identify the exact TRRS model and include a complete recovery image',async()=>{
 const data=complete();let info='Board-ID: SAMD21E18A-TRRSTrinkey-v0\r\n';
 const directory={getFileHandle:async name=>({getFile:async()=>new Blob([name==='INFO_UF2.TXT'?info:data])})};
 const actual=await inspectBootDrive(directory);assert.equal(actual.kind,'uf2');assert.equal(actual.entries[0][1].length,524288);
 info='Board-ID: SAMD21-OTHER';await assert.rejects(inspectBootDrive(directory),/not an Adafruit TRRS/);
});
test('boot drive disconnect during write is unconfirmed, never reported as verified',async()=>{
 const data=prepareRestore(complete());let wrote=false,aborted=false;
 const directory={getFileHandle:async()=>({createWritable:async()=>({write:async()=>{wrote=true;},close:async()=>{throw new Error('Disconnected');},abort:async()=>{aborted=true;}})})};
 const result=await writeUF2(directory,data);assert.ok(wrote&&aborted&&result.uncertain&&result.submitted);
 await assert.rejects(writeUF2(directory,new Uint8Array(1)),/Invalid/);
});

test('a complete file with an erased application header cannot be accepted as a recovery image',()=>{const image=complete();image.fill(255,APP_START/256*512+32,APP_START/256*512+40);assert.throws(()=>prepareRestore(image),/startup header/);});
