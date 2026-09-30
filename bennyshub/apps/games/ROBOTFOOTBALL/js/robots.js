/* Original modular football robots. Geometry is shared; only functional joints animate. */
(function () {
  'use strict';
  const T=window.THREE, PI=Math.PI;
  const geometryCache=new Map();

  // The bevels catch stadium lighting without textures or external model downloads.
  function plate(w,h,d,corner=.055) {
    const key=[w,h,d,corner].join('/');
    if(geometryCache.has(key))return geometryCache.get(key);
    const b=Math.min(w,h,d)*.13, x=w/2-b, y=h/2-b;
    const c=Math.min(corner,x*.65,y*.65),s=new T.Shape();
    s.moveTo(-x+c,-y);s.lineTo(x-c,-y);s.lineTo(x,-y+c);s.lineTo(x,y-c);
    s.lineTo(x-c,y);s.lineTo(-x+c,y);s.lineTo(-x,y-c);s.lineTo(-x,-y+c);s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:d-b*2,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,steps:1,curveSegments:1});
    g.translate(0,0,-d/2+b);geometryCache.set(key,g);return g;
  }
  function profile(points,d,bevel=.02) {
    const key=JSON.stringify([points,d,bevel]);
    if(geometryCache.has(key))return geometryCache.get(key);
    const s=new T.Shape();points.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:d-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,curveSegments:1});
    g.translate(0,0,-d/2+bevel);geometryCache.set(key,g);return g;
  }
  function initialize(renderer) {
    const m=renderer.materials;
    if(m.robotGraphite)return;
    m.robotGraphite=new T.MeshStandardMaterial({color:0x192532,metalness:.54,roughness:.44});
    m.robotTitanium=new T.MeshStandardMaterial({color:0x94aab6,metalness:.78,roughness:.29});
    m.robotSole=new T.MeshStandardMaterial({color:0x090e16,metalness:.05,roughness:.87});
    m.robotPorcelain=new T.MeshStandardMaterial({color:0xdce6e8,metalness:.34,roughness:.36});
    m.robotVisor=new T.MeshStandardMaterial({color:0x061722,metalness:.65,roughness:.13});
    m.robotGlow=new T.MeshStandardMaterial({color:0xa9eeff,emissive:0x39b9e3,emissiveIntensity:1.8,metalness:.25,roughness:.24});
    // Visors, ear hubs and joint lights glow in each team's accent colour.
    m.homeGlow=m.robotGlow.clone();m.awayGlow=m.robotGlow.clone();
    for(const name of ['homePrimary','homeAccent','awayPrimary','awayAccent']) {m[name].metalness=.38;m[name].roughness=.36;}
  }
  function create(renderer,p) {
    initialize(renderer);
    const m=renderer.materials,home=p.team==='home',primary=home?m.homePrimary:m.awayPrimary,accent=home?m.homeAccent:m.awayAccent;
    const armor=home?primary:m.robotPorcelain,secondary=home?m.robotPorcelain:primary,glow=home?m.homeGlow:m.awayGlow;
    const group=new T.Group(),body=new T.Group(),upper=new T.Group(),torso=new T.Group();
    group.name='football-robot';body.name='robot-body';upper.name='upper-body-pivot';
    group.add(body);body.add(upper);upper.position.y=1.1;upper.add(torso);torso.position.y=-1.1;
    const add=(g,mat,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>renderer.mesh(g,mat,parent,x,y,z,sx,sy,sz,true);
    const panel=(parent,mat,w,h,d,x,y,z,c=.04)=>add(plate(w,h,d,c),mat,parent,x,y,z);
    const rodGeometry=geometryCache.get('rod')||new T.CylinderGeometry(1,1,1,8);
    geometryCache.set('rod',rodGeometry);
    const rod=(parent,mat,r,h,x,y,z,axis)=>{const mesh=add(rodGeometry,mat,parent,x,y,z,r,h,r);if(axis==='x')mesh.rotation.z=PI/2;if(axis==='z')mesh.rotation.x=PI/2;return mesh;};
    const bolt=(parent,x,y,z,side)=>rod(parent,m.robotTitanium,.022,.012,x,y,z,side?'x':'z');
    let hash=0;for(const ch of String(p.id))hash+=ch.charCodeAt(0);

    // Separate plates float over a graphite frame, leaving readable mechanical gaps.
    panel(body,m.robotGraphite,.43,.24,.31,0,1.045,0);
    panel(body,primary,.39,.145,.29,0,1.055,.015);
    panel(body,m.robotTitanium,.44,.043,.305,0,1.135,0,.015);
    panel(body,accent,.105,.046,.023,0,1.133,.169,.008);
    panel(torso,m.robotGraphite,.435,.41,.28,0,1.34,0);
    const chest=profile([[-.205,-.25],[.205,-.25],[.3,.08],[.255,.235],[-.255,.235],[-.3,.08]],.345,.022);
    add(chest,armor,torso,0,1.425,0);
    // Large flush jersey panels preserve instant number recognition at game distance.
    panel(torso,home?m.robotGraphite:m.robotPorcelain,.44,.355,.035,0,1.407,.194,.038);
    const numberMat=new T.MeshStandardMaterial({map:renderer._numberTexture(p.number,home),transparent:true,roughness:.6,depthWrite:false});
    add(renderer.geometries.plane,numberMat,torso,0,1.412,.218,.43,.37,1);
    panel(torso,home?m.robotGraphite:m.robotPorcelain,.43,.355,.032,0,1.42,-.194,.032);
    const back=add(renderer.geometries.plane,numberMat,torso,0,1.423,-.215,.42,.37,1);back.rotation.y=PI;
    for(const side of [-1,1]) {
      const collar=panel(torso,accent,.19,.043,.052,side*.151,1.65,.169,.01);collar.rotation.z=side*.13;
      const chestRail=panel(torso,primary,.043,.275,.06,side*.253,1.421,.164,.012);chestRail.rotation.z=-side*.13;
      for(let n=0;n<3;n++)panel(torso,m.robotTitanium,.075,.025,.033,side*.22,1.24+n*.047,-.164,.004);
      panel(torso,m.robotGraphite,.083,.15,.062,side*.23,1.25,.08,.018);
      bolt(torso,side*.186,1.565,.219);
    }
    for(let n=0;n<3;n++)panel(torso,m.robotTitanium,.24-n*.025,.024,.042,0,1.173+n*.034,-.15,.006);
    rod(torso,m.robotTitanium,.078,.14,0,1.73,0);
    rod(torso,m.robotGraphite,.105,.055,0,1.722,0);

    // Helmet shape, facemask and ear hubs identify the sport before the robot details.
    const head=new T.Group();head.name='robot-helmet';head.position.set(0,1.905,0);torso.add(head);
    const helmet=profile([[-.193,-.105],[-.204,.075],[-.134,.181],[.134,.181],[.204,.075],[.193,-.105],[.13,-.154],[-.13,-.154]],.385,.03);
    add(helmet,primary,head,0,0,-.006);
    panel(head,accent,.054,.11,.385,0,.145,-.009,.015);
    panel(head,m.robotGraphite,.354,.137,.057,0,.013,.203,.027);
    const brow=profile([[-.18,-.012],[.18,-.012],[.153,.027],[-.153,.027]],.045,.006);
    add(brow,armor,head,0,.097,.224);
    panel(head,m.robotVisor,.324,.09,.033,0,.013,.241,.019);
    const glowLine=profile([[-.139,.008],[-.027,-.008],[.027,-.008],[.139,.008],[.13,.023],[.027,.007],[-.027,.007],[-.13,.023]],.01,.002);
    add(glowLine,glow,head,0,.006,.261);
    panel(head,m.robotGraphite,.225,.1,.068,0,-.108,.2,.025);
    for(let i=-1;i<=1;i++)panel(head,m.robotTitanium,.018,.04,.012,i*.052,-.113,.24,.003);
    for(const yy of [-.055,-.144]) {
      const points=[[-.212,yy-.015,.12],[-.191,yy,.26],[-.13,yy,.298],[.13,yy,.298],[.191,yy,.26],[.212,yy-.015,.12]].map(q=>new T.Vector3(...q));
      add(new T.TubeGeometry(new T.CatmullRomCurve3(points),15,.0105,5,false),m.robotTitanium,head);
    }
    for(const side of [-1,1]) {
      const cage=panel(head,m.robotTitanium,.017,.095,.018,side*.119,-.104,.299,.003);cage.rotation.z=side*.2;
      rod(head,m.robotGraphite,.086,.044,side*.222,-.021,-.013,'x');
      rod(head,m.robotTitanium,.059,.049,side*.228,-.021,-.013,'x');
      rod(head,accent,.035,.052,side*.232,-.021,-.013,'x');
      panel(head,m.robotGraphite,.032,.04,.115,side*.199,.088,-.034,.007);
      panel(head,glow,.009,.016,.048,side*.218,.088,-.025,.003);
    }
    panel(head,m.robotGraphite,.18,.08,.029,0,.02,-.218,.011);
    for(let n=-1;n<=1;n++)panel(head,m.robotTitanium,.115,.009,.012,0,.02+n*.021,-.237,.003);

    const arms=[],legs=[];
    for(const side of [-1,1]) {
      const arm=new T.Group();arm.name=side<0?'left-shoulder':'right-shoulder';arm.position.set(side*.39,1.55,0);torso.add(arm);arms.push(arm);
      arm.userData.upperLength=.34;arm.userData.lowerLength=.325;
      rod(arm,m.robotGraphite,.113,.155,0,-.028,0,'x');
      rod(arm,m.robotTitanium,.064,.17,side*.031,-.039,0,'x');
      const pad=panel(arm,armor,.282,.203,.365,side*.022,.01,-.012,.066);pad.rotation.z=side*.11;
      panel(arm,accent,.26,.039,.337,side*.025,.055,-.007,.014);
      panel(arm,glow,.16,.012,.02,side*.03,.092,.16,.004);
      panel(arm,primary,.235,.055,.31,side*.026,-.079,-.002,.018);
      panel(arm,m.robotGraphite,.115,.22,.127,0,-.204,0,.025);
      panel(arm,secondary,.151,.173,.137,0,-.184,.028,.03);
      for(const x of [-.067,.067])rod(arm,m.robotTitanium,.014,.192,x,-.218,-.044);
      rod(arm,m.robotGraphite,.075,.171,0,-.34,0,'x');
      rod(arm,m.robotTitanium,.045,.178,0,-.34,0,'x');
      rod(arm,accent,.026,.181,0,-.34,0,'x');
      const lower=new T.Group();lower.name='elbow';lower.position.y=-.34;lower.rotation.x=-.4;arm.add(lower);arm.userData.lower=lower;
      panel(lower,m.robotGraphite,.105,.265,.101,0,-.139,-.007,.022);
      const forearm=profile([[-.068,.098],[.068,.098],[.052,-.104],[-.052,-.104]],.134,.012);
      add(forearm,armor,lower,0,-.127,.021);
      panel(lower,accent,.095,.032,.148,0,-.066,.02,.01);
      rod(lower,m.robotTitanium,.013,.21,side*.066,-.141,-.021);
      rod(lower,m.robotTitanium,.047,.044,0,-.277,0);
      panel(lower,m.robotGraphite,.122,.043,.111,0,-.293,0,.013);

      // Wrist origin is the IK endpoint. Palm faces +Z and digits curl toward +Z.
      const hand=new T.Group();hand.name='articulated-grip';hand.position.set(0,-.325,0);lower.add(hand);arm.userData.hand=hand;
      panel(hand,m.robotGraphite,.127,.111,.083,0,-.012,.003,.025);
      panel(hand,secondary,.109,.069,.024,0,.002,-.039,.02);
      panel(hand,m.robotTitanium,.098,.025,.014,0,-.019,-.055,.008);
      const fingers=[];
      for(let n=0;n<3;n++) {
        const finger=new T.Group();finger.name='grip-finger';finger.position.set((n-1)*.04,-.062,.008);hand.add(finger);fingers.push(finger);
        panel(finger,m.robotGraphite,.032,.063,.036,0,-.022,.004,.009);
        panel(finger,m.robotGraphite,.03,.038,.035,0,-.06,.02,.009);
      }
      const thumb=new T.Group();thumb.name='grip-thumb';thumb.position.set(-side*.068,.002,.021);thumb.rotation.z=-side*.48;hand.add(thumb);
      panel(thumb,m.robotGraphite,.039,.079,.041,0,-.025,.009,.01);
      hand.userData.fingers=fingers;hand.userData.thumb=thumb;hand.userData.side=side;

      const leg=new T.Group();leg.name=side<0?'left-hip':'right-hip';leg.position.set(side*.158,1.04,0);body.add(leg);legs.push(leg);
      rod(leg,m.robotGraphite,.1,.215,0,-.031,0,'x');
      panel(leg,m.robotGraphite,.176,.342,.192,0,-.202,-.016,.033);
      const thigh=profile([[-.107,.144],[.107,.144],[.085,-.139],[-.085,-.139]],.254,.018);
      add(thigh,secondary,leg,0,-.22,.027);
      panel(leg,primary,.052,.279,.2,side*.109,-.211,.008,.013);
      panel(leg,accent,.019,.224,.115,side*.141,-.203,.013,.006);
      rod(leg,m.robotTitanium,.019,.276,-side*.084,-.232,-.113);
      rod(leg,m.robotTitanium,.047,.242,0,-.433,0,'x');
      const calf=new T.Group();calf.name='knee';calf.position.y=-.44;leg.add(calf);leg.userData.calf=calf;
      panel(calf,m.robotGraphite,.153,.367,.142,0,-.189,-.02,.025);
      panel(calf,armor,.19,.14,.125,0,-.014,.093,.039);
      panel(calf,accent,.116,.025,.02,0,-.005,.165,.008);
      panel(calf,glow,.05,.018,.012,0,-.06,.168,.004);
      const shin=profile([[-.066,.124],[.066,.124],[.047,-.125],[-.047,-.125]],.09,.013);
      add(shin,armor,calf,0,-.219,.074);
      panel(calf,m.robotTitanium,.027,.229,.014,0,-.213,.132,.007);
      rod(calf,m.robotTitanium,.018,.264,side*.066,-.202,-.061);
      rod(calf,m.robotGraphite,.064,.195,0,-.397,0,'x');
      rod(calf,m.robotTitanium,.04,.201,0,-.397,0,'x');
      panel(calf,m.robotSole,.254,.142,.38,0,-.485,.077,.043);
      panel(calf,primary,.229,.102,.237,0,-.448,.115,.028);
      panel(calf,secondary,.225,.076,.111,0,-.482,.218,.024);
      panel(calf,accent,.252,.025,.374,0,-.549,.077,.008);
      for(const x of [-.083,.083])for(const z of [-.039,.107,.214])panel(calf,m.robotGraphite,.055,.041,.053,x,-.575,z,.008);
    }
    renderer._batchRigid(body);
    const shadow=new T.Mesh(new T.PlaneGeometry(1.7,1.7),new T.MeshBasicMaterial({map:renderer.contactTexture,transparent:true,depthWrite:false}));shadow.rotation.x=-PI/2;shadow.position.y=.014;group.add(shadow);
    const model={group,body,torso:upper,head,arms,legs,shadow,lastAnim:'idle',catchAge:10,throwAge:10,tackleAge:10,downAge:10,kickAge:10,diveAge:10,number:p.number,team:p.team,numberMaterial:numberMat,lastX:p.x||0,lastZ:p.z||0,velocity:0,stride:hash*.31,heading:p.heading||0};
    group.position.set(p.x||0,0,p.z||0);group.rotation.y=p.heading||0;
    return model;
  }
  window.FootballRobotFactory={create};
})();
