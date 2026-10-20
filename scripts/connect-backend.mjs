import {readFileSync,writeFileSync} from 'node:fs';

// Run only after Render supplies the real API URL. This contains no secret.
const input=process.argv[2];
if(!input)throw new Error('Usage: npm run configure:backend -- https://YOUR-SERVICE.onrender.com');
const url=new URL(input);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.hostname.endsWith('.onrender.com')){
  throw new Error('Use the exact HTTPS Render service origin, without a path, credentials or query.');
}
const path=new URL('../vercel.json',import.meta.url);
const config=JSON.parse(readFileSync(path,'utf8'));
config.rewrites=[...(config.rewrites||[]).filter(rule=>rule.source!=='/api/:path*'),{source:'/api/:path*',destination:`${url.origin}/api/:path*`}];
writeFileSync(path,JSON.stringify(config,null,2)+'\n');
console.log(`Vercel /api now targets ${url.origin}. Push this configuration when the API is ready, then enable account mode in Vercel.`);
