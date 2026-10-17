/* Shared browser adapter: never handles an identity token or decides ownership. */
(() => {
  let adapter, id=crypto.randomUUID(), revision=0, previous='', timer, saving=false, dirty=false, loading=false, message, button, activeSave, modelWarning=false;
  const config=()=>window.CORPSE_CONFIG||{};
  async function api(path,method='GET',body){
    const response=await fetch(config().workEndpoint+path,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const value=await response.json();
    if(!response.ok)throw new Error(value.error?.message||'Your work could not be saved.');
    return value;
  }
  const say=text=>{if(message)message.textContent=text;};
  async function save(){
    clearTimeout(timer);
    if(!adapter||!config().authenticated||loading)return true;
    if(saving){dirty=true;await activeSave;return save();}
    const content=adapter.snapshot();
    if(!content.contributions.length&&!content.text.trim())return true;
    const serialized=JSON.stringify(content);
    if(serialized===previous)return true;
    saving=true;if(button)button.disabled=true;say('Saving…');
    activeSave=(async()=>{
      try{
        const result=await api('/entries','PUT',{id,app:'cadavre',kind:'poem',title:adapter.title||content.text.trim().split('\n')[0].slice(0,100)||'Untitled poem',content,expectedRevision:revision});
        revision=result.item.revision;previous=serialized;if(button)button.hidden=true;say(modelWarning?'Poem saved. Model history could not be updated.':'Saved');return true;
      }catch(error){if(button)button.hidden=false;say(error.message+' Your current poem is still here. Select Retry to save again.');return false;}
      finally{saving=false;if(button)button.disabled=false;}
    })();
    const success=await activeSave;
    if(dirty){dirty=false;if(success)return save();}
    return success;
  }
  window.addEventListener('beforeunload',event=>{
    if(config().authenticated&&adapter&&!loading&&(saving||JSON.stringify(adapter.snapshot())!==previous)){
      const content=adapter.snapshot();if(content.contributions.length||content.text.trim()){event.preventDefault();event.returnValue='';}
    }
  });
  window.CadavreWork={
    id:()=>id,
    modelRecorded(value){if(value===false){modelWarning=true;say("The turn is available, but model history could not be updated.");}},
    changed(){if(!adapter||loading)return;clearTimeout(timer);timer=setTimeout(()=>void save(),400);},
    async mount(value){
      adapter=value;
      const bar=document.createElement('nav');bar.id='account-work';bar.className='suite-account suite-nav suite-nav-dark';bar.setAttribute('aria-label','CUNY account');
      const links=document.createElement('div');links.className='suite-nav-links';bar.append(links);
      const games=document.createElement('a');games.className='suite-nav-button';games.href='https://games.ailab-452.workers.dev/';games.textContent='Games';
      games.onclick=async event=>{event.preventDefault();if(await save())location.assign(games.href);};links.append(games);
      const link=document.createElement('a');link.className='suite-nav-button';
      link.href=config().authenticated?'/my-work/':'/auth/start?next='+encodeURIComponent(location.pathname+location.search);link.textContent=config().authenticated?'My work':'CUNY Login';links.append(link);
      if(config().authenticated){
        link.onclick=async event=>{event.preventDefault();if(await save())location.assign(link.href);};
        button=document.createElement('button');button.type='button';button.className='suite-nav-button suite-nav-retry';button.textContent='Retry';button.hidden=true;button.onclick=()=>void save();bar.append(button);
        message=document.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');bar.prepend(message);
      }
      document.body.append(bar);
      const saved=new URLSearchParams(location.search).get('work');
      if(saved&&config().authenticated){
        loading=true;say('Opening saved work…');
        try{const result=await api('/entries/'+encodeURIComponent(saved));id=result.item.id;revision=result.item.revision;adapter.title=result.item.title;await adapter.restore(result.item.content);previous=JSON.stringify(adapter.snapshot());say('Saved work reopened');}
        catch(error){say(error.message);if(button)button.disabled=true;return false;}
        finally{loading=false;}
      }
      return true;
    },
    async newWork(){if(!await save())return false;id=crypto.randomUUID();revision=0;previous='';modelWarning=false;if(adapter)adapter.title='';return true;},
  };
})();
