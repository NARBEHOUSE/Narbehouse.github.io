// Static ballpark, painted once per renderer density and reused across games.
// Fine surface detail stays quiet so the ball, players and scan targets read clearly.
function bb2DrawBallpark(scene) {
    const density = Math.min(3, Math.max(2, scene._renderScale || window.__BASEBALL_RENDER_SCALE || 2));
    const key = 'ballpark-v2-' + density;
    if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, W * density, H * density);
        const c = texture.context;
        c.scale(density, density);
        const a = FIELD.WALL_ARC, home = FIELD.HOME;
        const start = a.startDeg * Math.PI / 180, end = a.endDeg * Math.PI / 180;
        const point = (angle, radius = a.r) => [a.cx + Math.cos(angle) * radius, a.cy + Math.sin(angle) * radius];
        const arc = (radius, width, color) => {
            c.beginPath();c.arc(a.cx,a.cy,radius,start,end);c.strokeStyle=color;c.lineWidth=width;c.stroke();
        };
        const line = (x1,y1,x2,y2,color,width=1) => {
            c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();
        };
        const ellipse = (x,y,rx,ry,color) => {
            c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();
        };
        let seed = 94;
        const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
        c.fillStyle='#10262c';c.fillRect(0,0,W,H);
        arc(a.r+31,66,'#203a43');
        for(let row=0;row<5;row++) {
            const radius=a.r+16+row*11;
            arc(radius,1,'#40555b');
            for(let angle=start+.006;angle<end;angle+=.012) {
                if(Math.floor((angle-start)/.10)%6===0)continue;
                const [x,y]=point(angle,radius);
                ellipse(x,y,2.3,1.5,random()>.7?'#799394':'#385963');
            }
        }
        for(let angle=start;angle<=end;angle+=.105) {
            const near=point(angle,a.r+9),far=point(angle,a.r+65);
            line(...near,...far,'#152d35',4);
        }
        const grass = new Path2D();
        grass.arc(a.cx,a.cy,a.r,start,end);
        const right=point(end),left=point(start);
        grass.lineTo(right[0],H+40);grass.lineTo(left[0],H+40);grass.closePath();
        c.save();c.clip(grass);
        const turf=c.createLinearGradient(0,60,0,H);
        turf.addColorStop(0,'#285e3c');turf.addColorStop(.6,'#337044');turf.addColorStop(1,'#3e7a48');
        c.fillStyle=turf;c.fillRect(0,0,W,H);
        // Long diagonal mowing passes, clipped to the field rather than wedge fans.
        c.save();c.translate(500,300);c.rotate(-.48);
        for(let x=-1000;x<1000;x+=62) {
            c.fillStyle='rgba(203,222,147,.045)';c.fillRect(x,-800,31,1600);
        }
        c.restore();
        for(let i=0;i<22000;i++) {
            const x=random()*W,y=random()*H;
            c.fillStyle=i%2?'rgba(215,230,171,.065)':'rgba(9,44,24,.085)';c.fillRect(x,y,.6,1.2);
        }
        // A curved dirt apron behind the bags, with a grass diamond inside it.
        const dirt = new Path2D();
        dirt.moveTo(home.x,home.y+34);
        dirt.lineTo(FIELD.THIRD.x-29,FIELD.THIRD.y+8);
        dirt.bezierCurveTo(287,321,335,235,500,231);
        dirt.bezierCurveTo(665,235,713,321,FIELD.FIRST.x+29,FIELD.FIRST.y+8);
        dirt.closePath();
        const clay=c.createLinearGradient(0,235,0,565);
        clay.addColorStop(0,'#ac7955');clay.addColorStop(.55,'#bd8d64');clay.addColorStop(1,'#a87752');
        c.fillStyle=clay;c.fill(dirt);
        c.save();c.clip(dirt);
        for(let i=0;i<6500;i++) {
            c.fillStyle=i%2?'rgba(74,46,26,.09)':'rgba(246,207,156,.12)';
            c.fillRect(280+random()*440,230+random()*360,random()*1.4+.4,.6);
        }
        for(let r=227;r<303;r+=5) {
            c.beginPath();c.ellipse(500,535,r,r*.99,0,Math.PI*1.16,Math.PI*1.84);
            c.lineWidth=.6;c.strokeStyle='rgba(246,207,162,.07)';c.stroke();
        }
        c.restore();
        const inner=new Path2D();
        inner.moveTo(500,487);inner.quadraticCurveTo(488,487,378,404);
        inner.quadraticCurveTo(371,398,381,390);inner.lineTo(491,307);
        inner.quadraticCurveTo(500,300,509,307);inner.lineTo(619,390);
        inner.quadraticCurveTo(629,398,622,404);inner.quadraticCurveTo(512,487,500,487);
        c.fillStyle='#397646';c.fill(inner);c.strokeStyle='rgba(38,67,33,.4)';c.lineWidth=2;c.stroke(inner);
        c.save();c.clip(inner);
        for(let y=304;y<490;y+=22) {c.fillStyle='rgba(193,215,146,.045)';c.fillRect(355,y,290,11);}
        c.restore();
        // Worn landing patch, rounded mound and plate-area clay.
        ellipse(home.x,home.y,43,35,clay);
        const mound=c.createRadialGradient(495,FIELD.MOUND.y-7,2,500,FIELD.MOUND.y,31);
        mound.addColorStop(0,'#d2a57a');mound.addColorStop(1,'#ad7d55');
        ellipse(501,FIELD.MOUND.y+2,30,21,'rgba(23,49,23,.24)');
        ellipse(500,FIELD.MOUND.y,29,20,mound);
        ellipse(500,FIELD.MOUND.y+9,6,8,'rgba(112,72,43,.24)');
        line(492,FIELD.MOUND.y-1,508,FIELD.MOUND.y-1,'#faf2dc',4);
        for(const x of [home.x-23,home.x+23])ellipse(x,home.y+2,8,17,'rgba(101,64,38,.16)');
        arc(a.r-13,22,'#a98562');arc(a.r-25,1,'#c5a175');
        arc(a.r-1,12,'#143f3b');arc(a.r+5,2,'#7eab9a');
        for(let angle=start;angle<=end;angle+=.037) {
            const p=point(angle,a.r-7),q=point(angle,a.r+4);line(...p,...q,'#28514a',1);
        }
        // Chalk belongs only on the foul lines, not between first/second/third.
        for(const base of [FIELD.THIRD,FIELD.FIRST]) {
            const dx=base.x-home.x,dy=base.y-home.y,ox=home.x-a.cx,oy=home.y-a.cy;
            const aa=dx*dx+dy*dy,bb=2*(ox*dx+oy*dy),cc=ox*ox+oy*oy-a.r*a.r;
            const t=(-bb+Math.sqrt(bb*bb-4*aa*cc))/(2*aa);
            const x=home.x+dx*t,y=home.y+dy*t;
            line(home.x,home.y,x,y,'rgba(250,246,219,.90)',2.4);
            line(x,y,x,y-32,'#dfbf56',2.5);
        }
        for(const base of [FIELD.FIRST,FIELD.SECOND,FIELD.THIRD]) {
            c.save();c.translate(base.x,base.y);c.rotate(Math.PI/4);
            c.fillStyle='rgba(45,37,24,.32)';c.fillRect(-7,-5,16,16);
            c.fillStyle='#f4edd8';c.fillRect(-7,-7,14,14);
            c.strokeStyle='#c3bba7';c.lineWidth=1;c.strokeRect(-7,-7,14,14);
            line(-5,-4,5,-4,'#ffffff',1);c.restore();
        }
        c.beginPath();c.moveTo(home.x-8,home.y-7);c.lineTo(home.x+8,home.y-7);
        c.lineTo(home.x+8,home.y+1);c.lineTo(home.x,home.y+8);c.lineTo(home.x-8,home.y+1);c.closePath();
        c.fillStyle='#faf5e4';c.fill();c.lineWidth=1;c.strokeStyle='#a8a18e';c.stroke();
        c.strokeStyle='rgba(250,246,219,.7)';c.lineWidth=1.5;
        c.strokeRect(home.x-31,home.y-12,16,28);c.strokeRect(home.x+15,home.y-12,16,28);
        for(const x of [home.x-155,home.x+155]) {
            c.beginPath();c.ellipse(x,home.y+28,16,12,0,0,Math.PI*2);c.stroke();
        }
        c.restore();
        texture.refresh();
    }
    scene.add.image(0,0,key).setOrigin(0).setDisplaySize(W,H).setDepth(-2);
}
