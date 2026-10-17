import {useEffect} from 'react';

// Keep the chat composer inside the visible viewport when a phone keyboard opens.
export default function useMobileViewport(){
  useEffect(()=>{
    const viewport=window.visualViewport,root=document.documentElement;
    let baseline=viewport?.height||window.innerHeight;
    const update=()=>{
      const height=viewport?.height||window.innerHeight;
      const editing=document.activeElement?.matches('input:not([type="checkbox"]),textarea');
      if(!editing)baseline=height;else baseline=Math.max(baseline,height);
      root.style.setProperty('--viewport-height',`${height}px`);
      root.toggleAttribute('data-keyboard-open',Boolean(editing&&(!viewport||viewport.scale===1)&&baseline-height>120));
    };
    update();viewport?.addEventListener('resize',update);window.addEventListener('resize',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
    return()=>{viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);root.style.removeProperty('--viewport-height');root.removeAttribute('data-keyboard-open');};
  },[]);
}
