/* Deliberate communication only. Never touches native scan/focus speech. */
(function(scope){
  'use strict';
  function wave(samples, sampleRate, leadInMs=750) {
    if (!(samples instanceof Float32Array) || !samples.length || !Number.isInteger(sampleRate) || sampleRate<8000 || sampleRate>96000) throw Error('Invalid speech audio.');
    const silence=Math.round(sampleRate*leadInMs/1000), buffer=new ArrayBuffer(44+(silence+samples.length)*2), view=new DataView(buffer);
    const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
    text(36,'data');view.setUint32(40,buffer.byteLength-44,true);
    for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+(silence+i)*2,v<0?v*32768:v*32767,true);}
    return buffer;
  }
  class Channel {
    constructor({synthesize,cancelSynthesis,enumerateOutputs,createAudio,createUrl,revokeUrl,onState=()=>{}}) {
      Object.assign(this,{synthesize,cancelSynthesis,enumerateOutputs,createAudio,createUrl,revokeUrl,onState});this.epoch=0;this.active=null;this.sink='';
    }
    state(phase,detail='',owner){this.onState({phase,detail,owner});}
    finish(job,reason,detail='') {
      if(job.done)return;job.done=true;clearTimeout(job.timer);
      if(job.audio){job.audio.onplaying=job.audio.onended=job.audio.onerror=null;job.audio.pause();job.audio.removeAttribute('src');job.audio.load();}
      if(job.url)this.revokeUrl(job.url);
      job.resolveStart(job.didStart);job.resolveFinish({reason,started:job.didStart});
      if(this.active===job){this.active=null;this.state(reason,detail,job.owner);}
    }
    stop(owner) {
      const job=this.active;if(!job||(owner!==undefined&&job.owner!==owner))return;
      this.epoch++;this.cancelSynthesis?.(job.id);this.finish(job,'cancelled','Message stopped.');
    }
    selectSink(id){this.stop();this.sink=id&&!['default','communications'].includes(id)?id:'';}
    async checkSink(sink=this.sink) {
      if(!sink)throw Error('Choose a speaker in Hub Settings first.');
      if(!(await this.enumerateOutputs()).some(d=>d.deviceId===sink))throw Error('Selected speaker is unavailable. Reconnect it and choose it in Hub Settings.');
    }
    async devicesChanged(){const sink=this.sink;try{if(sink)await this.checkSink(sink);}catch(e){if(sink!==this.sink)return;const job=this.active;if(job){this.cancelSynthesis?.(job.id);this.finish(job,'error',e.message+' Message was not completed.');}else this.state('error',e.message);}}
    speak(text,{voice='am_michael',owner}={}) {
      this.stop();const job={id:++this.epoch,owner,done:false,didStart:false};this.active=job;
      const started=new Promise(r=>{job.resolveStart=r;}),finished=new Promise(r=>{job.resolveFinish=r;});
      const current=()=>this.active===job&&!job.done;
      const fail=e=>{if(current()){this.cancelSynthesis?.(job.id);this.finish(job,'error','Message not completed. '+e.message+' Your text is kept.');}};
      const ticket={started,finished,cancel:()=>{if(current())this.stop(owner);}};
      void (async()=>{
        try{
          if(typeof text!=='string'||!text.trim()||text.length>5000)throw Error('Use a message of 1 to 5000 characters.');
          const sink=this.sink;await this.checkSink(sink);if(!current())return;
          this.state('generating','Preparing speech. First use downloads the local voice; this can take a few minutes.',owner);
          job.timer=setTimeout(()=>fail(Error('Voice preparation took too long. Please try again.')),600000);
          const audioData=await this.synthesize(job.id,text,voice);if(!current())return;
          await this.checkSink(sink);if(!current())return;
          const audio=job.audio=this.createAudio();
          if(typeof audio.setSinkId!=='function')throw Error('Choosing a speaker is unavailable in this browser.');
          await audio.setSinkId(sink);if(!current())return;
          if(audio.sinkId!==sink)throw Error('The chosen speaker could not be connected.');
          job.url=this.createUrl(wave(new Float32Array(audioData.samples),audioData.sampleRate));audio.src=job.url;
          audio.onerror=()=>fail(Error('Speaker playback failed. Reconnect it and try again.'));
          audio.onended=()=>{if(current())this.finish(job,'ended','Message finished.');};
          clearTimeout(job.timer);job.timer=setTimeout(()=>fail(Error('Speaker playback did not start. Try Test Speaker in Hub Settings.')),15000);
          audio.onplaying=()=>{if(!current())return;job.didStart=true;job.resolveStart(true);clearTimeout(job.timer);
            job.timer=setTimeout(()=>fail(Error('Speaker playback did not finish.')),((audioData.samples.length/audioData.sampleRate)+11)*1000);
            this.state('playing','Speaking on the selected speaker.',owner);
          };
          await audio.play();
        }catch(e){fail(e);}
      })();
      return ticket;
    }
  }
  if(typeof module==='object'&&module.exports)module.exports={Channel,wave};else scope.NarbeCommunicationChannel={Channel,wave};
})(globalThis);
