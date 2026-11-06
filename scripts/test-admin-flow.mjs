import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://hamaleo.github.io/hameleoadmin/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {default:React,act}=await import('react');const {createRoot}=await import('react-dom/client');
mkdirSync('.verification',{recursive:true});const out=path.resolve('.verification/admin-flow.mjs');
await build({entryPoints:['src/admin-gate.tsx'],bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:out,plugins:[{name:'local-auth-only',setup(b){
 b.onResolve({filter:/^\.\/api$/},()=>({path:'mock-api',namespace:'local-only'}));
 b.onResolve({filter:/^\.\/panel$/},()=>({path:'mock-panel',namespace:'local-only'}));
 b.onLoad({filter:/.*/,namespace:'local-only'},a=>({contents:a.path==='mock-panel'?'export default function Panel(){return null}':`export const configured=true;export const client={auth:{signOut:(...a)=>globalThis.authTest.auth.signOut(...a),setSession:(...a)=>globalThis.authTest.auth.setSession(...a),mfa:{getAuthenticatorAssuranceLevel:(...a)=>globalThis.authTest.auth.mfa.getAuthenticatorAssuranceLevel(...a),listFactors:(...a)=>globalThis.authTest.auth.mfa.listFactors(...a),enroll:(...a)=>globalThis.authTest.auth.mfa.enroll(...a),unenroll:async()=>({})}}};export const invoke=(...a)=>globalThis.authTest.invoke(...a);export const signOut=async()=>{};`}));
}}]});
const {default:AdminGate}=await import(pathToFileURL(out).href);
let container,root,calls,conflict,failEnrollment;
async function mount(configured=false){
 calls=[];
 globalThis.authTest={
  invoke:async(action)=>{
   calls.push(action);
   if(action==='status')return {configured};
   if(action==='set-credentials'&&conflict)throw Object.assign(Error('Credentials are already configured'),{status:409});
   return {ok:true,session:{access_token:'local-test-only',refresh_token:'local-test-only'}};
  },
  auth:{
   signOut:async(opts)=>{calls.push('signOut:'+opts.scope);return{}},
   setSession:async()=>{calls.push('freshSession');return{}},
   mfa:{
    getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1'}}),
    listFactors:async()=>({data:{totp:[],all:[]}}),
    enroll:async()=>{
     calls.push('enroll');
     if(failEnrollment){failEnrollment=false;return {error:Error('Temporary enrollment failure')}}
     return {data:{id:'local-factor',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"/>'}}};
    }
   }
  }
 };
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>root.render(React.createElement(AdminGate)));
}
async function input(index,value){await act(async()=>{const node=container.querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}))})}
async function submit(){await act(async()=>container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))}
async function unmount(){await act(async()=>root.unmount());container.remove()}
async function reachCredentials(){await submit();await input(0,'88888888');await submit();assert.equal(container.querySelector('h1').textContent,'Choose your credentials');await input(0,'local-test-owner');await input(1,'Local Test Password 1234');await input(2,'Local Test Password 1234')}
try{
 conflict=false;failEnrollment=false;await mount();await reachCredentials();await submit();
 assert.equal(container.querySelector('h1').textContent,'Private studio');assert.match(container.textContent,/credentials have been saved/);assert.ok(calls.includes('signOut:local'));assert.ok(!calls.includes('enroll'),'Revoked setup session must not be used to enroll');
 await input(1,'Local Test Password 1234');await submit();assert.equal(container.querySelector('h1').textContent,'Secure your studio with 2FA');assert.equal(calls.filter(x=>x==='set-credentials').length,1);assert.ok(calls.indexOf('login')<calls.indexOf('enroll'));await unmount();
 conflict=true;await mount();await reachCredentials();await submit();assert.equal(container.querySelector('h1').textContent,'Private studio');assert.ok(!container.querySelector('[role="alert"]'));await unmount();
 conflict=false;failEnrollment=true;await mount(true);await input(0,'local-test-owner');await input(1,'Local Test Password 1234');await submit();assert.equal(container.querySelector('h1').textContent,'Finish authenticator setup');assert.match(container.textContent,/Temporary enrollment failure/);await submit();assert.equal(container.querySelector('h1').textContent,'Secure your studio with 2FA');assert.equal(calls.filter(x=>x==='login').length,1);assert.ok(!calls.includes('set-credentials'));await unmount();
 console.log('PASS: local DOM exercises saved-credential sign-in, stale-page 409 recovery and MFA retry without repeating credential creation. No network or hosted account mutations.');
}finally{if(root&&container?.isConnected)await unmount();unlinkSync(out);dom.window.close()}
