'use strict';
const boardMenuButton=$('boardMenuButton'),boardMenu=$('boardMenu');
let settingsReturnFocus=boardMenuButton;
function closeBoardMenu(restoreFocus=false){
  boardMenu.hidden=true;boardMenuButton.setAttribute('aria-expanded','false');
  if(restoreFocus)boardMenuButton.focus();
}
function openBoardMenu(last=false){
  closeMapMenu();boardMenu.hidden=false;boardMenuButton.setAttribute('aria-expanded','true');
  const items=boardMenu.querySelectorAll('[role=menuitem]');items[last?items.length-1:0].focus();
}
function openBoardSettings(suggestions=false){
  settingsReturnFocus=document.activeElement?.closest('#boardMenu')?boardMenuButton:document.activeElement;
  closeBoardMenu();
  const dialog=$('boardOptions'),prediction=dialog.querySelector('.prediction-settings');
  $('settingsBoardName').append($('boardName').closest('label'));
  prediction.open=suggestions;
  if(!dialog.open)dialog.showModal();
  if(suggestions){prediction.querySelector('summary').focus();prediction.scrollIntoView({block:'nearest'});}
  else {$('boardLayout').focus();dialog.scrollTop=0;}
}
boardMenuButton.onclick=()=>boardMenu.hidden?openBoardMenu():closeBoardMenu(true);
boardMenuButton.onkeydown=e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openBoardMenu(e.key==='ArrowUp');}
};
boardMenu.onkeydown=e=>{
  const items=[...boardMenu.querySelectorAll('[role=menuitem]')],index=items.indexOf(document.activeElement);
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeBoardMenu(true);}
  else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
  }else if(e.key==='Tab')closeBoardMenu(true);
};
// Capture closes the dropdown before existing command handlers open dialogs or file pickers.
boardMenu.addEventListener('click',e=>{if(e.target.closest('[role=menuitem]'))closeBoardMenu(true);},true);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.header-dropdown'))closeBoardMenu();});
document.addEventListener('focusin',e=>{if(!e.target.closest('.header-dropdown'))closeBoardMenu();});
$('openBoardOptions').onclick=()=>openBoardSettings();
$('openSuggestions').onclick=()=>openBoardSettings(true);
$('closeBoardOptions').onclick=()=>$('boardOptions').close();
$('boardOptions').addEventListener('close',()=>{document.querySelector('.board-heading').prepend($('boardName').closest('label'));if(settingsReturnFocus?.isConnected)settingsReturnFocus.focus();});
