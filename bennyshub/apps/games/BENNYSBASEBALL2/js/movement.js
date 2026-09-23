// Ground-plane movement shared by fielders, baserunners and dugout entrances.
// Sprite overlap in perspective is fine; players' ground footprints cannot cross.
class BaseballPlayerMotion {
    constructor(scene) {
        this.scene = scene;
        this.registered = new Set();
        this.moves = new Map();
    }

    register(p) { this.registered.add(p); return p; }
    players() {
        const s = this.scene;
        const all = new Set([...this.registered, ...Object.values(s.fielders || {}),
            ...Object.values(s.runnerDots || {}), s.batter, s.onDeckBatter]);
        return [...all].filter(p => p && p.active !== false && p.visible !== false && p.alpha !== 0);
    }
    radius(p) { return 8.5 * Math.min(1, p.scaleX || 1); }
    stop(p) {
        const move = this.moves.get(p);
        if (move) {
            if(move.pausedRun && p._spr) p._spr.anims.resume();
            move.active = false; this.moves.delete(p);
        }
    }
    move(p, x, y, duration, done, onUpdate, gait) {
        this.register(p);
        this.stop(p);
        const move = { p, goal: {x,y}, speed: Math.hypot(x-p.x,y-p.y) / Math.max(.08,duration/1000),
            active: true, progress: 0, path: [], replan: 0, waited: 0, distance: Math.hypot(x-p.x,y-p.y), done, onUpdate, gait,
            stop: () => this.stop(p), isPlaying() { return this.active; } };
        this.moves.set(p,move);
        return move;
    }

    static segmentDistance(a,b,p) {
        const dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
        return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    }
    obstacles(p, players) {
        return players.filter(q=>q!==p).map(q=>({x:q.x,y:q.y,r:this.radius(p)+this.radius(q)+.5}));
    }
    clear(a,b,obstacles) {
        return obstacles.every(o => {
            const start=Math.hypot(a.x-o.x,a.y-o.y);
            // A newly revealed/substituted player may already be touching.
            // Only allow movement out of that overlap, never farther through it.
            if(start < o.r-.01)
                return (b.x-a.x)*(a.x-o.x)+(b.y-a.y)*(a.y-o.y)>=0 && Math.hypot(b.x-o.x,b.y-o.y)>start;
            return BaseballPlayerMotion.segmentDistance(a,b,o)>=o.r-.01;
        });
    }

    route(start,goal,obstacles,depth=0) {
        if(depth>obstacles.length)return [];
        if(this.clear(start,goal,obstacles)) return [goal];
        const occupied=obstacles.find(o=>Math.hypot(goal.x-o.x,goal.y-o.y)<o.r);
        if(occupied) {
            const distance=Math.hypot(start.x-occupied.x,start.y-occupied.y);
            if(distance<=occupied.r+4)return [];
            const staging={x:occupied.x+(start.x-occupied.x)/distance*(occupied.r+3),
                y:occupied.y+(start.y-occupied.y)/distance*(occupied.r+3)};
            // Approach, then yield until the base/exit becomes free. In
            // particular two movers exchanging positions must be able to start.
            return this.route(start,staging,obstacles,depth+1);
        }
        // Visibility graph around footprint polygons. Inflate the polygon so
        // straight edges between its corners also clear the circular footprint.
        const nodes=[{x:start.x,y:start.y},goal];
        for(const o of obstacles) for(let i=0;i<8;i++) {
            const angle=i*Math.PI/4,r=(o.r+2)/Math.cos(Math.PI/8);
            const node={x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r};
            if(obstacles.every(other=>Math.hypot(node.x-other.x,node.y-other.y)>=other.r))nodes.push(node);
        }
        const cost=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set();cost[0]=0;
        for(let step=0;step<nodes.length;step++) {
            let u=-1;
            for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u<0||cost[i]<cost[u]))u=i;
            if(u<0||!Number.isFinite(cost[u]))break;
            if(u===1) {
                const path=[];for(let i=1;i!==0;i=prev[i])path.unshift(nodes[i]);return path;
            }
            visited.add(u);
            for(let v=1;v<nodes.length;v++) {
                if(visited.has(v))continue;
                const next=cost[u]+Math.hypot(nodes[v].x-nodes[u].x,nodes[v].y-nodes[u].y);
                if(next<cost[v]&&this.clear(nodes[u],nodes[v],obstacles)){cost[v]=next;prev[v]=u;}
            }
        }
        return [];
    }

    update(delta) {
        // Bound both elapsed time and travel per substep: a slow frame cannot
        // teleport someone through another player or finish an obstructed route.
        let remaining=Math.min(Math.max(0,delta),100)/1000;
        for(const p of this.registered)if(p.active===false){this.stop(p);this.registered.delete(p);}
        while(remaining>1e-6) {
            const dt=Math.min(remaining,1/120);remaining-=dt;
            const players=this.players();
            for(const m of [...this.moves.values()]) {
                const p=m.p;
                if(!m.active||p.active===false){this.stop(p);continue;}
                const obstacles=this.obstacles(p,players);
                m.replan-=dt;
                if(m.replan<=0) {
                    // Keep a clear route instead of switching detour sides
                    // every quarter second as nearby teammates move.
                    if(!m.path.length || !this.clear(p,m.path[0],obstacles))m.path=this.route(p,m.goal,obstacles);
                    m.replan=.25;
                }
                let budget=m.speed*dt, dx=0,dy=0;
                while(budget>1e-6 && m.path.length) {
                    const target=m.path[0],distance=Math.hypot(target.x-p.x,target.y-p.y);
                    if(distance<.001){m.path.shift();continue;}
                    const amount=Math.min(budget,distance,2);
                    const next={x:p.x+(target.x-p.x)/distance*amount,y:p.y+(target.y-p.y)/distance*amount};
                    if(!this.clear(p,next,obstacles)){m.replan=0;break;}
                    dx+=next.x-p.x;dy+=next.y-p.y;p.x=next.x;p.y=next.y;budget-=amount;
                    if(amount>=distance-.001)m.path.shift();
                }
                if(p._bb2) {
                    if(Math.hypot(dx,dy)>.001) {
                        m.waited=0;
                        if(m.pausedRun && p._spr){p._spr.anims.resume();m.pausedRun=false;}
                        p.faceFrom(dx,dy);
                        // Slides, tags and other authored actions retain ownership.
                        if(m.gait === 'walk' && p.walkAnim)p.walkAnim();
                        else if(p._anim && p._anim.startsWith('run_'))p.runAnim();
                    } else if(p._spr && p._anim && /^(run|walk)_/.test(p._anim)) {
                        m.waited+=dt;
                        if(m.waited>.12){p._spr.anims.pause();m.pausedRun=true;}
                    }
                    p.syncDepth();
                }
                if(m.onUpdate)m.onUpdate();
                m.progress=Math.max(m.progress,1-Math.hypot(m.goal.x-p.x,m.goal.y-p.y)/(m.distance||1));
                if(Math.hypot(m.goal.x-p.x,m.goal.y-p.y)<.01) {
                    this.stop(p);m.progress=1;if(m.done)m.done();
                }
            }
        }
    }
}
