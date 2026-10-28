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
