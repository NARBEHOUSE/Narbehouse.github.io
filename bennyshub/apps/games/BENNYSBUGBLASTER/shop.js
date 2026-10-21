/* Full garden catalogue; locks and eligibility share the purchase rules. */
(function(){
'use strict';
const TAU=Math.PI*2,PI=Math.PI;
function oval(c,x,y,rx,ry,fill,stroke){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
function path(c,points,color,width){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}
function box(c,x,y,w,h,r,color,stroke){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
function gradient(c,light,dark){const g=c.createLinearGradient(-20,-30,20,30);g.addColorStop(0,light);g.addColorStop(1,dark);return g;}
function plus(c,x,y,color){box(c,x-4,y-12,8,24,2,color);box(c,x-12,y-4,24,8,2,color);}
function clock(c,x,y){oval(c,x,y,17,17,'#fff5d6','#615c4d');path(c,[[x,y-10],[x,y],[x+7,y+3]],'#597b67',3);oval(c,x,y,2,2,'#b18547');}
function bomb(c,x,y){oval(c,x,y,21,21,gradient(c,'#809471','#35493d'),'#263b32');box(c,x-6,y-26,12,10,3,'#b3bca5','#3e5145');path(c,[[x,y-26],[x+4,y-33],[x+12,y-33]],'#c5a66b',3);oval(c,x-6,y-8,6,4,'#e2e4bc55');}
function net(c,shield=false){if(shield){c.beginPath();c.moveTo(-23,-25);c.lineTo(23,-25);c.lineTo(21,10);c.quadraticCurveTo(16,24,0,32);c.quadraticCurveTo(-16,24,-21,10);c.closePath();}else{c.beginPath();c.roundRect(-25,-24,50,48,5);}c.fillStyle=gradient(c,'#b7d5c2','#6c9c88');c.fill();c.save();c.clip();for(let i=-40;i<50;i+=10){path(c,[[i,-32],[i+55,32]],'#f0ead3',2);path(c,[[i,32],[i+55,-32]],'#517567',1.5);}c.restore();if(shield)path(c,[[-23,-25],[23,-25],[21,10],[12,25],[0,32],[-12,25],[-21,10],[-23,-25]],'#577265',4);else box(c,-29,-28,6,60,2,'#b59568','#6d5b40');}
function drawIcon(c,index){
 c.save();c.translate(64,64);c.scale(1.3,1.3);oval(c,0,29,27,5,'#17271b20');
 if(index===0||index===1){
  c.save();c.rotate(-.18);box(c,-16,-20,32,46,7,gradient(c,'#f5f0d4','#bbd2bd'),'#577364');
  box(c,-16,-25,32,11,4,'#6e8d7f','#415f51');for(const x of [-9,0,9])oval(c,x,-20,2,2,'#e6edce');
  box(c,-11,1,22,19,3,'#faf4da');c.fillStyle='#63816d';c.font='bold 14px Georgia';c.textAlign='center';c.fillText('S',0,15);c.restore();
  if(index===1){path(c,[[17,17],[27,-1],[17,-1],[29,-22]],'#ebb659',6);for(let i=0;i<4;i++)oval(c,22+i*2,-31-i*2,2,2,'#fff1bc');}
 }else if(index===2){box(c,-28,-19,56,44,8,gradient(c,'#dc9683','#b0574b'),'#803e39');path(c,[[-10,-20],[-10,-28],[10,-28],[10,-20]],'#a96b53',5);plus(c,0,2,'#fff0d2');
 }else if(index===3||index===4){const s=BugBlasterPresentation.sprites.defender;const n=s.starts.idle;c.drawImage(s.sheet,n%8*s.size,Math.floor(n/8)*s.size,s.size,s.size,-42,-42,84,84);if(index===4)clock(c,17,16);
 }else if(index===5){box(c,-25,-9,50,37,2,gradient(c,'#f3e7bc','#bca675'),'#796747');path(c,[[-32,-9],[0,-31],[32,-9]],'#a85e42',10);path(c,[[-33,-12],[0,-35],[33,-12]],'#dc9b67',3);box(c,-6,7,13,21,2,'#5d8c7e');for(const x of [-18,12]){box(c,x,-3,9,11,1,'#d5e8ce','#8b8c68');path(c,[[x+4,-3],[x+4,8]],'#faf2d4',1);}
 }else if(index===6||index===7){bomb(c,-3,5);if(index===7)clock(c,18,18);else{path(c,[[16,-31],[22,-37]],'#f9d178',3);path(c,[[21,-28],[30,-29]],'#e99657',2);}
 }else if(index===8){box(c,-19,-25,38,51,8,gradient(c,'#6c8c79','#344b42'),'#2a4038');box(c,-13,-20,26,37,3,'#b4c8bc');for(let y=-14;y<18;y+=7)path(c,[[-12,y],[12,y]],'#6d8c83',1);c.beginPath();c.moveTo(4,-23);c.lineTo(-13,4);c.lineTo(0,2);c.lineTo(-5,23);c.lineTo(17,-5);c.lineTo(4,-3);c.closePath();c.fillStyle='#ffda69';c.fill();path(c,[[-12,29],[12,29]],'#557461',5);
 }else if(index===9){box(c,-19,-17,38,43,7,gradient(c,'#a2c392','#5e936c'),'#427152');path(c,[[16,-10],[30,-19],[35,-14]],'#80a77d',8);c.beginPath();c.ellipse(-21,-1,12,18,0,0,TAU);c.strokeStyle='#638c66';c.lineWidth=5;c.stroke();plus(c,0,5,'#f5ecc8');oval(c,0,-18,19,5,'#d4e0b5','#5d885d');
 }else if(index===10||index===11){net(c,index===11);if(index===11)plus(c,0,0,'#ecd29a');
 }else if(index===12){box(c,-19,-33,27,44,4,gradient(c,'#be986c','#7d654d'),'#594836');c.beginPath();c.moveTo(-19,-2);c.lineTo(6,-2);c.quadraticCurveTo(30,-6,32,20);c.quadraticCurveTo(12,27,-19,21);c.closePath();c.fillStyle=gradient(c,'#bd9564','#72523a');c.fill();path(c,[[-20,24],[31,24]],'#384535',7);for(let y=-23;y<-1;y+=7)path(c,[[-12,y],[1,y+3]],'#eee0b9',2);
 }else{box(c,-17,-15,34,42,7,gradient(c,'#f4dc86','#cca94e'),'#997b3c');box(c,-11,-24,22,12,3,'#d3c18b','#7a6d42');path(c,[[0,-24],[0,-33]],'#8f9c72',8);oval(c,0,6,9,12,'#fff1bd','#e1be62');for(let i=0;i<3;i++)oval(c,25+i*3,15+i*5,2+i*.6,3+i*.5,'#eac869');}
 c.restore();
}
const icons=buy_menu_options.map((_,i)=>{const c=document.createElement('canvas');c.width=c.height=128;drawIcon(c.getContext('2d'),i);return c;});
function stateFor(index){return getBuyItemState(index);}
function drawLock(c,x,y,size){
 c.save();c.translate(x,y);c.scale(size/20,size/20);
 box(c,-10,-10,20,23,5,'#f1e6c8','#616b56');
 c.beginPath();c.arc(0,-2,5,Math.PI,0);c.strokeStyle='#4b5945';c.lineWidth=2.5;c.stroke();
 box(c,-6,-2,12,10,2,'#4b5945');oval(c,0,2,1.5,1.5,'#f8eac5');c.restore();
}
function wrap(text,maxWidth,font){
 ctx.font=font;const lines=[];let line='';
 for(const word of text.split(' ')){const test=line?line+' '+word:word;if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);return lines;
}
let cards=[];
draw_buy_menu=function(){
 const W=SCREEN_WIDTH,H=SCREEN_HEIGHT,compact=W<600,short=H<550;
 const margin=Math.max(12,Math.min(44,W*.035)),gap=compact?7:12;
 const columns=W>=1100?4:W>=700&&short?4:W>=600?3:2,rows=Math.ceil(buy_menu_options.length/columns);
 const header=short?86:compact?104:130,footer=short?54:compact?66:82;
 const top=header,bottom=H-footer-12;
 const ch=Math.max(38,(bottom-top-gap*(rows-1))/rows),cw=(W-margin*2-gap*(columns-1))/columns;
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#65513e');bg.addColorStop(1,'#3e4e39');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.globalAlpha=.09;for(let y=0;y<H;y+=48)path(ctx,[[0,y],[W,y+2]],'#e8cc97',1);ctx.restore();
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 ctx.fillStyle='#f4e6bd';ctx.font='700 '+(compact?25:short?28:36)+'px "Segoe UI",sans-serif';ctx.fillText('Garden Store',margin,short?34:compact?37:49);
 ctx.font='700 '+(compact?11:13)+'px "Segoe UI",sans-serif';ctx.fillStyle='#c5cfae';ctx.fillText('LEVEL '+wave_number,margin,short?53:compact?55:71);
 const budgetLabel=points+' pts';ctx.font='700 '+(compact?20:28)+'px "Segoe UI",sans-serif';const bw=ctx.measureText(budgetLabel).width+40,bx=W-margin-bw,by=compact?19:short?14:24;
 box(ctx,bx,by,bw,compact?36:45,12,'#283b2b','#879b6c');oval(ctx,bx+18,by+(compact?18:22.5),8,8,'#e4ba66','#b18b49');ctx.fillStyle='#f4e4aa';ctx.fillText(budgetLabel,bx+32,by+(compact?25:32));
 ctx.fillStyle='#e6e8d4';ctx.font=(compact?11:13)+'px "Segoe UI",sans-serif';
 const help=points===0?'Play to earn points. Locks show when upgrades open.':'Choose an upgrade, or start the next level. Glue lasts one level.';
 ctx.fillText(help,margin,top-14);
 const available=new Set(getVisibleBuyOptions());cards=buy_menu_options.map((_,i)=>stateFor(i));buy_rects=[];
 for(const card of cards){
  const col=card.index%columns,row=Math.floor(card.index/columns),x=margin+col*(cw+gap),y=top+row*(ch+gap),selected=card.enabled&&menu_selected_index===card.index;
  card.rect={x,y,w:cw,h:ch};
  if(card.enabled)buy_rects.push({...card.rect,item:buy_menu_options[card.index],index:card.index});
  box(ctx,x,y+3,cw,ch,10,'#18271935');
  box(ctx,x,y,cw,ch,10,selected?'#fff0b3':card.enabled?'#fff5de':'#c5c9bf',selected?'#f7cd68':card.enabled?'#c5b78f':'#9da697');
  if(selected){ctx.save();ctx.strokeStyle='#263f29';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x+3,y+3,cw-6,ch-6,8);ctx.stroke();ctx.restore();}
  const iconSize=Math.min(compact?41:ch>=110?112:65,ch-12,cw*(ch>=110?.34:.27)),ix=x+7,iy=y+Math.max(4,(ch-iconSize)/2);
  ctx.save();if(!card.enabled){ctx.filter='grayscale(1)';ctx.globalAlpha=.65;}ctx.drawImage(icons[card.index],ix,iy,iconSize,iconSize);ctx.restore();
  if(card.locked)drawLock(ctx,ix+iconSize*.75,iy+iconSize*.75,Math.min(23,iconSize*.48));
  const textX=ix+iconSize+5,textW=x+cw-9-textX;
  const size=Math.max(9,Math.min(compact?12:17,ch*.17,textW/9));
  const font='700 '+size+'px "Segoe UI",sans-serif',lines=wrap(card.name,textW,font);
  ctx.fillStyle=card.enabled?'#2f4637':'#465242';ctx.font=font;
  const lineH=size*1.1,nameY=y+(ch>=110?ch*.27:14);
  lines.forEach((line,i)=>ctx.fillText(line,textX,nameY+i*lineH));
  const priceSize=Math.max(9,Math.min(14,ch*.16));ctx.font='700 '+priceSize+'px "Segoe UI",sans-serif';ctx.fillStyle=card.enabled?'#8c622e':'#515e4c';
  const priceY=ch>=110?y+ch*.67:y+ch-23;
  let price=card.maxed?'Complete':card.cost+' pts'+(card.index===13?' / level':'');
  while(ctx.measureText(price).width>textW&&price.length>3)price=price.slice(0,-2)+'…';
  ctx.fillText(price,textX,priceY);
  ctx.font=Math.max(9,Math.min(11,ch*.16))+'px "Segoe UI",sans-serif';ctx.fillStyle=card.enabled?'#52683d':'#465441';
  let note=card.note;
  if(card.enabled&&card.kind==='Permanent'&&card.max>1)note='Permanent · '+card.rank+'/'+card.max;
  while(ctx.measureText(note).width>textW&&note.length>3)note=note.slice(0,-2)+'…';
  ctx.fillText(note,textX,ch>=110?y+ch*.85:y+ch-8);

 }
 const labels=['Start Level','Undo','Main Menu'],buttonY=H-footer+5,buttonH=footer-17,buttonW=(W-margin*2-gap*2)/3;
 buy_buttons_rects=[];
 labels.forEach((name,i)=>{const index=buy_menu_options.length+i,x=margin+i*(buttonW+gap),enabled=available.has(index),selected=enabled&&menu_selected_index===index;
  if(enabled)buy_buttons_rects.push({x,y:buttonY,w:buttonW,h:buttonH,index,name});
  box(ctx,x,buttonY,buttonW,buttonH,10,selected?'#f8dfa0':i===0?'#c4d99b':enabled?'#ede3c8':'#87917f',selected?'#f8cc5f':i===0?'#dbe9be':'#a9b394');
  if(selected){ctx.strokeStyle='#314d35';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x+3,buttonY+3,buttonW-6,buttonH-6,8);ctx.stroke();}
  ctx.fillStyle=enabled?'#293e2b':'#43503f';ctx.font='700 '+Math.min(compact?14:21,buttonW/(name.length*.6),buttonH*.36)+'px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText(name,x+buttonW/2,buttonY+buttonH*.61);
 });ctx.textAlign='left';
};
window.BugBlasterShop={getCards:()=>cards.map(c=>({...c,rect:{...c.rect}})),icons};
})();
