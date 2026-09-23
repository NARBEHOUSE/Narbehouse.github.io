const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.gs.bases={first:null,second:null,third:null};s.gs.outs=0;s.ball.setVisible(false);s.resetFieldCamera(0);
        s._routes={frames:[],closest:Infinity};
        s._sampleRoutes=()=>{
            const p=s.playerMotion().players();
            for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)s._routes.closest=Math.min(s._routes.closest,Math.hypot(p[i].x-p[j].x,p[i].y-p[j].y));
            s._routes.frames.push(Object.fromEntries(Object.entries(s.fielders).map(([key,p])=>[key,{x:p.x,y:p.y}])));
        };
        s.time.addEvent({delay:80,loop:true,callback:s._sampleRoutes});
        })();`);
    const results=[];
    for(const half of ['top','bottom']) {
        await evaluate(`(()=>{const s=reviewScene;s.gs.playerIsAway=true;s.gs.half=${JSON.stringify(half)};s._routes={frames:[],closest:Infinity};s.createTeams(true);})();`);
        await wait(2500);await capture('browser-entry-lanes-'+half+'.png');
        await until('!reviewScene._teamEntry',20000);
        const data=await evaluate('reviewScene._routes');
        assert(data.closest>=16.98,'Players overlap: '+data.closest);
        assert(data.frames.every(f=>f.C.y>=545),'Catcher cut in front of home plate');
        await evaluate(`(()=>{const s=reviewScene,g=s.add.graphics().setDepth(80),colors={P:0xffffff,C:0xffdd00,'1B':0xff7777,'2B':0xffaa00,SS:0xdd88ff,'3B':0x88ffff,LF:0x55ccff,CF:0xaaff55,RF:0xff88cc};
            for(const key of Object.keys(s.fielders)) {g.lineStyle(2,colors[key],.9);g.beginPath();
                s._routes.frames.forEach((f,i)=>{if(i===0)g.moveTo(f[key].x,f[key].y);else g.lineTo(f[key].x,f[key].y);});g.strokePath();}
            s._routeOverlay=g;})();`);
        await capture('browser-entry-paths-'+half+'.png');await evaluate('reviewScene._routeOverlay.destroy();void 0;');
        results.push({half,...data});
    }
    return results;
};
