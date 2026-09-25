import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  creerInstallationMission,
  creerReseauTechniqueMission,
  creerSystemeMission,
  listerArchitectureTechniqueMission,
  rattacherEquipementArchitectureMission,
  supprimerObjetArchitectureMission
} from './missionTechnicalStructureDb.js';

function Chip({ label, selected, onPress, compact = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 6 : 8,
        marginRight: 6,
        marginBottom: 6
      }}
    >
      <Text
        style={{
          color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft,
          fontSize: compact ? 8.5 : 9.2,
          fontWeight: '800'
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function equipmentLabel(row) {
  return [row.type, row.brand, row.model].filter(Boolean).join(' · ') || 'Équipement';
}

export function MissionTechnicalStructureScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const routeSiteId = route?.params?.siteId || null;
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(routeSiteId);
  const [data, setData] = useState({
    locations: [],
    installations: [],
    systems: [],
    networks: [],
    equipment: [],
    components: []
  });
  const [createVisible, setCreateVisible] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    kind: 'installation',
    label: '',
    type: '',
    locationId: '',
    installationId: '',
    systemId: ''
  });
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignQuery, setAssignQuery] = useState('');

  const loadSites = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const rows = await db.getAllAsync(
      'SELECT s.* FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name',
      [missionId]
    );
    setSites(rows || []);
    if (!siteId && rows?.[0]?.id) setSiteId(rows[0].id);
  }, [missionId, siteId]);

  const load = useCallback(async () => {
    if (!missionId || !siteId) {
      setData({ locations: [], installations: [], systems: [], networks: [], equipment: [], components: [] });
      return;
    }
    const result = await listerArchitectureTechniqueMission(missionId, { siteId });
    setData(result);
  }, [missionId, siteId]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);
  useEffect(() => {
    load();
  }, [load]);

  const systemsByInstallation = useMemo(() => {
    const map = new Map();
    for (const system of data.systems || []) {
      const list = map.get(system.installation_id) || [];
      list.push(system);
      map.set(system.installation_id, list);
    }
    return map;
  }, [data.systems]);

  const networksBySystem = useMemo(() => {
    const map = new Map();
    for (const network of data.networks || []) {
      const key = network.system_id || '__installation__:' + (network.installation_id || '');
      const list = map.get(key) || [];
      list.push(network);
      map.set(key, list);
    }
    return map;
  }, [data.networks]);

  const equipmentFor = useCallback(
    (installationId, systemId = null, networkId = null, directOnly = false) => {
      return (data.equipment || []).filter((equipment) => {
        if (networkId) return equipment.network_id === networkId;
        if (systemId) return equipment.system_id === systemId && (!directOnly || !equipment.network_id);
        if (installationId)
          return equipment.installation_id === installationId && (!directOnly || !equipment.system_id);
        return !equipment.installation_id;
      });
    },
    [data.equipment]
  );

  const componentsCount = useCallback(
    (equipmentId) => (data.components || []).filter((component) => component.equipment_id === equipmentId).length,
    [data.components]
  );

  const openCreateInstallation = () => {
    setCreateDraft({ kind: 'installation', label: '', type: '', locationId: '', installationId: '', systemId: '' });
    setCreateVisible(true);
  };

  const openCreateSystem = (installation) => {
    setCreateDraft({
      kind: 'system',
      label: '',
      type: '',
      locationId: installation.location_id || '',
      installationId: installation.id,
      systemId: ''
    });
    setCreateVisible(true);
  };

  const openCreateNetwork = (installation, system = null) => {
    setCreateDraft({
      kind: 'network',
      label: '',
      type: '',
      locationId: installation.location_id || '',
      installationId: installation.id,
      systemId: system?.id || ''
    });
    setCreateVisible(true);
  };

  const saveCreate = async () => {
    if (!createDraft.label.trim()) {
      Alert.alert('À compléter', 'Indique le nom de l’objet technique.');
      return;
    }
    try {
      if (createDraft.kind === 'installation') {
        await creerInstallationMission({
          missionId,
          siteId,
          locationId: createDraft.locationId || null,
          type: createDraft.type,
          label: createDraft.label
        });
      } else if (createDraft.kind === 'system') {
        await creerSystemeMission({
          missionId,
          installationId: createDraft.installationId,
          type: createDraft.type,
          label: createDraft.label
        });
      } else {
        await creerReseauTechniqueMission({
          missionId,
          siteId,
          locationId: createDraft.locationId || null,
          installationId: createDraft.installationId || null,
          systemId: createDraft.systemId || null,
          type: createDraft.type,
          label: createDraft.label
        });
      }
      setCreateVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Création impossible', String(e?.message || e));
    }
  };

  const openAssign = (target) => {
    setAssignTarget(target);
    setAssignQuery('');
  };

  const candidateEquipment = useMemo(() => {
    const q = assignQuery.trim().toLowerCase();
    return (data.equipment || [])
      .filter(
        (equipment) =>
          !q ||
          [equipment.type, equipment.brand, equipment.model, equipment.location_label].some((value) =>
            String(value || '')
              .toLowerCase()
              .includes(q)
          )
      )
      .slice(0, 250);
  }, [data.equipment, assignQuery]);

  const assignEquipment = async (equipment) => {
    if (!assignTarget) return;
    try {
      await rattacherEquipementArchitectureMission({
        missionId,
        equipmentId: equipment.id,
        installationId: assignTarget.installationId || null,
        systemId: assignTarget.systemId || null,
        networkId: assignTarget.networkId || null
      });
      setAssignTarget(null);
      await load();
    } catch (e) {
      Alert.alert('Rattachement impossible', String(e?.message || e));
    }
  };

  const unlinkEquipment = async (equipment) => {
    try {
      await rattacherEquipementArchitectureMission({ missionId, equipmentId: equipment.id });
      await load();
    } catch (e) {
      Alert.alert('Déliaison impossible', String(e?.message || e));
    }
  };

  const removeObject = (kind, row) => {
    Alert.alert(
      'Supprimer cet objet technique ?',
      'Les équipements restent dans l’inventaire Mission. Les rattachements supprimés passent à vide lorsque la base le prévoit.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerObjetArchitectureMission(kind, row.id);
              await load();
            } catch (e) {
              Alert.alert('Suppression impossible', String(e?.message || e));
            }
          }
        }
      ]
    );
  };

  const EquipmentBadge = ({ equipment, allowUnlink = false }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={() => navigation.navigate('MissionEquipment', { missionId, siteId, equipmentId: equipment.id })}
      >
        <Text style={{ color: COLORS.ink, fontSize: 9.5, fontWeight: '800' }}>{equipmentLabel(equipment)}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.1, marginTop: 2 }}>
          {[
            equipment.location_label,
            componentsCount(equipment.id) ? componentsCount(equipment.id) + ' composant(s)' : null
          ]
            .filter(Boolean)
            .join(' · ') || 'Contexte à compléter'}
        </Text>
      </TouchableOpacity>
      {allowUnlink ? (
        <TouchableOpacity onPress={() => unlinkEquipment(equipment)} style={{ padding: 6 }}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 12 }}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const unassigned = equipmentFor(null);

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={[styles.sectionTitle, missionStyles.title]}>Architecture technique</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
          Structure fonctionnelle : Installation → Système → Réseau / circuit → Équipement. Elle complète la hiérarchie
          physique Bâtiment → Niveau → Local sans la dupliquer.
        </Text>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 14 }]}>Site</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {sites.map((site) => (
            <Chip key={site.id} label={site.name} selected={siteId === site.id} onPress={() => setSiteId(site.id)} />
          ))}
        </ScrollView>

        {siteId ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={openCreateInstallation}>
              <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Installation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, missionStyles.secondaryButton]}
              onPress={() => navigation.navigate('MissionTechnicalGraph', { missionId })}
            >
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Voir le synoptique</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, missionStyles.secondaryButton]}
              onPress={() => navigation.navigate('MissionPlan', { missionId })}
            >
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Plans / réseaux</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {(data.installations || []).map((installation) => {
          const systems = systemsByInstallation.get(installation.id) || [];
          const directNetworks = networksBySystem.get('__installation__:' + installation.id) || [];
          const directEquipment = equipmentFor(installation.id, null, null, true);

          return (
            <View key={installation.id} style={[missionStyles.card, { padding: 12, marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 12, fontWeight: '900' }}>
                    {installation.label}
                  </Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>
                    {[installation.type, installation.location_label].filter(Boolean).join(' · ') || 'Installation'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeObject('installation', installation)} style={{ padding: 5 }}>
                  <Text style={{ color: '#8B3A3A' }}>×</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  onPress={() => openCreateSystem(installation)}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Système</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  onPress={() => openCreateNetwork(installation)}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Réseau direct</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  onPress={() => openAssign({ installationId: installation.id, label: installation.label })}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Équipement</Text>
                </TouchableOpacity>
              </View>

              {directEquipment.length ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Équipements directs</Text>
                  {directEquipment.map((equipment) => (
                    <EquipmentBadge key={equipment.id} equipment={equipment} allowUnlink />
                  ))}
                </View>
              ) : null}

              {directNetworks.map((network) => (
                <View
                  key={network.id}
                  style={{ marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: MISSION_COLORS.accentSoft }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.ink, fontSize: 9.8, fontWeight: '900' }}>
                        Réseau · {network.label}
                      </Text>
                      <Text style={{ color: COLORS.inkFaint, fontSize: 8.1 }}>
                        {network.type || 'Type à compléter'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        openAssign({ installationId: installation.id, networkId: network.id, label: network.label })
                      }
                      style={{ padding: 5 }}
                    >
                      <Text style={{ color: MISSION_COLORS.accentDark, fontWeight: '900' }}>＋ EQ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeObject('network', network)} style={{ padding: 5 }}>
                      <Text style={{ color: '#8B3A3A' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {equipmentFor(installation.id, null, network.id).map((equipment) => (
                    <EquipmentBadge key={equipment.id} equipment={equipment} allowUnlink />
                  ))}
                </View>
              ))}

              {systems.map((system) => {
                const systemNetworks = networksBySystem.get(system.id) || [];
                const systemEquipment = equipmentFor(installation.id, system.id, null, true);
                return (
                  <View
                    key={system.id}
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: MISSION_COLORS.accentLine,
                      borderRadius: 11,
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.ink, fontSize: 10.3, fontWeight: '900' }}>
                          Système · {system.label}
                        </Text>
                        <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 2 }}>
                          {system.type || 'Type à compléter'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeObject('system', system)} style={{ padding: 5 }}>
                        <Text style={{ color: '#8B3A3A' }}>×</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      <TouchableOpacity
                        style={[styles.btnSecondary, missionStyles.secondaryButton]}
                        onPress={() => openCreateNetwork(installation, system)}
                      >
                        <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Réseau</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnSecondary, missionStyles.secondaryButton]}
                        onPress={() =>
                          openAssign({ installationId: installation.id, systemId: system.id, label: system.label })
                        }
                      >
                        <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Équipement</Text>
                      </TouchableOpacity>
                    </View>

                    {systemEquipment.map((equipment) => (
                      <EquipmentBadge key={equipment.id} equipment={equipment} allowUnlink />
                    ))}

                    {systemNetworks.map((network) => (
                      <View
                        key={network.id}
                        style={{
                          marginTop: 7,
                          padding: 8,
                          borderRadius: 9,
                          backgroundColor: MISSION_COLORS.accentSoft
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: COLORS.ink, fontSize: 9.5, fontWeight: '900' }}>{network.label}</Text>
                            <Text style={{ color: COLORS.inkFaint, fontSize: 8 }}>
                              {network.type || 'Réseau / circuit'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              openAssign({
                                installationId: installation.id,
                                systemId: system.id,
                                networkId: network.id,
                                label: network.label
                              })
                            }
                            style={{ padding: 5 }}
                          >
                            <Text style={{ color: MISSION_COLORS.accentDark, fontWeight: '900' }}>＋ EQ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeObject('network', network)} style={{ padding: 5 }}>
                            <Text style={{ color: '#8B3A3A' }}>×</Text>
                          </TouchableOpacity>
                        </View>
                        {equipmentFor(installation.id, system.id, network.id).map((equipment) => (
                          <EquipmentBadge key={equipment.id} equipment={equipment} allowUnlink />
                        ))}
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}

        {!data.installations?.length && siteId ? (
          <View style={[missionStyles.card, { padding: 13, marginTop: 12 }]}>
            <Text style={{ color: COLORS.inkSoft, fontSize: 9.7 }}>
              Aucune architecture technique créée. Commence par une installation : Chaufferie, Production ECS, CTA,
              Climatisation, GTB…
            </Text>
          </View>
        ) : null}

        {unassigned.length ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>
              Équipements non rattachés · {unassigned.length}
            </Text>
            <View style={[missionStyles.card, { padding: 10 }]}>
              {unassigned.slice(0, 40).map((equipment) => (
                <EquipmentBadge key={equipment.id} equipment={equipment} />
              ))}
              {unassigned.length > 40 ? (
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 6 }}>
                  + {unassigned.length - 40} autre(s). Utilise une installation pour les rattacher sans charger toute la
                  liste à l’écran.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalSheet, missionStyles.modalSheet]}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <Text style={[styles.modalTitle, missionStyles.title]}>
              {createDraft.kind === 'installation'
                ? 'Nouvelle installation'
                : createDraft.kind === 'system'
                  ? 'Nouveau système'
                  : 'Nouveau réseau / circuit'}
            </Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={createDraft.label}
              onChangeText={(v) => setCreateDraft((p) => ({ ...p, label: v }))}
              placeholder={
                createDraft.kind === 'installation'
                  ? 'Production chauffage, ECS, CTA…'
                  : createDraft.kind === 'system'
                    ? 'Circuit radiateurs Nord, Bouclage ECS…'
                    : 'Départ Nord, Retour ECS, Air neuf…'
              }
              autoFocus
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={createDraft.type}
              onChangeText={(v) => setCreateDraft((p) => ({ ...p, type: v }))}
              placeholder="Type / fonction (facultatif)"
            />
            {createDraft.kind === 'installation' ? (
              <>
                <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 10 }]}>
                  Localisation physique (facultatif)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
                  {(data.locations || []).map((location) => (
                    <Chip
                      key={location.id}
                      compact
                      label={location.label}
                      selected={createDraft.locationId === location.id}
                      onPress={() =>
                        setCreateDraft((p) => ({ ...p, locationId: p.locationId === location.id ? '' : location.id }))
                      }
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setCreateVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveCreate}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!assignTarget} transparent animationType="fade" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, missionStyles.modalSheet]}>
            <Text style={[styles.modalTitle, missionStyles.title]}>Rattacher un équipement</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 9.4, lineHeight: 14, marginBottom: 8 }}>
              {assignTarget?.label || 'Objet technique'}
            </Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={assignQuery}
              onChangeText={setAssignQuery}
              placeholder="Rechercher pompe, chaudière, CTA, UE, UI…"
            />
            <ScrollView style={{ maxHeight: 360, marginTop: 7 }}>
              {candidateEquipment.map((equipment) => (
                <TouchableOpacity
                  key={equipment.id}
                  onPress={() => assignEquipment(equipment)}
                  style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}
                >
                  <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800' }}>
                    {equipmentLabel(equipment)}
                  </Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.4, marginTop: 2 }}>
                    {equipment.location_label || 'Sans localisation'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnPrimary, missionStyles.primaryButton]}
                onPress={() => setAssignTarget(null)}
              >
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
