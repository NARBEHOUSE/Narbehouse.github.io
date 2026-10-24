export const DEFAULT = ['K',44,0,'K',40,0,'A'];
export const KEYS = [
 ['Space',44,'Space'],['Enter / Return',40,'Enter'],['Tab',43,'Tab'],['Arrow up',82,'ArrowUp'],['Arrow down',81,'ArrowDown'],['Arrow left',80,'ArrowLeft'],['Arrow right',79,'ArrowRight'],['Escape',41,'Escape'],['Backspace',42,'Backspace'],['Delete',76,'Delete'],['Home',74,'Home'],['End',77,'End'],['Page up',75,'PageUp'],['Page down',78,'PageDown'],['Insert',73,'Insert'],
 ...Array.from({length:26},(_,i)=>[String.fromCharCode(65+i),4+i,'Key'+String.fromCharCode(65+i)]),
 ...Array.from({length:9},(_,i)=>[String(i+1),30+i,'Digit'+(i+1)]),['0',39,'Digit0'],
 ...Array.from({length:12},(_,i)=>['F'+(i+1),58+i,'F'+(i+1)]),
 ['Minus',45,'Minus'],['Equals',46,'Equal'],['Left bracket',47,'BracketLeft'],['Right bracket',48,'BracketRight'],['Backslash',49,'Backslash'],['Semicolon',51,'Semicolon'],['Quote',52,'Quote'],['Backquote',53,'Backquote'],['Comma',54,'Comma'],['Period',55,'Period'],['Slash',56,'Slash'],['Caps Lock',57,'CapsLock'],['Print Screen',70,'PrintScreen'],['Scroll Lock',71,'ScrollLock'],['Pause',72,'Pause'],['Num Lock',83,'NumLock'],['Numpad /',84,'NumpadDivide'],['Numpad *',85,'NumpadMultiply'],['Numpad -',86,'NumpadSubtract'],['Numpad +',87,'NumpadAdd'],['Numpad Enter',88,'NumpadEnter'],...Array.from({length:9},(_,i)=>['Numpad '+(i+1),89+i,'Numpad'+(i+1)]),['Numpad 0',98,'Numpad0'],['Numpad .',99,'NumpadDecimal']
];
export const MOUSE = [['Left mouse button',1],['Right mouse button',2],['Middle mouse button',4]];
export function validateConfig(input) {
 if(!Array.isArray(input)||input.length!==7)throw new Error('Invalid settings format.');
 const a=[...input];
 for(const i of [0,3]){a[i+1]=Number(a[i+1]);a[i+2]=Number(a[i+2]);if(!Number.isInteger(a[i+1])||!Number.isInteger(a[i+2]))throw new Error('Invalid binding.');
 if(a[i]==='K'){if(a[i+1]<4||a[i+1]>115||a[i+2]<0||a[i+2]>15)throw new Error('Unsupported key.');}
 else if(a[i]==='M'){if(![1,2,4].includes(a[i+1])||a[i+2]!==0)throw new Error('Unsupported mouse button.');}
 else throw new Error('Unsupported action.');}
 if(!['A','R','S'].includes(a[6]))throw new Error('Invalid switch contact.');return a;
}
export function fromResponse(parts){if(parts[0]!=='CONFIG')throw new Error('Unexpected device response.');return validateConfig(parts.slice(1));}
export function bindingLabel(config,index){const i=index*3;const kind=config[i],value=config[i+1],mods=config[i+2];if(kind==='M')return MOUSE.find(k=>k[1]===value)?.[0]||'Mouse button';return [[1,'Ctrl'],[2,'Shift'],[4,'Alt'],[8,'Windows / Cmd']].filter(([bit])=>mods&bit).map(([,name])=>name).concat(KEYS.find(k=>k[1]===value)?.[0]||'USB key '+value).join(' + ');}
export function captureBinding(event){const key=KEYS.find(k=>k[2]===event.code);if(!key)return null;return ['K',key[1],(event.ctrlKey?1:0)|(event.shiftKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0)];}
export function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
