import React, {useEffect, useState} from 'react';
import {LockKeyhole, LogOut, Check} from 'lucide-react';
import {API_BASE, accountsEnabled, apiRequest, notifyAuthChange} from '../services/api.js';
import {clearWorkspace, getWorkspaceIdentity} from '../services/workspace.js';

function demoCopies() {
  try {
    const plans=JSON.parse(localStorage.getItem('echelon:plans')||'[]');
    const profile=JSON.parse(localStorage.getItem('echelon:profile')||'null');
    return {plans:Array.isArray(plans)?plans.slice(0,50):[],profile};
  } catch { return {plans:[],profile:null}; }
}

export default function ApiAccess({onConnected}) {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[clearOffline,setClearOffline]=useState(true);
  const [attempt,setAttempt]=useState(0);
  const [copies]=useState(demoCopies),[includeProfile,setIncludeProfile]=useState(false),[includePlans,setIncludePlans]=useState(false);
  useEffect(()=>{
    let alive=true;
    const params=new URLSearchParams(window.location.search);
    if(params.has('auth_error')){
      setError('Google sign-in did not complete. Please try again.');params.delete('auth_error');
      window.history.replaceState(null,'',window.location.pathname+(params.size?`?${params}`:'')+window.location.hash);
    }
    apiRequest('/auth/status').then(s=>{
      if(!alive)return;
      if(accountsEnabled&&s.authMode!=='google')throw new Error('Account service configuration is incomplete.');
      setStatus(s);
    }).catch(()=>{if(alive)setError('The account service is unavailable. Try again when the connection returns.');});
    return()=>{alive=false;};
  },[attempt]);

  async function login(event) {
    event.preventDefault();setBusy(true);setError('');
    const password=new FormData(event.currentTarget).get('password');event.currentTarget.reset();
    try {
      await apiRequest('/auth/login',{method:'POST',body:JSON.stringify({password})});
      setStatus({passwordRequired:true,authenticated:true,authMode:'owner'});
      notifyAuthChange('connected');onConnected?.();
    } catch(err){setError(err.message);}finally{setBusy(false);}
  }

  async function logout() {
    setBusy(true);setError('');const owner=getWorkspaceIdentity();
    window.dispatchEvent(new Event('echelon:signout-started'));
    try {
      await apiRequest('/auth/logout',{method:'POST'});
      if(clearOffline){try{clearWorkspace(owner);}catch{}}
      setStatus(s=>({...s,user:null,passwordRequired:true,authenticated:false}));
      notifyAuthChange('disconnected',clearOffline);
    } catch(err){setError(err.message);}finally{setBusy(false);}
  }

  async function importCopies() {
    setBusy(true);setError('');setNotice('');
    try {
      const result=await apiRequest('/account/import',{method:'POST',body:JSON.stringify({profile:includeProfile?copies.profile:null,plans:includePlans?copies.plans:[]})});
      setNotice(`Imported ${result.imported} ride plans; ${result.skipped} already existed.${includeProfile?' Rider setup imported.':''}`);
      setIncludePlans(false);setIncludeProfile(false);notifyAuthChange('connected');onConnected?.();
    } catch(err){setError(err.message);}finally{setBusy(false);}
  }

  const personal=status?.authMode==='google';
  return <div className="api-access">
    {status?.authenticated ? <>
      <div className="access-status"><Check size={18}/><strong>{personal?status.user?.name:status.passwordRequired?'Signed in / private owner':'Local mode / no account configured'}</strong></div>
      {personal&&<p>{status.user?.email}</p>}
      <p>{personal?'Your rider setup and saved plans belong to your account. This session expires after 30 minutes without activity, with an eight-hour maximum.':status.passwordRequired?'One private owner. HttpOnly session: 30-minute inactivity timeout and an eight-hour maximum.':'Access is restricted to this computer. Set an access password before using a public host.'}</p>
      {personal&&(copies.profile||copies.plans.length>0)&&<fieldset className="settings-form"><legend>Bring your browser demo data</legend>
        <p className="form-note">Import only the data you choose into this account. Existing browser demo copies stay on this device.</p>
        {copies.profile&&<label className="clear-offline"><input type="checkbox" checked={includeProfile} onChange={e=>setIncludeProfile(e.target.checked)}/>Replace my account's rider setup with this browser's demo setup</label>}
        {copies.plans.length>0&&<label className="clear-offline"><input type="checkbox" checked={includePlans} onChange={e=>setIncludePlans(e.target.checked)}/>Import {copies.plans.length} browser demo plans</label>}
        <button className="button secondary" disabled={busy||!includeProfile&&!includePlans} onClick={importCopies}>Import selected data</button>
      </fieldset>}
      {status.passwordRequired&&<>
        <label className="clear-offline"><input type="checkbox" checked={clearOffline} onChange={e=>setClearOffline(e.target.checked)}/>Clear this account's offline copies and open GPS recording when signing out. Saved server plans stay.</label>
        <button className="button secondary" onClick={logout} disabled={busy}><LogOut size={14}/>{busy?'Working…':'Sign out'}</button>
        {personal&&<p className="form-note">Signs you out of Echelon on this browser. Your Google account stays signed in.</p>}
      </>}
    </> : personal ? <>
      <a className="button primary full-width" href={`${API_BASE}/api/auth/google`}>Continue with Google</a>
      <p className="form-note">Use your own Google account. Google handles your password; Echelon receives your name and verified email, with no inbox access.</p>
    </> : status?.passwordRequired ? <form onSubmit={login} className="settings-form">
      <label>Private API password<input name="password" type="password" autoComplete="current-password" maxLength={256} required/></label>
      <p className="form-note">The password is sent only to your configured Echelon API. It is never saved in browser storage.</p>
      <button className="button primary" disabled={busy}><LockKeyhole size={14}/>{busy?'Signing in…':'Unlock private API'}</button>
    </form> : !error&&<p>Checking API access…</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="planner-error" role="alert">{error}</p>}
    {!status&&error&&<button className="button secondary" onClick={()=>{setError('');setAttempt(n=>n+1);}}>Retry connection</button>}
  </div>;
}
