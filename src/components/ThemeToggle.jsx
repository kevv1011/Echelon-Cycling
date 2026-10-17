import React from 'react';
import {Sun,Moon} from 'lucide-react';
export default function ThemeToggle({theme,toggleTheme}){
  const next=theme==='dark'?'light':'dark';
  return <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
