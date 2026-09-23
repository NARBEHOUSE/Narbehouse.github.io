// Real Phaser camera regression, run with: node art/check_browser.js --camera
const assert = require('node:assert/strict');
module.exports = async function ({evaluate, until, wait, call, capture}) {
    const results = [];
    const centeredMessage = async label => {
        const screen = await evaluate(`(() => {
            const s=reviewScene,c=s.cameras.main,t=s.msgText,m=t.getWorldTransformMatrix();
            const p=c.matrix.transformPoint(m.tx,m.ty);
            return {visible:t.visible,text:t.text,x:p.x/c.width,y:p.y/c.height,
                size:s.messageOverlay.scaleX*c.zoom/s._renderScale};
        })()`);
        assert(screen.visible,label+': message visible');
        assert(Math.abs(screen.x-.5)<.001,label+': horizontally centered');
        assert(Math.abs(screen.y-.5)<.001,label+': vertically centered');
        assert(Math.abs(screen.size-1)<.001,label+': fixed screen size');
        results.push({label,...screen});
    };
    const fullField = async label => {
        await wait(50); // Let Phaser refresh worldView after a synchronous reset.
        const view = await evaluate(`(() => {
            const s=reviewScene,c=s.cameras.main;
            return {zoom:c.zoom/ s._renderScale,x:c.scrollX,y:c.scrollY,
                width:c.worldView.width,height:c.worldView.height,
                requested:s._viewRequest.zoom,hud:s.hudAll.every(o=>o.visible),
                meters:[s.meter,s.powerMeter].every(o=>o.x===0&&o.y===0&&o.scaleX===1&&o.scrollFactorX===0)};
        })()`);
        assert(Math.abs(view.zoom-1)<.001,label+': zoom');
        assert.equal(view.x,0,label+': scrollX');assert.equal(view.y,0,label+': scrollY');
        assert.equal(view.width,1000,label+': field width');assert.equal(view.height,600,label+': field height');
        assert.equal(view.requested,1,label+': resize target');assert(view.hud,label+': scoreboard');
        assert(view.meters,label+': meter layout');results.push({label,...view});
    };
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (() => {
            const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
            s.gs.playerIsAway=true;s.gs.half='top';s.gs.firstPitch=false;s.gs.outs=0;
            s.gs.bases={first:null,second:null,third:null};s.syncRunners();s.createTeams(false);
            s._ballBusy=0;s._returnPending=false;
            // Observe the real finishPlay; do not replace its camera/game-flow behavior.
            s.finishPlay=function(outcome){this._cameraResult=outcome;GameScene.prototype.finishPlay.call(this,outcome);};
            const p=s.batter.actionPoint('swing_normal','bat');s.ball.setPosition(p.x,p.y);
            s.playGrounderToFirst();
        })();`);
    await wait(550);
    assert(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale>1.2'),'Race must actually zoom in');
    await until('reviewScene.msgText.visible && /^(OUT|SAFE) AT FIRST$/.test(reviewScene.msgText.text)',20000);
    await wait(250);await centeredMessage('Live call at first base');
    await capture('browser-centered-result.png');
    await until('!!reviewScene._cameraResult',20000);
    await wait(500);
    await fullField('Grounder resolves');
    await until('!!reviewScene.menu',15000);
    await fullField('Next batter controls');
    await capture('browser-camera-after-out.png');

    // A fielding zoom must reset even though the batting flag is already false.
    await evaluate('reviewScene._zoomOnPoint(300,200,1.7,250)');await wait(350);
    assert.equal(await evaluate('reviewScene._battingCam'),false);
    await evaluate('reviewScene.setBattingCamera(false)');await wait(500);
    await fullField('Fielding close-up with batting flag off');

    // The next-play boundary must cancel a zoom that is still moving. Resizing
    // afterward must not resurrect its stored target, on either display density.
    await evaluate(`reviewScene.setMenu(null);reviewScene.setBattingCamera(true);void 0;`);
    await wait(100);
    await evaluate('reviewScene.nextPlay();void 0;');
    await fullField('Interrupted batting zoom');
    for (const [width,height,deviceScaleFactor] of [[1440,900,2],[800,600,1]]) {
        await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:false});
        await wait(450);await fullField('Resize '+width+' / DPR '+deviceScaleFactor);
    }
    await wait(350);await fullField('Old tween cannot resume');

    // Both labels stay anchored while zooming, panning and changing density.
    for (const label of ['SAFE!', 'OUT!']) {
        await evaluate(`reviewScene.setMenu(null);reviewScene.bigMessage(${JSON.stringify(label)},2200);
            reviewScene._zoomOnPoint(650,400,1.9,650);void 0;`);
        await wait(300);await centeredMessage(label+' during zoom');
        await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:2,mobile:false});
        await wait(300);await centeredMessage(label+' high density');
        await evaluate('reviewScene.resetFieldCamera()');await wait(450);
        await centeredMessage(label+' full field');
        await wait(1800);
        await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
        await wait(250);
    }

    // Use the real fly-out animation, finishPlay and inning change together.
    await evaluate(`(() => {
        const s=reviewScene;s.setMenu(null);s.gs.bases={first:null,second:null,third:null};
        s.clearContactRunners();s.syncRunners();s.createTeams(false);s.gs.outs=3;
        s._cameraResult=null;
        s.animatePlayerContact('Pop Fly Out',()=>s.finishPlay('Pop Fly Out'));
    })()`);
    await until('reviewScene.cameras.main.zoom/reviewScene._renderScale>1.5',15000);
    await until('reviewScene._cameraResult === "Pop Fly Out"',15000);
    await wait(500);await fullField('Third out resolves');
    await until('reviewScene.gs.half === "bottom"',5000);
    await fullField('Teams change sides');
    await until('!!reviewScene.menu',20000);
    await fullField('Next half-inning controls');
    await capture('browser-camera-next-inning.png');
    return results;
};
