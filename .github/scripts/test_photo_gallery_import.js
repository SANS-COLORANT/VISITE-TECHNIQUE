/** Gallery-import regression: real picker/resize logic with mocked Android APIs. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
let source=read('photoGalleryImport.js')
  .replace(/^import\s+[^\n]*\n/gm,'')
  .replace(/^export\s+/gm,'');
const sizes=[3100000,690000];
const manipulated=[],deleted=[];
let selection={canceled:false,assets:[{uri:'file:///picker/photo.heic',type:'image',width:4800,height:3200,fileName:'IMG_1234.HEIC'}]};
const picker={
  MediaTypeOptions:{Images:'Images'},
  launchImageLibraryAsync:async options=>{
    assert.equal(options.mediaTypes,'Images');
    assert.equal(options.allowsEditing,false);
    assert.equal(options.allowsMultipleSelection,false);
    assert.equal(options.base64,false);
    return selection;
  },
};
const manipulator={
  SaveFormat:{JPEG:'jpeg'},
  manipulateAsync:async (uri,actions,opts)=>{
    const id=manipulated.length+1;
    manipulated.push({uri,actions,opts});
    assert.equal(opts.format,'jpeg');
    return {uri:'file:///cache/processed-'+id+'.jpg',width:id===1?1920:1600,height:id===1?1280:1067};
  },
};
const fileSystem={
  cacheDirectory:'file:///cache/',
  getInfoAsync:async()=>({exists:true,size:sizes.shift()||690000}),
  deleteAsync:async(uri)=>{deleted.push(uri);},
};
const gallery=new Function('ImagePicker','ImageManipulator','FileSystem',
  source+'\nreturn {GALERIE_MAX_OCTETS,nettoyerTitrePhotoGalerie,titrePhotoGalerie,choisirPhotoDansGalerie,compresserPhotoDeGalerie,nettoyerPhotoTemporaireGalerie};'
)(picker,manipulator,fileSystem);
(async()=>{
  assert.equal(gallery.GALERIE_MAX_OCTETS,1500000);
  assert.equal(gallery.nettoyerTitrePhotoGalerie('  CTA/filtre || état.jpg  '),'CTA filtre état.jpg');
  assert.equal(gallery.titrePhotoGalerie(selection.assets[0],'CTA 1 · Filtre'),'CTA 1 · Filtre');
  let picked=await gallery.choisirPhotoDansGalerie();
  assert.equal(picked.uri,'file:///picker/photo.heic');
  const compact=await gallery.compresserPhotoDeGalerie(picked);
  assert.ok(compact.size<=gallery.GALERIE_MAX_OCTETS);
  assert.equal(manipulated.length,2,'first result is too big, second pass is applied');
  assert.deepEqual(manipulated[0].actions,[{resize:{width:1920}}]);
  assert.deepEqual(manipulated[1].actions,[{resize:{width:1600}}]);
  assert.ok(deleted.includes('file:///cache/processed-1.jpg'));
  assert.ok(!deleted.includes('file:///picker/photo.heic'),'never delete original gallery image');
  await gallery.nettoyerPhotoTemporaireGalerie(compact.uri);
  assert.ok(deleted.includes(compact.uri),'compressed temporary cleaned only after durable copy');
  selection={canceled:true,assets:null};
  assert.equal(await gallery.choisirPhotoDansGalerie(),null,'cancel never creates photo');
  const files=[
    'photoGalleryImport.js','PhotoGalleryImportSheet.js','PhotoButton.js','photoLibreCapture.js',
    'OptimizedPhotoPanel.js','VisiteScreen.js','VisitChrome.js','missionMediaDb.js','MissionVisitScreen.js',
  ];
  const {parse}=require('@babel/parser');
  for(const file of files) assert.doesNotThrow(()=>parse(read(file),{
    sourceType:'module',plugins:['jsx']
  }),'valid JSX and JS: '+file);
  const button=read('PhotoButton.js');
  assert.ok(button.includes('PhotoGalleryImportSheet'),'all technical photo buttons expose gallery');
  assert.ok(button.includes("choisirPhotoDansGalerie()"));
  assert.ok(button.includes("compresserPhotoDeGalerie(galerieAsset)"));
  assert.ok(button.includes("titreImporte || cible.label"));
  assert.ok(button.includes("titreImporte ? ' - '"),'import label is included in durable filename');
  assert.ok(button.includes("createId().slice(0,8)"),'photos within one second never overwrite');
  assert.ok(button.includes("remplacerPhoto(photoExistante.id"),'replace keeps existing DB identity');
  const libre=read('photoLibreCapture.js');
  assert.ok(libre.includes("if (uriImportee) return await savePromise"),'gallery copies completed before deleting temp file');
  assert.ok(libre.includes("void savePromise;"),'camera captures remain responsive');
  assert.ok(libre.includes("inclure_export: entiteKey ? 1 : 0"),'free gallery imports remain private by default');
  const panel=read('OptimizedPhotoPanel.js');
  assert.ok(panel.includes('onPress={()=>ouvrirGalerie(null)}'),'Photos panel retains its gallery picker');
  assert.ok(panel.includes("galerieLien, {uri:photoOptimisee.uri,titre}"),'the importer preserves attached photo context');
  assert.ok(!panel.includes('galleryOpenRequest'),'Photos no longer expects the deleted quick shortcut');
  const visit=read('VisiteScreen.js');
  const chrome=read('VisitChrome.js');
  const actionBar=chrome.split('export function VisitActionBar')[1].split('const s = StyleSheet.create')[0];
  assert.ok(actionBar,'shared visit action bar must exist');
  assert.equal((actionBar.match(/<TouchableOpacity/g)||[]).length,3,'exactly 3 quick actions');
  assert.ok(actionBar.includes('>Note</Text>'),'quick note is kept');
  assert.ok(actionBar.includes('{photoLabel}</Text>'),'quick free/CTA photo is kept');
  assert.ok(actionBar.includes('>Anomalie</Text>'),'quick anomaly is kept');
  assert.ok(!actionBar.includes('onGallery') && !actionBar.includes('>Galerie</Text>'),'no gallery shortcut in the bottom bar');
  assert.ok(visit.includes('<VisitActionBar onNote={ouvrirNote} onPhoto={prendrePhotoLibre}'),'visit passes the 3 surviving callbacks');
  assert.ok(!visit.includes('onGallery={') && !visit.includes('setGalleryContext('),'deleted gallery quick action is not wired');
  const mission=read('missionMediaDb.js');
  assert.ok(mission.includes("sourceUri = null")&&mission.includes("selectedUri=result.assets[0].uri"));
  assert.ok(read('MissionVisitScreen.js').includes("sourceUri:compact.uri"));
  assert.ok(!read('photoGalleryImport.js').includes('requestMediaLibraryPermissionsAsync'),
    'the OS picker does not need broad gallery reading permission');
  console.log('PASS gallery photo picker, 1.5MB JPEG, cancellation, safe file names, 3 visit quick actions, in-panel gallery, CTA/Mission UI, JSX syntax and privacy');
})().catch(e=>{console.error(e);process.exitCode=1;});