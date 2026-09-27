(() => {
  if(globalThis.BennyPlayerAdapters)return;
  // Browser equivalents of the original control_bar.py/server.py profiles.
  // Activate provider controls directly; synthetic keys cannot activate native buttons.
  const profiles={
    plex:{play:['[data-testid="resumeButton"]','[data-testid="resume-button"]','[data-testid="playButton"]','[data-testid="play-button"]','[aria-label="Resume"]','[aria-label="Play"]'],unmute:false},
    youtube:{play:['.ytp-large-play-button','.ytp-play-button'],fullscreen:['.ytp-fullscreen-button']},
    pluto:{play:['button[aria-label="Play"]','[data-testid="play-pause-button"]'],unmute:true},
    prime:{play:['.atvwebplayersdk-playpause-button','button[aria-label="Play"]','[data-testid="play-button"]']},
    paramount:{play:['.vjs-big-play-button','button[aria-label="Play"]']},
    netflix:{play:['[data-uia="player-play-pause"]','button[aria-label="Play"]']},
    disney:{play:['button[aria-label="Play"]','[data-testid="play-button"]']},
    hulu:{play:['button[aria-label="Play"]','[data-testid="play-pause-button"]']},
    tubi:{play:['button[aria-label="Play"]','button[aria-label="Resume"]']},
    max:{play:['button[aria-label="Play"]','[data-testid="play-button"]']}
  };
  // Use the actual player controls (YouTube's F action, for example), without
  // moving keyboard focus away from the switch bar or dispatching untrusted keys.
  const fullscreenControls={
    youtube:['.ytp-fullscreen-button'],
    plex:['[data-testid="fullscreenButton"]','[data-testid="fullscreen-button"]'],
    netflix:['[data-uia="control-fullscreen-enter"]','[data-uia="control-fullscreen-exit"]'],
    prime:['.atvwebplayersdk-fullscreen-button'],
    paramount:['.vjs-fullscreen-control'],
    disney:['[data-testid="fullscreen-button"]'],
    hulu:['[data-testid="fullscreen-button"]'],
    max:['[data-testid="fullscreen-button"]'],
    pluto:['[data-testid="fullscreen-button"]']
  };
  const commonFullscreen=['button[aria-label="Full screen" i]','button[aria-label="Fullscreen" i]','button[aria-label="Enter fullscreen" i]','button[aria-label="Enter full screen" i]','button[title="Full screen" i]'];
  const toggleControls={
    plex:['[data-testid="playPauseButton"]','[data-testid="play-pause-button"]','button[aria-label="Pause" i]','button[title="Pause" i]','button[aria-label="Play" i]','button[title="Play" i]'],
    youtube:['.ytp-play-button'],netflix:['[data-uia="control-play-pause-play"]','[data-uia="control-play-pause-pause"]','[data-uia="player-play-pause"]'],
    prime:['.atvwebplayersdk-playpause-button'],paramount:['.vjs-play-control'],
    disney:['[data-testid="play-pause-button"]'],hulu:['[data-testid="play-pause-button"]'],max:['[data-testid="play-pause-button"]'],pluto:['[data-testid="play-pause-button"]']
  };
  const itemControls={
    youtube:{next:['.ytp-next-button'],previous:['.ytp-prev-button']},
    plex:{next:['[data-testid="nextButton"]','[data-testid="next-episode-button"]'],previous:['[data-testid="previousButton"]','[data-testid="previous-episode-button"]']},
    netflix:{next:['[data-uia="next-episode-seamless-button"]','[data-uia="control-next"]'],previous:['[data-uia="control-previous"]']},
    prime:{next:['.atvwebplayersdk-nextup-button'],previous:['.atvwebplayersdk-previous-button']}
  };
  const visible=el=>el&&el.getClientRects().length&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(el).visibility!=='hidden';
  function find(selectors=[]) {return selectors.flatMap(s=>[...document.querySelectorAll(s)]).find(visible);}
  function media(){
    const full=document.fullscreenElement;
    const score=v=>(full?.contains(v)?1e12:0)+(v.hasAttribute('data-benny-fit-video')?1e11:0)+((v.currentSrc||v.srcObject||v.readyState>0)?1e10:0)+(!v.paused?1e9:0)+v.clientWidth*v.clientHeight;
    return [...document.querySelectorAll('video,audio')].filter(v=>visible(v)||v.tagName==='AUDIO').sort((a,b)=>score(b)-score(a))[0];
  }
  function login(){return /login|signin|sign-in|oauth/i.test(location.pathname)||!!find(['input[type="password"]']);}
  const label=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\s+/g,' ').trim();
  function playButton(profile){
    const candidates=[...new Set([
      ...document.querySelectorAll('button,[role="button"],a[href],input[type="button"],input[type="submit"]'),
      ...(profile.play||[]).flatMap(s=>[...document.querySelectorAll(s)])
    ])].filter(el=>visible(el)&&!el.closest('form')&&!/trailer|restart|beginning|from (?:the )?start|buy|rent|subscribe|sign in/i.test(label(el)));
    const safe=el=>/^(play|resume|resume playback|continue watching|watch now)(?:\s+(?:movie|episode|from\s+\d[\d:. ]*|\d[\d:. ]*))?$/i.test(label(el));
    // Plex can render Resume as a link, or reuse Play's node inside a dialog.
    // The active dialog wins over the title page underneath it.
    const dialogs=candidates.filter(el=>el.closest('[role="dialog"],dialog,[aria-modal="true"]'));
    const ranked=list=>list.find(el=>safe(el)&&/^resume/i.test(label(el)))||list.find(safe);
    return ranked(dialogs)||ranked(candidates)||candidates.find(el=>(profile.play||[]).some(s=>el.matches(s)));
  }
  function create(service){
    const profile=profiles[service]||{},clicked=new WeakMap();let attempts=0,started=Date.now(),stopped=false,mediaAttempt;
    // Disney and Netflix own their video/DRM layout. Their native player must
    // not be resized or covered by our automatic CSS fullscreen layer.
    const view=globalThis.BennyPlayerView?.create();let automaticView=!!service&&!['disney','netflix'].includes(service);
    function profileChoices(){
      if(service!=='netflix')return [];
      // Only existing profile tiles in the chooser, never Add/Manage Profile.
      const selectors=['.profiles-gate-container .profile-link','.choose-profile .profile-link','[data-uia="choose-profile"] [data-uia="profile-link"]'];
      return [...new Set(selectors.flatMap(selector=>[...document.querySelectorAll(selector)]))]
        .filter(visible).filter(el=>!el.closest('.addProfileIcon,.profile-add,[data-uia="add-profile"]')&&!el.querySelector('.addProfileIcon'))
        .map(element=>({element,label:(element.querySelector('.profile-name')?.textContent||label(element)).trim()}))
        .filter(choice=>choice.label&&!/^(?:add|manage|edit) profiles?$/i.test(choice.label));
    }
    const fullscreenButton=()=>find(fullscreenControls[service])||find(commonFullscreen);
    function playerControl(selectors){
      const v=media(),full=document.fullscreenElement;
      const candidates=[...new Set(selectors.flatMap(s=>[...document.querySelectorAll(s)]))].filter(el=>
        !el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('form,[hidden],[inert]')&&(!full||full.contains(el))&&el.getClientRects().length);
      // Start in the active video's container and walk outward. This allows
      // auto-hidden controls but excludes unrelated page controls where possible.
      if(v)for(let parent=v.parentElement;parent&&parent!==document.body&&parent!==document.documentElement;parent=parent.parentElement){const found=candidates.find(el=>parent.contains(el));if(found)return found;}
      return candidates.find(visible);
    }
    async function play(userGesture=false){
      if(login())return 'Unlock browser to sign in, then lock controls again.';
      if(profileChoices().length)return 'waiting';
      const v=media();
      if(v&&!v.paused){if(profile.unmute)v.muted=false;return 'playing';}
      // Activate the provider first: an empty/blocked media element must not
      // prevent Play -> Resume -> playback transitions from being completed.
      const button=playButton(profile);
      if(button){
        const signature=label(button),previous=clicked.get(button);
        if(userGesture||!previous||previous.signature!==signature||(previous.count<3&&Date.now()-previous.at>=750)){
          clicked.set(button,{signature,at:Date.now(),count:previous?.signature===signature?previous.count+1:1});
          button.click();attempts++;return 'starting';
        }
      }
      if(v){
        if(profile.unmute)v.muted=false;
        // play() on an unsourced placeholder can stay pending indefinitely.
        // Keep observing the page while a real media play request is pending.
        if(v.currentSrc||v.srcObject||v.readyState>0){
          if(!mediaAttempt||mediaAttempt.element!==v||userGesture){
            const attempt=mediaAttempt={element:v,state:'starting'};
            try {Promise.resolve(v.play()).then(()=>{attempt.state='playing';},error=>{attempt.state=error.name==='NotAllowedError'?'Press Enter to play.':'waiting';});}
            catch(error){attempt.state=error.name==='NotAllowedError'?'Press Enter to play.':'waiting';}
            await Promise.resolve();
          }
          return mediaAttempt.state;
        }
      }
      return 'waiting';
    }
    return {
      media,profileChoices,
      restartStartup(){stopped=false;started=Date.now();attempts=0;mediaAttempt=null;},
      syncView(){
        if(automaticView&&!login()&&!profileChoices().length){
          const v=media();
          // Identify YouTube's player even when its fullscreen control is hidden.
          const player=service==='youtube'?v?.closest('#movie_player,.html5-video-player'):null;
          view?.sync(v,fullscreenButton(),player);
        }else view?.clear();
      },
      clearView(){view?.clear();},
      async fullscreen(){
        automaticView=false;
        if(document.fullscreenElement){view?.clear();await document.exitFullscreen();return 'Player fullscreen off';}
        if(view?.active){view.clear();return 'Player fullscreen off';}
        if(login())throw Error('Sign in and start the video first.');
        const v=media();
        if(!v)throw Error('Start the video with Play first.');
        const button=fullscreenButton();
        // Keep the player wrapper (and its captions) when we can identify it
        // from the fullscreen control; otherwise use the video itself.
        // A video is a replaced element: descendants cannot reliably receive
        // focus there. Fullscreen its wrapper so the switch bar stays operable.
        let target=v.parentElement||document.documentElement;
        for(let parent=button?.parentElement;parent&&parent!==document.body&&parent!==document.documentElement;parent=parent.parentElement){
          if(parent.contains(v)){target=parent;break;}
        }
        if(button){
          const entered=new Promise(resolve=>{
            const done=()=>{clearTimeout(timer);document.removeEventListener('fullscreenchange',done);resolve();};
            const timer=setTimeout(done,350);document.addEventListener('fullscreenchange',done);
          });
          button.click();await entered;
        }
        if(!document.fullscreenElement){
          if(!target.requestFullscreen)throw Error('Player fullscreen is unavailable on this page.');
          const properties={position:'fixed',inset:'0',width:'100%',height:'100%',maxWidth:'none',maxHeight:'none',objectFit:'contain'};
          const original=v.getAttribute('style');
          const restore=()=>{if(document.fullscreenElement===target)return;document.removeEventListener('fullscreenchange',restore);if(original===null)v.removeAttribute('style');else v.setAttribute('style',original);};
          try{
            await target.requestFullscreen();
            for(const [key,value] of Object.entries(properties))v.style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');
            document.addEventListener('fullscreenchange',restore);
          }catch{throw Error('Select Fullscreen again to allow player fullscreen.');}
        }
        return 'Player fullscreen on';
      },
      async startup(){
        if(profileChoices().length){started=Date.now();return 'waiting';}
        if(stopped)return 'done';
        if(login()){stopped=true;return 'Unlock browser to sign in, then choose Lock controls.';}
        const v=media();if(v&&!v.paused){if(profile.unmute)v.muted=false;stopped=true;return 'playing';}
        const result=await play();
        if(result==='playing'){stopped=true;return result;}
        // Directly activating Play/Resume replaces the native X/Enter/P sequence.
        // Synthetic Enter is not a native button activation; it cannot replace click().
        if(result==='Press Enter to play.'||Date.now()-started>30000||attempts>8){stopped=true;return result==='Press Enter to play.'?result:'Press Enter to play.';}
        return result;
      },
      cancelStartup(){stopped=true;},
      async toggle(){
        stopped=true;const v=media();
        if(v&&(v.currentSrc||v.srcObject||v.readyState>0)){
          const wasPaused=v.paused,verb=wasPaused?'Play':'Pause';
          const button=playerControl([...(toggleControls[service]||[]),`button[aria-label="${verb}" i]`,`button[title="${verb}" i]`]);
          if(button){
            button.click();
            // Give the provider its own state transition first. If it ignores
            // the click, fall back to the active media instead of a stale video.
            await new Promise(resolve=>setTimeout(resolve,200));
            const current=media()||v;
            if(current.paused===wasPaused){if(wasPaused){try{await current.play();}catch{return 'Select Play again to start the video.';}}else current.pause();}
            return current.paused?'Paused':'Playing';
          }
        }
        if(v&&!v.paused){v.pause();return 'Paused';}
        stopped=false;started=Date.now();attempts=0;
        const result=await play(true);
        return result==='playing'?'Playing':result==='starting'?'Starting video…':result==='waiting'?'Play is not available on this page yet.':result;
      },
      action(command){
        if(!['next','previous','skip'].includes(command))throw Error('Unknown player control.');
        const direction=command==='previous'?'Previous':'Next';
        const selectors=command==='skip'?['[data-testid="skipIntroButton"]','[data-uia="player-skip-intro"]','[data-testid="skip-intro-button"]','button[aria-label="Skip intro" i]','button[title="Skip intro" i]']:[
          ...(itemControls[service]?.[command]||[]),`[data-testid="${command}-episode-button"]`,`[data-testid="${command}-button"]`,
          ...[direction,direction+' episode',direction+' video',direction+' item'].flatMap(text=>[`button[aria-label="${text}" i]`,`button[title="${text}" i]`,`[role="button"][aria-label="${text}" i]`])
        ];
        const target=playerControl(selectors);if(!target)throw Error(command==='skip'?'No intro skip is available right now.':direction+' item is not available in this player right now.');target.click();
      }
    };
  }
  globalThis.BennyPlayerAdapters={create};
})();
