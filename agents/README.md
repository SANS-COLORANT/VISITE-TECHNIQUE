# METRA — Cadre multi-agents IA

Ce dossier décrit les rôles spécialisés utilisés pour développer METRA de manière contrôlée.

## Agents

- `orchestrator.md` : analyse les demandes et répartit le travail.
- `trames-data.md` : trames ICPE/VMC/Pré-allumage, presets et mappings Excel.
- `android-ui.md` : interface terrain React Native / Android.
- `database.md` : patrimoine, SQLite et migrations.
- `reports.md` : Excel, PDF et Word.
- `qa.md` : tests et recherche de régressions.
- `build-release.md` : CI, Gradle, APK et artefacts.

## Ordre de travail recommandé

```text
Demande
  ↓
Orchestrateur
  ↓
Agents spécialisés
  ↓
Branche feature
  ↓
QA
  ↓
PR vers native-android
  ↓
Build / Release
```

## Règle commune

Tous les agents doivent lire avant intervention :
- `docs/METRA_RULES.md` ;
- le document métier correspondant à leur domaine.

Ces fichiers constituent des **contrats de rôle et prompts de référence**. Ils ne donnent pas automatiquement des droits GitHub à une IA : les permissions restent gérées par le système qui exécute l’agent.
