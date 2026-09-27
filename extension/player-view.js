(() => {
  if(globalThis.BennyPlayerView)return;
  // The window is already fullscreen. Fit the provider's actual player inside
  // it without requiring a synthetic F key or a fullscreen user-gesture grant.
  globalThis.BennyPlayerView={create(){
    let video,player,style;const marked=[],surroundings=new Map();
    function clearSurroundings(){
      for(const [el,previous]of surroundings){if(previous===null)el.removeAttribute('data-benny-player-outside');else el.setAttribute('data-benny-player-outside',previous);}
      surroundings.clear();
    }
    function hideSurroundings(target){
      const outside=new Set();
      // YouTube's recommendations/header can occupy sibling stacking contexts.
      // Hide those branches without changing their layout or moving the player.
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
      marked.length=0;style?.remove();style=null;video=player=null;
    }
    function mark(el,name){marked.push([el,name,el.getAttribute(name)]);el.setAttribute(name,'');}
    return {
      get active(){return !!video;},clear,
      sync(next,button,preferredRoot){
        if(document.fullscreenElement){if(video)clear();return;}
        if(!next||next.tagName!=='VIDEO'||!(next.currentSrc||next.srcObject||next.readyState>0)){if(video)clear();return;}
        let target=next.parentElement;
        for(let node=button?.parentElement;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){if(node.contains(next)){target=node;break;}}
        if(preferredRoot?.contains(next))target=preferredRoot;
        if(!target||target===document.body||target===document.documentElement)target=next;
        if(video===next&&player===target&&style?.isConnected){if(preferredRoot===player)hideSurroundings(player);return;}
        clear();video=next;player=target;
        mark(video,'data-benny-fit-video');mark(player,'data-benny-player-view');
        // YouTube gives its inner video container a fixed player size. Growing
        // only the outer player leaves the video in that smaller rectangle.
        if(preferredRoot===player)for(let node=video.parentElement;node&&node!==player;node=node.parentElement)mark(node,'data-benny-player-surface');
        if(preferredRoot===player)hideSurroundings(player);
        // Transformed/contained ancestors would otherwise trap position:fixed.
        for(let node=player.parentElement;node;node=node.parentElement)mark(node,'data-benny-player-ancestor');
        style=document.createElement('style');style.textContent=`
          [data-benny-player-ancestor]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important;overflow:visible!important;clip-path:none!important}
          [data-benny-fit-video]{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;margin:0!important}
          [data-benny-fit-video]:not([data-benny-player-view]){position:absolute!important}
          [data-benny-player-surface]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;transform:none!important}
          [data-benny-player-outside]{opacity:0!important;pointer-events:none!important}
          [data-benny-player-view]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;transform:none!important;background:#000!important;z-index:2147483640!important}
        `;document.documentElement.append(style);
      }
    };
  }};
})();
