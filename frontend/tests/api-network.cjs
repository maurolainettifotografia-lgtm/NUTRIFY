// Exercises the actual API client with isolated network and storage boundaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/api.ts'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function client(fetch) {
  const removed=[];const values=new Map();const exports={};
  const storage={secureGet:async(k,f)=>values.get(k)??f,secureSet:async(k,v)=>{values.set(k,v);return true;},secureRemove:async k=>{removed.push(k);values.delete(k);return true;}};
  vm.runInNewContext(js,{exports,module:{exports},require:name=> name==='react-native'?{Platform:{OS:'android'}}:{storage},process:{env:{EXPO_PUBLIC_BACKEND_URL:'https://api.example.test'}},fetch,AbortController,setTimeout,clearTimeout,console});
  return {api:exports,removed,values};
}
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('authenticated request sends the original token and serializes the body',async()=>{
 let request;const {api}=client(async(url,opts)=>{request={url,...opts};return response(200,{ok:true});});
 api.setAuthToken('synthetic-token');const result=await api.apiFetch('/sessions',{method:'POST',body:{request_id:'synthetic-request'}});
 assert.equal(result.ok,true);assert.equal(request.headers.Authorization,'Bearer synthetic-token');assert.equal(JSON.parse(request.body).request_id,'synthetic-request');
});
test('network failure preserves the session',async()=>{
 const {api,removed}=client(async()=>{throw Error('offline');});api.setAuthToken('synthetic');
 await assert.rejects(api.apiFetch('/auth/me'),e=>e.status===0);assert.equal(api.getAuthToken(),'synthetic');assert.equal(removed.length,0);
});
test('401 clears identity and token and notifies expiry once',async()=>{
 const {api,removed}=client(async()=>response(401,{}));api.setAuthToken('synthetic');let expired=0;api.subscribeSessionExpired(()=>expired++);
 await assert.rejects(api.apiFetch('/auth/me'),e=>e.status===401);assert.equal(api.getAuthToken(),null);assert.deepEqual(removed,['auth_token','auth_identity_v1']);assert.equal(expired,1);
});
test('late 401 from an old session does not log out a newer session',async()=>{
 let complete;const {api,removed}=client(()=>new Promise(resolve=>{complete=resolve;}));api.setAuthToken('old');const pending=api.apiFetch('/auth/me');api.setAuthToken('new');complete(response(401,{detail:'Old request'}));
 await assert.rejects(pending,e=>e.status===401);assert.equal(api.getAuthToken(),'new');assert.equal(removed.length,0);
});
test('timeout ends a pending request without clearing authentication',async()=>{
 const {api}=client((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))));api.setAuthToken('synthetic');
 await assert.rejects(api.apiFetch('/auth/me',{timeoutMs:5}),e=>e.status===0);assert.equal(api.getAuthToken(),'synthetic');
});
test('malformed server error retains HTTP status',async()=>{
 const {api}=client(async()=>({status:503,ok:false,json:async()=>{throw Error('html');}}));
 await assert.rejects(api.apiFetch('/profile'),e=>e.status===503&&e.message==='Erro na requisição');
});
test('204 does not try to read a JSON body',async()=>{
 const {api}=client(async()=>({status:204,ok:true,json:async()=>{throw Error('must not read');}}));assert.equal(await api.apiFetch('/routine',{method:'DELETE'}),undefined);
});
test('validation errors are readable and do not expire a valid session',async()=>{
 const {api}=client(async()=>response(422,{detail:[{msg:'Value error, Corrija a porção'}]}));api.setAuthToken('synthetic');
 await assert.rejects(api.apiFetch('/food'),e=>e.status===422&&e.message==='Corrija a porção');assert.equal(api.getAuthToken(),'synthetic');
});
