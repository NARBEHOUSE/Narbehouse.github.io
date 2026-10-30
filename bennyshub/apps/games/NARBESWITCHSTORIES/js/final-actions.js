/** The Bright Night: a curling wave, tactile books, and shared celebrations. */
window.NSS = window.NSS || {};
NSS.FinalActions = (function () {
    'use strict';
    const names=new Set(['wavecurl','bookopen','readtogether','proudjump','friendscheer']);
    const clamp=n=>Math.max(0,Math.min(1,n));
    const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
    const region=(r,b)=>({x:r.x+b[0]*r.w,y:r.y+b[1]*r.h,w:(b[2]-b[0])*r.w,h:(b[3]-b[1])*r.h});
    function fit(img,r){const k=Math.min(r.w/img.width,r.h/img.height);return {x:r.x+(r.w-img.width*k)/2,y:r.y+r.h-img.height*k,w:img.width*k,h:img.height*k};}
    let mixed;
    function blend(ctx,a,b,r,t){
        if(!a)return;
        if(!b||t<=0){ctx.drawImage(a,r.x,r.y,r.w,r.h);return;}
        if(t>=1){ctx.drawImage(b,r.x,r.y,r.w,r.h);return;}
        if(!mixed)mixed=document.createElement('canvas');
        if(mixed.width!==a.width||mixed.height!==a.height){mixed.width=a.width;mixed.height=a.height;}
        const c=mixed.getContext('2d');c.clearRect(0,0,mixed.width,mixed.height);
        // Add premultiplied colors so an unchanged silhouette stays opaque.
        c.globalAlpha=1-t;c.drawImage(a,0,0);c.globalCompositeOperation='lighter';c.globalAlpha=t;
        c.drawImage(b,0,0,a.width,a.height);c.globalCompositeOperation='source-over';c.globalAlpha=1;
        mixed.src=a.src;ctx.drawImage(mixed,r.x,r.y,r.w,r.h);
    }
    function wavePose(r,p){
        const rise=ease(p/.52),curl=ease((p-.34)/.45),height=.62+.38*rise;
        return {rect:{x:r.x,y:r.y+r.h*(1-height),w:r.w,h:r.h*height},curl};
    }
    function wave(ctx,a,b,r,p){const pose=wavePose(r,p);blend(ctx,a,b,pose.rect,pose.curl);}

    // Texture a hinged cover with two affine triangles. The actual painted
    // Braille pages remain visible beneath it; no lettering is synthesized.
    function triangle(ctx,img,s,d){
        const [s0,s1,s2]=s,[d0,d1,d2]=d;
        const sx1=s1[0]-s0[0],sy1=s1[1]-s0[1],sx2=s2[0]-s0[0],sy2=s2[1]-s0[1];
        const dx1=d1[0]-d0[0],dy1=d1[1]-d0[1],dx2=d2[0]-d0[0],dy2=d2[1]-d0[1],det=sx1*sy2-sx2*sy1;
        const a=(dx1*sy2-dx2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,b=(dy1*sy2-dy2*sy1)/det,dv=(dy2*sx1-dy1*sx2)/det;
        ctx.save();ctx.beginPath();ctx.moveTo(...d0);ctx.lineTo(...d1);ctx.lineTo(...d2);ctx.closePath();ctx.clip();
        ctx.transform(a,b,c,dv,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-dv*s0[1]);ctx.drawImage(img,0,0);ctx.restore();
    }
    function quad(ctx,img,d){
        const w=img.width,h=img.height;
        triangle(ctx,img,[[0,0],[w,0],[w,h]],[d[0],d[1],d[2]]);
        triangle(ctx,img,[[0,0],[w,h],[0,h]],[d[0],d[2],d[3]]);
    }
    function bookOpening(p){return ease((p-.08)/.72);}
    let bookCanvas,bookKey;
    function books(ctx,tools,opened,cover,r,p){
        if(!tools||!opened||!cover)return;
        const key=tools.src+'|'+opened.src+'|'+p+'|'+NSS.Settings.get('outline')+'|'+NSS.Settings.cvi();
        if(!bookCanvas){bookCanvas=document.createElement('canvas');bookCanvas.width=1536;bookCanvas.height=1024;}
        if(bookKey!==key){const c=bookCanvas.getContext('2d');c.clearRect(0,0,1536,1024);paintBooks(c,tools,opened,cover,{x:0,y:0,w:1536,h:1024},p);bookCanvas.src=tools.src;bookKey=key;}
        ctx.drawImage(bookCanvas,r.x,r.y,r.w,r.h);
    }
    function paintBooks(ctx,tools,opened,cover,r,p){
        if(!tools||!opened||!cover)return;
        // The headphones occupy the right column throughout the action.
        // The open book stays below the stack in the left column.
        ctx.drawImage(tools,r.x,r.y,r.w,r.h);
        const br={x:r.x+r.w*.02,y:r.y+r.h*.44,w:r.w*.56,h:r.h*.56};
        const u=bookOpening(p),hinge=br.x+br.w*.50;
        // Nothing inside the book is painted while it is shut. As the cover
        // lifts, only the right page is revealed beneath it. The left page
        // travels with the turning leaf instead of appearing open in advance.
        if(u>=.99){ctx.drawImage(opened,br.x,br.y,br.w,br.h);return;}
        if(u>0){ctx.save();ctx.beginPath();ctx.rect(hinge,br.y,br.w*.5,br.h);ctx.clip();
            ctx.drawImage(opened,br.x,br.y,br.w,br.h);ctx.restore();}
        const angle=u*Math.PI,topX=hinge+Math.cos(angle)*br.w*.405,bottomX=hinge+Math.cos(angle)*br.w*.465;
        const lift=Math.sin(angle)*br.h*.18;
        const corners=[[hinge,br.y+br.h*.20],[topX,br.y+br.h*.15-lift],
            [bottomX,br.y+br.h*.89-lift],[hinge,br.y+br.h*.91]];
        if(u>.90){ctx.save();ctx.globalAlpha=ease((u-.90)/.09);ctx.beginPath();ctx.rect(br.x,br.y,br.w*.5,br.h);ctx.clip();
            ctx.drawImage(opened,br.x,br.y,br.w,br.h);ctx.restore();}
        ctx.save();ctx.globalAlpha=1-ease((u-.90)/.09);
        if(u<.5)quad(ctx,cover,corners);
        else{
            // Back of the cover is the book's own illustrated left page.
            if(!leftPage||leftPage.src!==opened.src){leftPage=document.createElement('canvas');leftPage.width=opened.width/2;leftPage.height=opened.height;
                leftPage.getContext('2d').drawImage(opened,0,0,opened.width/2,opened.height,0,0,leftPage.width,leftPage.height);leftPage.src=opened.src;}
            quad(ctx,leftPage,[corners[1],corners[0],corners[3],corners[2]]);
        }
        ctx.restore();
    }
    let leftPage;
    function readingAmount(p){return ease((p-.08)/.48);}
    function jumpPose(r,p){
        const flight=clamp((p-.24)/.48),lift=4*flight*(1-flight)*r.h*.17;
        const crouch=p<.24?Math.sin(clamp(p/.24)*Math.PI)*.045:p>.72?Math.sin(clamp((p-.72)/.16)*Math.PI)*.035:0;
        return {lift,rect:{x:r.x,y:r.y+r.h*crouch-lift,w:r.w,h:r.h*(1-crouch)},
            cheer:ease((p-.15)/.10)*(1-ease((p-.78)/.12))};
    }
    function jump(ctx,a,b,r,p,simple){
        const pose=jumpPose(r,p);
        if(!simple){ctx.save();ctx.fillStyle='rgba(73,54,27,.18)';ctx.beginPath();
            ctx.ellipse(r.x+r.w*.5,r.y+r.h*.936,r.w*(.17-.05*pose.lift/(r.h*.17)),r.h*.012,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        blend(ctx,a,b,pose.rect,pose.cheer);
    }
    function cheer(ctx,a,b,r,p){
        const glow=ease(p/.18)*(1-ease((p-.84)/.16))*(.7+.3*Math.sin(p*Math.PI*2)**2);
        if(glow>0){const x=r.x+r.w*.5,y=r.y+r.h*.50,radius=Math.min(r.w*.51,r.h*.63);
            ctx.save();ctx.globalAlpha=glow*.64;const g=ctx.createRadialGradient(x,y,radius*.18,x,y,radius);
            g.addColorStop(0,'rgba(255,226,107,.50)');g.addColorStop(.64,'rgba(255,213,88,.42)');g.addColorStop(1,'transparent');
            ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.restore();}
        blend(ctx,a,b,r,ease((p-.10)/.17));
    }
    function simple(ctx,imageFor,page,img,r,p){
        const spec=page.spreadAction,pose=spec.poses[0]&&imageFor(page.story.objects[spec.poses[0]]);
        switch(page.action){
            case 'wavecurl':wave(ctx,img,pose,r,p);break;
            case 'bookopen':books(ctx,img,imageFor(page.story.objects[spec.detailObject]),pose,r,p);break;
            case 'readtogether':blend(ctx,img,pose,r,readingAmount(p));break;
            case 'proudjump':jump(ctx,img,pose,r,p,true);break;
            case 'friendscheer':cheer(ctx,img,pose,r,p);break;
        }
    }
    function book(ctx,imageFor,page,frame,p){
        const spec=page.spreadAction,img=imageFor(page.story.objects[spec.object]);
        if(!img)return;
        const r=fit(img,region(frame,spec.bounds)),pose=spec.poses[0]&&imageFor(page.story.objects[spec.poses[0]]);
        switch(page.action){
            case 'wavecurl':wave(ctx,img,pose,r,p);break;
            case 'bookopen':books(ctx,img,imageFor(page.story.objects[spec.detailObject]),pose,r,p);break;
            case 'readtogether':{
                const overlay=imageFor(spec.overlay),a=readingAmount(p);
                if(!overlay||!a)break;
                const b=spec.bounds,patch=region(frame,b);ctx.save();ctx.globalAlpha=a;
                ctx.drawImage(overlay,b[0]*overlay.width,b[1]*overlay.height,(b[2]-b[0])*overlay.width,(b[3]-b[1])*overlay.height,patch.x,patch.y,patch.w,patch.h);ctx.restore();break;
            }
            case 'proudjump':jump(ctx,img,pose,r,p,false);break;
            case 'friendscheer':cheer(ctx,img,pose,r,p);break;
        }
    }
    return {handles:name=>names.has(name),simple,book,wavePose,jumpPose,bookOpening};
})();
