// METRA — fragments de rapports PDF lourds (aucune mutation des visites).
export const MAX_PHOTOS_PAR_FRAGMENT = 8;

// Un lot ne charge qu'un local et au plus 8 photographies pendant l'impression.
// Réserves et contrôles sont rendus une seule fois ; le matériel reste après les photos.
export function decouperRapportPdf(datas = [], photosConfig = [], inclurePhotos = true) {
  const fragments = [];
  for (const data of datas) {
    const visiteId = String(data?.visite?.id ?? '');
    const photos = inclurePhotos
      ? photosConfig.filter((p) => String(p.visiteId) === visiteId && p.include !== false && p.exportAllowed !== false)
        .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
      : [];
    const nombre = Math.max(1, Math.ceil(photos.length / MAX_PHOTOS_PAR_FRAGMENT));
    for (let index = 0; index < nombre; index += 1) {
      const premierLocal = index === 0;
      const dernierLocal = index === nombre - 1;
      fragments.push({
        data: {
          ...data,
          sections: premierLocal ? data.sections : [],
          remarques: premierLocal ? data.remarques : [],
          materiel: dernierLocal ? data.materiel : [],
        },
        photosConfig: photos.slice(index * MAX_PHOTOS_PAR_FRAGMENT, (index + 1) * MAX_PHOTOS_PAR_FRAGMENT),
        premierDocument: fragments.length === 0,
        premierLocal,
        dernierLocal,
      });
    }
  }
  return fragments;
}

function bornesDocument(html) {
  const ouvertureBody = html.indexOf('<body>');
  const debutArticle = html.indexOf('<article class="siteReport">', ouvertureBody);
  const finArticle = html.indexOf('</article>', debutArticle);
  const fermetureBody = html.lastIndexOf('</body>');
  if (ouvertureBody < 0 || debutArticle < 0 || finArticle < 0 || fermetureBody < finArticle) {
    throw new Error('Structure HTML du rapport non reconnue. Export annulé sans perte de données.');
  }
  return {
    ouvertureBody: ouvertureBody + '<body>'.length,
    debutArticle,
    finArticle: finArticle + '</article>'.length,
    fermetureBody,
  };
}

// L'entête vient d'un rendu sans photographies sur le périmètre complet :
// garde, synthèse patrimoine, sommaire de tous les sites et introduction.
export function extraireEnteteRapport(html) {
  const bornes = bornesDocument(html);
  return html.slice(bornes.ouvertureBody, bornes.debutArticle);
}

// Chaque fragment garde le CSS original, mais une seule garde/sommaire,
// un seul titre local et une seule signature par visite.
export function composerHtmlFragment(html, entete, { premierDocument, premierLocal, dernierLocal }) {
  const bornes = bornesDocument(html);
  let article = html.slice(bornes.debutArticle, bornes.finArticle);
  if (!premierLocal) {
    article = article.replace(/<article class="siteReport"><div class="siteStart">[\s\S]*?<\/div>/, '<article class="siteReport">');
    // Le saut de page initial n'est plus nécessaire dans un document PDF indépendant.
    article = article.replace(/(<section class="[^"]*) pageBreakBefore/, '$1');
  }
  const signatures = dernierLocal ? html.slice(bornes.finArticle, bornes.fermetureBody) : '';
  return html.slice(0, bornes.ouvertureBody)
    + (premierDocument ? entete : '')
    + article + signatures + '</body></html>';
}

// New adaptive planner. The historical eight-photo API above stays available
// to legacy previews/tests. All optimized splits occur at PHOTO PAGE boundaries.
export function poidsPhotoPage(size) {
  return size==='large'?6:size==='full'?12:2;
}
export function pagesPhotosRapport(items) {
  const pages=[];let page=[],weight=0;
  for(const p of items){
    const w=poidsPhotoPage(p.photo?.size||p.size);
    if(page.length&&weight+w>12){pages.push(page);page=[];weight=0;}
    page.push(p);weight+=w;
    if(weight>=12){pages.push(page);page=[];weight=0;}
  }
  if(page.length)pages.push(page);
  return pages;
}
export function choisirBudgetPdf(profile={}) {
  if(profile.lowRam||!profile.memoryClassMb||!profile.availableBytes||profile.availableBytes<384*1024*1024)return 8;
  if(profile.memoryClassMb>=256&&profile.availableBytes>=1536*1024*1024)return 24;
  if(profile.memoryClassMb>=192&&profile.availableBytes>=640*1024*1024)return 16;
  return 8;
}
function poidsMemoire(p) {return p.size==='full'?5:p.size==='large'?3:1;}
function nombreLignes(data){
  return (data.sections||[]).reduce((n,s)=>n+(s.groups||[]).reduce((a,g)=>a+(g.rows||[]).length,0),0)
    +(data.remarques||[]).length+(data.materiel||[]).length;
}
export function planifierLotsPdf(datas=[],photosConfig=[],inclurePhotos=true,budget=8){
  const limite=[8,16,24].includes(budget)?budget:8;
  const byVisit=new Map();
  if(inclurePhotos)for(const p of photosConfig){
    if(p.include===false||p.exportAllowed===false)continue;
    const k=String(p.visiteId);
    if(!byVisit.has(k))byVisit.set(k,[]);
    byVisit.get(k).push(p);
  }
  const fragments=[];
  for(const data of datas){
    const items=(byVisit.get(String(data.visite.id))||[]).slice().sort((a,b)=>(Number(a.ordre)||0)-(Number(b.ordre)||0));
    const chunks=[];let current=[],weight=0;
    for(const page of pagesPhotosRapport(items)){
      const pw=page.reduce((n,p)=>n+poidsMemoire(p),0);
      if(current.length&&(weight+pw>limite||current.length+page.length>limite)){chunks.push(current);current=[];weight=0;}
      current.push(...page);weight+=pw;
    }
    if(current.length||!chunks.length)chunks.push(current);
    chunks.forEach((photos,index)=>{
      const first=index===0,last=index===chunks.length-1;
      fragments.push({
        data:{...data,sections:first?data.sections:[],note:first?data.note:'',remarques:first?data.remarques:[],materiel:last?data.materiel:[]},
        photosConfig:photos,premierLocal:first,dernierLocal:last,premierDocument:fragments.length===0,
        poids:photos.reduce((n,p)=>n+poidsMemoire(p),0),
      });
    });
  }
  const lots=[];let lot=[],weight=0,photos=0,rows=0;
  for(const f of fragments){
    const n=nombreLignes(f.data);
    if(lot.length&&(weight+f.poids>limite||photos+f.photosConfig.length>limite||rows+n>500||lot.length>=3)){
      lots.push(lot);lot=[];weight=0;photos=0;rows=0;
    }
    lot.push(f);weight+=f.poids;photos+=f.photosConfig.length;rows+=n;
  }
  if(lot.length)lots.push(lot);
  return lots;
}
// Compose complete articles in the exact selected order. Start each subsequent
// article on a fresh printed page, as with the former independent print jobs.
export function composerHtmlLot(rendered,entete,premierDocument){
  if(!rendered.length)throw Error('Lot PDF vide.');
  const first=bornesDocument(rendered[0].html);
  const head=rendered[0].html.slice(0,first.ouvertureBody);
  const articles=rendered.map(({html,fragment},i)=>{
    const b=bornesDocument(html);
    let article=html.slice(b.debutArticle,b.finArticle);
    if(!fragment.premierLocal){
      article=article.replace(/<article class="siteReport"><div class="siteStart">[\s\S]*?<\/div>/,'<article class="siteReport">');
      article=article.replace(/(<section class="[^"]*) pageBreakBefore/,'$1');
    }
    if(i>0)article=article.replace('<article class="siteReport">','<article class="siteReport" style="page-break-before:always">');
    return article+(fragment.dernierLocal?html.slice(b.finArticle,b.fermetureBody):'');
  });
  return head+(premierDocument?entete:'')+articles.join('')+'</body></html>';
}
