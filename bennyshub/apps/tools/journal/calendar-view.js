(() => {
  const key=d=>[d.getFullYear(),d.getMonth()+1,d.getDate()].join('-');
  const label=d=>d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  function overview(dates,counts,period){
    const populated=dates.map(date=>counts.get(key(date))||0).filter(Boolean);
    const total=populated.reduce((sum,count)=>sum+count,0);
    return total ? total+(total===1?' entry':' entries')+' on '+populated.length+(populated.length===1?' day.':' days.') : 'No entries this '+period+'.';
  }
  let groups=[],row=-1,cell=-1,inRow=false,say=()=>{},onScanReset=()=>{};
  function shiftMonth(date,delta){
    const result=new Date(date),day=result.getDate();result.setDate(1);result.setMonth(result.getMonth()+delta);
    result.setDate(Math.min(day,new Date(result.getFullYear(),result.getMonth()+1,0).getDate()));return result;
  }
  function clear(){document.querySelectorAll('#changeViewModal .highlighted').forEach(el=>el.classList.remove('highlighted'));}
  function resetScan(){clear();row=-1;cell=-1;inRow=false;document.getElementById('calendarScanHint').textContent='Space: next row. Enter: choose row.';onScanReset();}
  function highlight(){
    clear();const group=groups[row];if(!group)return;
    const active=inRow?[group.buttons[cell]]:group.buttons;
    active.forEach(button=>button?.classList.add('highlighted'));
    active[0]?.scrollIntoView({block:'nearest',inline:'nearest'});
    if(!inRow)document.getElementById('calendarOverview').textContent=group.label;
    say(inRow?(active[0]?.getAttribute('aria-label')||active[0]?.textContent):group.label);
  }
  function scan(delta=1){
    if(!groups.length)return;
    if(inRow)cell=(cell+delta+groups[row].buttons.length)%groups[row].buttons.length;
    else row=row<0?(delta>0?0:groups.length-1):(row+delta+groups.length)%groups.length;
    highlight();
  }
  function select(){
    if(row<0)return;
    if(!inRow){inRow=true;cell=0;document.getElementById('calendarScanHint').textContent='Space: next choice. Enter: select. Hold Enter: return to rows.';highlight();}
    else groups[row]?.buttons[cell]?.click();
  }
  function render(selected,entries,onSelect,onSpeak=()=>{},onReset=()=>{}){
    const grid=document.getElementById('journalCalendarDays');if(!grid)return;
    say=onSpeak;onScanReset=onReset;
    const today=new Date();today.setHours(0,0,0,0);
    const counts=new Map();for(const entry of entries){const date=new Date(entry.date);if(Number.isFinite(date.getTime()))counts.set(key(date),(counts.get(key(date))||0)+1);}
    let month=new Date(selected.getFullYear(),selected.getMonth(),1);
    const previous=document.getElementById('calendarPreviousMonth'),next=document.getElementById('calendarNextMonth');
    function draw(opening=false){
      const monthName=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
      document.getElementById('journalCalendarMonth').textContent=monthName;
      next.disabled=month.getFullYear()===today.getFullYear()&&month.getMonth()===today.getMonth();
      const start=month.getDay(),days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
      const monthDates=Array.from({length:days},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1));
      const monthSummary=monthName+'. '+overview(monthDates,counts,'month');
      document.getElementById('calendarOverview').textContent=monthSummary;
      grid.replaceChildren();groups=[{label:monthSummary+' Month controls.',buttons:[previous,next].filter(b=>!b.disabled)}];
      let week,weekButtons=[],weekDates=[];
      for(let offset=0;offset<Math.ceil((start+days)/7)*7;offset++){
        if(offset%7===0){week=document.createElement('div');week.className='calendar-week';grid.append(week);weekButtons=[];weekDates=[];}
        const day=offset-start+1;
        if(day<1||day>days){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');week.append(blank);}
        else{
          const date=new Date(month.getFullYear(),month.getMonth(),day),dateKey=key(date),count=counts.get(dateKey)||0;
          weekDates.push(date);
          const button=document.createElement('button');button.type='button';button.className='calendar-day';button.dataset.date=dateKey;
          button.setAttribute('aria-label',label(date)+', '+count+(count===1?' entry':' entries'));
          button.setAttribute('aria-pressed',String(dateKey===key(selected)));if(dateKey===key(today))button.setAttribute('aria-current','date');
          button.disabled=date>today;button.textContent=day;
          if(count){const badge=document.createElement('span');badge.className='calendar-entry-count';badge.textContent=count;badge.setAttribute('aria-hidden','true');button.append(badge);}
          button.onclick=()=>{resetScan();onSelect(date);};week.append(button);if(!button.disabled)weekButtons.push(button);
        }
        if(offset%7===6&&weekButtons.length){
          const short=date=>date.toLocaleDateString('en-US',{month:'long',day:'numeric'});
          const summary='Week '+short(weekDates[0])+' through '+short(weekDates[weekDates.length-1])+'. '+overview(weekDates,counts,'week');
          week.setAttribute('role','group');week.setAttribute('aria-label',summary);
          groups.push({label:summary,buttons:weekButtons});
        }
      }
      const todayButton=document.getElementById('calendarToday');todayButton.onclick=()=>{resetScan();onSelect(today);};
      groups.push({label:'Today or back',buttons:[todayButton,document.querySelector('[data-action="close-view-modal"]')]});
      resetScan();
      say((opening?'Calendar view. ':'')+monthSummary);
    }
    previous.onclick=()=>{month=shiftMonth(month,-1);draw();};
    next.onclick=()=>{if(!next.disabled){month=shiftMonth(month,1);draw();}};
    draw(true);
  }
  window.BennyJournalCalendar={render,shiftMonth,scan,select,resetScan};
})();
