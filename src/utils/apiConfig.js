export function validatedApiBase(configured='') {
  if(!configured)return '';
  const url=new URL(configured);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('VITE_API_URL must be an API origin without credentials, query parameters or a path.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('The API must use HTTPS, or HTTP on loopback only.');
  return url.origin;
}
