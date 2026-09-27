(() => {
  class KenLMPredictor {
    constructor(){
      this.available=false;this.pending=new Map();this.nextId=0;
      try{
        this.worker=new Worker(new URL('kenlm-worker.js',document.currentScript.src));
        this.worker.onmessage=({data})=>{
          if(data.ready){clearTimeout(this.loadTimer);this.available=true;window.dispatchEvent(new Event('benny-predictions-ready'));return;}
          if(data.failed){this.stop();return;}
          const pending=this.pending.get(data.id);if(!pending)return;
          clearTimeout(pending.timer);this.pending.delete(data.id);pending.resolve(Array.isArray(data.words)?data.words:[]);
        };
        this.worker.onerror=event=>{event.preventDefault();this.stop();};
        this.loadTimer=setTimeout(()=>this.stop(),45000);
        addEventListener('pagehide',()=>this.stop(),{once:true});
      }catch{this.stop();}
    }
    stop(){
      this.available=false;clearTimeout(this.loadTimer);this.worker?.terminate();
      for(const request of this.pending.values()){clearTimeout(request.timer);request.resolve([]);}this.pending.clear();
    }
    async predict(buffer,local){
      if(!this.available)return [];
      // A sentence boundary resets context. Only the current prefix and two
      // preceding words go to the local worker; nothing is sent to a server.
      const tail=String(buffer).replace(/\|/g,'').toUpperCase().split(/[.!?\n]/).at(-1);
      const words=tail.match(/[A-Z]+(?:'[A-Z]+)*/g)||[];
      const prefix=/[A-Z']$/.test(tail)?words.pop()||'':'';
      if(prefix.length>60)return [];
      const context=words.slice(-2);
      if(context.some(word=>word.length>60))return [];
      return new Promise(resolve=>{
        const id=++this.nextId;
        const timer=setTimeout(()=>{this.pending.delete(id);resolve([]);},250);
        this.pending.set(id,{resolve,timer});
        try{this.worker.postMessage({id,context,prefix,local:local.filter(Boolean)});}catch{this.stop();}
      });
    }
  }
  window.kenLMPredictor=new KenLMPredictor();
})();
