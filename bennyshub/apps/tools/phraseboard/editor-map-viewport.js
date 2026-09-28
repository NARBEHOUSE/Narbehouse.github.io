'use strict';
let mapZoom=1,mapPanMode=false,mapSpaceHeld=false,mapDetailsVisible=true,mapWasActive=false,mapNeedsFit=false;
let categoryToolbarHome,categoryOptionsHome,mapViewportFrame;
function syncMapWorkspace(){
  const active=editorView==='map',workspace=document.querySelector('.workspace');
  if(!categoryToolbarHome){
    categoryToolbarHome=document.createComment('Category toolbar');categoryOptionsHome=document.createComment('Category appearance');
    document.querySelector('.canvas-toolbar').before(categoryToolbarHome);$('categoryOptions').before(categoryOptionsHome);
  }
  document.body.classList.toggle('graphic-editor',active);$('mapControls').hidden=!active;
  workspace.classList.toggle('map-details-hidden',!mapDetailsVisible);
  $('mapCategoryInspector').hidden=!active||!selectedCategories.size;
  $('inspector').hidden=active&&selectedCategories.size>0;
  const toolbar=document.querySelector('.canvas-toolbar');
  if(active){
    if(toolbar.parentElement!==$('mapCategoryInspector'))$('mapCategoryInspector').append(toolbar,$('categoryOptions'));
    if(!mapWasActive)mapNeedsFit=true;
  }else{
    categoryToolbarHome.after(toolbar);categoryOptionsHome.after($('categoryOptions'));
    $('canvasSpace').style.width='';$('canvasSpace').style.height='';
    Object.assign($('canvas').style,{left:'',top:'',transform:''});
    if(mapWasActive){const viewport=document.querySelector('.canvas-scroll');viewport.scrollLeft=0;viewport.scrollTop=0;}
  }
  mapWasActive=active;
}
function mapViewportGeometry(){
  const viewport=document.querySelector('.canvas-scroll');
  return {viewport,padX:viewport.clientWidth/2,padY:viewport.clientHeight/2,width:$('canvas').offsetWidth,height:$('canvas').offsetHeight};
}
function applyMapScale(){
  const {viewport,padX,padY,width,height}=mapViewportGeometry();
  Object.assign($('canvas').style,{left:padX+'px',top:padY+'px',transform:'scale('+mapZoom+')'});
  $('canvasSpace').style.width=Math.ceil(width*mapZoom+2*padX)+'px';
  $('canvasSpace').style.height=Math.ceil(height*mapZoom+2*padY)+'px';
  $('mapZoomReset').textContent=Math.round(mapZoom*100)+'%';
  $('mapZoomOut').disabled=mapZoom<=.02;$('mapZoomIn').disabled=mapZoom>=2.5;
}
function updateMapViewport(){
  cancelAnimationFrame(mapViewportFrame);
  if(editorView!=='map'||document.querySelector('dialog[open]'))return;
  applyMapScale();
  mapViewportFrame=requestAnimationFrame(()=>{if(editorView!=='map'||document.querySelector('dialog[open]'))return;if(mapNeedsFit){mapNeedsFit=false;fitMap();}else applyMapScale();});
}
function setMapZoom(value,clientX,clientY){
  const {viewport,padX,padY}=mapViewportGeometry(),rect=viewport.getBoundingClientRect();
  const x=clientX===undefined?viewport.clientWidth/2:clientX-rect.left,y=clientY===undefined?viewport.clientHeight/2:clientY-rect.top;
  const boardX=(viewport.scrollLeft+x-padX)/mapZoom,boardY=(viewport.scrollTop+y-padY)/mapZoom;
  mapZoom=Math.max(.02,Math.min(2.5,value));applyMapScale();
  viewport.scrollLeft=padX+boardX*mapZoom-x;viewport.scrollTop=padY+boardY*mapZoom-y;
}
function fitMap(){
  if(editorView!=='map')return;
  const {viewport,padX,padY,width,height}=mapViewportGeometry();
  const panel=mapDetailsVisible?Math.min(290,viewport.clientWidth*.38):0;
  const availableWidth=Math.max(100,viewport.clientWidth-panel-48),availableHeight=Math.max(100,viewport.clientHeight-106);
  mapZoom=Math.max(.02,Math.min(1,availableWidth/width,availableHeight/height));applyMapScale();
  viewport.scrollLeft=padX-(availableWidth-width*mapZoom)/2-24;
  viewport.scrollTop=padY-(availableHeight-height*mapZoom)/2-76;
}
function startMapPan(event){
  if(editorView!=='map'||!(event.button===1||event.button===0&&(mapPanMode||mapSpaceHeld)))return;
  event.preventDefault();event.stopPropagation();closeMapMenu();
  const viewport=event.currentTarget,left=viewport.scrollLeft,top=viewport.scrollTop;
  viewport.setPointerCapture(event.pointerId);document.querySelector('.workspace').classList.add('panning');
  const move=e=>{viewport.scrollLeft=left-(e.clientX-event.clientX);viewport.scrollTop=top-(e.clientY-event.clientY);};
  const finish=()=>{viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',finish);viewport.removeEventListener('pointercancel',finish);document.querySelector('.workspace').classList.remove('panning');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);};
  viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);
}
window.addEventListener('DOMContentLoaded',()=>{
  const viewport=document.querySelector('.canvas-scroll');
  $('mapZoomIn').onclick=()=>setMapZoom(mapZoom*1.2);$('mapZoomOut').onclick=()=>setMapZoom(mapZoom/1.2);
  $('mapZoomReset').onclick=()=>setMapZoom(1);$('mapFit').onclick=fitMap;
  $('mapPan').onclick=()=>{mapPanMode=!mapPanMode;$('mapPan').setAttribute('aria-pressed',String(mapPanMode));$('mapPan').title=mapPanMode?'Pan mode — click to select tiles':'Selection mode — click to pan';document.querySelector('.workspace').classList.toggle('pan-mode',mapPanMode);$('mapControls').querySelector('span').textContent=mapPanMode?'Drag to pan · Scroll to zoom':'Scroll to pan · Ctrl + scroll to zoom · Drag empty space to select';};
  $('mapDetails').onclick=()=>{mapDetailsVisible=!mapDetailsVisible;$('mapDetails').textContent=mapDetailsVisible?'Hide details':'Show details';$('mapDetails').setAttribute('aria-expanded',String(mapDetailsVisible));syncMapWorkspace();};
  viewport.addEventListener('pointerdown',startMapPan,true);
  viewport.addEventListener('wheel',e=>{if(editorView==='map'&&(mapPanMode||e.ctrlKey||e.metaKey)){e.preventDefault();setMapZoom(mapZoom*Math.exp(-e.deltaY*.002),e.clientX,e.clientY);}},{passive:false});
  document.addEventListener('keydown',e=>{if(editorView!=='map'||e.defaultPrevented||e.target.closest('input,textarea,select,button,[role=button],summary,dialog')||e.target.isContentEditable)return;if(e.code==='Space'){e.preventDefault();mapSpaceHeld=true;}if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')fitMap();else setMapZoom(mapZoom*(e.key==='-'?1/1.2:1.2));}});
  document.addEventListener('keyup',e=>{if(e.code==='Space')mapSpaceHeld=false;});window.addEventListener('blur',()=>mapSpaceHeld=false);
  document.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))updateMapViewport();},true);
  new ResizeObserver(()=>{if(editorView==='map')updateMapViewport();}).observe(viewport);
  $('canvas').addEventListener('load',()=>{if(editorView==='map')updateMapViewport();},true);
});
