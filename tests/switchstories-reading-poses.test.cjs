'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../bennyshub/apps/games/NARBESWITCHSTORIES/js');
const draws=[];
function canvas(){const c={width:0,height:0};c.getContext=()=>({clearRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},moveTo(){},lineTo(){},closePath(){},transform(){},
    drawImage(img,...args){draws.push({src:img.src,args,canvas:c});}});return c;}
const context={NSS:{Settings:{get:()=> 'off',cvi:()=>false}},window:{},document:{createElement:canvas}};
vm.runInNewContext(fs.readFileSync(path.join(base,'ocean-listen.js'),'utf8'),context);
const motion=context.NSS.OceanListen,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
for(const h of [160,480,1200]){
    const w=h*2/3,head={x:w*.5,y:h*.27};
    for(let i=0;i<=120;i++){
        const lean=motion.amount(i/120);
        for(const x of [w*.42,w*.65]){const foot=motion.point(x,h*.92,w,h,lean);near(foot.x,x);near(foot.y,h*.92);}
    }
    const end=motion.point(head.x,head.y,w,h,1);assert.ok(end.x<head.x-h*.10,'Sanja leans clearly toward the ocean');
}
vm.runInNewContext(fs.readFileSync(path.join(base,'final-actions.js'),'utf8'),context);
const tools={src:'tools',width:1536,height:1024},opened={src:'open-pages',width:1536,height:1024},cover={src:'closed-cover',width:1301,height:1209};
const page={action:'bookopen',spreadAction:{object:'tools',detailObject:'open',poses:['cover']},story:{objects:{tools,open:opened,cover}}};
const ctx=canvas().getContext('2d'),r={x:0,y:0,w:600,h:400};
context.NSS.FinalActions.simple(ctx,x=>x,page,tools,r,0);
assert.ok(draws.some(x=>x.src==='closed-cover'),'closed cover is visible before the action');
assert.ok(!draws.some(x=>x.src==='open-pages'),'no inside page is drawn while the book is closed');
draws.length=0;context.NSS.FinalActions.simple(ctx,x=>x,page,tools,r,.25);
assert.ok(draws.some(x=>x.src==='open-pages'),'inside page is revealed during opening');
assert.ok(draws.some(x=>x.src==='closed-cover'),'cover is still turning');
draws.length=0;context.NSS.FinalActions.simple(ctx,x=>x,page,tools,r,1);
assert.ok(draws.some(x=>x.src==='open-pages'),'open tactile book visible at the end');
assert.ok(!draws.some(x=>x.src==='closed-cover'),'closed cover no longer covers the open pages');
console.log('Passed: grounded feet during a visible listening lean, fully closed starting book, progressive interior reveal, and open ending.');
