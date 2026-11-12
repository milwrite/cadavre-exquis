import { GAME_MODELS } from './game-models.ts';
export type GatewayModel = {
  id:string; name?:string; provider?:string; status?:string; modality?:string;
  capabilities?:string[]; context_length?:number;
};
export type Policy = {
  providers:ReadonlySet<string>; exclude:readonly RegExp[]; allow:readonly string[]; gateway?:boolean;
};
export const EXCLUDE: readonly RegExp[] = [];
export const ALLOW: readonly string[] = GAME_MODELS.map(model => model.id);
export function policyFromEnv(value:string|undefined, gatewayKeyPresent:boolean):Policy {
  const all = (value || 'workers-ai').trim().toLowerCase() === 'all' && gatewayKeyPresent;
  return {
    providers:new Set(all ? ['workers-ai','bedrock-mantle','bedrock-runtime','openrouter'] : ['workers-ai']),
    exclude:EXCLUDE, allow:ALLOW, gateway:gatewayKeyPresent,
  };
}
export function selectModels(models:GatewayModel[], policy:Policy):GatewayModel[] {
  return models.filter(m => {
    const id=String(m.id || '').trim();
    const featured=GAME_MODELS.find(choice => choice.id === id || choice.binding === id);
    return id && (m.status ?? 'active') === 'active' && (m.modality ?? 'text') === 'text'
      && (m.capabilities ?? []).includes('text-generation') && policy.providers.has(m.provider ?? '')
      && !policy.exclude.some(re => re.test(id))
      && (!policy.allow.length || policy.allow.includes(featured?.id || id))
      && (!featured || featured.provider === m.provider);
  });
}
