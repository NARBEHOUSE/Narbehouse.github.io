/* Same-side crowd spacing. Combat contact between defenders and enemies stays native. */
(function (root) {
  'use strict';
  const radii = {small: 18, medium: 25, large: 32, extra_large: 45, boss: 82, defender: 16};
  const radius = bug => radii[bug.etype || 'defender'];
  function moveBy(bug, x, y) {
    bug.x += x;
    bug.y += y;
    if (Number.isFinite(bug.baseX)) bug.baseX += x; // Preserve the ant's new zigzag lane.
  }
  function constrain(bug, width) {
    const r = radius(bug);
    const x = Math.max(r, Math.min(width - r, bug.x));
    moveBy(bug, x - bug.x, 0);
  }
  function resolve(bugs, width) {
    const alive = bugs.filter(bug => !bug.isDead);
    for (const bug of alive) constrain(bug, width);
    // Broad phase sorts by x; most pairs are rejected without a distance test.
    for (let pass = 0; pass < 12; pass++) {
      const sorted = alive.slice().sort((a, b) => a.x - b.x);
      let overlap = false;
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i], ar = radius(a);
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j], br = radius(b), gap = ar + br + 3;
          if (b.x - a.x > ar + 85) break;
          if (Math.abs(a.y - b.y) >= gap) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= gap - 0.01) continue;
          overlap = true;
          // Give a following bug a lateral way past instead of pushing a queue forward.
          if (Math.abs(dx) < 0.001) dx = ((i + j) % 2 ? 1 : -1) * 0.001;
          const desiredX = Math.sqrt(Math.max(0, gap * gap - dy * dy));
          const shift = (desiredX - Math.abs(dx) + 0.02) * Math.sign(dx);
          const aw = a.stuckToGlue ? 0 : b.stuckToGlue ? 1 : 0.5;
          const bw = b.stuckToGlue ? 0 : a.stuckToGlue ? 1 : 0.5;
          moveBy(a, -shift * aw, 0);
          moveBy(b, shift * bw, 0);
          constrain(a, width); constrain(b, width);
          // At a screen edge or a packed row, the following bug waits behind.
          const remaining = Math.hypot(b.x - a.x, b.y - a.y);
          if (remaining < gap - 0.01) {
            const requiredY = Math.sqrt(Math.max(0, gap * gap - (b.x - a.x) ** 2));
            const behind = a.y < b.y ? a : b.y < a.y ? b : a;
            const ahead = behind === a ? b : a;
            if (!behind.stuckToGlue) moveBy(behind, 0, ahead.y - requiredY - behind.y - 0.02);
          }
        }
      }
      if (!overlap) break;
    }
    // Resolve any residual overlap in a dense pack by waiting behind it.
    // This also prevents narrow-screen edge constraints from leaving a stacked pair.
    const settled = alive.filter(bug => bug.stuckToGlue);
    for (const bug of alive.filter(bug => !bug.stuckToGlue).sort((a,b)=>b.y-a.y)) {
      for (let pass=0;pass<=settled.length;pass++) {
        let adjusted=false;
        for (const other of settled) {
          const gap=radius(bug)+radius(other)+3,dx=Math.abs(bug.x-other.x);
          if(dx>=gap||Math.hypot(dx,bug.y-other.y)>=gap-.01)continue;
          const requiredY=Math.sqrt(gap*gap-dx*dx);
          moveBy(bug,0,other.y-requiredY-.02-bug.y);
          adjusted=true;
        }
        if(!adjusted)break;
      }
      settled.push(bug);
    }
  }
  function placeSpawn(bug, others, y, width) {
    const r = radius(bug), desired = Math.max(r, Math.min(width-r, bug.x));
    const live = others.filter(other => !other.isDead);
    // Closest free spot on the entry row, then queue outside the field if it is full.
    const candidates = [desired, r, width-r];
    for (const other of live) {
      const gap = r + radius(other) + 4;
      if (Math.abs(y-other.y) < gap) {
        const dx = Math.sqrt(gap*gap - (y-other.y)**2);
        candidates.push(other.x-dx, other.x+dx);
      }
    }
    candidates.sort((a,b) => Math.abs(a-desired)-Math.abs(b-desired));
    for (const x of candidates) {
      if (x < r || x > width-r) continue;
      if (live.every(other => Math.hypot(x-other.x,y-other.y) >= r+radius(other)+3)) {
        moveBy(bug,x-bug.x,y-bug.y);
        return;
      }
    }
    let entryY = y;
    for (const other of live) {
      const gap = r+radius(other)+4, dx = Math.abs(desired-other.x);
      if (dx < gap) entryY = Math.min(entryY,other.y-Math.sqrt(gap*gap-dx*dx));
    }
    moveBy(bug,desired-bug.x,entryY-bug.y);
  }
  root.BugBlasterCrowd = {resolve, placeSpawn, radius};
})(typeof window === 'undefined' ? globalThis : window);
