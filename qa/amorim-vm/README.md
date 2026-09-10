# METRA - Amorim VM endurance

Campagne Appium/UiAutomator2 longue pour Android VM.

## Objectif

Par défaut le runner vise **12 000 actions** et jusqu'à **240 minutes**. Il combine balayage ciblé, création/remplissage de grosses visites, réouverture/persistance et phase chaotique afin de parcourir plusieurs milliers d'interactions sans s'arrêter au premier défaut.

## Watchdog

Si aucun changement d'écran n'est détecté pendant 25 secondes, le runner capture XML + screenshot + logcat puis tente successivement BACK, redémarrage de l'application et recréation de session Appium. Le plafond par défaut est 120 récupérations.

## Lancement sur la VM

```bash
cd qa/amorim-vm
npm install
MAX_ACTIONS=12000 MAX_RUNTIME_MIN=240 npm exec -- node metra-endurance.mjs
```

Exemple très long :

```bash
MAX_ACTIONS=25000 MAX_RUNTIME_MIN=480 STUCK_SECONDS=25 MAX_RECOVERIES=250 npm exec -- node metra-endurance.mjs
```

Variables : `APPIUM_HOST`, `APPIUM_PORT`, `DEVICE_NAME`, `APP_PACKAGE`, `MAX_ACTIONS`, `MAX_RUNTIME_MIN`, `STUCK_SECONDS`, `MAX_RECOVERIES`, `ARTIFACT_ROOT`.

## Sorties

Chaque run crée `qa/amorim-vm/artifacts/<timestamp>/` avec `final-report.json`, `live-report.json`, `events.json`, `checkpoints.json`, captures XML, screenshots et logcat lors des récupérations.

Le rapport mesure notamment : nombre d'actions, transitions, écrans uniques, redémarrages, récupérations Watchdog, échecs et compteurs de couverture par fonction rencontrée.
