const {expect}=require('@playwright/test');
const sessions=new WeakMap();
async function measurePlayerLayout(page){
  let session=sessions.get(page);
  if(!session){session=await page.context().newCDPSession(page);sessions.set(page,session);}
  const {root:tree}=await session.send('DOM.getDocument',{depth:-1,pierce:true});
  function find(node){
    if(node.attributes?.some((name,i)=>i%2===0&&name==='id'&&node.attributes[i+1]==='benny-player-controls'))return node;
    for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const found=find(child);if(found)return found;}
  }
  const host=find(tree);if(!host?.shadowRoots?.length)return null;
  const {object}=await session.send('DOM.resolveNode',{backendNodeId:host.shadowRoots[0].backendNodeId});
  const {result}=await session.send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,functionDeclaration:function(){
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    const panel=this.querySelector('[data-benny-controls-panel]')||this.querySelector('section');
    const buttons=[...this.querySelectorAll('nav button')].filter(b=>!b.closest('[hidden]'));
    const nav=buttons[0]?.closest('nav'),toolbar=this.querySelector('.player-toolbar'),footer=this.querySelector('.player-footer'),badge=this.querySelector('.narbe-scan-status-badge'),status=this.querySelector('[role="status"]');
    const navStyle=nav?getComputedStyle(nav):null,statusStyle=status?getComputedStyle(status):null;
    return {panel:rect(panel),panelClientHeight:panel.clientHeight,panelScrollHeight:panel.scrollHeight,
      nav:nav?{rect:rect(nav),clientWidth:nav.clientWidth,scrollWidth:nav.scrollWidth,scrollLeft:nav.scrollLeft,paddingLeft:parseFloat(navStyle.paddingLeft)||0,paddingRight:parseFloat(navStyle.paddingRight)||0,gap:parseFloat(navStyle.columnGap)||0,label:nav.getAttribute('aria-label')}:null,
      toolbar:toolbar?rect(toolbar):null,
      footer:footer?rect(footer):null,badge:badge?{...rect(badge),text:badge.textContent,clientWidth:badge.clientWidth,scrollWidth:badge.scrollWidth}:null,
      statusRect:status?{...rect(status),clientWidth:status.clientWidth,scrollWidth:status.scrollWidth,whiteSpace:statusStyle.whiteSpace}:null,
      buttons:buttons.map(b=>({command:b.dataset.command,rect:rect(b),fontSize:parseFloat(getComputedStyle(b).fontSize),label:b.getAttribute('aria-label')||b.textContent,selected:b.classList.contains('selected'),scanPaused:b.hasAttribute('data-narbe-scan-paused'),outlineStyle:getComputedStyle(b).outlineStyle,pausePrefix:getComputedStyle(b.matches('[data-narbe-scan-pause-label]')?b:b.querySelector('[data-narbe-scan-pause-label]')||b,'::before').content})),
      status:status?.textContent};
  }.toString()});
  await session.send('Runtime.releaseObject',{objectId:object.objectId});
  const outer=await page.evaluate(()=>{
    const video=[...document.querySelectorAll('video')].find(v=>v.currentSrc||v.srcObject||v.readyState>0)||document.querySelector('video');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    let mediaContent=null;
    if(video){
      const r=video.getBoundingClientRect(),css=getComputedStyle(video);
      const px=name=>parseFloat(css[name])||0;
      const x=r.x+px('borderLeftWidth')+px('paddingLeft'),y=r.y+px('borderTopWidth')+px('paddingTop');
      const width=r.width-px('borderLeftWidth')-px('borderRightWidth')-px('paddingLeft')-px('paddingRight');
      const height=r.height-px('borderTopWidth')-px('borderBottomWidth')-px('paddingTop')-px('paddingBottom');
      // The object-fit content box is the usable image area, including when
      // a native fullscreen video itself must occupy the entire viewport.
      mediaContent={x,y,width,height,right:x+width,bottom:y+height};
    }
    return {video:video?rect(video):null,mediaContent,objectFit:video?getComputedStyle(video).objectFit:null,
      intrinsic:video?{width:video.videoWidth,height:video.videoHeight}:null,
      captions:[...document.querySelectorAll('[data-fixture-caption]')].filter(el=>(!document.fullscreenElement||document.fullscreenElement.contains(el))&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{const r=rect(el),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:el.dataset.fixtureCaption,rect:r,painted:top===el||el.contains(top),topTag:top?.tagName,topId:top?.id}}),
      viewport:{width:innerWidth,height:innerHeight},fullscreen:!!document.fullscreenElement,
      sameVideo:!window.originalVideo||window.originalVideo===video,
      sameStream:!window.originalStream||window.originalStream===video?.srcObject,
      sameParent:!window.originalParent||window.originalParent===video?.parentElement,
      selected:document.querySelector('#benny-player-controls')?.dataset.selected,
      scanState:document.querySelector('#benny-player-controls')?.dataset.scanState,
      bodyScrollWidth:document.documentElement.scrollWidth};
  });
  return {...outer,...result.value};
}
function layoutIssues(layout,{allButtons='auto',minVideoHeight=80}={}){
  if(!layout)return ['Player controls missing'];
  const issues=[],{mediaContent:video,panel,viewport}=layout,epsilon=2;
  if(!video||video.width<1||video.height<minVideoHeight)issues.push('Video area is missing or too short');
  if(video&&video.bottom>panel.y+epsilon)issues.push('Video extends underneath the controls');
  if(video&&video.bottom<panel.y-4)issues.push('Video area has not resized to the controls dock');
  if(video&&(video.y < -epsilon||video.x < -epsilon||video.right>viewport.width+epsilon))issues.push('Video is outside the viewport');
  if(panel.x < -epsilon||panel.y < -epsilon||panel.right>viewport.width+epsilon||panel.bottom>viewport.height+epsilon)issues.push('Controls panel is outside the viewport');
  if(layout.objectFit!=='contain')issues.push('Video must preserve its full image using object-fit: contain');
  if(!layout.sameVideo||!layout.sameStream||!layout.sameParent)issues.push('Layout replaced or reparented the native video or stream');
  if(layout.bodyScrollWidth>viewport.width+epsilon)issues.push('Layout causes horizontal overflow');
  for(const caption of layout.captions||[]){
    if(caption.rect.bottom>panel.y+epsilon)issues.push('Caption overlaps controls: '+caption.id);
    if(!caption.painted)issues.push('Caption is obscured by another surface: '+caption.id);
  }
  const row=layout.nav?.rect;
  const checkAll=allButtons===true||(allButtons==='auto'&&layout.nav?.scrollWidth<=layout.nav?.clientWidth+epsilon);
  const inside=(inner,outer)=>inner.x>=outer.x-epsilon&&inner.y>=outer.y-epsilon&&inner.right<=outer.right+epsilon&&inner.bottom<=outer.bottom+epsilon;
  const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>epsilon&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>epsilon;
  if(!layout.toolbar)issues.push('Inline player toolbar is missing');
  if(layout.toolbar&&!inside(layout.toolbar,panel))issues.push('Toolbar overflows the controls panel');
  if(layout.footer&&row){
    if(intersects(layout.footer,row)||layout.footer.x<row.right-epsilon)issues.push('Status lane overlaps or precedes the controls lane');
    if(Math.min(layout.footer.bottom,row.bottom)-Math.max(layout.footer.y,row.y)<=0)issues.push('Status lane is not inline with controls');
    if(layout.toolbar&&!inside(layout.footer,layout.toolbar))issues.push('Status lane overflows the toolbar');
    if(layout.toolbar&&layout.toolbar.right-layout.footer.right>epsilon)issues.push('Status lane does not reach the far-right toolbar edge');
  }
  if(layout.badge?.height>0){
    if(!layout.footer||!inside(layout.badge,layout.footer))issues.push('Scan badge overflows the status lane');
    if(layout.badge.scrollWidth>layout.badge.clientWidth+epsilon)issues.push('Scan badge text is clipped');
    if(layout.statusRect?.height>0&&intersects(layout.badge,layout.statusRect))issues.push('Scan badge overlaps playback status');
  }
  if(layout.statusRect?.height>0){
    if(!layout.footer||!inside(layout.statusRect,layout.footer))issues.push('Playback status overflows the status lane');
    if(layout.statusRect.whiteSpace!=='nowrap')issues.push('Playback status wraps into another row');
    if(/^(Playing|Paused|Parked)$/i.test(layout.status?.trim())&&layout.statusRect.scrollWidth>layout.statusRect.clientWidth+epsilon)issues.push('Short playback status is clipped');
  }
  if(checkAll&&row&&layout.buttons.length){
    const first=layout.buttons[0].rect,last=layout.buttons.at(-1).rect;
    if(Math.abs(first.x-row.x-layout.nav.paddingLeft)>epsilon||Math.abs(row.right-layout.nav.paddingRight-last.right)>epsilon)issues.push('Controls do not fill the available horizontal lane');
    for(let i=1;i<layout.buttons.length;i++)if(Math.abs(layout.buttons[i].rect.x-layout.buttons[i-1].rect.right-layout.nav.gap)>epsilon)issues.push('Control gaps are uneven');
  }
  if(layout.scanState==='paused'){
    const paused=layout.buttons.filter(button=>button.scanPaused);
    if(paused.length!==1||paused[0]?.outlineStyle!=='dotted')issues.push('Paused control must have one dotted highlight');
    if(paused.some(button=>button.pausePrefix&&!['none','normal','\"\"'].includes(button.pausePrefix)))issues.push('Paused control still has a text prefix');
    if(layout.badge?.height>0&&/paused/i.test(layout.badge.text))issues.push('Paused text badge remains visible');
  }
  for(const button of layout.buttons){
    const r=button.rect;
    if(r.width<36-epsilon||r.height<36-epsilon||button.fontSize<14)issues.push('Control is too small: '+button.command);
    if(Math.abs(r.y-layout.buttons[0].rect.y)>epsilon)issues.push('Controls wrap into multiple rows');
    if((checkAll||button.selected)&&row&&(r.x<row.x-epsilon||r.right>row.right+epsilon||r.y<row.y-epsilon||r.bottom>row.bottom+epsilon))issues.push('Clipped control: '+button.command);
  }
  return issues;
}
async function expectPlayerLayout(page,options={}){
  let layout;
  await expect.poll(async()=>{
    layout=await measurePlayerLayout(page);
    return layoutIssues(layout,options);
  },{timeout:6000,intervals:[100]}).toEqual([]);
  return layout;
}
module.exports={measurePlayerLayout,layoutIssues,expectPlayerLayout};
