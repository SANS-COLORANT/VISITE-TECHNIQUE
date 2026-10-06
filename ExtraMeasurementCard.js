import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { StepperNumerique } from './GenericFields.js';
import { useDurableAutosave } from './durableAutosave.js';
import { modifierPointMesureVisite } from './terrainVisitDb.js';
import { LecturePhotoButton } from './PhotoOcrReview.js';
import { styles } from './styles.js';

export function ExtraMeasurementCard({ point, visiteId }) {
  const [label,setLabel,flushLabel] = useDurableAutosave(point.libelle,v=>modifierPointMesureVisite(visiteId,point.id,'libelle',v));
  const [value,setValue,,setImmediate] = useDurableAutosave(point.valeur,v=>modifierPointMesureVisite(visiteId,point.id,'valeur',v));
  return <View style={styles.formCard}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><TextInput accessibilityLabel="Nom du point de mesure" style={[styles.input,{flex:1}]} value={label} onChangeText={setLabel} onBlur={flushLabel}/><LecturePhotoButton visiteId={visiteId} entiteKey={`mesure||${point.id}`} label={label} kind="temperatures" unit={point.unite} current={{valeur:value}} onApply={v=>setImmediate(v.valeur)}/></View>
    <StepperNumerique valeur={value} config={{min:-Infinity,max:Infinity,step:point.unite==='bar'?0.1:1,unit:point.unite}} onChange={setValue}/>
    <Text style={styles.importHint}>Mesure complémentaire de cette visite · annexe Excel</Text>
  </View>;
}
