/** Sanja leans from her hips while both bare feet remain planted. */
window.NSS=window.NSS||{};
NSS.OceanListen=(function(){
    'use strict';
    const clamp=n=>Math.max(0,Math.min(1,n));
    const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
    const amount=p=>ease((p-.12)/.50);
    function angleAt(y,lean){return -.28*lean*(1-ease((y-.59)/.20));}
    function point(x,y,w,h,lean){
        const hx=w*.55,hy=h*.70,a=angleAt(y/h,lean),dx=x-hx,dy=y-hy;
        return {x:hx+dx*Math.cos(a)-dy*Math.sin(a),y:hy+dx*Math.sin(a)+dy*Math.cos(a)};
    }
    let source,bent,lastKey,lastA,lastB;
    function draw(ctx,a,b,r,p){
        if(!a)return;
        const lean=amount(p),hand=ease((p-.05)/.20),pad=a.height*.20;
        const key=p+'|'+a.width+'|'+a.height;
        if(!source){source=document.createElement('canvas');bent=document.createElement('canvas');}
        if(key!==lastKey||a!==lastA||b!==lastB){
            if(source.width!==a.width||source.height!==a.height){source.width=a.width;source.height=a.height;}
            const w=a.width,h=a.height,width=Math.ceil(w+pad*2);
            if(bent.width!==width||bent.height!==h){bent.width=width;bent.height=h;}
            const s=source.getContext('2d');s.clearRect(0,0,w,h);
            s.globalAlpha=b?1-hand:1;s.drawImage(a,0,0);
            if(b&&hand){s.globalCompositeOperation='lighter';s.globalAlpha=hand;s.drawImage(b,0,0,w,h);}
            s.globalCompositeOperation='source-over';s.globalAlpha=1;
            // Preserve the original legs and foot contacts throughout.
            const fixed=Math.floor(h*.79);s.clearRect(0,fixed,w,h-fixed);s.drawImage(a,0,fixed,w,h-fixed,0,fixed,w,h-fixed);
            const c=bent.getContext('2d');c.clearRect(0,0,width,h);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
            const band=(y,sh,angle)=>{c.save();c.translate(pad+w*.55,h*.70);c.rotate(angle);
                c.drawImage(source,0,y,w,sh,-w*.55,y-h*.70,w,sh);c.restore();};
            band(fixed,h-fixed,0);
            const upper=Math.floor(h*.59),step=Math.max(2,h/400);
            for(let y=fixed;y>upper;y-=step){const from=Math.max(upper,y-step);band(from,Math.min(h-from,y-from+2),angleAt((from+y)/2/h,lean));}
            band(0,upper+1,angleAt(0,lean));
            bent.src=hand>=1&&b?b.src:a.src;lastKey=key;lastA=a;lastB=b;
        }
        const scale=r.h/a.height;
        ctx.drawImage(bent,r.x-pad*scale,r.y,bent.width*scale,r.h);
    }
    return {draw,point,amount};
})();
