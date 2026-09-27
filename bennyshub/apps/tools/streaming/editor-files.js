(() => {
  const reminder=document.getElementById('backup-reminder');let previousFocus,individualAdds=0;
  async function downloadBackup(){BennyData.download('streaming-library.json',{version:2,library:await WebStreaming.getData(),episodes:await WebStreaming.allEpisodes(),genres:WebStreaming.getGenres()});}
  window.remindStreamingBackup=()=>{individualAdds=0;previousFocus=document.activeElement;document.getElementById('backup-reminder-status').textContent='';document.getElementById('backup-reminder-later').textContent='Later';reminder.showModal();};
  window.noteStreamingAddition=()=>{if(++individualAdds>=5)remindStreamingBackup();};
  document.getElementById('backup-reminder-later').onclick=()=>reminder.close();
  reminder.addEventListener('close',()=>previousFocus?.focus());
  document.getElementById('backup-reminder-download').onclick=async()=>{
    try{await downloadBackup();document.getElementById('backup-reminder-status').textContent='Backup download started. Keep the JSON file in a safe place.';document.getElementById('backup-reminder-later').textContent='Done';}
    catch(error){document.getElementById('backup-reminder-status').textContent=error.message;}
  };
  async function readFile(input) {const file=input.files[0];if(!file)return null;if(file.size>10000000)throw Error('Choose a JSON file smaller than 10 MB.');return JSON.parse(await file.text());}
  document.getElementById('library-import').onchange=async e=>{
    try {
      const data=await readFile(e.target);if(!data)return;
      const items=WebStreaming.library(Array.isArray(data)?data:data.library);
      const eps=data.episodes?WebStreaming.episodes(data.episodes):null;
      if(!await showConfirm('Add new titles from this file? Existing entries and matching links will be kept. Nothing will be replaced.'))return;
      const result=await WebStreaming.addData(items);
      const epResult=eps?await WebStreaming.addEpisodes(eps):null;
      if(data.genres)WebStreaming.saveGenres({...data.genres,...WebStreaming.getGenres()});
      await fetchData();showToast('Added '+result.added+' titles; skipped '+result.skipped+' matching links.'+(epResult?' Added '+epResult.added+' episodes.':''));
      if(result.added>1||epResult?.added>1)remindStreamingBackup();
    }catch(error){showToast(error.message,'error');}finally{e.target.value='';}
  };
  document.getElementById('episodes-import').onchange=async e=>{
    try {const data=await readFile(e.target);if(!data)return;const eps=WebStreaming.episodes(data);if(await showConfirm('Add new episodes? Existing episode numbers and matching links will be kept.')){const result=await WebStreaming.addEpisodes(eps);showToast('Added '+result.added+' episodes; skipped '+result.skipped+' existing episodes or links.');}}
    catch(error){showToast(error.message,'error');}finally{e.target.value='';}
  };
  document.getElementById('library-export').onclick=async()=>{
    try{await downloadBackup();}
    catch(error){showToast(error.message,'error');}
  };
  document.getElementById('companion-options').onclick=()=>BennyExtension.request('OPEN_OPTIONS').catch(e=>showToast(e.message,'error'));
})();
