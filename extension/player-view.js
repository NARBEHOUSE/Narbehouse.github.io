(() => {
  if(globalThis.BennyPlayerView)return;
  // Keep the provider's video and caption hierarchy in place. The Companion
  // reserves a measured dock below the picture instead of covering the video.
  globalThis.BennyPlayerView={create(){
    let video,player,style,lastSignature='',overlayChildren=[];const marked=[],surroundings=new Map();
    function clearSurroundings(){
      for(const [el,previous]of surroundings){if(previous===null)el.removeAttribute('data-benny-player-outside');else el.setAttribute('data-benny-player-outside',previous);}
      surroundings.clear();
    }
    function hideSurroundings(target){
      const outside=new Set();
      for(let branch=target;branch?.parentElement;branch=branch.parentElement){
        for(const sibling of branch.parentElement.children){
          if(sibling!==branch&&sibling.id!=='benny-player-controls'&&!['HEAD','SCRIPT','STYLE','LINK','META'].includes(sibling.tagName))outside.add(sibling);
        }
      }
      for(const [el,previous]of surroundings)if(!outside.has(el)){
        if(previous===null)el.removeAttribute('data-benny-player-outside');else el.setAttribute('data-benny-player-outside',previous);
        surroundings.delete(el);
      }
      for(const el of outside)if(!surroundings.has(el)){
        surroundings.set(el,el.getAttribute('data-benny-player-outside'));el.setAttribute('data-benny-player-outside','');
      }
    }
    function clear(){
      clearSurroundings();
      for(const [el,name,previous] of marked){if(previous===null)el.removeAttribute(name);else el.setAttribute(name,previous);}
      marked.length=0;style?.remove();style=null;video=player=null;lastSignature='';overlayChildren=[];
    }
    function mark(el,name,value=''){marked.push([el,name,el.getAttribute(name)]);el.setAttribute(name,value);}
    return {
      get active(){return !!video;},clear,
      sync(next,button,preferredRoot,frame,nativeLayout=false){
        if(!next||next.tagName!=='VIDEO'||!(next.currentSrc||next.srcObject||next.readyState>0)){if(video)clear();return;}
        const full=document.fullscreenElement;
        let target=next.parentElement;
        for(let node=button?.parentElement;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){if(node.contains(next)){target=node;break;}}
        if(preferredRoot?.contains(next))target=preferredRoot;
        if(!target||target===document.body||target===document.documentElement)target=next;
        if(full===next)target=next;
        const box=frame||{left:0,top:0,width:innerWidth,height:innerHeight};
        const x=Math.max(0,box.left),y=Math.max(0,box.top),w=Math.max(1,box.width),h=Math.max(1,box.height);
        const bottom=Math.max(0,innerHeight-y-h),right=Math.max(0,innerWidth-x-w);
        const signature=[x,y,w,h,bottom,right,nativeLayout,full===target,full===next].join(':');
        const children=full===target&&full!==next?[...target.children].filter(el=>el.id!=='benny-player-controls'&&!['STYLE','SCRIPT','LINK'].includes(el.tagName)):[];
        const sameChildren=children.length===overlayChildren.length&&children.every((el,i)=>el===overlayChildren[i]);
        if(video===next&&player===target&&style?.isConnected&&lastSignature===signature&&sameChildren){
          if(!nativeLayout&&preferredRoot===player)hideSurroundings(player);return;
        }
        clear();video=next;player=target;lastSignature=signature;overlayChildren=children;
        let overlayCSS='';
        mark(video,'data-benny-fit-video');
        if(full===next){
          // A native fullscreen VIDEO has a UA-sized outer box. Padding reduces
          // its replaced-content box without moving/reloading the media element.
          mark(video,'data-benny-full-video');
        }else{
          mark(player,full===player?'data-benny-full-player':nativeLayout?'data-benny-player-frame':'data-benny-player-view');
          // Fit intermediate video surfaces as well as the outer player. Keep
          // provider siblings (including captions) in their original hierarchy.
          if(player!==video)for(let node=video.parentElement;node&&node!==player;node=node.parentElement)mark(node,'data-benny-player-surface');
          if(full===player){
            let surface=video;
            while(surface.parentElement&&surface.parentElement!==player)surface=surface.parentElement;
            mark(surface,'data-benny-full-surface');
            // Some players put captions beside the media surface. Reserve the
            // same bottom inset for their existing bottom-anchored layers too.
            for(const child of children){
              if(child===surface)continue;
              const css=getComputedStyle(child),offset=parseFloat(css.bottom);
              if(!['absolute','fixed'].includes(css.position)||!Number.isFinite(offset))continue;
              const index=children.indexOf(child),tall=child.getBoundingClientRect().height>h;
              mark(child,'data-benny-full-overlay',String(index));
              overlayCSS+='[data-benny-full-overlay="'+index+'"]{z-index:2147483641!important;max-height:'+h+'px!important;bottom:'+Math.max(bottom,bottom+offset)+'px!important;'+(tall?'top:'+y+'px!important;height:'+h+'px!important;':'top:auto!important;')+'}';
            }
          }
          if(!nativeLayout){
            if(preferredRoot===player)hideSurroundings(player);
            for(let node=player.parentElement;node&&node!==full;node=node.parentElement)mark(node,'data-benny-player-ancestor');
          }
        }
        style=document.createElement('style');
        style.textContent=`
          [data-benny-player-ancestor]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important;overflow:visible!important;clip-path:none!important}
          /* These boxes now use frame coordinates. Provider centering transforms
             would move the fitted picture out of its frame; captions keep theirs. */
          [data-benny-fit-video],[data-benny-player-surface],[data-benny-player-view],[data-benny-player-frame],[data-benny-full-surface],[data-benny-full-player]{transform:none!important;translate:none!important;scale:none!important;rotate:none!important}
          [data-benny-fit-video]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;box-sizing:border-box!important;margin:0!important;padding:0!important}
          [data-benny-player-surface]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important}
          [data-benny-player-outside]{opacity:0!important;pointer-events:none!important}
          [data-benny-player-view],[data-benny-player-frame],[data-benny-full-surface]{position:fixed!important;inset:auto!important;left:${x}px!important;top:${y}px!important;width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important;margin:0!important;padding:0!important;background:#000!important;z-index:2147483640!important}
          [data-benny-player-view],[data-benny-player-frame]{border:2px solid #8bccff!important;border-bottom:0!important;border-radius:14px 14px 0 0!important;overflow:hidden!important}
          [data-benny-full-player]{box-sizing:border-box!important;padding-bottom:${bottom}px!important;background:#000!important}
          [data-benny-full-video]{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;box-sizing:border-box!important;padding:${y}px ${right}px ${bottom}px ${x}px!important;object-fit:contain!important;background:#000!important}
        `+overlayCSS;document.documentElement.append(style);
      }
    };
  }};
})();
