import React from 'react';
import {Route,Bike,MessageSquare} from 'lucide-react';
const sections=[['plan','Plan',Route],['ride','Ride',Bike],['chat','Chat',MessageSquare]];
export default function MobileNav({active,onChange}){
  return <nav className="mobile-nav" aria-label="Mobile sections">{sections.map(([id,label,Icon])=><button key={id} aria-pressed={active===id} className={active===id?'selected':''} onClick={()=>onChange(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>;
}
