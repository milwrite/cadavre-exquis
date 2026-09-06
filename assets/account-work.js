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
    saving=true;button.disabled=true;say('Saving privately…');
    activeSave=(async()=>{
      try{
        const result=await api('/entries','PUT',{id,app:'cadavre',kind:'poem',title:adapter.title||content.text.trim().split('\n')[0].slice(0,100)||'Untitled poem',content,expectedRevision:revision});
        revision=result.item.revision;previous=serialized;say(modelWarning?'Poem saved. Model history could not be updated.':'Saved privately · My work');return true;
      }catch(error){say(error.message+' Your current poem is still here. Use Save privately to retry.');return false;}
      finally{saving=false;button.disabled=false;}
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
      const bar=document.createElement('aside');bar.id='account-work';bar.setAttribute('aria-label','Saved work');
      bar.style.cssText='position:relative;z-index:5;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:14px;padding:12px 18px;border-bottom:1px solid #555;font:14px/1.5 system-ui,sans-serif;background:#1b1b19;color:#ece9e0';
      const link=document.createElement('a');link.style.color='inherit';
      link.href=config().authenticated?'/my-work/':'https://tools.ailab.gc.cuny.edu/launch/cadavre';link.textContent=config().authenticated?'My work':'Sign in with CUNY to save your work';bar.append(link);
      if(config().authenticated){
        link.onclick=async event=>{event.preventDefault();if(await save())location.assign(link.href);};
        button=document.createElement('button');button.type='button';button.textContent='Save privately';button.style.cssText='font:inherit;padding:7px 12px;color:inherit;background:transparent;border:1px solid #777;border-radius:4px';button.onclick=()=>void save();bar.append(button);
        message=document.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent='Work saves after each turn. Private pins stay off the public wall.';bar.append(message);
      }
      document.body.prepend(bar);
      const saved=new URLSearchParams(location.search).get('work');
      if(saved&&config().authenticated){
        loading=true;say('Opening saved work…');
        try{const result=await api('/entries/'+encodeURIComponent(saved));id=result.item.id;revision=result.item.revision;adapter.title=result.item.title;await adapter.restore(result.item.content);previous=JSON.stringify(adapter.snapshot());say('Saved work reopened. New turns update this item.');}
        catch(error){say(error.message);button.disabled=true;return false;}
        finally{loading=false;}
      }
      return true;
    },
    async newWork(){if(!await save())return false;id=crypto.randomUUID();revision=0;previous='';modelWarning=false;if(adapter)adapter.title='';return true;},
  };
})();
