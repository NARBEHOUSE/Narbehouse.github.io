'use strict';
/* Rush's photo-based appearance, with the requested simpler side coat and brown paws.
   Used throughout the game; the approved pet geometry stays unchanged. */
function rushCoatColor(x,y,area='coat'){
  if(area==='tan')return '#B89B70';
  if(area==='blaze')return '#CDD0BE';
  if(area==='muzzle')return '#778487';
  if(area==='mask')return '#262D33';
  // Broad, solid gray patches instead of scattered pixel speckles.
  return inE(x,y,{cx:-5,cy:-1,rx:4.8,ry:4.1})||inE(x,y,{cx:7,cy:2,rx:4.1,ry:3.1})?'#536168':'#303940';
}
const RUSH_STYLE={kind:'dog',label:'Australian Cattle Dog',ears:'perk',sw:'#353F46',
  pal:{fur:'#353F46',light:'#55636A',ear:'#242B31',earIn:'#685D58',line:'#171E24',iris:'#695746',lid:'#1B232A',blush:'#93806C',nose:'#141B21',collar:'#A94F63',tag:'#C3CED1'},
  pattern(x,y,t,G){
    if(t==='paw')return rushCoatColor(x,y,'tan');
    if(t==='muzzle'||t==='grey')return rushCoatColor(x-G.cx,y-G.hy,'muzzle');
    if(!['fur','light','tail'].includes(t))return null;
    const hx=x-G.cx,hy=y-G.hy;
    if(t==='fur'&&inHead(x,y,G,0)){
      const nx=hx/G.headRx,ny=hy/G.headRy;
      if(Math.abs(nx+.03)<.14+.055*Math.cos(ny*7)&&ny<.02)return rushCoatColor(hx,hy,'blaze');
      if(ny>.26&&Math.abs(nx)>.57)return rushCoatColor(hx,hy,'tan');
      if(inC(x,y,G.eyeRX,G.eyeY,3.9)||inC(x,y,G.eyeLX,G.eyeY,3.3))return rushCoatColor(hx,hy,'mask');
      return rushCoatColor(hx,hy,ny<-.4?'coat':'muzzle');
    }
    if(t==='fur'&&y>G.bodyCy+G.bodyRy*.67)return rushCoatColor(x,y,'tan');
    if(t==='light'&&y<G.bodyCy-1&&Math.abs(hx)<G.bodyRx*.37)return rushCoatColor(x,y,'tan');
    return rushCoatColor(x-G.cx,y-G.bodyCy);
  }};
function rushSidePattern(x,y,t,G){
  const H=G.head,hx=x-H.x,hy=y-H.y;
  // The renderer's paw tag follows each rounded foot, including walking and lying poses.
  // Coloring by a horizontal height instead made the legs look like square socks.
  if(t==='paw')return '#A4774F';
  if(t==='muzzle'||t==='grey')return rushCoatColor(hx,hy,'muzzle');
  if(!['fur','light','tail'].includes(t))return null;
  if(t==='fur'&&inE(x,y,H)){
    const nx=hx/H.rx,ny=hy/H.ry;
    if(ny<-.5&&nx>.12&&nx<.53)return rushCoatColor(hx,hy,'blaze');
    if(ny>.38&&nx>-.15&&nx<.65)return rushCoatColor(hx,hy,'tan');
    if(nx>-.05&&ny>-.5&&ny<.27)return rushCoatColor(hx,hy,'mask');
    return ny>.1?rushCoatColor(hx,hy,'muzzle'):'#303940';
  }
  // One dark gray for torso, legs, underside and tail; normal pose shading adds depth.
  return '#303940';
}
STYLES.cattle=RUSH_STYLE;
SIDE_PAT.cattle=rushSidePattern;
