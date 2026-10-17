import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, CornerDownLeft, Radio, Bookmark, Check, MessageSquare, Compass } from 'lucide-react';
const prompts = [ ['Tomorrow’s wind at Clark', 'Check tomorrow 5:30 AM wind for Clark Loop'], ['Switch to 30 mm tubeless', "I'm switching to 30mm tubeless in the rain"], ['Fuel the Monasterio ride', 'How many gels for the 112km Monasterio ride at Tempo?'], ['Why the higher rear PSI?', 'Why is my rear PSI higher than front?'] ];
export default function Director({ messages, onSend, busy, savedCount, openSaved }) {
  const [input, setInput] = useState(''); const end = useRef(null);
  useEffect(() => { if (messages.length > 1) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  function submit(e) { e.preventDefault(); if (!input.trim() || busy) return; onSend(input.trim()); setInput(''); }
  return <aside className="director panel"><div className="director-header"><div className="director-mark"><Radio size={20}/></div><div><h2>Ride Director</h2><span>YOUR TACTICAL CO-PILOT</span></div><span className="director-status"><span className={`dot ${busy?'amber':'green'}`}/>{busy?'SYNCING':'READY'}</span></div>
    <div className="director-context"><span className="dot amber"/>CONNECTED TO YOUR DASHBOARD <span>↔</span></div>
    <div className="conversation" aria-live="polite" aria-busy={busy}><div className="chat-date">PRE-RIDE CHANNEL · PHT</div>{messages.map((m,i)=><div key={m.id || i} className={`message ${m.role}`}>
      {m.role === 'assistant' && <div className="message-author"><span className="tiny-mark">E</span>RIDE DIRECTOR <small>{m.source === 'live' ? 'FORECAST' : m.source === 'cached' ? 'CACHED FORECAST' : m.source === 'demo' ? 'DEMO FORECAST' : 'CO-PILOT'}</small></div>}
      {m.role === 'assistant' && i === 0 && <h3>A good ride starts<br/>before you clip in.</h3>}
      <p>{m.text}</p>{m.changes?.length > 0 && <div className="change-list"><Check size={12}/> Dashboard updated · {m.changes.join(' · ')}</div>}
    </div>)}{messages.length === 1 && <><div className="prompt-label">LET’S GET YOU RIDE-READY</div><div className="prompt-list">{prompts.map(([label,prompt])=><button key={label} onClick={()=>onSend(prompt)} disabled={busy}><MessageSquare size={13}/>{label}<ArrowUpRight size={14}/></button>)}</div><div className="director-note"><Compass size={15}/><span>Tell me the route, your setup, or what’s on your mind. I’ll dial in the details.</span></div></>}{busy && <div className="thinking"><span/><span/><span/>Reading the ride conditions</div>}<div ref={end}/></div>
    <form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="director-input">Message Ride Director</label><textarea id="director-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Plan a ride. Ask a question." rows="2" maxLength={2000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit(e);}}}/><div><span><CornerDownLeft size={11}/> Enter to send</span><button className="send-button" aria-label="Send message" disabled={busy||!input.trim()}><ArrowUp size={17}/></button></div></form>
    <div className="director-footer"><span>ROUTE · WEATHER · SETUP</span><button onClick={openSaved}><Bookmark size={12}/>{savedCount} SAVED</button></div>
  </aside>;
}
