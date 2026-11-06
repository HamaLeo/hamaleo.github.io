import {createClient,FunctionsHttpError} from '@supabase/supabase-js';
import seed from './seed.json';
import {normalizeContent} from './content';
declare global {interface Window {HAMALEO_CONFIG?:{supabaseUrl:string;supabasePublishableKey:string}}}
export const config=window.HAMALEO_CONFIG;
export const configured=!!(config?.supabaseUrl&&config?.supabasePublishableKey);
export const client=configured?createClient(config!.supabaseUrl,config!.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}}):null;
export class PortfolioApiError extends Error{constructor(message:string,public status=0){super(message);this.name='PortfolioApiError'}}
export async function invoke(action:string,body:Record<string,unknown>={}){
 if(!client)throw Error('The secure backend has not been connected yet.');
 const {data,error}=await client.functions.invoke('portfolio-api',{body:{action,...body}});
 if(error){
  if(error instanceof FunctionsHttpError){let details:any;try{details=await error.context.json()}catch{}throw new PortfolioApiError(typeof details?.error==='string'?details.error:'Request could not be completed. Please try again.',error.context.status)}
  throw new PortfolioApiError('Unable to reach the secure service. Check your connection and try again.');
 }
 if(data?.error)throw new PortfolioApiError(data.error);
 return data;
}
export async function api(path:string,options:RequestInit={}){try{if(path==='/api/content'&&(!options.method||options.method==='GET')){if(!client)return Response.json(normalizeContent(seed));const {data,error}=await client.from('portfolio_content').select('value').eq('singleton',true).maybeSingle();if(error)throw error;return Response.json(normalizeContent(data?.value||seed))}if(path==='/api/content')return Response.json(await invoke('save',{content:JSON.parse(options.body as string)}));if(path==='/api/stats')return Response.json(await invoke('stats'));if(path==='/api/visit'){if(client){let visitor=localStorage.getItem('mh-visitor');if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('mh-visitor',visitor)}await invoke('visit',{visitor})}return Response.json({ok:true})}throw Error('Unsupported request')}catch(e:any){return Response.json({error:e.message||'Request failed'},{status:400})}}
export async function signOut(){await client?.auth.signOut();location.reload()}
