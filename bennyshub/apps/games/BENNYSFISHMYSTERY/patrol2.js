const H=require('./tools/playtest.js'); const {G,RT,THREE}=H;
G.init({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(55,16/9,.1,4000),
 renderer:{shadowMap:{},domElement:{},setSize(){},render(){},setPixelRatio(){},getContext:()=>null}});
function trial(mission){
  G.resetProgress();
  const sv=G.getSave(); sv.briefed=99; sv.currentMission=mission; sv.money=100000;
  ['rods','vessels','baits','tools'].forEach(k=>(RT.content.roster[k]||[]).forEach(x=>{if(!sv[k].includes(x.id))sv[k].push(x.id);}));
  if(G.getHelper()) G.toggleHelper();
  G.goToDock(); G.setOnFoot(false); G.castOff();
  let up=0,gap=0,worst=0,f=0;
  for(let i=0;i<300*30;i++){
    f++; const phase=Math.floor(f/240)%4;
    G.setSteer(phase===1?0.6:phase===3?-0.6:0);
    G.update(1/30);
    if(G.debugActiveSpot()){up++;gap=0;}else{gap++;if(gap>worst)worst=gap;}
  }
  G.setSteer(0);
  console.log('  job '+mission+':  card up '+Math.round(up/9000*100)+'% of five minutes,  longest gap '+(worst/30).toFixed(0)+'s');
}
trial(27);
