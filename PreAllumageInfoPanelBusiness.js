import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { preparerStructurePreAllumage } from './preAllumageStructureDb.js';
import { PreAllumageInfoPanelV3 } from './PreAllumageInfoPanelV3.js';
import { COLORS } from './styles.js';

export function PreAllumageInfoPanelBusiness(props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      await chargerPreAllumageModulaire(props.visiteId);
      await preparerStructurePreAllumage(props.visiteId);
      if (alive) setReady(true);
    })().catch((e) => { console.warn('Préparation Pré-allumage impossible', e); if (alive) setReady(true); });
    return () => { alive = false; };
  }, [props.visiteId]);
  if (!ready) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <PreAllumageInfoPanelV3 {...props} />;
}
