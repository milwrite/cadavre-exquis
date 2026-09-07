import { retiredCadavre } from './browser-move.ts';
export default {fetch(request:Request){const path=new URL(request.url).pathname;if(request.method==='GET' && !path.startsWith('/api/'))return retiredCadavre();return new Response('Cadavre has moved.',{status:410,headers:{'cache-control':'no-store'}});}};
