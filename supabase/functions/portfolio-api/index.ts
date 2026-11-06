// Supabase Edge Function. Service credentials are read only from platform secrets.
import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {z} from 'npm:zod@3.25.76';
const url=Deno.env.get('SUPABASE_URL')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const origin='https://hamaleo.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
const publicClient=()=>createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
async function hash(input:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')}
function handle(value:unknown){if(typeof value!=='string')return '';const v=value.normalize('NFKC').trim().toLowerCase();return /^[a-z0-9_.-]{3,64}$/.test(v)?v:''}
const text=z.string().max(6000),link=z.string().max(2048).refine(v=>!v||/^https?:\/\//i.test(v));
const image=z.string().max(2048).refine(v=>!v||/^https?:\/\//i.test(v)||(/^\/(?!\/)/.test(v)));
const project=z.object({name:text,category:text,description:text,tags:z.array(z.string().max(100)).max(30),visual:z.enum(['gan','vit','yolo','ecg','home']),url:link.optional(),imageUrl:image.optional(),year:z.string().max(50).optional()}).passthrough();
const language=z.object({title:text,nav:z.array(text).length(4),portraitUrl:image,projects:z.array(project).max(100),portfolioProjects:z.array(project).max(100),experience:z.array(z.object({company:text,role:text,date:text,description:text,url:link.optional()}).passthrough()).max(100),education:z.array(z.object({degree:text,school:text,date:text}).passthrough()).max(100),skills:z.array(text).max(100)}).catchall(z.union([text,z.number(),z.boolean(),z.array(z.unknown())]));
const contentSchema=z.object({en:language,ku:language});
Deno.serve(async req=>{if(req.headers.get('origin')!==origin)return new Response('Forbidden',{status:403});if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{const raw=await req.text();if(raw.length>160000)return reply({error:'Request too large'},413);const body=JSON.parse(raw);const action=body.action;
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 const {data:account,error:accountError}=await service.from('portfolio_admin_account').select('*').eq('singleton',true).maybeSingle();if(accountError||!account)return reply({error:'Owner provisioning is incomplete'},503);
 const identityHash=await hash(account.username_salt+':ip:'+ip);
 const limit=async(bucket:string,n:number,seconds=600)=>{const {data,error}=await service.rpc('consume_portfolio_limit',{p_bucket:bucket,p_limit:n,p_seconds:seconds});if(error)throw Error('Unable to verify request limit');return data===true};
 if(action==='status')return reply({configured:!!account.username_hash});
 if(['login','request-setup','verify-setup'].includes(action)){if(!await limit(action+':'+identityHash,action==='login'?12:action==='verify-setup'?8:3))return reply({error:'Too many attempts. Try again later.'},429);if(action==='request-setup'&&!await limit('setup-global',5))return reply({error:'Try again later.'},429);
 const {data:{user:owner},error}=await service.auth.admin.getUserById(account.user_id);if(error||!owner?.email)throw Error('Owner account unavailable');const auth=publicClient();
 if(action==='request-setup'){if(account.username_hash)return reply({error:'Setup is already complete. Sign in with your username.'},409);const {error}=await auth.auth.signInWithOtp({email:owner.email,options:{shouldCreateUser:false}});if(error)throw Error('Unable to send verification code. Try again later.');return reply({ok:true})}
 if(action==='verify-setup'){if(account.username_hash)return reply({error:'Setup is already complete'},409);if(!/^\d{6,8}$/.test(body.code||''))return reply({error:'Invalid code'},400);const {data,error}=await auth.auth.verifyOtp({email:owner.email,token:body.code,type:'email'});if(error||!data.session)return reply({error:'Invalid or expired code'},401);return reply({session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}})}
 const username=handle(body.username);const usernameHash=await hash(account.username_salt+':handle:'+username);if(typeof body.password!=='string'||body.password.length>128)return reply({error:'Invalid username or password'},401);const {data,error:loginError}=await auth.auth.signInWithPassword({email:owner.email,password:body.password});if(loginError||!data.session||!username||usernameHash!==account.username_hash)return reply({error:'Invalid username or password'},401);return reply({session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
 }
 if(action==='visit'){if(!/^[a-f0-9-]{36}$/i.test(body.visitor||''))return reply({error:'Invalid visitor'},400);if(!await limit('visit:'+identityHash,90,60))return reply({error:'Too many requests'},429);const visitor=await hash(account.username_salt+':visitor:'+body.visitor);const {error}=await service.rpc('record_portfolio_visit',{p_day:new Date().toISOString().slice(0,10),p_visitor_hash:visitor});if(error)throw Error('Unable to record visit');return reply({ok:true})}
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'')||'';const userClient=createClient(url,publicKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const {data:{user},error:userError}=await userClient.auth.getUser(token);if(userError||!user||user.id!==account.user_id)return reply({error:'Owner access required'},403);
 if(action==='set-credentials'){if(account.username_hash)return reply({error:'Credentials are already configured'},409);const username=handle(body.username);if(!username||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return reply({error:'Choose a 3–64 character username (letters, numbers, dots, dashes or underscores) and a password of at least 12 characters.'},400);if(!await limit('configure:'+identityHash,5))return reply({error:'Try again later'},429);const {error}=await service.auth.admin.updateUserById(user.id,{password:body.password});if(error)throw Error('Password did not meet the authentication policy');const {data,error:saveError}=await service.from('portfolio_admin_account').update({username_hash:await hash(account.username_salt+':handle:'+username),configured_at:new Date().toISOString()}).eq('user_id',user.id).is('username_hash',null).select('user_id').single();if(saveError||!data)throw Error('Unable to complete setup');return reply({ok:true})}
 const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.aal!=='aal2')return reply({error:'Two-factor verification is required'},403);
 // Sensitive RPCs use the verified user's JWT and database RLS, never service-role writes.
 if(action==='stats'){const {data,error}=await userClient.rpc('get_portfolio_stats');if(error)throw Error('Unable to load analytics');return reply(data)}
 if(action==='save'){const parsed=contentSchema.safeParse(body.content);if(!parsed.success)return reply({error:'Invalid content: '+parsed.error.issues[0].path.join('.')},400);const {error}=await userClient.from('portfolio_content').upsert({singleton:true,value:parsed.data,updated_at:new Date().toISOString()},{onConflict:'singleton'});if(error)throw Error('Unable to save content');return reply({ok:true})}
 return reply({error:'Unsupported action'},400);
 }catch{return reply({error:'Request could not be completed. Please try again.'},400)}
});
