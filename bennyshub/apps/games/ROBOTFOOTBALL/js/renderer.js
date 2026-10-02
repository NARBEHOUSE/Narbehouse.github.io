/* Original procedural stadium, football robots and ball presentation. */
(function () {
  'use strict';
  const T = window.THREE;
  const PI = Math.PI;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const mix = (a,b,t) => a+(b-a)*t;
  const CHARGE_SEGMENTS = 72, CHARGE_SIDES = 8;
  function canvasTexture(w,h,draw) {
    const c=document.createElement('canvas');c.width=w;c.height=h;
    draw(c.getContext('2d'),w,h);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    return texture;
  }
  function stadiumRing(rx,rz,width,y,height,material) {
    const positions=[],normals=[],uvs=[],indices=[],segments=160;
    // Sloping continuous seating deck, centred on midfield.
    for(let i=0;i<=segments;i++) {
      const a=i/segments*PI*2,ca=Math.cos(a),sa=Math.sin(a);
      positions.push(rx*ca,y,50+rz*sa,(rx+width)*ca,y+height,50+(rz+width)*sa);
      normals.push(0,1,0,0,1,0);uvs.push(i/segments*18,0,i/segments*18,1);
      if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);
    return new T.Mesh(g,material);
  }
  class FootballRenderer {
    constructor(container) {
      if(!T) throw new Error('The local 3D engine is unavailable.');
      this.homeTeam={id:'blue',name:'BLUEBORGS',shortName:'BLU',color:'#1565c0',accent:'#5e92f3'};this.awayTeam={id:'red',name:'RUSTBOTS',shortName:'RST',color:'#d32f2f',accent:'#ff6659'};
      this.container=container;this.time=0;this.playerModels=new Map();this.routeSignature='';this.frame=0;
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
      this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.16;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
      this.renderer.domElement.setAttribute('aria-hidden','true');
      container.appendChild(this.renderer.domElement);
      this.scene=new T.Scene();this.scene.fog=new T.FogExp2(0x1b2c44,0.0032);
      this.camera=new T.PerspectiveCamera(49,1,0.1,900);
      this.camera.position.set(0,68,9);this.look=new T.Vector3(0,0,35);this.camera.lookAt(this.look);
      this.desiredCamera=new T.Vector3();this.desiredLook=new T.Vector3();this._project=new T.Vector3();
      this.geometries={box:new T.BoxGeometry(1,1,1),sphere:new T.SphereGeometry(1,16,12),limb:new T.CylinderGeometry(1,1,1,10),plane:new T.PlaneGeometry(1,1)};
      this.materials={
        navy:new T.MeshStandardMaterial({color:0x123957,roughness:0.72}),
        lime:new T.MeshStandardMaterial({color:0xd6ff5f,roughness:0.5}),
        cream:new T.MeshStandardMaterial({color:0xf2ead9,roughness:0.83}),
        orange:new T.MeshStandardMaterial({color:0xe9633b,roughness:0.54}),
        dark:new T.MeshStandardMaterial({color:0x17212d,roughness:0.84}),
        black:new T.MeshStandardMaterial({color:0x0c131b,roughness:0.72}),
        metal:new T.MeshStandardMaterial({color:0xb9cbd0,metalness:0.6,roughness:0.35}),
        visor:new T.MeshStandardMaterial({color:0x122e3f,metalness:0.5,roughness:0.1}),
        white:new T.MeshStandardMaterial({color:0xe9f3f4,roughness:0.8}),
        concrete:new T.MeshStandardMaterial({color:0x253947,roughness:0.95,side:T.DoubleSide}),
        seat:new T.MeshStandardMaterial({color:0x38576b,roughness:1,side:T.DoubleSide})
      };
      this.materials.homePrimary=this.materials.navy.clone();this.materials.homeAccent=this.materials.lime.clone();this.materials.awayPrimary=this.materials.orange.clone();this.materials.awayAccent=this.materials.cream.clone();
      this._lighting();this._field();this._stadium();this._equipment();this._batchRigid(this.scene);this._hero();this.resize();
    }
    mesh(geometry,material,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1,shadow=false) {
      const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=shadow;
      if(parent)parent.add(m);return m;
    }
    _lighting() {
      const sky=new T.Mesh(new T.SphereGeometry(600,32,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color(0x050b1f)},middle:{value:new T.Color(0x21406b)},bottom:{value:new T.Color(0x3f9fb3)}},vertexShader:'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',fragmentShader:'varying vec3 vPos; uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));} void main(){vec3 d=normalize(vPos);float h=d.y; vec3 color=mix(bottom,middle,smoothstep(-0.12,0.2,h)); color=mix(color,top,smoothstep(0.1,0.85,h)); float star=step(.9972,hash(floor(d*190.0)))*smoothstep(.08,.45,h); color+=star*vec3(.75,.88,1.0);gl_FragColor=vec4(color,1.0);}'}));
      this.scene.add(sky);
      this.scene.add(new T.HemisphereLight(0xc4e5ff,0x355445,1.4));
      const key=new T.DirectionalLight(0xffead3,2.2);key.position.set(-45,76,-20);key.target.position.set(0,0,50);key.castShadow=true;
      key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-78,right:78,top:102,bottom:-102,near:1,far:230});
      key.shadow.bias=-0.0003;key.shadow.normalBias=0.035;this.scene.add(key,key.target);
      const fill=new T.DirectionalLight(0xc1e0ff,1.1);fill.position.set(45,50,80);this.scene.add(fill);
      this.glowTexture=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(64,64,0,64,64,62);g.addColorStop(0,'rgba(230,248,255,1)');g.addColorStop(.1,'rgba(196,229,255,.7)');g.addColorStop(.35,'rgba(144,199,255,.12)');g.addColorStop(1,'rgba(144,199,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
      this.contactTexture=canvasTexture(64,64,(ctx,w,h)=>{const g=ctx.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'rgba(0,0,0,.46)');g.addColorStop(.45,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    }
    _makeFieldTexture(home,away) {
      const texture=canvasTexture(2048,4096,(ctx,w,h)=>{
        const X=x=>(x+29.5)/59*w,Z=z=>(z+13)/126*h;
        ctx.fillStyle='#244a39';ctx.fillRect(0,0,w,h);
        for(let z=-10;z<110;z+=5){ctx.fillStyle=Math.round(z/5)%2?'#347247':'#3b7b4c';ctx.fillRect(X(-26.65),Z(z),X(26.65)-X(-26.65),Z(z+5)-Z(z));}
        // Fine fibre texture is baked once; the live scene has no grass particle cost.
        let seed=97;for(let i=0;i<95000;i++){seed=(seed*16807)%2147483647;const x=seed%w;seed=(seed*16807)%2147483647;const y=seed%h;ctx.fillStyle=i%2?'rgba(190,217,126,.045)':'rgba(1,37,20,.045)';ctx.fillRect(x,y,1,5);}
        ctx.fillStyle=home.color;ctx.fillRect(X(-26.65),Z(-10),X(26.65)-X(-26.65),Z(0)-Z(-10));
        ctx.fillStyle=away.color;ctx.fillRect(X(-26.65),Z(100),X(26.65)-X(-26.65),Z(110)-Z(100));
        ctx.fillStyle='rgba(255,255,255,.035)';for(let j=-9;j<54;j+=5){ctx.save();ctx.translate(X(j-26),Z(-10));ctx.rotate(.42);ctx.fillRect(0,-200,32,750);ctx.restore();}
        // Hex armour plating in both end zones reads as a robot arena without hiding any line.
        ctx.strokeStyle='rgba(255,255,255,.11)';ctx.lineWidth=3;
        for(const [z0,z1] of [[-10,0],[100,110]]){
          ctx.save();ctx.beginPath();ctx.rect(X(-26.65),Z(z0),X(26.65)-X(-26.65),Z(z1)-Z(z0));ctx.clip();
          const r=30,dx=r*Math.sqrt(3);
          for(let row=0,y=Z(z0)-r;y<Z(z1)+r;row++,y+=r*1.5)for(let x=X(-26.65)-dx+(row%2?dx/2:0);x<X(26.65)+dx;x+=dx){ctx.beginPath();for(let k=0;k<6;k++){const a=PI/6+k*PI/3;ctx.lineTo(x+Math.cos(a)*r*.92,y+Math.sin(a)*r*.92);}ctx.closePath();ctx.stroke();}
          ctx.restore();
        }
        ctx.strokeStyle='#e9efd9';ctx.lineWidth=7;ctx.strokeRect(X(-26.65),Z(-10),X(26.65)-X(-26.65),Z(110)-Z(-10));
        for(let z=0;z<=100;z+=5){ctx.beginPath();ctx.moveTo(X(-26.65),Z(z));ctx.lineTo(X(26.65),Z(z));ctx.lineWidth=z%10===0?6:4;ctx.stroke();}
        ctx.lineWidth=3;for(let z=1;z<100;z++){if(z%5===0)continue;for(const x of [-26,-3.1,3.1,26]){ctx.beginPath();ctx.moveTo(X(x-.35),Z(z));ctx.lineTo(X(x+.35),Z(z));ctx.stroke();}}
        ctx.font='900 116px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#eff3e4';
        for(let z=10;z<100;z+=10){const n=String(Math.min(z,100-z));for(const x of [-19,19]){ctx.save();ctx.translate(X(x),Z(z));ctx.rotate(x<0?PI/2:-PI/2);ctx.fillText(n,0,0);ctx.restore();} }
        // Directional chevrons add a broadcast-field finish without obscuring the lines.
        ctx.fillStyle='#eaf1dd';for(let z=10;z<=90;z+=10){if(z===50)continue;for(const x of [-19,19]){const zz=z+(z<50?2.8:-2.8);ctx.beginPath();ctx.moveTo(X(x-.7),Z(zz));ctx.lineTo(X(x+.7),Z(zz));ctx.lineTo(X(x),Z(zz+(z<50?.8:-.8)));ctx.fill();}}
        ctx.save();ctx.translate(X(0),Z(50));ctx.fillStyle=home.color;ctx.strokeStyle=home.accent;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-185,-112);ctx.lineTo(186,-112);ctx.lineTo(151,79);ctx.lineTo(0,153);ctx.lineTo(-151,79);ctx.closePath();ctx.fill();ctx.stroke();
        // A robot helmet crest at midfield ties every team to the machine league.
        ctx.strokeStyle='#d9eef5';ctx.lineWidth=9;ctx.strokeRect(-98,-68,196,132);ctx.fillStyle=home.accent;ctx.fillRect(-79,-39,158,31);ctx.fillStyle='#d9eef5';for(let tooth=-48;tooth<=48;tooth+=24)ctx.fillRect(tooth,25,12,22);ctx.fillRect(-124,-34,21,50);ctx.fillRect(103,-34,21,50);ctx.fillRect(-7,-92,14,21);ctx.restore();
        ctx.font='900 150px Arial, sans-serif';ctx.strokeStyle='#142631';ctx.lineWidth=8;ctx.strokeText(home.name.toUpperCase(),X(0),Z(-5),w*.84);ctx.fillStyle='#f7f5ea';ctx.fillText(home.name.toUpperCase(),X(0),Z(-5),w*.84);
        ctx.save();ctx.translate(X(0),Z(105));ctx.rotate(PI);ctx.strokeStyle='#142631';ctx.lineWidth=8;ctx.strokeText(away.name.toUpperCase(),0,0,w*.84);ctx.fillStyle='#f7f5ea';ctx.fillText(away.name.toUpperCase(),0,0,w*.84);ctx.restore();
        ctx.font='700 29px Arial, sans-serif';ctx.fillStyle='#dbe7d9';ctx.save();ctx.translate(X(-28.1),Z(50));ctx.rotate(-PI/2);ctx.fillText('ROBOT FOOTBALL  /  MECH LEAGUE',0,0);ctx.restore();
      });
      texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      return texture;
    }
    _field() {
      const texture=this._makeFieldTexture(this.homeTeam,this.awayTeam);
      const field=new T.Mesh(new T.PlaneGeometry(59,126),new T.MeshStandardMaterial({map:texture,roughness:1}));field.rotation.x=-PI/2;field.position.set(0,0,50);field.receiveShadow=true;this.scene.add(field);this.fieldMesh=field;
      this.mesh(new T.PlaneGeometry(210,290),new T.MeshStandardMaterial({color:0x233f34,roughness:1}),this.scene,0,-.04,50).rotation.x=-PI/2;
      const markerMaterial=new T.MeshBasicMaterial({color:0x60dafa,transparent:true,opacity:.85,depthWrite:false});
      this.scrimmage=this.mesh(new T.PlaneGeometry(53.3,.15),markerMaterial,this.scene,0,.045,25);this.scrimmage.rotation.x=-PI/2;
      this.firstDown=this.mesh(new T.PlaneGeometry(53.3,.17),new T.MeshBasicMaterial({color:0xffd36b,transparent:true,opacity:.92,depthWrite:false}),this.scene,0,.05,35);this.firstDown.rotation.x=-PI/2;
      const lineGlow=canvasTexture(8,64,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
      const laser=color=>new T.MeshBasicMaterial({map:lineGlow,color,transparent:true,opacity:.5,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
      this.scrimmageGlow=this.mesh(new T.PlaneGeometry(53.3,1.4),laser(0x3de7ff),this.scene,0,.04,25);this.scrimmageGlow.rotation.x=-PI/2;
      this.firstDownGlow=this.mesh(new T.PlaneGeometry(53.3,1.4),laser(0xffc93a),this.scene,0,.045,35);this.firstDownGlow.rotation.x=-PI/2;
      this.routeGroup=new T.Group();this.scene.add(this.routeGroup);
      this.trajectoryMaterial=new T.LineDashedMaterial({color:0xbff6ff,dashSize:.5,gapSize:.3,transparent:true,opacity:.65});
      this.trajectory=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:41},()=>new T.Vector3())),this.trajectoryMaterial);this.scene.add(this.trajectory);
    }
    _stadium() {
      const m=this.materials;
      for(let tier=0;tier<3;tier++) {
        const rx=42+tier*8,rz=78+tier*8,y=1.7+tier*7.2;
        this.scene.add(stadiumRing(rx,rz,7.6,y,6.1,m.seat));
        this.scene.add(stadiumRing(rx+7.8,rz+7.8,.2,y+6.1,-3.5,m.concrete));
        for(let row=0;row<9;row++){const offset=row*.82;this.scene.add(stadiumRing(rx+offset,rz+offset,.08,y+offset*.8+.12,0,m.dark));}
      }
      // Robot spectators keep the mechanical league theme in three instanced draws.
      const count=6200,torso=new T.InstancedMesh(new T.BoxGeometry(.41,.5,.3),new T.MeshLambertMaterial({color:0xffffff}),count);
      const heads=new T.InstancedMesh(new T.BoxGeometry(.27,.25,.24),new T.MeshLambertMaterial({color:0xffffff}),count);
      const visors=new T.InstancedMesh(new T.BoxGeometry(.21,.05,.018),new T.MeshBasicMaterial({color:0x70e3ff}),count);
      const dummy=new T.Object3D(),color=new T.Color(),shirt=[0xd4e6dd,0x244759,0x9fbd6d,0xc5d2ce,0x185365,0xe59468,0x486276,0x94a49b];
      let seed=313;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
      for(let i=0;i<count;i++) {
        const tier=Math.floor(rand()*3),row=Math.floor(rand()*9),a=rand()*PI*2;
        const rx=42+tier*8+row*.82,rz=78+tier*8+row*.82,y=1.7+tier*7.2+row*.67;
        // Aisles give the crowd architectural rhythm.
        const aisle=Math.abs((a*16/PI)%1-.5)<.055;
        dummy.position.set(rx*Math.cos(a),y+.34,50+rz*Math.sin(a));dummy.rotation.set(0,-a-PI/2,0);dummy.scale.setScalar(aisle?.01:1);dummy.updateMatrix();torso.setMatrixAt(i,dummy.matrix);torso.setColorAt(i,color.setHex(shirt[Math.floor(rand()*shirt.length)]));
        dummy.position.y+=.39;dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);heads.setColorAt(i,color.setHex([0x799098,0x425564,0xb4bdc0][Math.floor(rand()*3)]));dummy.translateZ(.13);dummy.updateMatrix();visors.setMatrixAt(i,dummy.matrix);
      }
      torso.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;visors.instanceMatrix.needsUpdate=true;this.scene.add(torso,heads,visors);
      const ribbonTexture=canvasTexture(2048,128,(ctx,w,h)=>{ctx.fillStyle='#04111d';ctx.fillRect(0,0,w,h);ctx.fillStyle='#3de7ff';ctx.fillRect(0,0,w,4);ctx.fillRect(0,h-6,w,6);ctx.font='700 50px Bahnschrift, Arial';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText('ROBOT FOOTBALL   \u25C6   MECH LEAGUE   \u25C6   ALL SYSTEMS GO   \u25C6   POWERED BY SWITCHES',w/2,62);});
      ribbonTexture.wrapS=T.RepeatWrapping;
      const ribbonMat=new T.MeshBasicMaterial({map:ribbonTexture,side:T.DoubleSide});
      this.scene.add(stadiumRing(50,86,.01,8.05,-1.5,ribbonMat));this.scene.add(stadiumRing(58,94,.01,15.25,-1.5,ribbonMat));
      // Open trussed roof, keeping an unobstructed dusk sky and floodlight silhouette.
      this.scene.add(stadiumRing(65,101,10,24.7,-1.2,new T.MeshStandardMaterial({color:0x142b3c,roughness:.62,metalness:.38,side:T.DoubleSide})));
      for(let i=0;i<24;i++) {
        const a=i/24*PI*2,x=66*Math.cos(a),z=50+102*Math.sin(a);
        this.mesh(this.geometries.limb,m.concrete,this.scene,x,13,z,.32,26,.32);
        const truss=this.mesh(this.geometries.box,m.metal,this.scene,69*Math.cos(a),24,z+3*Math.sin(a),12,.22,.25);truss.rotation.y=-a;
      }
      const glowMaterial=new T.SpriteMaterial({map:this.glowTexture,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending});
      const lampMaterial=new T.MeshBasicMaterial({color:0xeeffff});
      for(const z of [-15,24,76,115])for(const side of [-1,1]) {
        const x=side*54;this.mesh(this.geometries.limb,m.metal,this.scene,x,15,z,.2,30,.2);
        const lamps=new T.Group();lamps.position.set(x,30,z);lamps.rotation.y=side*PI/2;lamps.rotation.x=-.25;
        this.mesh(this.geometries.box,m.dark,lamps,0,0,0,8,2.25,.4);
        for(let i=0;i<8;i++)for(let j=0;j<2;j++)this.mesh(this.geometries.plane,lampMaterial,lamps,-3.3+i*.95,-.52+j*1.05,.23,.74,.74,1);
        this.scene.add(lamps);const halo=new T.Sprite(glowMaterial);halo.position.set(x,30,z);halo.scale.set(17,12,1);this.scene.add(halo);
      }
      // Both end-zone jumbotrons share one live scoreboard canvas.
      const board=document.createElement('canvas');board.width=1536;board.height=512;this.boardCtx=board.getContext('2d');
      this.boardTexture=new T.CanvasTexture(board);this.boardTexture.colorSpace=T.SRGBColorSpace;this.boardKey='';
      const boardMaterial=new T.MeshBasicMaterial({map:this.boardTexture,toneMapped:false});
      const frameGlow=new T.MeshBasicMaterial({color:0x3de7ff,toneMapped:false});
      for(const end of [-1,1]) {
        const screen=new T.Group();screen.position.set(0,17,50+end*88);if(end>0)screen.rotation.y=PI;
        this.mesh(this.geometries.box,m.dark,screen,0,0,0,28,11,.65);
        this.mesh(this.geometries.box,frameGlow,screen,0,-5.2,.34,26.8,.12,.05);this.mesh(this.geometries.box,frameGlow,screen,0,5.2,.34,26.8,.12,.05);
        this.mesh(this.geometries.plane,boardMaterial,screen,0,0,.35,26.8,9.7,1);this.scene.add(screen);
      }
      this._drawBoard(null,true);
      // Neon runs along the stands and sideline walls; the walls take each team's colour.
      const neon=new T.MeshBasicMaterial({color:0x3de7ff,toneMapped:false});
      for(let tier=0;tier<3;tier++)this.scene.add(stadiumRing(41.9+tier*8,77.9+tier*8,.02,1.9+tier*7.2,-.16,neon));
      this.materials.neonHome=new T.MeshBasicMaterial({color:0x3d8bff,toneMapped:false});this.materials.neonAway=new T.MeshBasicMaterial({color:0xff5a67,toneMapped:false});
      this.materials.beacon=new T.MeshBasicMaterial({color:0x3de7ff,toneMapped:false});this.materials.pylon=new T.MeshBasicMaterial({color:0xff9a3c,toneMapped:false});
      for(const side of [-1,1]) {
        const wall=this.mesh(this.geometries.box,m.dark,this.scene,side*33,.8,50,.6,1.6,123);wall.receiveShadow=true;
        this.mesh(this.geometries.box,side<0?this.materials.neonHome:this.materials.neonAway,this.scene,side*32.68,1.45,50,.04,.1,123);
        const benchmat=side<0?m.homePrimary:m.awayPrimary;
        const chargeLight=new T.MeshBasicMaterial({color:side<0?0x56cfff:0xff8b67});
        for(let bay=0;bay<4;bay++){const zz=31+bay*12;this.mesh(this.geometries.box,m.metal,this.scene,side*31.5,.14,zz,1.9,.28,3.4);this.mesh(this.geometries.box,m.dark,this.scene,side*32.3,1.3,zz,.35,2.5,3.4);this.mesh(this.geometries.box,chargeLight,this.scene,side*32.05,1.5,zz,.08,.1,2.7);for(const offset of [-1.45,1.45])this.mesh(this.geometries.box,chargeLight,this.scene,side*31.5,.3,zz+offset,1.7,.045,.08);}
        for(let j=0;j<4;j++){this.mesh(this.geometries.box,m.cream,this.scene,side*30,.75,35+j*9,1,.22,6);this.mesh(this.geometries.box,benchmat,this.scene,side*30.5,1.2,35+j*9,.16,.8,6);}
        for(let j=0;j<9;j++){
          const marker=this.mesh(this.geometries.box,this.materials.beacon,this.scene,side*27.8,.35,10+j*10,.2,.7,.4);marker.rotation.z=side*.15;
        }
      }
      // Energy pylons at every corner of both end zones.
      const pylonGlow=new T.SpriteMaterial({map:this.glowTexture,color:0xff9a3c,transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending});
      for(const z of [-10,0,100,110])for(const x of [-26.65,26.65]){this.mesh(this.geometries.box,this.materials.pylon,this.scene,x,.3,z,.2,.6,.2);const halo=new T.Sprite(pylonGlow);halo.position.set(x,.45,z);halo.scale.set(1.6,1.6,1);this.scene.add(halo);}
    }
    _equipment() {
      const goalmat=new T.MeshStandardMaterial({color:0xffd23f,emissive:0xffb000,emissiveIntensity:.6,metalness:.3,roughness:.4});this.goalMaterial=goalmat;
      this.goalWindow=this.mesh(this.geometries.plane,new T.MeshBasicMaterial({color:0x5dffb0,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,toneMapped:false}),this.scene,0,6.4,110,6.2,6.2,1);
      for(const z of [-12,112]) {
        const crossZ=z<0?-10:110;
        const support=this.mesh(this.geometries.limb,goalmat,this.scene,0,3.3,(z+crossZ)/2,.12,2,.12);support.rotation.x=PI/2;
        this.mesh(this.geometries.limb,goalmat,this.scene,0,1.65,z,.14,3.3,.14);
        const cross=this.mesh(this.geometries.limb,goalmat,this.scene,0,3.3,crossZ,.09,6.2,.09);cross.rotation.z=PI/2;
        for(const x of [-3.1,3.1])this.mesh(this.geometries.limb,goalmat,this.scene,x,6.4,crossZ,.08,6.2,.08);
        this.mesh(this.geometries.limb,this.materials.navy,this.scene,0,.8,z,.27,1.6,.27);
      }
      this.ball=this._makeFootball();this.ball.name='football-flight';
      this.scene.add(this.ball);
      this.selection=new T.Group();const ringmat=new T.MeshBasicMaterial({color:0x3de7ff,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide});
      this.selectionMaterial=ringmat;
      const ring=new T.Mesh(new T.RingGeometry(.72,.98,48),ringmat);ring.rotation.x=-PI/2;this.selection.add(ring);
      for(let i=0;i<4;i++){const g=this.mesh(this.geometries.box,ringmat,this.selection,Math.cos(i*PI/2)*1.03,.02,Math.sin(i*PI/2)*1.03,.15,.04,.15);g.rotation.y=PI/4;}
      this.scene.add(this.selection);
      const aimTexture=canvasTexture(128,128,(ctx)=>{ctx.strokeStyle='#ffd23f';ctx.lineWidth=7;ctx.beginPath();ctx.arc(64,64,37,0,PI*2);ctx.stroke();ctx.lineWidth=4;for(const [x,y,xx,yy] of [[64,7,64,34],[64,94,64,121],[7,64,34,64],[94,64,121,64]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(64,64,5,0,PI*2);ctx.fill();});
      this.kickMarker=new T.Sprite(new T.SpriteMaterial({map:aimTexture,transparent:true,depthWrite:false}));this.kickMarker.scale.set(3.4,3.4,1);this.scene.add(this.kickMarker);
      this.controlRing=new T.Mesh(new T.RingGeometry(.6,.8,40),new T.MeshBasicMaterial({color:0xa4dfff,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide}));this.controlRing.rotation.x=-PI/2;this.scene.add(this.controlRing);
      this._effects();
    }
    // Sparks, speed trails and fireworks share one additive point cloud.
    _effects() {
      const count=520,fx={count,next:0,pos:new Float32Array(count*3),col:new Float32Array(count*3),base:new Float32Array(count*3),vel:new Float32Array(count*3),life:new Float32Array(count),max:new Float32Array(count),gravity:new Float32Array(count)};
      for(let i=0;i<count;i++)fx.pos[i*3+1]=-50;
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(fx.pos,3));geometry.setAttribute('color',new T.BufferAttribute(fx.col,3));
      this.fx=fx;this.fxPoints=new T.Points(geometry,new T.PointsMaterial({size:1.1,map:this.glowTexture,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
      this.fxPoints.frustumCulled=false;this.scene.add(this.fxPoints);this._fireworks=[];this._trailClock=0;
      // The charge line: a solid bright tube along the throw with a dark edge, so it reads on bright grass.
      const tube=(material)=>{
        const g=new T.BufferGeometry(),index=[];g.setAttribute('position',new T.BufferAttribute(new Float32Array((CHARGE_SEGMENTS+1)*CHARGE_SIDES*3),3));
        for(let i=0;i<CHARGE_SEGMENTS;i++)for(let j=0;j<CHARGE_SIDES;j++){const a=i*CHARGE_SIDES+j,b=i*CHARGE_SIDES+(j+1)%CHARGE_SIDES,c=a+CHARGE_SIDES,d=b+CHARGE_SIDES;index.push(a,c,b,b,c,d);}
        g.setIndex(index);const mesh=new T.Mesh(g,material);mesh.frustumCulled=false;mesh.visible=false;this.scene.add(mesh);return mesh;
      };
      this.chargeArc=tube(new T.MeshBasicMaterial({color:0xffd23f,toneMapped:false}));
      this.chargeEdge=tube(new T.MeshBasicMaterial({color:0x04101b,transparent:true,opacity:.6,side:T.BackSide,depthWrite:false}));
      this.chargeTip=new T.Sprite(new T.SpriteMaterial({map:this.glowTexture,color:0xffd23f,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
      this.chargeTip.visible=false;this.scene.add(this.chargeTip);
      // The kickoff tee: a small orange cone the ball stands in at the 35.
      this.kickTee=new T.Mesh(new T.CylinderGeometry(.07,.17,.14,14),new T.MeshStandardMaterial({color:0xff7b1c,emissive:0x3a1400,roughness:.55}));this.kickTee.visible=false;this.scene.add(this.kickTee);
    }
    // Wrap a tube mesh around a list of points; the tube thickens toward the far end so it stays readable.
    _tube(mesh,points,near,far) {
      const array=mesh.geometry.attributes.position.array,up=new T.Vector3(0,1,0),tangent=new T.Vector3(),normal=new T.Vector3(),side=new T.Vector3();
      for(let i=0;i<=CHARGE_SEGMENTS;i++){
        const p=points[i];tangent.copy(points[Math.min(CHARGE_SEGMENTS,i+1)]).sub(points[Math.max(0,i-1)]);
        if(tangent.lengthSq()<1e-8)tangent.set(0,0,1);tangent.normalize();
        normal.crossVectors(tangent,up);if(normal.lengthSq()<1e-6)normal.set(1,0,0);normal.normalize();side.crossVectors(normal,tangent).normalize();
        const radius=mix(near,far,i/CHARGE_SEGMENTS);
        for(let j=0;j<CHARGE_SIDES;j++){const a=j/CHARGE_SIDES*PI*2,k=(i*CHARGE_SIDES+j)*3,c=Math.cos(a)*radius,d=Math.sin(a)*radius;array[k]=p.x+normal.x*c+side.x*d;array[k+1]=p.y+normal.y*c+side.y*d;array[k+2]=p.z+normal.z*c+side.z*d;}
      }
      mesh.geometry.attributes.position.needsUpdate=true;
    }
    burst(x,y,z,n,kind,color) {
      const fx=this.fx;if(!fx)return;
      const tint=new T.Color(),palette={impact:[0xffd23f,0xff8a2a,0xffffff],break:[0x3de7ff,0xa6f5ff,0xffffff],trail:[color||0x3de7ff],firework:[color||0xffd23f,0xffd23f,0xffffff]}[kind]||[0xffffff];
      for(let k=0;k<n;k++){
        const i=fx.next;fx.next=(fx.next+1)%fx.count;
        const a=Math.random()*PI*2,up=kind==='firework'?Math.random()*2-1:Math.random(),speed=kind==='trail'?.5+Math.random()*.6:kind==='firework'?5+Math.random()*4:2.5+Math.random()*4.5;
        const flat=Math.sqrt(Math.max(0,1-up*up));
        fx.pos[i*3]=x;fx.pos[i*3+1]=y;fx.pos[i*3+2]=z;
        fx.vel[i*3]=Math.cos(a)*flat*speed;fx.vel[i*3+1]=(kind==='trail'?.4:up*speed+(kind==='firework'?0:1.5));fx.vel[i*3+2]=Math.sin(a)*flat*speed;
        fx.max[i]=fx.life[i]=kind==='trail'?.35+Math.random()*.2:kind==='firework'?1+Math.random()*.7:.35+Math.random()*.4;
        fx.gravity[i]=kind==='trail'?0:kind==='firework'?3.2:9;
        tint.setHex(palette[k%palette.length]);fx.base[i*3]=tint.r;fx.base[i*3+1]=tint.g;fx.base[i*3+2]=tint.b;
      }
    }
    _stepEffects(dt) {
      const fx=this.fx;if(!fx)return;
      for(let i=0;i<fx.count;i++){
        if(fx.life[i]<=0)continue;
        fx.life[i]-=dt;
        if(fx.life[i]<=0){fx.pos[i*3+1]=-50;fx.col[i*3]=fx.col[i*3+1]=fx.col[i*3+2]=0;continue;}
        fx.vel[i*3+1]-=fx.gravity[i]*dt;
        for(let c=0;c<3;c++)fx.pos[i*3+c]+=fx.vel[i*3+c]*dt;
        if(fx.pos[i*3+1]<.05&&fx.gravity[i]>0){fx.pos[i*3+1]=.05;fx.vel[i*3+1]*=-.3;}
        const fade=Math.min(1,fx.life[i]/fx.max[i]*1.6);
        for(let c=0;c<3;c++)fx.col[i*3+c]=fx.base[i*3+c]*fade;
      }
      this.fxPoints.geometry.attributes.position.needsUpdate=true;this.fxPoints.geometry.attributes.color.needsUpdate=true;
      for(const show of this._fireworks)show.delay-=dt;
      for(const show of this._fireworks.filter(show=>show.delay<=0))this.burst(show.x,show.y,show.z,this.reducedMotion?22:44,'firework',show.color);
      this._fireworks=this._fireworks.filter(show=>show.delay>0);
    }
    _celebrate(s) {
      const home=s.possession==='home',team=home?this.homeTeam:this.awayTeam,color=new T.Color(team.accent||team.color).getHex(),z=home?103:-3;
      for(let k=0;k<(this.reducedMotion?2:5);k++)this._fireworks.push({delay:k*.32,x:(Math.random()*2-1)*11,y:4.5+Math.random()*3.5,z:z+(Math.random()*2-1)*3,color:k%2?0xffd23f:color});
    }
    _drawBoard(s,menu) {
      const home=this.homeTeam,away=this.awayTeam;
      const period=s?(s.format==='regulation'?(s.overtime?'OT':'Q'+s.quarter):'DRIVE '+s.drive):'';
      const key=menu?'menu':[home.name,home.color,away.name,away.color,s.homeScore,s.awayScore,period,s.possession].join('|');
      if(key===this.boardKey)return;
      this.boardKey=key;
      const ctx=this.boardCtx,w=1536,h=512;
      ctx.fillStyle='#040b14';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(61,231,255,.06)';for(let y=0;y<h;y+=6)ctx.fillRect(0,y,w,2);
      ctx.textAlign='center';ctx.textBaseline='middle';
      if(menu){
        ctx.fillStyle='#3de7ff';ctx.fillRect(0,0,w,10);ctx.fillRect(0,h-10,w,10);
        ctx.font='700 120px Bahnschrift, Arial';ctx.fillStyle='#eaf6ff';ctx.fillText('ROBOT FOOTBALL',w/2,190);
        ctx.font='600 52px Bahnschrift, Arial';ctx.fillStyle='#3de7ff';ctx.fillText('M E C H   L E A G U E',w/2,300);
        ctx.font='600 30px Consolas, monospace';ctx.fillStyle='#8fb3c8';ctx.fillText('ALL SYSTEMS GO',w/2,400);
      }else{
        for(const [team,x,score] of [[home,0,s.homeScore],[away,w/2+120,s.awayScore]]){
          ctx.fillStyle=team.color;ctx.fillRect(x,0,w/2-120,h);
          ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x,h-150,w/2-120,150);
          ctx.fillStyle='#ffffff';ctx.font='700 64px Bahnschrift, Arial';ctx.fillText(team.name,x+(w/2-120)/2,h-76,w/2-170);
          ctx.font='700 250px Consolas, monospace';ctx.fillText(String(score),x+(w/2-120)/2,170);
        }
        ctx.fillStyle='#040b14';ctx.fillRect(w/2-120,0,240,h);
        ctx.fillStyle='#3de7ff';ctx.font='700 58px Consolas, monospace';ctx.fillText(period,w/2,150,220);
        ctx.font='600 30px Bahnschrift, Arial';ctx.fillStyle='#ffd23f';ctx.fillText((s.possession==='home'?home:away).shortName+' BALL',w/2,260,220);
        ctx.fillStyle='#3de7ff';ctx.fillRect(w/2-120,h-12,240,12);
      }
      this.boardTexture.needsUpdate=true;
    }
    _makeFootball() {
      const ball=new T.Group();
      // The model's +Z axis runs from tail to nose. Pass spin is only around Z.
      const leather=canvasTexture(512,256,(ctx,w,h)=>{
        ctx.fillStyle='#783d22';ctx.fillRect(0,0,w,h);
        for(let y=0;y<h;y+=5)for(let x=0;x<w;x+=5){ctx.fillStyle=(x*7+y*3)%11<5?'#8a4829':'#63331e';ctx.beginPath();ctx.ellipse(x+(y%10?2:0),y,1.15,1.55,0,0,PI*2);ctx.fill();}
        for(let i=0;i<4;i++){ctx.fillStyle='#42231a';ctx.fillRect(i*w/4,0,2,h);ctx.fillStyle='#ae6940';ctx.fillRect(i*w/4+2,0,1,h);}
      });
      const profile=[];
      for(let i=0;i<=30;i++){const t=-1+i/15;profile.push(new T.Vector2(.139*Math.pow(Math.max(0,1-t*t),.68),t*.245));}
      const shell=new T.LatheGeometry(profile,32);shell.rotateX(PI/2);
      this.mesh(shell,new T.MeshStandardMaterial({map:leather,roughness:.77}),ball,0,0,0,1,1,1,true);
      const laces=new T.MeshStandardMaterial({color:0xf1e7cb,roughness:.73});
      for(let i=0;i<7;i++){const z=-.093+i*.031,y=.139*Math.pow(1-(z/.245)**2,.68)+.004;this.mesh(this.geometries.box,laces,ball,0,y,z,.092,.013,.013,true);}
      const spine=[];for(let i=0;i<12;i++){const z=-.108+i*.216/11;spine.push(new T.Vector3(0,.139*Math.pow(1-(z/.245)**2,.68)+.008,z));}
      this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(spine),14,.009,5,false),laces,ball);
      for(const z of [-.169,.169]){const radius=.139*Math.pow(1-(z/.245)**2,.68)+.001;const band=new T.Mesh(new T.TorusGeometry(radius,.008,6,32),laces);band.position.z=z;ball.add(band);}
      this._batchRigid(ball);return ball;
    }
    _numberTexture(number,home) {
      return canvasTexture(128,160,(ctx,w,h)=>{ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 105px Arial';ctx.strokeStyle='#10212e';ctx.lineWidth=8;ctx.strokeText(String(number||1),w/2,85);ctx.fillStyle=home?'#f5f3e9':this.awayTeam.color;ctx.fillText(String(number||1),w/2,85);ctx.font='700 14px Arial';ctx.fillText((home?this.homeTeam:this.awayTeam).shortName.toUpperCase(),w/2,21,w*.92);});
    }
    _batchRigid(group) {
      // Bake rigid pieces sharing a material into one mesh. Arms and knees remain
      // independent joints; helmets, pads and shoe details do not add draw calls.
      for(const child of [...group.children])if(child.isGroup)this._batchRigid(child);
      const byMaterial=new Map();
      for(const child of group.children)if(child.isMesh){if(!byMaterial.has(child.material))byMaterial.set(child.material,[]);byMaterial.get(child.material).push(child);}
      for(const [material,meshes] of byMaterial){
        if(meshes.length<2)continue;
        const geometries=meshes.map(mesh=>{mesh.updateMatrix();const clone=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(!clone.index)return clone;const plain=clone.toNonIndexed();clone.dispose();return plain;});
        const geometry=new T.BufferGeometry();
        for(const name of ['position','normal','uv']){
          const size=name==='uv'?2:3,total=geometries.reduce((n,g)=>n+g.attributes.position.count*size,0),array=new Float32Array(total);let offset=0;
          for(const source of geometries){const attribute=source.attributes[name];if(attribute)array.set(attribute.array,offset);offset+=source.attributes.position.count*size;}
          geometry.setAttribute(name,new T.BufferAttribute(array,size));
        }
        geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,material);mesh.castShadow=meshes.some(m=>m.castShadow);group.add(mesh);
        for(const original of meshes)group.remove(original);for(const source of geometries)source.dispose();
      }
    }
    _athlete(p) {
      const model=window.FootballRobotFactory.create(this,p);
      model.gripBall=this.ball.clone(true);model.gripBall.name='football-held';model.gripBall.visible=false;
      model.arms[0].parent.add(model.gripBall);
      return model;
    }
    _applyTeams(options) {
      const normalize=(team,fallback)=>Object.assign({},fallback,team||{}, {shortName:(team&&(team.shortName||team.name))||fallback.shortName});
      const home=normalize(options.homeTeam,this.homeTeam),away=normalize(options.awayTeam,this.awayTeam);
      const key=[home.id,home.name,home.shortName,home.color,home.accent,away.id,away.name,away.shortName,away.color,away.accent].join('|');
      if(key===this.teamKey)return;
      this.teamKey=key;this.homeTeam=home;this.awayTeam=away;
      this.materials.homePrimary.color.set(home.color);this.materials.homeAccent.color.set(home.accent);
      this.materials.awayPrimary.color.set(away.color);this.materials.awayAccent.color.set(away.accent);
      const glowOf=team=>new T.Color(team.accent||team.color).lerp(new T.Color(0xffffff),.3);
      if(this.materials.homeGlow){this.materials.homeGlow.color.copy(glowOf(home));this.materials.homeGlow.emissive.copy(glowOf(home));this.materials.awayGlow.color.copy(glowOf(away));this.materials.awayGlow.emissive.copy(glowOf(away));}
      this.materials.neonHome.color.set(home.accent||home.color);this.materials.neonAway.color.set(away.accent||away.color);this.boardKey='';
      const previous=this.fieldMesh.material.map;this.fieldMesh.material.map=this._makeFieldTexture(home,away);this.fieldMesh.material.needsUpdate=true;if(previous)previous.dispose();
      for(const model of [...this.playerModels.values(),...this.heroModels]){
        const previousNumber=model.numberMaterial.map;model.numberMaterial.map=this._numberTexture(model.number,model.team==='home');model.numberMaterial.needsUpdate=true;if(previousNumber)previousNumber.dispose();
      }
    }
    _hero() {
      this.heroLight=new T.DirectionalLight(0xe8f2ff,2.3);this.heroLight.position.set(-1,8,10);this.heroLight.target.position.set(-3,1,21);this.heroLight.visible=false;this.scene.add(this.heroLight,this.heroLight.target);
      this.heroGroup=new T.Group();this.heroGroup.visible=false;this.scene.add(this.heroGroup);this.heroModels=[];
      for(const p of [{id:'hero',team:'home',number:7,x:-3.25,z:21,heading:PI+.1},{id:'hero-back',team:'home',number:88,x:1.5,z:29,heading:PI+.35},{id:'hero-away',team:'away',number:24,x:-7,z:35,heading:PI}]){const model=this._athlete(p);this.heroGroup.add(model.group);this.heroModels.push(model);}
    }
    _routes(s) {
      let routes=s.kickoff||s.toss?[]:s.routes||[];
      if((s.phase==='playcall'||s.phase==='presnap')&&s.previewPlayId&&!s.kickoff&&!s.toss){
        const los=s.lineOfScrimmage||25,players=s.players||[];
        const home=role=>players.find(p=>p.team==='home'&&p.role===role);
        const point=p=>({x:p.x,z:p.z});
        const play=window.FootballSim&&window.FootballSim.PLAYS.find(p=>p.id===s.previewPlayId);
        if(s.possession==='home'&&play){
          if(play.type==='pass'){
            routes=['WR1','WR2','SLOT','TE'].map((role,i)=>{
              const p=home(role),r=play.routes[i];if(!p)return null;
              const end={x:r[2],z:Math.min(102,los+r[3])};
              return{playerId:p.id,points:[point(p),{x:p.x,z:Math.min(end.z,los+Math.min(7,r[3]*.5))},end]};
            }).filter(Boolean);
          }else if(play.type==='run'){
            const p=home('RB');routes=p?[{playerId:p.id,points:[point(p),{x:play.lane,z:los-1.5},{x:play.lane,z:Math.min(105,los+17)}]}]:[];
          }else{
            const p=home('QB'),from=s.placeKick&&play.id!=='punt'?s.placeKick.spot:p;routes=p?[{playerId:p.id,points:[point(from),{x:0,z:play.id==='punt'?Math.min(104,los+44):110}]}]:[];
          }
        }else if(s.possession==='away'){
          const id=s.previewPlayId;
          if(id==='puntreturn'||id==='fgreturn'){
            // The returner drops back to where the kick comes down.
            const p=home('FS');routes=p?[{playerId:p.id,points:[point(p),{x:0,z:id==='fgreturn'?1:clamp(los-42,3,97)}],defense:true}]:[];
          }else if(id==='puntblock'||id==='fgblock'){
            const spot=s.placeKick?s.placeKick.spot:{x:0,z:los+6};
            routes=['LB1','MLB','LB2'].map((role,i)=>{const p=home(role);return p?{playerId:p.id,points:[point(p),{x:spot.x+(i-1)*2.5,z:clamp(spot.z-1,-5,105)}],defense:true}:null;}).filter(Boolean);
          }else if(id==='man'){
            // Each defender picks up one receiver.
            routes=[['CB1','WR1'],['CB2','WR2'],['SS','TE'],['LB2','SLOT']].map(([role,mark])=>{const p=home(role),m=players.find(q=>q.team==='away'&&q.role===mark);return p&&m?{playerId:p.id,points:[point(p),{x:m.x,z:m.z-1.5}],defense:true}:null;}).filter(Boolean);
          }else{
            const roles=id==='blitz'?['MLB','DE1','DE2']:['MLB','LB1','LB2'];
            routes=roles.map((role,i)=>{
              const p=home(role);if(!p)return null;
              const zone=id==='zone',x=i===0?0:(i===1?-1:1)*(zone?14:id==='contain'?18:4);
              const z=clamp(los+(zone?-15:id==='blitz'?3:-3),-5,105);
              return{playerId:p.id,points:[point(p),{x,z}],defense:true};
            }).filter(Boolean);
          }
        }
      }
      const signature=JSON.stringify(routes);
      if(signature!==this.routeSignature) {
        this.routeSignature=signature;
        while(this.routeGroup.children.length){const c=this.routeGroup.children[0];this.routeGroup.remove(c);c.geometry.dispose();c.material.dispose();}
        routes.forEach((route,i)=>{
          if(!route.points||route.points.length<2)return;
          const points=route.points.map(p=>new T.Vector3(p.x,.115,p.z));
          const color=route.defense?(i===0?0xa4eaff:0xb8dbe6):(i===0?0x3de7ff:0xd8f6ff);
          const curve=new T.CurvePath();
          for(let j=1;j<points.length;j++)if(points[j].distanceTo(points[j-1])>.02)curve.add(new T.LineCurve3(points[j-1],points[j]));
          if(!curve.curves.length)return;
          const line=new T.Mesh(new T.TubeGeometry(curve,Math.max(8,points.length*8),i===0?.11:.075,5,false),new T.MeshBasicMaterial({color,transparent:true,opacity:i===0?.94:.74}));this.routeGroup.add(line);
          const first=route.points[0],startRing=new T.Mesh(new T.RingGeometry(.48,.61,24),new T.MeshBasicMaterial({color,transparent:true,opacity:.95,side:T.DoubleSide}));startRing.rotation.x=-PI/2;startRing.position.set(first.x,.12,first.z);this.routeGroup.add(startRing);
          const last=route.points[route.points.length-1],before=route.points[route.points.length-2],angle=Math.atan2(last.x-before.x,last.z-before.z);
          const cone=new T.Mesh(new T.ConeGeometry(.6,1.4,3),new T.MeshBasicMaterial({color,transparent:true,opacity:.96}));cone.rotation.set(PI/2,0,-angle);cone.position.set(last.x,.16,last.z);this.routeGroup.add(cone);
        });
      }
      this.routeGroup.visible=s.phase==='playcall'||s.phase==='presnap';
    }
    _updatePlayer(model,p,dt,s) {
      const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
      const movement=Math.hypot(p.x-model.lastX,p.z-model.lastZ)/Math.max(dt,.001);
      const teleported=movement>35;
      model.velocity=mix(model.velocity,teleported?0:Math.min(movement,12),1-Math.exp(-dt*12));model.lastX=p.x;model.lastZ=p.z;
      model.group.position.set(p.x,p.y||0,p.z);
      let difference=(p.heading||0)-model.heading;difference=Math.atan2(Math.sin(difference),Math.cos(difference));model.heading+=difference*(1-Math.exp(-dt*12));model.group.rotation.y=model.heading;
      for(const name of ['catchAge','throwAge','tackleAge','downAge','kickAge','diveAge'])model[name]+=dt;
      if(model.lastAnim!==p.anim){
        const event={catch:'catchAge',throw:'throwAge',tackle:'tackleAge',down:'downAge',kick:'kickAge',dive:'diveAge',knocked:'diveAge'}[p.anim];if(event)model[event]=0;
        // Armour on armour throws sparks: orange on a tackle, cyan when a runner breaks free.
        if(!['playcall','presnap'].includes(s.phase)&&dt>0){if(p.anim==='down')this.burst(p.x,1,p.z,this.reducedMotion?14:28,'impact');else if(p.anim==='dive'||p.anim==='knocked')this.burst(p.x,.9,p.z,this.reducedMotion?10:22,'break');}
        model.lastAnim=p.anim;
      }
      if(s.phase==='playcall'||s.phase==='presnap')for(const name of ['catchAge','throwAge','tackleAge','downAge','kickAge','diveAge'])model[name]=10;
      const amount=clamp(model.velocity/5,0,1),running=amount>.035;
      model.stride+=dt*model.velocity*2.7;
      const swing=Math.sin(model.stride),breath=this.reducedMotion?0:Math.sin(this.time*1.8+p.number)*.009;
      model.body.position.y=running?Math.abs(Math.cos(model.stride))*.035*amount:breath;
      model.body.rotation.set(0,0,0);model.torso.rotation.set(.04+amount*.13,-swing*.065*amount,swing*.027*amount);
      for(let i=0;i<2;i++){
        const cycle=model.stride+(i?PI:0),step=Math.sin(cycle),recovery=Math.max(0,step);
        model.legs[i].rotation.set(step*.72*amount,0,(i?-.02:.02)*amount);
        model.legs[i].userData.calf.rotation.x=.04+Math.pow(recovery,1.2)*1.2*amount;
        model.arms[i].rotation.set(-step*.62*amount-.07,0,i?-.045:.045);
        model.arms[i].userData.lower.rotation.set(-.25-amount*.85,0,0);
        const hand=model.arms[i].userData.hand;
        if(hand){hand.rotation.set(0,0,0);for(const finger of hand.userData.fingers||[])finger.rotation.x=-.18;hand.userData.thumb.rotation.x=0;}
      }
      const carrier=p.id===s.carrierId;
      if(carrier&&s.phase!=='aim'&&s.phase!=='playcall'&&s.phase!=='presnap'){
        model.arms[1].rotation.set(-.65,0,-.18);model.arms[1].userData.lower.rotation.x=-1.55;
        model.torso.rotation.y*=.65;
      }
      const linePlayer=/^(C|LG|RG|LT|RT|DE\d|DT\d)$/.test(p.role||'');
      if(s.phase==='presnap'||s.phase==='playcall'){
        if(linePlayer){model.torso.rotation.x=.38;model.body.position.y-=.1;for(let i=0;i<2;i++){model.legs[i].rotation.x=-.18;model.legs[i].userData.calf.rotation.x=.42;model.arms[i].rotation.x=-.32;model.arms[i].userData.lower.rotation.x=-.5;}}
        else{model.torso.rotation.x=.1;for(let i=0;i<2;i++){model.legs[i].userData.calf.rotation.x=.1;model.arms[i].userData.lower.rotation.x=-.42;}}
      }
      if((linePlayer||p.anim==='block')&&['aim','flight','run','defend'].includes(s.phase)&&p.anim!=='down'&&p.anim!=='tackle'){
        const drive=this.reducedMotion?0:Math.sin(this.time*6+p.number)*.045;
        model.torso.rotation.x=.2+amount*.06+drive;
        for(let i=0;i<2;i++){model.arms[i].rotation.x=-.94+drive*(i?1:-1);model.arms[i].userData.lower.rotation.x=-.58;if(!running){model.legs[i].rotation.x=i?.1:-.12;model.legs[i].userData.calf.rotation.x=.19;}}
      }
      if((s.phase==='aim'||s.phase==='presnap'&&s.nextPhase==='aim')&&p.role==='QB'){
        model.arms[1].rotation.set(-1.28,0,-.22);model.arms[1].userData.lower.rotation.x=-1.65;
        model.arms[0].rotation.set(-.72,0,.15);model.arms[0].userData.lower.rotation.x=-1.05;model.torso.rotation.y=-.15;
      }
      if(model.throwAge<.85){
        const release=smooth(model.throwAge/.3),follow=smooth((model.throwAge-.28)/.5);
        model.arms[1].rotation.set(mix(-1.65,-.3,follow),0,mix(-.25,-.06,follow));
        model.arms[1].userData.lower.rotation.x=mix(mix(-1.65,-.12,release),-.5,follow);
        model.arms[0].rotation.set(-.45+follow*.3,0,.18);model.torso.rotation.y=mix(-.22,.3,release)*(1-follow);
        model.torso.rotation.x=.08+Math.sin(release*PI)*.1;
      }
      const targetId=typeof s.selectedTarget==='number'?(s.targets||[])[s.selectedTarget]:s.selectedTarget;
      const airborne=s.phase==='flight'||s.phase==='defend'&&s.defenseStage==='flight';
      const receiverId=s.phase==='defend'?s.defenseTargetId:targetId;
      const anticipation=airborne&&receiverId===p.id&&s.ball?clamp(1-Math.hypot(s.ball.x-p.x,s.ball.z-p.z)/6,0,1):0;
      const catchReach=model.catchAge<.72?1-smooth((model.catchAge-.15)/.56):anticipation;
      if(catchReach>0){
        for(let i=0;i<2;i++){model.arms[i].rotation.x=mix(model.arms[i].rotation.x,-2.12,catchReach);model.arms[i].rotation.z=(i?-.14:.14)*catchReach;model.arms[i].userData.lower.rotation.x=mix(model.arms[i].userData.lower.rotation.x,-.26,catchReach);}
        model.torso.rotation.x-=catchReach*.07;if(model.catchAge<.4&&!this.reducedMotion)model.body.position.y+=Math.sin(model.catchAge/.4*PI)*.11;
      }
      if(model.kickAge<.95){
        const wind=smooth(model.kickAge/.18),strike=smooth((model.kickAge-.18)/.22),settle=smooth((model.kickAge-.4)/.5);
        model.legs[1].rotation.x=mix(mix(.58,-1.3,strike),0,settle)*wind;model.legs[1].userData.calf.rotation.x=mix(.65,.05,strike)*(1-settle);
        model.arms[0].rotation.z=.55*(1-settle);model.arms[1].rotation.z=-.55*(1-settle);model.torso.rotation.x=-.08*(1-settle);
      }
      if(p.anim==='tackle'){
        const wrap=smooth(model.tackleAge/.4);model.torso.rotation.x=mix(.15,.62,wrap);model.body.position.y=-.1*wrap;
        for(let i=0;i<2;i++){model.arms[i].rotation.set(-1.5,0,(i?-.45:.45)*(1-wrap*.55));model.arms[i].userData.lower.rotation.x=-.2-wrap*.8;model.legs[i].userData.calf.rotation.x=.32+wrap*.15;}
        if(s.tackle?.tacklerId===p.id){const finish=smooth((s.tackle.elapsed-.32)/.65);model.body.rotation.x=finish*1.18;model.body.position.y=.14*finish;model.torso.rotation.x*=1-finish*.72;}
      }
      if(p.anim==='down'){
        const fall=smooth(model.downAge/.6);model.body.rotation.set(fall*1.48,0,Math.sin(fall*PI)*.15);model.body.position.y=.12*fall;model.torso.rotation.set(.04,0,0);
        model.arms[0].rotation.x=-.8;model.arms[1].rotation.x=-.55;for(let i=0;i<2;i++){model.legs[i].rotation.x=(i?.12:-.2)*fall;model.legs[i].userData.calf.rotation.x=(i?.4:.12)*fall;}
      }
      if(p.anim==='dive'){
        // A missed diving tackle: flat out on the turf, then back up.
        const fall=smooth(model.diveAge/.28)*(1-smooth((model.diveAge-.72)/.35));
        model.body.rotation.set(fall*1.35,0,0);model.body.position.y=.18*fall;
        for(let i=0;i<2;i++){model.arms[i].rotation.set(mix(model.arms[i].rotation.x,-2.7,fall),0,(i?-.2:.2)*fall);model.arms[i].userData.lower.rotation.x=mix(model.arms[i].userData.lower.rotation.x,-.15,fall);model.legs[i].rotation.x=mix(model.legs[i].rotation.x,i?.35:.1,fall);}
      }
      if(p.anim==='knocked'){
        const fall=smooth(model.diveAge/.25)*(1-smooth((model.diveAge-.75)/.35));
        model.body.rotation.set(-fall*1.2,0,(this.reducedMotion?0:Math.sin(model.diveAge*9)*.12)*fall);model.body.position.y=.22*fall;
        for(let i=0;i<2;i++){model.arms[i].rotation.set(mix(model.arms[i].rotation.x,-2.3,fall),0,(i?-.5:.5)*fall);model.legs[i].rotation.x=mix(model.legs[i].rotation.x,i?-.5:-.2,fall);}
      }
      // The place-kick holder: down on one knee, holding the ball up on its point until the boot arrives.
      const holding=!!s.placeKick&&s.placeKick.holderId===p.id&&!s.placeKick.struck&&['playcall','presnap','kickaim','kickflight'].includes(s.phase);
      model.kneel=holding&&(teleported||this.reducedMotion)?1:mix(model.kneel||0,holding?1:0,1-Math.exp(-dt*(holding?9:3.2)));
      if(model.kneel>.002){
        const k=model.kneel,legs=model.legs,arms=model.arms;
        model.body.position.y=mix(model.body.position.y,-.46,k);model.body.rotation.set(0,0,0);
        model.torso.rotation.set(mix(model.torso.rotation.x,.3,k),mix(model.torso.rotation.y,.12,k),model.torso.rotation.z*(1-k));
        legs[0].rotation.set(mix(legs[0].rotation.x,-1.5,k),0,0);legs[0].userData.calf.rotation.x=mix(legs[0].userData.calf.rotation.x,1.5,k);
        legs[1].rotation.set(mix(legs[1].rotation.x,.08,k),0,0);legs[1].userData.calf.rotation.x=mix(legs[1].userData.calf.rotation.x,1.5,k);
        arms[1].rotation.set(mix(arms[1].rotation.x,-.55,k),0,-.12*k);arms[1].userData.lower.rotation.x=mix(arms[1].userData.lower.rotation.x,-.85,k);
      }
      if(p.stumble>0&&!this.reducedMotion){const wobble=Math.sin(this.time*26)*.16*Math.min(1,p.stumble/.5);model.torso.rotation.z+=wobble;model.body.rotation.x+=Math.abs(wobble)*.6;}
      const scored=s.phase==='result'&&s.result&&/touchdown/i.test(s.result.title||'')&&p.team===s.possession;
      const winner=s.phase==='final'&&(p.team==='home'?s.homeScore>s.awayScore:s.awayScore>s.homeScore);
      if((p.anim==='celebrate'||scored||winner)&&p.anim!=='down'){
        const cheer=this.reducedMotion?0:Math.sin(this.time*3+p.number)*.1;
        model.arms[0].rotation.set(-2.65+cheer,0,.25);model.arms[1].rotation.set(-2.45-cheer,0,-.25);
        model.arms[0].userData.lower.rotation.x=-.5;model.arms[1].userData.lower.rotation.x=-.75;model.torso.rotation.z=cheer*.35;
        model.body.position.y+=this.reducedMotion?0:Math.max(0,Math.sin(this.time*3+p.number))*.035;
      }
    }
    _solveGrip(model,index,target,ballCenter,longAxis,weight=1) {
      const arm=model.arms[index],lower=arm.userData.lower,hand=arm.userData.hand;
      if(!hand)return 0;
      const upperLength=arm.userData.upperLength||.34,lowerLength=arm.userData.lowerLength||.325;
      const shoulder=arm.position.clone(),direction=target.clone().sub(shoulder);
      const distance=clamp(direction.length(),.06,upperLength+lowerLength-.003);direction.normalize();
      const reachable=shoulder.clone().addScaledVector(direction,distance);
      const along=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance);
      const height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
      const hint=new T.Vector3(index===0?-.82:.82,1.12,-.08).sub(shoulder);
      hint.addScaledVector(direction,-hint.dot(direction));
      if(hint.lengthSq()<.00001)hint.set(index===0?-1:1,0,0);hint.normalize();
      const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(hint,height);
      const down=new T.Vector3(0,-1,0);
      const upperQ=new T.Quaternion().setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize());
      const lowerVector=reachable.clone().sub(elbow).applyQuaternion(upperQ.clone().invert()).normalize();
      const lowerQ=new T.Quaternion().setFromUnitVectors(down,lowerVector);
      arm.quaternion.slerp(upperQ,weight);lower.quaternion.slerp(lowerQ,weight);
      const palmZ=ballCenter.clone().sub(reachable).normalize();
      const palmY=longAxis.clone().multiplyScalar(index===0?1:-1);palmY.addScaledVector(palmZ,-palmY.dot(palmZ)).normalize();
      const palmX=new T.Vector3().crossVectors(palmY,palmZ).normalize();palmY.crossVectors(palmZ,palmX).normalize();
      const palmWorld=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(palmX,palmY,palmZ));
      const parentQ=arm.quaternion.clone().multiply(lower.quaternion).invert();
      hand.quaternion.slerp(parentQ.multiply(palmWorld),weight);
      for(const finger of hand.userData.fingers||[])finger.rotation.x=-.92*weight;
      if(hand.userData.thumb)hand.userData.thumb.rotation.x=-.5*weight;
      model.group.updateMatrixWorld(true);
      const actual=hand.getWorldPosition(new T.Vector3());
      const expected=arm.parent.localToWorld(reachable.clone());
      return actual.distanceTo(expected);
    }
    _poseFootball(model,p,s,mode,dt) {
      const center=new T.Vector3(),axis=new T.Vector3();
      const ready=mode==='ready'||mode==='handoff',throwing=mode==='throw';
      let both=ready;
      if(ready){center.set(0,mode==='handoff'?1.3:1.405,mode==='handoff'?.48:.355);axis.set(.9,.05,.43).normalize();}
      else if(throwing){
        const duration=.32,t=clamp(1-(s.throwWindupRemaining||0)/duration,0,1),smooth=t=>t*t*(3-2*t);
        const chest=new T.Vector3(0,1.405,.355),cocked=new T.Vector3(.365,1.84,.055),release=new T.Vector3(.30,1.75,.44);
        center.copy(t<.48?chest.lerp(cocked,smooth(t/.48)):cocked.lerp(release,smooth((t-.48)/.52)));
        axis.set(.9*(1-t),.15+.3*Math.sin(t*PI),.43+.57*t).normalize();both=t<.18;
      }else{
        center.set(.315,1.315,.33);axis.set(0,.88,.47).normalize();
        if(model.catchAge<.58){
          const t=clamp(model.catchAge/.58,0,1),blend=t*t*(3-2*t);
          if(!model.catchGripStart){
            model.catchGripStart=this._lastBallWorld?model.arms[0].parent.worldToLocal(this._lastBallWorld.clone()):new T.Vector3(0,1.58,.42);
            model.catchGripStart.x=clamp(model.catchGripStart.x,-.16,.28);model.catchGripStart.y=clamp(model.catchGripStart.y,1.3,1.7);model.catchGripStart.z=clamp(model.catchGripStart.z,.32,.48);
          }
          center.lerpVectors(model.catchGripStart,center,blend);axis.lerpVectors(new T.Vector3(.75,.12,.65).normalize(),axis,blend).normalize();both=true;
        }else model.catchGripStart=null;
      }
      if(s.handoff?.runnerId===p.id&&model.handoffGripStart){
        const t=clamp((s.handoff.elapsed-s.handoff.transferAt)/.3,0,1);
        const start=model.arms[0].parent.worldToLocal(model.handoffGripStart.clone());
        center.lerpVectors(start,center,t*t*(3-2*t));both=t<.8;
        if(t===1)model.handoffGripStart=null;
      }
      const ball=model.gripBall;ball.visible=true;ball.position.copy(center);
      ball.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);
      // Put the lace panel outside the chest, so the grip reads from the chase camera.
      ball.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),ready?-.4:.5));
      let error=0;
      if(both){
        const outward=new T.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
        for(let i=0;i<2;i++){const grip=center.clone().addScaledVector(axis,i===0?-.135:.135).addScaledVector(outward,.126);error=Math.max(error,this._solveGrip(model,i,grip,center,axis));}
      }else{
        const underside=new T.Vector3(0,-1,0).addScaledVector(axis,axis.y).normalize();
        const grip=center.clone().addScaledVector(axis,-.11).addScaledVector(underside,.134);
        error=this._solveGrip(model,1,grip,center,axis);
      }
      model.group.updateMatrixWorld(true);
      const position=ball.getWorldPosition(new T.Vector3()),rotation=ball.getWorldQuaternion(new T.Quaternion());
      this._presentedPosition=position.clone();
      this.ballPresentation={mode:'held',carrierId:p.id,longAxis:new T.Vector3(0,0,1).applyQuaternion(rotation).toArray(),forward:null,spinAngle:0,gripError:error,ballCenter:position.toArray(),twoHands:both};
      return position;
    }
    _presentFootball(s,dt,menu,lookup) {
      for(const model of [...this.playerModels.values(),...this.heroModels])model.gripBall.visible=false;
      const previous=this.ballPresentation;
      this.ball.visible=false;
      if(menu){const hero=this.heroModels[0];const position=this._poseFootball(hero,{id:'hero'},s,'carry',dt);this._lastBallWorld=position;return;}
      const windup=s.phase==='flight'&&s.throwWindupRemaining>0;
      const cpuWindup=s.phase==='defend'&&s.throwWindupRemaining>0;
      const passFlight=s.phase==='flight'||s.phase==='defend'&&s.defenseStage==='flight';
      const kickFlight=s.phase==='kickflight';
      const holderId=windup||cpuWindup?s.passerId:s.carrierId;
      const holder=lookup.get(holderId),model=this.playerModels.get(holderId);
      const k=s.placeKick,tee=!!k&&!k.struck&&['playcall','presnap','kickaim','kickflight'].includes(s.phase);
      const held=!!holder&&!!model&&!tee&&!kickFlight&&(!passFlight||windup||cpuWindup);
      if(held){
        const handoff=s.handoff&&s.handoff.elapsed<s.handoff.duration;
        if(handoff&&previous?.carrierId!==holderId&&holderId===s.handoff.runnerId&&this._lastBallWorld)model.handoffGripStart=this._lastBallWorld.clone();
        const mode=windup||cpuWindup?'throw':handoff&&holderId===s.handoff.quarterbackId?'handoff':holder.role==='QB'&&['playcall','presnap','aim','kickaim','defend'].includes(s.phase)?'ready':'carry';
        const position=this._poseFootball(model,holder,s,mode,dt);
        if(handoff&&s.handoff.elapsed>.6&&s.handoff.elapsed<s.handoff.transferAt+.3){
          const partnerId=holderId===s.handoff.runnerId?s.handoff.quarterbackId:s.handoff.runnerId;
          const partner=this.playerModels.get(partnerId);
          if(partner){const parent=partner.arms[0].parent,local=parent.worldToLocal(position.clone()),axis=new T.Vector3(.9,.05,.43).normalize();for(let i=0;i<2;i++)this._solveGrip(partner,i,local.clone().addScaledVector(axis,i? .12:-.12),local,axis);}
        }
        this._lastBallWorld=position;this._releaseAge=0;return;
      }
      const b=s.ball;if(!b||b.visible===false){this.ballPresentation={mode:'hidden',carrierId:null};return;}
      this.ball.visible=true;
      const position=new T.Vector3(b.x,b.y,b.z);
      if(tee){
        // Up on its point, leaning a touch back toward the kicker, a fingertip on top.
        const d=k.dir||(s.possession==='away'?-1:1),axis=new T.Vector3(0,1,-.12*d).normalize(),holderModel=this.playerModels.get(k.holderId);
        position.set(k.spot.x,k.tee?.36:.24,k.spot.z);this.ball.position.copy(position);this.ball.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);
        if(holderModel&&holderModel.kneel>.05){
          const arm=holderModel.arms[0],hand=arm.userData.hand;holderModel.group.updateMatrixWorld(true);
          const top=arm.parent.worldToLocal(position.clone().addScaledVector(axis,.245+.1)),centre=arm.parent.worldToLocal(position.clone());
          this._solveGrip(holderModel,0,top,centre,new T.Vector3(0,0,1),holderModel.kneel);
          if(hand){holderModel.group.updateMatrixWorld(true);hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(holderModel.group.getWorldQuaternion(new T.Quaternion())));for(const finger of hand.userData.fingers||[])finger.rotation.x=-.05;}
        }
        this._lastBallWorld=position.clone();this._presentedPosition=position.clone();
        this.ballPresentation={mode:'tee',carrierId:null,holderId:k.holderId,longAxis:axis.toArray(),forward:null,spinAngle:0,gripError:0,ballCenter:position.toArray()};
        return;
      }
      const forward=new T.Vector3(b.vx||0,b.vy||0,b.vz||0);
      if(passFlight&&!windup){
        if(previous?.mode==='held'&&this._lastBallWorld){this._releaseOffset=this._lastBallWorld.clone().sub(position);this._releaseAge=0;}
        if(this._releaseOffset&&this._releaseAge<.3){
          this._releaseAge+=dt;const weight=Math.max(0,1-this._releaseAge/.3);position.addScaledVector(this._releaseOffset,weight*weight);
          if(this._lastBallWorld&&dt>0)forward.copy(position).sub(this._lastBallWorld).divideScalar(dt);
        }
      }
      if(forward.lengthSq()<.000001&&this._lastBallWorld&&dt>0)forward.copy(position).sub(this._lastBallWorld);
      if(forward.lengthSq()<.000001)forward.set(0,.08,s.possession==='away'?-1:1);
      forward.normalize();this.ball.position.copy(position);
      if(passFlight||kickFlight){
        this._spiralAngle=(this._spiralAngle||0)+dt*(kickFlight?12:44);
        this.ball.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),forward);
        this.ball.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(kickFlight?1:0,0,kickFlight?0:1),this._spiralAngle));
      }else this.ball.rotation.set(.05,.2,.5);
      this._lastBallWorld=position.clone();this._presentedPosition=position.clone();
      this.ballPresentation={mode:passFlight||kickFlight?'flight':'loose',carrierId:null,longAxis:new T.Vector3(0,0,1).applyQuaternion(this.ball.quaternion).toArray(),forward:forward.toArray(),spinAngle:this._spiralAngle||0,gripError:0,ballCenter:position.toArray(),kick:kickFlight};
    }
    _camera(s,dt,options,lookup) {
      // Every view looks up the field from the player's own side, on offense and
      // on defense, so left and right never swap and your robots stay nearest you.
      const menu=options.menu,phase=s.phase,away=s.possession==='away',dir=1;
      const los=Number.isFinite(s.lineOfScrimmage)?s.lineOfScrimmage:(s.fieldPosition||25);
      const qb=(s.players||[]).find(p=>p.role==='QB'&&p.team===(s.possession||'home'));
      const controlled=lookup.get(s.controlledId),carrier=lookup.get(s.defenseTargetId||s.carrierId),ball=s.ball||{x:0,y:1,z:los};
      let fov=49;
      if(menu) {
        const sway=options.reducedMotion?0:Math.sin(this.time*.075)*.4;
        this.desiredCamera.set(1+sway,2.65,15);this.desiredLook.set(.1,.1,22);fov=46;
      } else if(phase==='tackle'||phase==='result') {
        const p=lookup.get(s.tackle?.carrierId)||lookup.get(s.carrierId)||{x:ball.x,z:ball.z};
        // High enough that the linemen around the pile do not block the tackle.
        this.desiredCamera.set(p.x+4.5,7.5,p.z-8);
        this.desiredLook.set(p.x,.5,p.z+.3);fov=49;
      } else if(phase==='playcall'||phase==='presnap'||phase==='final') {
        // Overhead, close in on the ball. The playbook covers the left of the screen, so the field slides right.
        // A kickoff frames the tee and the field it is kicked into.
        const z=clamp(los,2,99),focus=s.kickoff?z+(s.kickoff.team==='home'?10:-10):z+(away?-3:7),x=clamp(ball.x||0,-12,12)*.5,shift=options.menuOpen?11:0;
        if(phase==='presnap'){this.desiredCamera.set(x,30,focus-17);this.desiredLook.set(x,0,focus+2);}
        else{this.desiredCamera.set(x+shift,44,focus-24);this.desiredLook.set(x+shift,0,focus+2);}
        fov=51;
      } else if(s.placeKick&&(s.placeKick.dir||(away?-1:1))===1&&(phase==='kickaim'||phase==='kickflight'&&!s.placeKick.struck)) {
        // Behind the kicker: the holder, the ball on its point and the uprights all in one view.
        // On a kickoff the camera stands further back, behind the kicker's run-up, looking downfield.
        const spot=s.placeKick.spot,tee=!!s.placeKick.tee;
        this.desiredCamera.set(spot.x+(tee?1.6:.9),tee?6.6:4.6,spot.z-(tee?19:10));this.desiredLook.set(spot.x-.3,tee?1:1.6,spot.z+(tee?26:9));fov=52;
      } else if(phase==='aim'||phase==='kickaim') {
        const p=qb||controlled||{x:0,z:los-4};
        this.desiredCamera.set(p.x+dir*1.7,5.5,p.z-dir*9.5);this.desiredLook.set(p.x*.2,.9,p.z+dir*7.5);fov=52;
      } else if(phase==='kickflight'&&away) {
        // A visitors' kick comes toward your end: watch it arrive from your side of the field.
        this.desiredCamera.set(ball.x*.5+9,7+ball.y*.35,Math.max(-20,ball.z-17));this.desiredLook.set(ball.x,Math.max(1,ball.y*.7),ball.z+3);fov=54;
      } else if(phase==='flight'||phase==='kickflight') {
        this.desiredCamera.set(ball.x+dir*5,Math.max(5.7,ball.y+3.5),ball.z-dir*12);
        this.desiredLook.set(ball.x,Math.max(1.1,ball.y*.55),ball.z+dir*6);fov=54;
      } else if(phase==='defend') {
        // Behind your robot, looking at the ball; pull back as the two separate so both stay in view.
        const me=controlled||{x:0,z:los-9},target=carrier||me,gap=Math.min(22,Math.hypot(target.x-me.x,target.z-me.z));
        this.desiredCamera.set(mix(me.x,target.x,.35),5+gap*.26,Math.max(-18,Math.min(me.z,target.z)-9-gap*.3));
        this.desiredLook.set(mix(me.x,target.x,.65),1,mix(me.z,target.z,.65)+2);fov=55;
      } else {
        const p=controlled||carrier||qb||{x:0,z:los};
        const runDir=dir;
        this.desiredCamera.set(p.x+runDir*.45,4.45,p.z-runDir*8.6);this.desiredLook.set(p.x,1.15,p.z+runDir*8);fov=53;
      }
      const phaseChanged=this.lastPhase!==phase||this.lastMenu!==menu;
      // Reduced motion removes camera travel and idle sway while retaining the playable view.
      const speed=options.reducedMotion||!this.hasRendered?1:1-Math.exp(-dt*(phaseChanged?2.2:4));
      this.camera.position.lerp(this.desiredCamera,speed);this.look.lerp(this.desiredLook,speed);this.camera.fov=mix(this.camera.fov,fov,speed);this.camera.updateProjectionMatrix();this.camera.lookAt(this.look);
      this.lastPhase=phase;this.lastMenu=menu;this.hasRendered=true;
    }
    render(s,dt,options={}) {
      if(!s)return;this._applyTeams(options);this.reducedMotion=!!options.reducedMotion;dt=clamp(Number.isFinite(dt)?dt:.016,0,.08);this.time+=dt;this.frame++;
      const players=s.players||[],lookup=new Map(players.map(p=>[p.id,p])),menu=!!options.menu;
      this.heroGroup.visible=menu;this.heroLight.visible=menu;
      for(const [id,model] of this.playerModels)model.group.visible=!menu&&lookup.has(id);
      for(const p of players) {
        let model=this.playerModels.get(p.id);
        if(!model){model=this._athlete(p);this.playerModels.set(p.id,model);this.scene.add(model.group);}
        model.group.visible=!menu;this._updatePlayer(model,p,dt,s);
      }
      if(menu)for(let i=0;i<this.heroModels.length;i++){const model=this.heroModels[i];model.body.position.y=options.reducedMotion?0:Math.sin(this.time*1.7+i)*.012;model.arms[0].rotation.x=-.24;model.arms[1].rotation.x=-.68;model.arms[1].userData.lower.rotation.x=-1.12;}
      this.scrimmage.visible=this.scrimmageGlow.visible=!menu;this.firstDown.visible=this.firstDownGlow.visible=!menu&&s.conversion!=='kick'&&!s.kickoff&&!s.toss;
      const tee=!!(s.kickoff&&s.placeKick&&s.placeKick.tee);this.kickTee.visible=!menu&&tee;if(tee)this.kickTee.position.set(s.placeKick.spot.x,.07,s.placeKick.spot.z);
      this.scrimmage.position.z=this.scrimmageGlow.position.z=s.lineOfScrimmage||0;this.firstDown.position.z=this.firstDownGlow.position.z=clamp(s.firstDownLine||0,0,100);
      this._drawBoard(s,menu);
      // Visors power on when the stadium boots, then breathe gently in the menu.
      const boot=Math.min(1,this.time/1.4),flicker=boot<1&&Math.random()<.25?.25:1;
      for(const glow of [this.materials.homeGlow,this.materials.awayGlow])if(glow)glow.emissiveIntensity=(menu&&!this.reducedMotion?1.6+Math.sin(this.time*2.2)*.35:1.8)*boot*flicker;
      if(s.result!==this._seenResult){this._seenResult=s.result;if(!menu&&s.phase==='result'&&s.result&&/touchdown|conversion!|extra point good|field goal/i.test(s.result.title||''))this._celebrate(s);}
      const runner=(s.phase==='run'||s.phase==='defend')&&!s.controlGrace&&lookup.get(s.carrierId),runnerModel=runner&&this.playerModels.get(runner.id);
      if(runnerModel&&runnerModel.velocity>4&&dt>0&&(this._trailClock-=dt)<=0){const team=runner.team==='home'?this.homeTeam:this.awayTeam;this._trailClock=.035;this.burst(runner.x-Math.sin(runner.heading)*.35,.3,runner.z-Math.cos(runner.heading)*.35,1,'trail',new T.Color(team.accent||team.color).getHex());}
      this._stepEffects(dt);
      this._routes(s);if(menu)this.routeGroup.visible=false;
      const targetId=typeof s.selectedTarget==='number'?(s.targets||[])[s.selectedTarget]:s.selectedTarget;
      const target=lookup.get(targetId);
      const markedPlayer=s.phase==='defend'?lookup.get(s.defenseTargetId||s.carrierId):target;
      // The aim ring marks a receiver only once the scan has highlighted one.
      this.selection.visible=!menu&&((s.phase==='aim'&&!!target&&options.targetShown!==false)||(s.phase==='defend'&&!!markedPlayer));
      this.selectionMaterial.color.setHex(s.phase==='defend'?0xffbb73:0xd6ff5f);
      if(markedPlayer){this.selection.position.set(markedPlayer.x,.065,markedPlayer.z);const pulse=options.reducedMotion?1:1+Math.sin(this.time*3)*.035;this.selection.scale.setScalar(pulse);}
      const controlled=lookup.get(s.controlledId);
      this.controlRing.visible=!menu&&!!controlled;
      if(controlled)this.controlRing.position.set(controlled.x,.055,controlled.z);
      this._presentFootball(s,dt,menu,lookup);
      const b=this._presentedPosition||s.ball;
      const kickAim=s.phase==='kickaim';
      const lane=Number.isFinite(s.kickAim)?{x:clamp(s.kickAim,-1,1)*2.2}:((s.kickTargets||[])[s.kickAimIndex||0]||{x:0});
      const punt=s.playId==='punt';
      // A kickoff's line runs to the receivers' goal line.
      const aim=kickAim?(s.kickoff?{x:0,y:1,z:s.kickoff.team==='home'?100:0}:{x:lane.x*(punt?6:1),y:punt?.3:5.2,z:punt?Math.min(104,(s.lineOfScrimmage||25)+44):112}):target;
      this.kickMarker.visible=!menu&&kickAim;
      const onTarget=!menu&&kickAim&&options.kickGuide&&!punt&&!s.kickoff&&Math.abs(s.kickAim||0)<=(s.kickWindow??.4),pulse=this.reducedMotion?1:.8+Math.sin(this.time*6)*.2;
      this.goalMaterial.color.setHex(onTarget?0x9dffcf:0xffd23f);this.goalMaterial.emissive.setHex(onTarget?0x2dff9a:0xffb000);this.goalMaterial.emissiveIntensity=onTarget?1.5*pulse:.6;
      this.goalWindow.material.opacity=onTarget?.22*pulse:0;this.kickMarker.material.color.setHex(onTarget?0x9dffcf:0xffffff);
      if(kickAim)this.kickMarker.position.set(aim.x,aim.y,aim.z);
      const charge=!menu&&options.charge&&aim&&b?options.charge:null;
      this.chargeArc.visible=this.chargeEdge.visible=this.chargeTip.visible=!!charge;
      const y0=kickAim?(s.placeKick?b.y:.9):1.8;
      const arcTo=(end,t)=>{const dist=Math.hypot(end.x-b.x,end.z-b.z),rise=Math.min(kickAim?8:7,dist*(kickAim?.17:.16));return new T.Vector3(mix(b.x,end.x,t),Math.max(.1,mix(y0,end.y,t)+Math.sin(t*PI)*rise),mix(b.z,end.z,t));};
      if(charge){
        // Quick to the target, a slow crawl onto it, then (for a throw) on past him: an overthrow.
        const zone=options.chargeZone||[.88,1.12],max=options.chargeMax||1.35,power=charge.power,over=!kickAim&&power>zone[1];
        const color=power<zone[0]?0xffd23f:over?0xff5a67:0x62ffa3;
        const end={x:aim.x,y:kickAim?aim.y:1.35,z:aim.z};let reach;
        if(power<zone[0])reach=power/zone[0]*.94;
        else if(!over)reach=.94+Math.min(1,(power-zone[0])/(zone[1]-zone[0]))*.06;
        else{const along=Math.hypot(aim.x-b.x,aim.z-b.z)||1,extra=2+(power-zone[1])/(max-zone[1])*9;end.x+=(aim.x-b.x)/along*extra;end.z+=(aim.z-b.z)/along*extra;end.y=.5;reach=1;}
        const points=[];for(let i=0;i<=CHARGE_SEGMENTS;i++)points.push(arcTo(end,reach*i/CHARGE_SEGMENTS));
        const near=kickAim?.06:.05,far=kickAim?.2:.13;
        this._tube(this.chargeArc,points,near,far);this._tube(this.chargeEdge,points,near+.05,far+.08);this.chargeArc.material.color.setHex(color);
        const grow=power>=zone[0]&&!over&&!this.reducedMotion?1+Math.sin(this.time*8)*.15:1;
        this.chargeTip.position.copy(points[CHARGE_SEGMENTS]);this.chargeTip.scale.setScalar((kickAim?3:2)*grow);this.chargeTip.material.color.setHex(color);
      }
      this.trajectory.visible=!menu&&!charge&&(s.phase==='aim'||kickAim)&&!!aim&&!!b;
      if(this.trajectory.visible){const array=this.trajectory.geometry.attributes.position.array,end={x:aim.x,y:kickAim?aim.y:1.35,z:aim.z};for(let i=0;i<=40;i++){const p=arcTo(end,i/40);array[i*3]=p.x;array[i*3+1]=p.y;array[i*3+2]=p.z;}this.trajectory.geometry.attributes.position.needsUpdate=true;this.trajectory.geometry.computeBoundingSphere();this.trajectory.computeLineDistances();}
      this._camera(s,dt,options,lookup);this.renderer.render(this.scene,this.camera);
    }
    getSteerSign() {
      // The simulation steers in field X. Map screen-left/right through the
      // actual chase camera so controls stay consistent on both possessions.
      const q=this.camera.quaternion,rightX=1-2*(q.y*q.y+q.z*q.z);
      if(Math.abs(rightX)>.18)this._steerSign=rightX<0?-1:1;
      return this._steerSign||-1;
    }
    projectWorld(point) {
      this._project.set(point.x||0,Number.isFinite(point.y)?point.y:0,point.z||0).project(this.camera);
      return{x:(this._project.x*.5+.5)*this.width,y:(-.5*this._project.y+.5)*this.height,visible:this._project.z>-1&&this._project.z<1&&Math.abs(this._project.x)<1&&Math.abs(this._project.y)<1};
    }
    projectPoint(point) { return this.projectWorld(point); }
    projectPlayer(id) {
      const model=this.playerModels.get(id);if(!model||!model.group.visible)return{x:0,y:0,visible:false};
      this._project.set(model.group.position.x,2.5,model.group.position.z).project(this.camera);
      return{x:(this._project.x*.5+.5)*this.width,y:(-.5*this._project.y+.5)*this.height,visible:this._project.z>-1&&this._project.z<1&&Math.abs(this._project.x)<1&&Math.abs(this._project.y)<1};
    }
    resize() {
      this.width=Math.max(1,this.container.clientWidth||window.innerWidth);this.height=Math.max(1,this.container.clientHeight||window.innerHeight);
      this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
    }
    dispose() {
      this.scene.traverse(object=>{if(object.geometry)object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)if(material){if(material.map)material.map.dispose();material.dispose();}});
      this.renderer.dispose();this.renderer.domElement.remove();
    }
  }
  window.FootballRenderer=FootballRenderer;
})();
