import ICAL from './vendor/ical.mjs';
export function calendarWeek(text, now=new Date()) {
  const calendar=new ICAL.Component(ICAL.parse(text));
  for(const tz of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz.getFirstPropertyValue('tzid'),new ICAL.Timezone(tz));
  const start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+7);
  // A missing timezone definition must not silently turn a local appointment into UTC.
  for(const comp of calendar.getAllSubcomponents('vevent')) for(const property of comp.getAllProperties()) {
    const tzid=property.getParameter('tzid');
    if(tzid && !ICAL.TimezoneService.has(tzid)) throw Error('Calendar timezone definition is missing. Export a Google Calendar iCal feed with timezone information.');
  }
  const grouped=new Map();
  for(const comp of calendar.getAllSubcomponents('vevent')){const uid=comp.getFirstPropertyValue('uid');if(!grouped.has(uid))grouped.set(uid,[]);grouped.get(uid).push(comp);}
  const events={}, warnings=[];let totalCount=0, steps=0;
  function add(event, startTime, endTime){
    if(event.component.getFirstPropertyValue('status')==='CANCELLED')return;
    const date=startTime.toJSDate(), finish=endTime?.toJSDate()||date;
    if(date>=end||finish<start||(finish.getTime()===start.getTime()&&date<start))return;
    const day=date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
    (events[day]??=[]).push({summary:String(event.summary||'Untitled event').slice(0,500),allDay:startTime.isDate,time:startTime.isDate?'':date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),timestamp:date.getTime()});totalCount++;
  }
  for(const components of grouped.values()){
    const base=components.find(c=>!c.hasProperty('recurrence-id'));
    if(!base)continue;
    const event=new ICAL.Event(base);
    if(base.getFirstPropertyValue('status')==='CANCELLED')continue;
    for(const exception of components.filter(c=>c!==base))event.relateException(new ICAL.Event(exception));
    if(!event.isRecurring()){add(event,event.startDate,event.endDate);continue;}
    const iterator=event.iterator();let next;
    while((next=iterator.next())){
      if(++steps>50000)throw Error('This calendar has too many recurrences to expand safely. Use a smaller calendar.');
      if(next.toJSDate()>=end)break;
      const occurrence=event.getOccurrenceDetails(next);add(occurrence.item,occurrence.startDate,occurrence.endDate);
    }
    // Overrides can move a future recurrence into this week.
    for(const c of components.filter(c=>c!==base)){
      const exception=new ICAL.Event(c);const original=exception.recurrenceId;
      if(original?.toJSDate()>=end)add(exception,exception.startDate,exception.endDate);
    }
  }
  for(const list of Object.values(events))list.sort((a,b)=>a.timestamp-b.timestamp);
  return {ok:true,events,totalCount,warnings};
}
