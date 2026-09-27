(() => {
  const prefix='benny-web:v1:';
  window.BennyData={
    get(key,fallback){const value=localStorage.getItem(prefix+key);if(value===null)return fallback;try{return JSON.parse(value);}catch{throw Error('Saved '+key+' data could not be read. Export or reset it in Data settings.');}},
    set(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));}catch{throw Error('Could not save on this device. Storage may be full or disabled. Export your work before closing.');}},
    remove(key){localStorage.removeItem(prefix+key);},
    download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  };
})();
