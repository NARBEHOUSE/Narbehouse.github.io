/** Explicit app bridge for stationary choice contexts. No DOM polling or key listeners;
 *  the Back-stop row outline follows scroll and resize only while it is shown. */
window.NarbeChoiceScanAdapter = (function () {
  'use strict';
  // A row entered with {backStop:true} loops through its items plus one stop that
  // says "Back"; choosing it returns to the same parent row. Apps see a null item
  // there, as at the root blank, while a dashed outline marks the whole row. It
  // lives here rather than in choice-scan.js so the Companion's synced copy of the
  // controller is unchanged.
  const BACK_STOP = Object.freeze({id:'narbe:row-back', label:'Back', element:null});
  // Dashed outline around a row's items: unlike the filled row highlight and the
  // dotted pause outline. Only the visible part of each item counts, so rows in
  // scrolled lists never spill over headers or neighbouring panels.
  function createRowOutline() {
    let box = null, targets = [], frame = 0;
    const PAD = 4;
    const clip = (r, c) => ({left:Math.max(r.left,c.left), top:Math.max(r.top,c.top), right:Math.min(r.right,c.right), bottom:Math.min(r.bottom,c.bottom)});
    function visibleRect(element) {
      const own = element.getBoundingClientRect();
      let rect = {left:own.left, top:own.top, right:own.right, bottom:own.bottom};
      for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/hidden|auto|scroll|clip/.test(style.overflowX + style.overflowY)) rect = clip(rect, parent.getBoundingClientRect());
      }
      rect = clip(rect, {left:0, top:0, right:innerWidth, bottom:innerHeight});
      return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
    }
    function place() {
      frame = 0;
      if (!box) return;
      const rects = targets.map(visibleRect).filter(Boolean);
      if (!rects.length) { box.hidden = true; return; }
      const all = rects.reduce((a, r) => ({left:Math.min(a.left,r.left), top:Math.min(a.top,r.top), right:Math.max(a.right,r.right), bottom:Math.max(a.bottom,r.bottom)}));
      Object.assign(box.style, {left:(all.left - PAD) + 'px', top:(all.top - PAD) + 'px',
        width:(all.right - all.left + PAD * 2) + 'px', height:(all.bottom - all.top + PAD * 2) + 'px'});
      box.hidden = false;
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(place); };
    function hide() {
      targets = [];
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!box) return;
      box.remove(); box = null;
      removeEventListener('scroll', queue, true); removeEventListener('resize', queue);
    }
    function show(elements) {
      targets = elements.filter(element => element?.nodeType === 1 && element.isConnected);
      if (!targets.length) { hide(); return; }
      if (!box) {
        box = document.createElement('div');
        box.className = 'narbe-row-back-outline';
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;' +
          'border:4px dashed #ffd54f;border-radius:12px;box-shadow:0 0 0 2px rgba(0,0,0,.75),inset 0 0 0 2px rgba(0,0,0,.75)';
        document.body.append(box);
        addEventListener('scroll', queue, true); addEventListener('resize', queue);
      }
      place();
    }
    return {show, hide};
  }
  function create(options) {
    const manager = options.manager || window.NarbeScanManager;
    let controller = null, contexts = [], stops = [], active = false, updating = false, inputHeld = false;
    let badge = null, badgeHost = null;
    const rowOutline = createRowOutline();
    const context = () => contexts[contexts.length - 1] || null;
    // An empty row gets no stop, so it is never entered and empties out like any other row.
    const withStop = items => stops[contexts.length - 1] && items.length ? [...items, BACK_STOP] : items;
    const atBackStop = () => controller?.getState().id === BACK_STOP.id;
    function statusHost(next) {
      const host = next?.statusHost || options.statusHost;
      if (!host && !options.badge) throw new Error('A choice context must supply its statusHost');
      if (host !== badgeHost || !badge) {
        badge?.destroy(); badgeHost = host;
        badge = options.badge || window.NarbeScanStatusBadge.create({host});
      }
      return host;
    }
    function paint(state) {
      if (updating) return;
      if (state.depth < contexts.length - 1) contexts.length = stops.length = state.depth + 1;
      const current = context(), item = current?.items[state.index] || null;
      if (current) statusHost(current);
      const value = active && !state.suspended ? (state.parked ? 'Parked' : state.braked ? 'Paused' : '') : '';
      badge?.update(value, {item:item?.element || null,label:item?.labelElement || item?.element || null,state});
      if (active && !state.suspended && state.id === BACK_STOP.id) rowOutline.show(current.items.map(entry => entry.element));
      else rowOutline.hide();
      const target = options.stateHost;
      if (target) {
        target.dataset.choiceActive = String(active);
        target.dataset.choiceContext = current?.key || '';
        target.dataset.choiceIndex = String(active ? state.index : -1);
        target.dataset.choiceSelected = active ? (state.parked ? 'parked' : state.id ?? 'park') : '';
        target.dataset.choiceState = !active || state.suspended ? 'suspended' : state.parked ? 'parked' : state.braked ? 'paused' : manager.getSettings().autoScan ? 'running' : 'step';
      }
      if (active) { options.onContext?.(current,state); options.onHighlight?.(item,state,current); }
    }
    function ensure(current) {
      if (controller) return;
      statusHost(current);
      controller = manager.createChoiceScan({
        choice:true,holdThreshold:options.holdThreshold,brakeKeyAvailable:options.brakeKeyAvailable,
        items:[],getId:item=>item.id,getLabel:item=>typeof item.label==='function'?item.label():item.label,
        getElement:item=>item.element,getLabelElement:item=>item.labelElement || item.element,
        speak:options.speak || (text=>window.NarbeVoiceManager?.speak(text)),
        badge:{update(){},destroy(){badge?.destroy();badge=null;badgeHost=null;}},
        onHighlight:(_item,state)=>paint(state),
        onSelect:(item,state)=>{if(item===BACK_STOP){controller.back({restore:true});return;}options.onSelect?.(item,state,context());}
      });
    }
    function sync(next, {fresh=false,restoreId=null}={}) {
      if (!next) {
        active=false;
        if (controller) controller.setSuspended(true);
        return false;
      }
      if (!next.key || !Array.isArray(next.items)) throw new Error('A choice context needs a stable key and items');
      const previous=context(),changed=!previous || previous.key!==next.key;
      updating=true;
      if (changed || fresh) {contexts=[next];stops=[false];} else contexts[contexts.length-1]=next;
      const wasActive=active;active=true;
      ensure(next);
      if (!wasActive) controller.setSuspended(false);
      if (changed || fresh) {
        controller.open(next.items,{restoreId});controller.setInputHeld(inputHeld);
      } else controller.setItems(withStop(next.items));
      updating=false;paint(controller.getState());
      return true;
    }
    function enterGroup(next, settings) {
      if (!active || !controller || controller.getState().index<0) return false;
      // A back-stop row always loops: only choosing its stop (or the app's own Back) leaves it.
      const backStop=settings?.backStop===true;
      updating=true;contexts.push(next);stops.push(backStop);
      const entered=controller.enterGroup(withStop(next.items),{...settings,wrap:backStop||settings?.wrap===true});
      if(!entered){contexts.pop();stops.pop();}updating=false;paint(controller.getState());return entered;
    }
    function back(settings) { return active && controller?.back(settings); }
    function align(id) {
      if (!active || !controller) return false;
      if (controller.getState().id===id) return true;
      const current=context();
      if (!current.items.some(item=>item.id===id)) return false;
      // Pointer selection is deliberate navigation; a redraw of its current
      // choice uses sync and retains the completed brake/park state.
      return sync(current,{fresh:true,restoreId:id});
    }
    const api={
      sync,enterGroup,back,align,
      get active(){return active;},
      get context(){return context();},
      getState(){return controller?{...controller.getState(),active,context:context()?.key,backStop:atBackStop()}:null;},
      step(direction){return active && controller?.step(direction);},
      select(){return active && controller?.select();},
      // Like the root blank, Space on the back stop is consumed without pausing:
      // there is no item there to carry the dotted pause outline.
      brakePress(){
        if(!active||!controller)return false;
        if(atBackStop()){const s=manager.getSettings();return !!(s.autoScan&&s.spaceBrake&&options.brakeKeyAvailable!==false);}
        return controller.brakePress();
      },
      brakeRelease(){return !!controller?.brakeRelease();},
      setInputHeld(value){inputHeld=!!value;if(active)controller?.setInputHeld(inputHeld);},
      announce(text, settings){return active?controller?.announceCurrent(text, settings):null;},
      cancelInput(){inputHeld=false;if(controller){controller.setSuspended(true);if(active)controller.setSuspended(false);}},
      dispose(){active=false;rowOutline.hide();controller?.dispose();controller=null;contexts=[];stops=[];}
    };
    return api;
  }
  return {create, createRowOutline};
})();
