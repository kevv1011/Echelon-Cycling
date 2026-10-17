import {useEffect,useState} from 'react';

const key='echelon:theme';
function savedTheme(){try{const value=localStorage.getItem(key);return ['light','dark'].includes(value)?value:null;}catch{return null;}}
export function preferredTheme(){return savedTheme()||(globalThis.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark');}
export function applyTheme(theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f3f5f7':'#0a0b0d');}
export function initializeTheme(){applyTheme(preferredTheme());}
export default function useTheme(){
  const [theme,setTheme]=useState(preferredTheme);
  useEffect(()=>{applyTheme(theme);},[theme]);
  useEffect(()=>{
    const media=globalThis.matchMedia?.('(prefers-color-scheme: light)');
    const systemChanged=()=>{if(!savedTheme())setTheme(preferredTheme());};
    const storageChanged=e=>{if(e.key===key||e.key===null)setTheme(preferredTheme());};
    media?.addEventListener('change',systemChanged);window.addEventListener('storage',storageChanged);
    return()=>{media?.removeEventListener('change',systemChanged);window.removeEventListener('storage',storageChanged);};
  },[]);
  return {theme,toggleTheme(){setTheme(current=>{const next=current==='dark'?'light':'dark';try{localStorage.setItem(key,next);}catch{}return next;});}};
}
