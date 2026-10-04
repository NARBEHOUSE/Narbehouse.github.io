function status(checking = false) {
  const connected = BennyExtension.state.connected;
  const label = document.getElementById('status');
  label.textContent = checking ? 'Checking…' : connected ? 'Connected' : 'Not connected';
  label.dataset.connection = checking ? 'checking' : connected ? 'connected' : 'disconnected';
}
async function checkConnection() {
  const button = document.getElementById('check');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Checking…';
  status(true);
  try { await BennyExtension.check(); }
  finally { status(); button.disabled = false; button.textContent = 'Check again'; }
}
addEventListener('benny-extension-change', () => status());
document.getElementById('check').onclick = checkConnection;
document.getElementById('settings').onclick = async () => {
  const button = document.getElementById('settings');
  const error = document.getElementById('setup-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Opening settings…';
  try { await BennyExtension.request('OPEN_OPTIONS', {}, 4000); }
  catch(e) { error.textContent = e.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Open Companion settings'; }
};
document.getElementById('back').onclick = async () => {
  if (parent !== window) { parent.postMessage({action: 'focusBackButton'}, location.origin); return; }
  const button=document.getElementById('back'),error=document.getElementById('setup-error');
  if(button.disabled)return;button.disabled=true;error.hidden=true;
  try{
    await BennyExtension.check();
    if(!BennyExtension.state.connected){location.href='index.html';return;}
    if(!BennyExtension.supports('settings-return'))throw Error('Update and reload the latest Companion, then reload this page to return to your existing Hub tab.');
    await BennyExtension.request('SETTINGS_RETURN',{},6000);
  }catch(e){error.textContent=e.message;error.hidden=false;button.disabled=false;}
};
checkConnection();
