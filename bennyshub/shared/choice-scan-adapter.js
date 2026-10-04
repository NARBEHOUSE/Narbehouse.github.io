/** Explicit app bridge for stationary choice contexts. No DOM polling or key listeners. */
window.NarbeChoiceScanAdapter = (function () {
  'use strict';
  function create(options) {
    const manager = options.manager || window.NarbeScanManager;
    let controller = null, contexts = [], active = false, updating = false, inputHeld = false;
    let badge = null, badgeHost = null;
    const context = () => contexts[contexts.length - 1] || null;
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
      if (state.depth < contexts.length - 1) contexts.length = state.depth + 1;
      const current = context(), item = current?.items[state.index] || null;
      if (current) statusHost(current);
      const value = active && !state.suspended ? (state.parked ? 'Parked' : state.braked ? 'Paused' : '') : '';
      badge?.update(value, {item:item?.element || null,label:item?.labelElement || item?.element || null,state});
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
        onSelect:(item,state)=>{options.onSelect?.(item,state,context());}
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
      if (changed || fresh) contexts=[next]; else contexts[contexts.length-1]=next;
      const wasActive=active;active=true;
      ensure(next);
      if (!wasActive) controller.setSuspended(false);
      if (changed || fresh) {
        controller.open(next.items,{restoreId});controller.setInputHeld(inputHeld);
      } else controller.setItems(next.items);
      updating=false;paint(controller.getState());
      return true;
    }
    function enterGroup(next, settings) {
      if (!active || !controller || controller.getState().index<0) return false;
      updating=true;contexts.push(next);const entered=controller.enterGroup(next.items,settings);if(!entered)contexts.pop();updating=false;paint(controller.getState());return entered;
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
      getState(){return controller?{...controller.getState(),active,context:context()?.key}:null;},
      step(direction){return active && controller?.step(direction);},
      select(){return active && controller?.select();},
      brakePress(){return active && controller?.brakePress();},
      brakeRelease(){return !!controller?.brakeRelease();},
      setInputHeld(value){inputHeld=!!value;if(active)controller?.setInputHeld(inputHeld);},
      announce(text, settings){return active?controller?.announceCurrent(text, settings):null;},
      cancelInput(){inputHeld=false;if(controller){controller.setSuspended(true);if(active)controller.setSuspended(false);}},
      dispose(){active=false;controller?.dispose();controller=null;contexts=[];}
    };
    return api;
  }
  return {create};
})();
