if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
