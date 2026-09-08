import { CAIL_CANONICAL_ISSUER, loadIdentityVerifierConfig, readIdentityKeyring, verifyIdentityJwt, verifyKeyringGatewayJwt, createCailAuthError, serializeCailAuthError } from '@cuny-ai-lab/cail-identity';
export const ORIGIN = 'https://tools.ailab.gc.cuny.edu';
export type AdmissionResolution = {ok:true;expiresAt:string;revision:number;accessRole:'member'|'admin';budgetScope:'person'|'person-plus'|'admin'} | {ok:false;code:'not_admitted';retryable:false};
export type AuthBindings = {CAIL_IDENTITY_JWKS:string; ADMISSION_RESOLVER:{resolveMembership(input:{subject:string}):Promise<AdmissionResolution>}};
export class AuthFailure extends Error {
  constructor(public response:Response) {super('Authentication or membership failed.');}
}
function denied(code:Parameters<typeof createCailAuthError>[0], message:string,status:number):never {
  throw new AuthFailure(new Response(serializeCailAuthError(createCailAuthError(code,message,'/launch/my-work')),{status,headers:{'content-type':'application/json','cache-control':'no-store'}}));
}
export async function authenticate(request:Request,env:AuthBindings,audience:string,requireGateway=false) {
  const loaded = await loadIdentityVerifierConfig({jwks:env.CAIL_IDENTITY_JWKS,issuer:CAIL_CANONICAL_ISSUER,expectedAudience:audience,supportedIssuers:[CAIL_CANONICAL_ISSUER]});
  if (!loaded.ok) denied('identity_verification_misconfigured','CUNY sign-in is temporarily unavailable.',503);
  const keyring = readIdentityKeyring(request.headers);
  if (!keyring) denied('authentication_required','Sign in with CUNY to save and reopen work.',401);
  const identity = await verifyIdentityJwt(keyring.appJwt,loaded.config);
  if (!identity) denied('invalid_credential','Your sign-in expired. Sign in again.',401);
  if (requireGateway) {
    const gateway = await loadIdentityVerifierConfig({jwks:env.CAIL_IDENTITY_JWKS,issuer:CAIL_CANONICAL_ISSUER,expectedAudience:'cail:gateway'});
    if (!gateway.ok) denied('identity_verification_misconfigured','Model identity is temporarily unavailable.',503);
    if (!await verifyKeyringGatewayJwt(keyring,gateway.config,identity.subject)) denied('invalid_credential','Sign in again before using a model.',401);
  }
  let timer:ReturnType<typeof setTimeout>|undefined;
  let access:AdmissionResolution;
  try {
    access = await Promise.race([env.ADMISSION_RESOLVER.resolveMembership({subject:identity.subject}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),2000);})]);
  } catch {denied('admission_unavailable','Lab access could not be checked. Try again.',503);}
  finally {if (timer) clearTimeout(timer);}
  const raw=access as unknown;
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) denied('admission_unavailable','Lab access could not be checked. Try again.',503);
  const fields=Object.keys(raw);
  if (!access.ok) {
    if(access.ok===false && access.code==='not_admitted' && access.retryable===false && fields.length===3) denied('admission_required','Active CAIL access is required.',403);
    denied('admission_unavailable','Lab access could not be checked. Try again.',503);
  }
  const expiry=Date.parse(access.expiresAt);
  if (access.ok!==true || fields.length!==5 || fields.some(k=>!['ok','expiresAt','revision','accessRole','budgetScope'].includes(k)) || !Number.isFinite(expiry) || new Date(expiry).toISOString()!==access.expiresAt || !Number.isSafeInteger(access.revision) || access.revision<0 || !['member','admin'].includes(access.accessRole) || !['person','person-plus','admin'].includes(access.budgetScope)) denied('admission_unavailable','Lab access could not be checked. Try again.',503);
  if (Date.parse(access.expiresAt) <= Date.now()) denied('admission_required','Your CAIL access has expired.',403);
  return {subject:identity.subject,keyring};
}
export function enforceOrigin(request:Request):void {
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
  if (request.headers.get('origin') !== ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthFailure(Response.json({error:{code:'origin_rejected',message:'Reload this page from CUNY AI Lab.'}},{status:403}));
}
export async function boundedJson(request:Request,max=200000):Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AuthFailure(Response.json({error:{code:'invalid_content_type',message:'Send JSON.'}},{status:415}));
  const reader=request.body?.getReader();
  if (!reader) return null;
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const part=await reader.read();if(part.done) break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new AuthFailure(Response.json({error:{code:'body_too_large',message:'This item is too large to save.'}},{status:413}));}chunks.push(part.value);}}
  finally {reader.releaseLock();}
  const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(merged));}catch{throw new AuthFailure(Response.json({error:{code:'invalid_json',message:'Invalid JSON.'}},{status:400}));}
}
