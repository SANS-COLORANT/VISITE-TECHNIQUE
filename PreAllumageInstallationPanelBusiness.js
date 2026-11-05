import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { initialiserPreAllumageModulaire } from './preAllumageModularDb.js';
import { preparerStructurePreAllumage } from './preAllumageStructureDb.js';
import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';
import { PreAllumageInstallationPanelV3 } from './PreAllumageInstallationPanelV3.js';
import { PreAllumagePlanCard } from './PreAllumagePlanCard.js';
import { COLORS } from './styles.js';

export function PreAllumageInstallationPanelBusiness(props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      // Preserve bootstrap -> legacy structure mapping before mounting the editor.
      // A read of the entire model is not needed until V3 finishes normalization.
      await initialiserPreAllumageModulaire(props.visiteId);
      await assurerStructureSitePreAllumage(props.visiteId);
      await preparerStructurePreAllumage(props.visiteId);
      if (alive) setReady(true);
    })().catch((e) => {
      console.warn('Préparation des locaux Pré-allumage impossible', e);
      if (alive) setReady(true);
    });
    return () => { alive = false; };
  }, [props.visiteId]);
  if (!ready) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <View style={{ flex: 1 }}>
    <PreAllumagePlanCard visiteId={props.visiteId} onSaved={props.onSaved} />
    <PreAllumageInstallationPanelV3 {...props} />
  </View>;
}
