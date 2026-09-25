/** Bounded, horizontal patrol routes shared by the game and Workshop. */
RT.characterPaths=(function(){
'use strict';
const key=c=>c.join(',');
function validate(raw,layers){if(raw==null)return[];if(!Array.isArray(raw)||raw.length>40)throw Error('Use at most 40 character patrols.');const used=new Set();return raw.map(r=>{if(!Array.isArray(r.cell)||r.cell.length!==3||r.cell.some(n=>!Number.isInteger(n)||n<0))throw Error('A patrol needs a valid character cell.');const [l,y,x]=r.cell,m=RT.data.MAT[layers[l]?.[y]?.[x]];if(!m||!(m.guard||m.crown)||used.has(key(r.cell)))throw Error('Each patrol must belong to a different guard or crowned rascal.');used.add(key(r.cell));if(!Array.isArray(r.points)||r.points.length<2||r.points.length>8||r.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>6)))throw Error('Use 2–8 patrol stops, within six blocks of the character.');if(r.points[0][0]!==0||r.points[0][1]!==0)throw Error('Start each patrol at its character.');return{cell:r.cell.slice(),points:r.points.map(p=>p.slice())};});}
function find(blocks,cell){return blocks.find(b=>b.layer===cell[0]&&b.row===cell[1]&&b.col===cell[2]);}
function clearAt(specs,who,x,z){const foot=who.y-who.h/2;
 for(const b of specs){if(b===who||RT.data.MAT[b.matId]?.guard||RT.data.MAT[b.matId]?.crown)continue;if(Math.abs(x-b.x)<(who.w+b.w)/2-.06&&Math.abs(z-b.z)<(who.d+b.d)/2-.06&&foot+who.h>b.y-b.h/2+.06&&foot<b.y+b.h/2-.06)return false;}
 if(foot<.08)return true;
 return [-.32,.32].every(dx=>[-.32,.32].every(dz=>specs.some(b=>b!==who&&Math.abs(b.y+b.h/2-foot)<.12&&x+dx>=b.x-b.w/2&&x+dx<=b.x+b.w/2&&z+dz>=b.z-b.d/2&&z+dz<=b.z+b.d/2)));
}
function supported(specs,who,points){let prev=[0,0];for(const p of points){const n=Math.max(1,Math.ceil(Math.hypot(p[0]-prev[0],p[1]-prev[1])*8));for(let i=0;i<=n;i++){const t=i/n;if(!clearAt(specs,who,who.x+prev[0]+(p[0]-prev[0])*t,who.z+prev[1]+(p[1]-prev[1])*t))return false;}prev=p;}return true;}
function defaults(level){const specs=RT.levels.parseLevel(level).blocks,out=[];for(const b of specs){if(!(RT.data.MAT[b.matId].guard||RT.data.MAT[b.matId].crown))continue;const candidates=[[[0,0],[1,0],[-1,0]],[[0,0],[-1,0]],[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[.3,0],[0,0],[-.3,0]]];const points=candidates.find(p=>supported(specs,b,p));if(points)out.push({cell:[b.layer,b.row,b.col],points});}return out;}
function check(level){const specs=RT.levels.parseLevel(level).blocks;for(const route of level.patrols||[]){const who=find(specs,route.cell);if(!who||!supported(specs,who,route.points))throw Error('Patrol at layer '+(route.cell[0]+1)+', row '+(route.cell[1]+1)+', column '+(route.cell[2]+1)+' crosses a wall or unsupported edge. Edit its route or keep that character static.');}return true;}
return{validate,find,supported,defaults,check};
})();
