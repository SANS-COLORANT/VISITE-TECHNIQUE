import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { preparerStructurePreAllumage } from './preAllumageStructureDb.js';
import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';
import { PreAllumageInstallationPanelV3 } from './PreAllumageInstallationPanelV3.js';
import { COLORS } from './styles.js';

export function PreAllumageInstallationPanelBusiness(props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      await chargerPreAllumageModulaire(props.visiteId);
      await assurerStructureSitePreAllumage(props.visiteId);
      await preparerStructurePreAllumage(props.visiteId);
      await chargerPreAllumageModulaire(props.visiteId);
      if (alive) setReady(true);
    })().catch((e) => {
      console.warn('Préparation des locaux Pré-allumage impossible', e);
      if (alive) setReady(true);
    });
    return () => { alive = false; };
  }, [props.visiteId]);
  if (!ready) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <PreAllumageInstallationPanelV3 {...props} />;
}
