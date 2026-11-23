#!/usr/bin/env node
/**
 * METRA cross-module static audit. Read-only; never edits app data.
 * This reports likely blockers and review candidates; it does NOT certify
 * runtime behavior on a Samsung phone or network/SQLite integration.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const walk = (p) => fs.readdirSync(p,{withFileTypes:true}).flatMap(d => {
  if (['node_modules','.git','.expo','android','dist','build','coverage','outputs'].includes(d.name)) return [];
  const full = path.join(p,d.name);
  return d.isDirectory()?walk(full):/\.(js|jsx|ts|tsx)$/.test(d.name)?[full]:[];
});
const files = walk(root), findings=[];
const report=(severity,category,file,line,message)=>findings.push({severity,category,file,line,message});
const rel=f=>path.relative(root,f).replace(/\\/g,'/');
let directFlash=0, filesWithModal=0, modalMissingNav=0, unresolved=[];
for(const file of files){
  const name=rel(file);
  const source=fs.readFileSync(file,'utf8'),lines=source.split(/\r?\n/);
  if(/^\s*(?:import|export)[^\n]*from\s*['"]@shopify\/flash-list['"]/m.test(source) || /require\(['"]@shopify\/flash-list['"]\)/.test(source)){
    directFlash++;
    report('BLOCKER','NATIVE_ARCH',name,source.slice(0,source.search(/@shopify\/flash-list/)).split('\n').length,'FlashList v2 import despite newArchEnabled=false');
  }
  for(let i=0;i<lines.length;i++){
    let line=lines[i];
    // Ignore test fixtures: scan app modules only for runtime imports.
    if(!name.startsWith('.github/')&&!name.startsWith('tests/')){
      const re=/(?:\bfrom\s*|\brequire\(|\bimport\s*\()['"]((?:\.\.?\/)[^'"]+)['"]/g;
      let match;
      while((match=re.exec(line))!==null){
        const base=path.resolve(path.dirname(file),match[1]);
        const options=[base,base+'.js',base+'.jsx',base+'.ts',base+'.tsx',path.join(base,'index.js')];
        if(!options.some(x=>fs.existsSync(x))){unresolved.push(name+':'+(i+1)+' -> '+match[1]);}
      }
    }
  }
  if(!name.startsWith('.github/')&&!name.startsWith('tests/')){
    const modalOccurrences=Array.from(source.matchAll(/<Modal\b([^>]*)>/g));
    if(modalOccurrences.length){
      filesWithModal++;
      for(const m of modalOccurrences){
        if(!/navigationBarTranslucent/.test(m[1])){
          modalMissingNav++;
          report('REVIEW','MODAL_SAFE_AREA',name,source.slice(0,m.index).split('\n').length,'Modal without navigationBarTranslucent; verify Android 3-button inset');
        }
      }
    }
    // Find obvious risk: mounting heavyweight modules on top-level screens.
    if(/<FlashList\b/.test(source) && !/FlashList\.test\./.test(name)){
      report('BLOCKER','NATIVE_ARCH',name,source.indexOf('<FlashList')>=0?source.slice(0,source.indexOf('<FlashList')).split('\n').length:1,'Direct FlashList component with legacy architecture');
    }
  }
}
for(const value of unresolved.slice(0,100)) report('REVIEW','IMPORT_RESOLUTION',value.split(':')[0],Number(value.split(':')[1])||0,value);
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(app.expo.newArchEnabled===false && /^2\./.test(pkg.dependencies['@shopify/flash-list']||'')){
  report('REVIEW','NATIVE_ARCH','package.json',0,'FlashList v2 dependency remains installed: no import may be used by legacy runtime');
}
if(app.expo.android?.package!=='com.visitetechnique.tablet')report('BLOCKER','PACKAGE','app.json',0,'Unexpected Android package');
const play=fs.readFileSync(path.join(root,'.github/workflows/metra-playstore-secure.yml'),'utf8');
if(!play.includes("METRA_PLAY_SECURE_BUILD: '1'"))report('BLOCKER','SECURITY','metra-playstore-secure.yml',0,'Secure Play flag missing');
const counts={BLOCKER:findings.filter(x=>x.severity==='BLOCKER').length,REVIEW:findings.filter(x=>x.severity==='REVIEW').length};
const sections=[...new Set(findings.map(f=>f.category))];
const md=[
'# Audit global METRA — revue statique du code',
'',
'Cette revue ne prouve pas que les parcours fonctionnent réellement sur Android ; logcat + tests tablette indispensables.',
'',
'- Fichiers JS/TS parcourus : '+files.length,
'- Imports directs FlashList v2 : '+directFlash,
'- Modules possédant des Modal : '+filesWithModal,
'- Modal à inspecter pour la barre Android : '+modalMissingNav,
'- Imports locaux non résolus à inspecter : '+unresolved.length,
'- Blocages à haute confiance : '+counts.BLOCKER,
'- Points de revue : '+counts.REVIEW,
'',
...sections.flatMap(section=>['## '+section,'',...findings.filter(x=>x.category===section).map(f=>'- **'+f.severity+'** '+f.file+':'+f.line+' — '+f.message),'']),
'## Suites de tests recommandées','',
'ICPE, REMAR, VMC, Pré-allumage, réseau de chaleur, navigation, photos, galerie, stockage SQLite, Intranet, sauvegarde, PDF/Excel/Word, modes hors ligne, permissions, app 3-button Android. Les tests statiques ne remplacent pas ces essais.',
''];
const out=path.join(root,'metra_global_audit_20261123.md');
fs.writeFileSync(out,md.join('\n'));
console.log(JSON.stringify({files:files.length,directFlash,filesWithModal,modalMissingNav,unresolved:unresolved.length,...counts},null,2));
console.log(findings.slice(0,24).map(f=>f.severity+' '+f.category+' '+f.file+':'+f.line+' '+f.message).join('\n'));
if(counts.BLOCKER)process.exitCode=1;
