/**
 * METRA static audit of all application JavaScript/TypeScript sources.
 * Source resolution, route exports, React Native legacy compatibility and
 * potentially obstructed Android modals. No user data or native config edited.
 */
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '../..');
const skip = new Set(['.git','.github','node_modules','android','ios','dist','build','assets','docs','tests','coverage','.expo','outputs']);
const files = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) visit(target); }
    else if (/\.(js|jsx|cjs|mjs|ts|tsx)$/.test(entry.name)) files.push(target);
  }
}
visit(root);
const rel=(p)=>path.relative(root,p).replace(/\\/g,'/');
const blocker=[],warning=[],routes=[];
const stats={sourceFiles:files.length,parsed:0,relativeImports:0,modalCount:0,modalsWithoutNavInsets:0,reactEffectsAsync:0,screenRoutes:0,flashListImports:0};
const asts=new Map();
function issue(list,code,file,detail,line=null) { list.push({code,file:rel(file),detail,line}); }
function parseFile(file) {
  if (asts.has(file)) return asts.get(file);
  const text = fs.readFileSync(file,'utf8');
  try {
    const ast=parser.parse(text,{sourceType:'unambiguous',allowReturnOutsideFunction:true,errorRecovery:true,plugins:['jsx','typescript','decorators-legacy','dynamicImport','classProperties']});
    stats.parsed++;
    if (ast.errors && ast.errors.length) {
      for (const err of ast.errors) issue(blocker,'parse-recovery',file,err.message,err.loc?.line);
    }
    asts.set(file,{ast,text});
    return {ast,text};
  } catch(error) {
    issue(blocker,'invalid-js',file,error.message,error.loc?.line);
    asts.set(file,null);
    return null;
  }
}
function resolveRelative(file, spec) {
  if(!spec.startsWith('.'))return null;
  const base=path.resolve(path.dirname(file),spec);
  const candidates=[base,base+'.js',base+'.jsx',base+'.ts',base+'.tsx',base+'.json',base+'.mjs',base+'.cjs',path.join(base,'index.js'),path.join(base,'index.ts'),path.join(base,'index.tsx'),path.join(base,'package.json')];
  return candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())||null;
}
const importChecks=[];
function walk(node,callback) {
  if(!node || typeof node!=='object') return;
  if(Array.isArray(node)){for(const child of node)walk(child,callback);return;}
  if(typeof node.type==='string') callback(node);
  for(const [key,value] of Object.entries(node)) {
    if(key==='loc'||key==='extra'||key==='comments'||key==='tokens'||key==='leadingComments'||key==='trailingComments'||key==='errors')continue;
    if(value && typeof value==='object')walk(value,callback);
  }
}
for(const file of files) {
  const data=parseFile(file);
  if(!data)continue;
  const {ast,text}=data;
  walk(ast.program,(node)=>{
    if(node.type==='ImportDeclaration'||node.type==='ExportAllDeclaration'||(node.type==='ExportNamedDeclaration'&&node.source)) {
      const spec=node.source?.value;
      if(typeof spec==='string'&&spec.startsWith('.')) {
        stats.relativeImports++;
        if(!resolveRelative(file,spec))issue(blocker,'missing-relative-import',file,spec,node.loc?.start?.line);
      }
      if(typeof spec==='string'&&spec==='@shopify/flash-list'){
        stats.flashListImports++;issue(blocker,'flashlist-v2-direct',file,'FlashList v2 requires React Native New Architecture, but METRA Play targets legacy',node.loc?.start?.line);
      }
    }
    if(node.type==='CallExpression'&&node.callee?.name==='require'&&node.arguments?.[0]?.type==='StringLiteral') {
      const spec=node.arguments[0].value;
      if(typeof spec==='string'&&spec.startsWith('.')&&!resolveRelative(file,spec))issue(blocker,'missing-dynamic-require',file,'Module absent: '+spec,node.loc?.start?.line);
      if(spec==='@shopify/flash-list'){stats.flashListImports++;issue(blocker,'flashlist-v2-require',file,'FlashList v2 direct require on legacy architecture',node.loc?.start?.line);}
    }
    if(node.type==='JSXOpeningElement'&&node.name?.type==='JSXIdentifier'&&node.name.name==='Modal') {
      stats.modalCount++;
      const attrs=new Set(node.attributes.filter(a=>a.type==='JSXAttribute').map(a=>a.name?.name));
      if(!attrs.has('navigationBarTranslucent')){stats.modalsWithoutNavInsets++;issue(warning,'modal-nav-inset-review',file,'Modal without navigationBarTranslucent; verify buttons against Android system navigation',node.loc?.start?.line);}
    }
    if(node.type==='CallExpression'&&node.callee?.name==='useEffect'&&node.arguments?.[0]?.async){
      stats.reactEffectsAsync++;
      issue(warning,'async-effect-review',file,'Async useEffect callback can return a Promise instead of cleanup',node.loc?.start?.line);
    }
  });
}
function exportedNames(file, seen=new Set()) {
  if(seen.has(file))return new Set();seen.add(file);
  const info=parseFile(file);const exports=new Set();if(!info)return exports;
  for(const node of info.ast.program.body) {
    if(node.type==='ExportNamedDeclaration') {
      if(node.declaration) {
        const d=node.declaration;
        if(d.id?.name)exports.add(d.id.name);
        if(d.declarations)for(const v of d.declarations) if(v.id?.name)exports.add(v.id.name);
      }
      if(node.specifiers)for(const e of node.specifiers)if(e.exported?.name)exports.add(e.exported.name);
    }
    if(node.type==='ExportDefaultDeclaration')exports.add('default');
    if(node.type==='ExportAllDeclaration') {
      const p=resolveRelative(file,node.source?.value||'');
      if(p)for(const n of exportedNames(p,seen))exports.add(n);
    }
  }
  return exports;
}
const appFile=path.join(root,'App.js');
const app=fs.readFileSync(appFile,'utf8');
const loaders=app.match(/const DEFERRED_SCREEN_LOADERS[\s\S]*?\n\}\);/)?.[0]||'';
for (const match of loaders.matchAll(/(\w+)\s*:\s*\(\)\s*=>\s*require\(['"](\.[^'"]+)['"]\)\.(\w+)/g)) {
  const [,route,spec,exportName]=match;
  stats.screenRoutes++;
  routes.push({route,module:spec,exportName});
  const file=resolveRelative(appFile,spec);
  if(!file){issue(blocker,'route-module-missing',appFile,route+': '+spec);continue;}
  const exports=exportedNames(file);
  if(!exports.has(exportName))issue(blocker,'route-export-missing',file,route+' expects '+exportName+' exported');
}
for (const match of app.matchAll(/<DeferredScreen\s+name="([^"]+)"/g)) {
  if (!routes.some(r=>r.route===match[1]))issue(blocker,'unregistered-screen',appFile,'DeferredScreen '+match[1]+' missing loader');
}
const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
if(config.expo.newArchEnabled===false&&stats.flashListImports){
  issue(blocker,'legacy-native-unsafe',appFile,'FlashList v2 found in legacy build');
}
const report={generatedAt:new Date().toISOString(),branch:String(process.env.GITHUB_REF_NAME||'local'),summary:{...stats,blocking: blocker.length,warnings:warning.length},routes,blocking: blocker,warnings:warning};
const folder=path.join(root,'audit-results');
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'metra-all-screens-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log('METRA source audit: '+JSON.stringify(report.summary));
if(blocker.length){console.error('Blocking findings:\n'+blocker.slice(0,60).map(x=>x.code+' '+x.file+':'+x.line+' '+x.detail).join('\n'));process.exitCode=1;}
else console.log('PASS: no source-level blockers in resolved modules and route exports');
console.log('Potential UI review candidates: '+warning.length+' (see audit-results JSON)');
