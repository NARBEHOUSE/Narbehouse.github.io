/** The Bright Night: moving cane layers and quiet light/sand effects, pages 11–16. */
window.NSS = window.NSS || {};
NSS.SensoryActions = (function () {
    'use strict';
    const TAU = Math.PI * 2;
    const names = new Set(['canesweep', 'listen', 'canedip', 'sandsift', 'goldwater', 'planktonglow']);
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
    const envelope = p => ease(p / .14) * (1 - ease((p - .84) / .16));
    const point = (r, x, y) => ({ x: r.x + r.w * x, y: r.y + r.h * y });
    const region = (r, b) => ({ x: r.x + b[0] * r.w, y: r.y + b[1] * r.h, w: (b[2] - b[0]) * r.w, h: (b[3] - b[1]) * r.h });
    function fit(img, r) {
        const k = Math.min(r.w / img.width, r.h / img.height);
        return { x: r.x + (r.w - img.width * k) / 2, y: r.y + r.h - img.height * k, w: img.width * k, h: img.height * k };
    }

    // The forearm rotates about the elbow. Its transformed grip determines
    // the entire cane's handle, so the fingers and handle never separate.
    function sweepPose(r, p) {
        const swing = Math.sin(p * TAU * 2) * envelope(p), angle = swing * .17;
        const elbow = point(r,.12,.42), grip = point(r,.55,.426);
        const dx=grip.x-elbow.x,dy=grip.y-elbow.y;
        const hand={x:elbow.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:elbow.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
        const tip = {
            x: r.x + r.w * .67 + swing * r.h * .20,
            y: r.y + r.h * 1.005
        };
        const top={x:hand.x-(tip.x-hand.x)*.08/.92,y:hand.y-(tip.y-hand.y)*.08/.92};
        return { elbow, angle, hand, top, tip };
    }
    function dipPose(r, p) {
        const lift = Math.pow(Math.sin(p * TAU), 2) * r.h * .14;
        return { top: { x: r.x + r.w * .33, y: r.y + r.h * .23 - lift },
            tip: { x: r.x + r.w * .56, y: r.y + r.h * .80 - lift },
            surface: point(r, .56, .785), lift };
    }
    function cane(ctx, img, top, tip, shaftOnly) {
        if (!img) return;
        const from = shaftOnly ? .188 : 0, sh = img.height * (1 - from);
        const h = Math.hypot(tip.x - top.x, tip.y - top.y), w = h * img.width / sh;
        ctx.save(); ctx.translate(top.x, top.y); ctx.rotate(-Math.atan2(tip.x - top.x, tip.y - top.y));
        ctx.drawImage(img, 0, from * img.height, img.width, sh, -w / 2, 0, w, h); ctx.restore();
    }
    function sweepLayers(ctx,body,arm,stick,r,p) {
        const a=sweepPose(r,p);
        ctx.drawImage(body,r.x,r.y,r.w,r.h);
        cane(ctx,stick,a.top,a.tip,false);
        ctx.save();ctx.translate(a.elbow.x,a.elbow.y);ctx.rotate(a.angle);ctx.translate(-a.elbow.x,-a.elbow.y);
        ctx.drawImage(arm,r.x,r.y-r.h*.026,r.w,r.h);ctx.restore();
        // Follow the painted sleeve's inner seam and sloping cuff. A rectangular
        // torso patch here also covers the forearm, leaving a red square on it.
        ctx.save();ctx.beginPath();
        ctx.moveTo(r.x,r.y+r.h*.24);
        ctx.lineTo(r.x+r.w*.34,r.y+r.h*.24);
        ctx.bezierCurveTo(r.x+r.w*.29,r.y+r.h*.29,r.x+r.w*.25,r.y+r.h*.35,r.x+r.w*.208,r.y+r.h*.408);
        ctx.lineTo(r.x,r.y+r.h*.382);ctx.closePath();ctx.clip();
        ctx.drawImage(body,r.x,r.y,r.w,r.h);ctx.restore();
    }
    let sweepCanvas, sweepClean, sweepOutlined, sweepKey;
    function sweep(ctx, body, arm, stick, r, p, simple) {
        if (!body) return;
        r = fit(body, r);
        if(!arm||!stick)return;
        if (!simple) {
            ctx.save(); ctx.fillStyle = 'rgba(26,42,48,.20)'; ctx.beginPath();
            ctx.ellipse(r.x + r.w * .53, r.y + r.h * .979, r.w * .41, r.h * .018, 0, 0, TAU); ctx.fill(); ctx.restore();
        }
        if(!simple){sweepLayers(ctx,body,arm,stick,r,p);return;}
        const color=NSS.Settings.is('outline','off')?null:(NSS.Settings.option('outline').color||'#ffe630');
        // Assemble slightly above the actual display resolution. This keeps
        // the moving outline sharp without repainting millions of invisible
        // source pixels for a small phone image on every animation frame.
        const renderH=Math.min(body.height,Math.ceil(r.h*Math.min(window.devicePixelRatio||1,2)*1.25));
        const renderW=renderH*body.width/body.height;
        const key=body.src+'|'+p+'|'+color+'|'+renderH;
        const pad=renderH*.24,extra=renderH*.035;
        if(sweepKey!==key){
            if(!sweepCanvas){sweepCanvas=document.createElement('canvas');sweepClean=document.createElement('canvas');sweepOutlined=document.createElement('canvas');}
            const width=Math.ceil(renderW+pad*2),height=Math.ceil(renderH+extra*2);
            for(const c of [sweepCanvas,sweepClean,sweepOutlined]){if(c.width!==width||c.height!==height){c.width=width;c.height=height;}else c.getContext('2d').clearRect(0,0,width,height);}
            sweepLayers(sweepCanvas.getContext('2d'),body,arm,stick,{x:pad,y:extra,w:renderW,h:renderH},p);
            const clean=sweepClean.getContext('2d');clean.filter='url(#nss-cvi-silhouette)';clean.drawImage(sweepCanvas,0,0);
            const out=sweepOutlined.getContext('2d');
            if(color){for(let i=0;i<32;i++){const angle=i*TAU/32;out.drawImage(sweepClean,Math.cos(angle)*renderH*.008,Math.sin(angle)*renderH*.008);}
                out.globalCompositeOperation='source-in';out.fillStyle=color;out.fillRect(0,0,width,height);out.globalCompositeOperation='source-over';}
            out.drawImage(sweepClean,0,0);sweepOutlined.src=body.src;sweepKey=key;
        }
        const scale=r.h/renderH;
        ctx.drawImage(sweepOutlined,r.x-pad*scale,r.y-extra*scale,sweepOutlined.width*scale,sweepOutlined.height*scale);
    }

    function halo(ctx, x, y, radius, color, amount) {
        if (amount <= 0) return;
        ctx.save(); ctx.globalAlpha = amount;
        const g = ctx.createRadialGradient(x,y,0,x,y,radius);
        g.addColorStop(0,'rgba(255,255,230,.94)');
        g.addColorStop(.22,color); g.addColorStop(1,'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,radius,0,TAU); ctx.fill(); ctx.restore();
    }
    function sparkle(ctx, x, y, radius, amount) {
        halo(ctx,x,y,radius * 3,'rgba(146,250,255,.65)',amount);
        ctx.save(); ctx.globalAlpha = amount; ctx.fillStyle = '#f0ffff'; ctx.beginPath();
        ctx.moveTo(x,y-radius);ctx.quadraticCurveTo(x+radius*.15,y-radius*.15,x+radius,y);
        ctx.quadraticCurveTo(x+radius*.15,y+radius*.15,x,y+radius);
        ctx.quadraticCurveTo(x-radius*.15,y+radius*.15,x-radius,y);
        ctx.quadraticCurveTo(x-radius*.15,y-radius*.15,x,y-radius);ctx.fill();ctx.restore();
    }
    function earSparkles(ctx, r, p, simple) {
        const positions = simple ? [[.345,.43],[.575,.55],[.375,.65],[.565,.39]] : [[.22,.28],[.66,.41],[.38,.75],[.76,.73]];
        positions.forEach(([x,y],i) => {
            const glow = envelope(p) * (.35 + .65 * (.5 - .5 * Math.cos(p * TAU * 1.5 - i)));
            const at = point(r,x,y);
            sparkle(ctx,at.x,at.y,r.h * (simple ? .026 : .075), (simple ? .18 : 0) + glow * .82);
        });
    }
    function ripple(ctx, at, radius, progress, strength) {
        if (strength <= 0) return;
        ctx.save(); ctx.strokeStyle = '#d7fbff'; ctx.lineWidth = Math.max(1, radius * .018);
        for (let i=0;i<3;i++) {
            const t = (progress * 2.8 + i / 3) % 1;
            ctx.globalAlpha = strength * (1 - t) * .8;
            ctx.beginPath(); ctx.ellipse(at.x,at.y,radius*(.20+t*.80),radius*(.06+t*.20),-.08,0,TAU);ctx.stroke();
        }
        ctx.restore();
    }
    function dipGrip(r,p){
        const a=dipPose(r,p);
        return {x:a.top.x+(a.tip.x-a.top.x)*.08,y:a.top.y+(a.tip.y-a.top.y)*.08};
    }
    function dipLayers(ctx,stick,arm,r,p,armScale=.46){
        const a=dipPose(r,p),grip=dipGrip(r,p);
        cane(ctx,stick,a.top,a.tip,false);
        if(arm){const w=r.h*armScale,h=w*arm.height/arm.width;
            ctx.drawImage(arm,grip.x-w*.87,grip.y-h*.77,w,h);}
    }
    let dipCanvas,dipClean,dipOutlined,dipKey;
    function dip(ctx, stick, arm, r, p, simple) {
        const a = dipPose(r,p);
        let drawTool=()=>dipLayers(ctx,stick,arm,r,p,.46);
        if(simple&&stick&&arm){
            const color=NSS.Settings.is('outline','off')?null:(NSS.Settings.option('outline').color||'#ffe630');
            const h=Math.min(1400,Math.ceil(r.h*Math.min(window.devicePixelRatio||1,2)*1.25)),w=h*r.w/r.h,pad=w*.10,top=h*.24;
            const key=p+'|'+h+'|'+color;
            if(key!==dipKey){
                if(!dipCanvas){dipCanvas=document.createElement('canvas');dipClean=document.createElement('canvas');dipOutlined=document.createElement('canvas');}
                const width=Math.ceil(w+pad*2),height=Math.ceil(h+top);
                for(const c of [dipCanvas,dipClean,dipOutlined]){if(c.width!==width||c.height!==height){c.width=width;c.height=height;}else c.getContext('2d').clearRect(0,0,width,height);}
                dipLayers(dipCanvas.getContext('2d'),stick,arm,{x:pad,y:top,w,h},p);
                const clean=dipClean.getContext('2d');clean.filter='url(#nss-cvi-silhouette)';clean.drawImage(dipCanvas,0,0);
                const out=dipOutlined.getContext('2d');
                if(color){for(let i=0;i<32;i++){const angle=i*TAU/32;out.drawImage(dipClean,Math.cos(angle)*h*.006,Math.sin(angle)*h*.006);}
                    out.globalCompositeOperation='source-in';out.fillStyle=color;out.fillRect(0,0,width,height);out.globalCompositeOperation='source-over';}
                out.drawImage(dipClean,0,0);dipOutlined.src=arm.src;dipKey=key;
            }
            const scale=r.h/h;
            drawTool=()=>ctx.drawImage(dipOutlined,r.x-pad*scale,r.y-top*scale,dipOutlined.width*scale,dipOutlined.height*scale);
        }
        // Below the waterline the cane is partly translucent; the foreground
        // ripple is painted last so the tip reads as entering the water.
        ctx.save(); ctx.beginPath();ctx.rect(r.x-r.w,r.y-r.h,r.w*3,a.surface.y-(r.y-r.h));ctx.clip();
        drawTool();ctx.restore();
        ctx.save();ctx.globalAlpha=.38;ctx.beginPath();ctx.rect(r.x-r.w,a.surface.y,r.w*3,r.h);ctx.clip();
        drawTool();ctx.restore();
        const contact = 1-ease(a.lift/(r.h*.10));
        ripple(ctx,a.surface,r.w*.16,p,p>0&&p<1 ? .22+.78*contact : .18);
    }

    function sand(ctx, start, fall, p, simple) {
        if(p<=0||p>=1)return;
        const duration=.21, grains=90;
        ctx.save();
        for(let i=0;i<grains;i++) {
            const born=.08+i/grains*.63, age=(p-born)/duration;
            if(age<0||age>1)continue;
            // Each grain keeps its x coordinate: gravity carries it straight
            // down from a narrow gap between the fingertips.
            const x=start.x+Math.sin(i*2.399)*fall*.009, y=start.y+fall*age*age;
            const size=Math.max(simple?1.4:1.0,fall*(.007+(i%3)*.0015));
            ctx.globalAlpha=Math.min(1,age/.05)*Math.min(1,(1-age)/.12);
            ctx.fillStyle=['#f8dea0','#e7bc69','#fff1c5'][i%3];
            if(!simple){ctx.strokeStyle='rgba(133,91,38,.45)';ctx.lineWidth=.6;ctx.strokeRect(x,y,size,size*1.2);}
            ctx.fillRect(x,y,size,size*1.2);
        }
        ctx.restore();
    }

    // Warp each one-pixel row by a continuous, small displacement. Unlike
    // broad sliding strips, neighboring rows never expose visible block seams.
    function waterOffset(y, h, p) { return Math.sin(y/h*TAU*1.7-p*TAU*1.2) * h * .012 * envelope(p); }
    function water(ctx,img,r,p) {
        if(p<=0||p>=1){ctx.drawImage(img,r.x,r.y,r.w,r.h);return;}
        const rows=Math.max(1,Math.ceil(r.h));
        for(let j=0;j<rows;j++){
            const sy=j/rows*img.height, sh=Math.min(img.height-sy,img.height/rows+.5);
            ctx.drawImage(img,0,sy,img.width,sh,r.x+waterOffset(j/rows*r.h,r.h,p),r.y+j/rows*r.h,r.w,sh/img.height*r.h);
        }
    }
    const goldSimple = [[.236,.289],[.772,.315],[.567,.465],[.251,.600],[.762,.653]];
    const planktonSimple = [[.29,.37,0],[.40,.42,1],[.60,.46,0],[.85,.41,1],[.58,.73,0],[.80,.71,1]];
    const goldBook = [[.283,.883],[.365,.835],[.434,.94],[.531,.95],[.677,.92],[.141,.805],[.821,.73]];
    const goldStars = [[.219,.043],[.305,.087],[.351,.260],[.407,.227],[.534,.107],
        [.653,.15],[.688,.061],[.812,.122],[.854,.043],[.885,.181]];
    const planktonBook = [[.186,.887,1],[.275,.918,0],[.299,.861,1],[.365,.882,0],[.475,.929,0],
        [.512,.917,1],[.579,.877,1],[.672,.851,1],[.777,.901,0],[.953,.876,1],[.823,.589,0]];
    function oceanLights(ctx,r,points,p,greenBlue,simple,mapX) {
        const a=envelope(p);
        if(a<=0)return;
        points.forEach(([x,y,color],i)=>{
            const at=point(r,x,y),pulse=.5-.5*Math.cos(p*TAU*1.4-i*.85);
            const glow=a*(!greenBlue&&!simple ? .62+.38*pulse : .35+.65*pulse);
            if(mapX)at.x=mapX(x);
            if(simple&&!greenBlue)at.x+=waterOffset(y*r.h,r.h,p);
            const radius=r.h*(simple?.115:.035)*(greenBlue ? .45+1.25*glow : simple ? 1 : 1.85);
            halo(ctx,at.x,at.y,radius,greenBlue?(color?'rgba(191,255,54,.80)':'rgba(52,243,255,.80)'):'rgba(255,232,75,.82)',glow);
        });
    }
    function skyLights(ctx,r,p,mapX) {
        if(p<=0||p>=1)return;
        goldStars.forEach(([x,y],i)=>{
            const glow=envelope(p)*(.60+.40*(.5-.5*Math.cos(p*TAU*1.4-i*.7)));
            sparkle(ctx,mapX(x),r.y+y*r.h,r.h*.019,glow);
        });
    }

    function simple(ctx,imageFor,page,img,r,p) {
        const spec=page.spreadAction, stick=spec.detailObject&&imageFor(page.story.objects[spec.detailObject]);
        switch(page.action){
            case 'canesweep': sweep(ctx,imageFor({...page.story.objects[spec.object],background:true}),
                imageFor({...page.story.objects[spec.poses[0]],background:true}),imageFor({...page.story.objects[spec.detailObject],background:true}),r,p,true);break;
            case 'listen': ctx.drawImage(img,r.x,r.y,r.w,r.h);earSparkles(ctx,r,p,true);break;
            case 'canedip': ctx.drawImage(img,r.x,r.y,r.w,r.h);
                dip(ctx,imageFor({...page.story.objects[spec.detailObject],background:true}),
                    imageFor({...page.story.objects[spec.poses[0]],background:true}),r,p,true);break;
            case 'sandsift':
                ctx.drawImage(img,r.x,r.y,r.w,r.h);
                sand(ctx,point(r,.10,.50),r.h*.47,p,true);break;
            case 'goldwater': water(ctx,img,r,p);oceanLights(ctx,r,goldSimple,p,false,true);break;
            case 'planktonglow': ctx.drawImage(img,r.x,r.y,r.w,r.h);oceanLights(ctx,r,planktonSimple,p,true,true);break;
        }
    }
    function book(ctx,imageFor,page,frame,p,width){
        const spec=page.spreadAction,r=region(frame,spec.bounds);
        const img=imageFor(page.story.objects[spec.object]),stick=spec.detailObject&&imageFor(page.story.objects[spec.detailObject]);
        // The panorama's outer scenery stretches on wide displays. Its painted
        // lights must use that same mapping instead of drifting off the dots.
        const core=page.spreadCore,left=Math.min(0,frame.x),right=Math.max(width,frame.x+frame.w);
        const mapX=x=>!core?frame.x+x*frame.w:x<core[0]?left+x/core[0]*(frame.x+core[0]*frame.w-left)
            :x>core[1]?frame.x+core[1]*frame.w+(x-core[1])/(1-core[1])*(right-frame.x-core[1]*frame.w):frame.x+x*frame.w;
        switch(page.action){
            case 'canesweep':sweep(ctx,img,imageFor(page.story.objects[spec.poses[0]]),stick,r,p,false);break;
            case 'listen':earSparkles(ctx,r,p,false);break;
            case 'canedip': {
                // Same motion as the focused view, mapped to the original cane's
                // diagonal route. Only the cane and its contact rings move.
                // A naturally sized forearm enters from the screen edge.
                // Its origin is independent of the background's safe-area margin.
                const dr={x:frame.x+frame.w*.24,y:-frame.h*.06,w:frame.w*.365,h:frame.h};
                dip(ctx,stick,imageFor(page.story.objects[spec.poses[0]]),dr,p,false);break;
            }
            case 'sandsift':sand(ctx,{x:r.x,y:r.y},r.h,p,false);break;
            case 'goldwater':skyLights(ctx,frame,p,mapX);oceanLights(ctx,frame,goldBook,p,false,false,mapX);break;
            case 'planktonglow':oceanLights(ctx,frame,planktonBook,p,true,false,mapX);break;
        }
    }
    return { handles: name=>names.has(name), simple, book, sweepPose, dipPose, dipGrip };
})();
