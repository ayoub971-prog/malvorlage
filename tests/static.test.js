import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('every application element lookup has a matching unique HTML id',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);
});
test('relative manifest icons, worker and all offline cache assets exist',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root)));
 assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
 for(const icon of manifest.icons)assert.ok(fs.existsSync(new URL(icon.src,root)));
 const sw=fs.readFileSync(new URL('sw.js',root),'utf8');
 const list=sw.match(/const ASSETS=\[([^;]+)\];/)[1];
 for(const m of list.matchAll(/'([^']+)'/g))assert.ok(fs.existsSync(new URL(m[1],root)),m[1]);
});
test('no external runtime hosts, uploads or clipboard polling',()=>{
 for(const file of ['app.js','core.js','worker.js','index.html','style.css','sw.js']){
 const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert.doesNotMatch(text,/https?:\/\//);assert.doesNotMatch(text,/navigator\.clipboard|XMLHttpRequest|sendBeacon/);
 }
 assert.match(app,/addEventListener\('paste'/);assert.match(html,/capture="environment"/);
});
