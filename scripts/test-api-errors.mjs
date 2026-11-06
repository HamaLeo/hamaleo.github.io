import {build} from 'esbuild';
import {readFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.verification/api-errors.mjs');mkdirSync(path.dirname(out),{recursive:true});
await build({entryPoints:['src/api.ts'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:out});
const raw=readFileSync('public/config.js','utf8');globalThis.window={HAMALEO_CONFIG:JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1))};
// Match a browser request without attaching an owner session.
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,options={})=>originalFetch(input,{...options,headers:{...options.headers,Origin:'https://hamaleo.github.io'}});
try{const {invoke}=await import(pathToFileURL(out).href);await assert.rejects(()=>invoke('save',{content:{}}),e=>e.status===403&&e.message==='Owner access required');console.log('PASS: real SDK HTTP errors retain the server message and status for the recovery UI.');}finally{globalThis.fetch=originalFetch;unlinkSync(out)}
