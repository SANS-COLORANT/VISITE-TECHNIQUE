# METRA — Politique de confidentialité (PROJET NON VALIDÉ)

> Cette version est un **modèle de travail**, à valider par Energie et Service et le responsable RGPD avant diffusion. Ne jamais publier avec les champs entre crochets.

**Dernière mise à jour envisagée :** 20 novembre 2026.

## 1. Responsable et contact

METRA est une application de visites techniques utilisée par les professionnels autorisés.

Responsable de traitement / éditeur présumé : **ENERGIE ET SERVICE**, 143 rue Yves le Coz, 78000 Versailles, France ; société identifiée sous le numéro SIREN 338 335 201.

Contact public provisoire : contact.versailles@energieetservice.fr.

**À valider :** rôles exacts d'E&S et de ses clients (responsable, sous-traitant, co-responsable selon contrats) ; contact officiel pour les demandes de droits et éventuel DPO.

## 2. Données concernées

En fonction des modules activés et des autorisations : identifiant d'activation de tablette, identifiants techniques de session, informations d'organisation (clients/sites/locaux), informations techniques d'installations, équipements, mesures, avis, observations, photos, documents et, dans certains modules, noms et signatures.

La saisie et les photographies peuvent incidemment contenir des données à caractère personnel. L'application peut conserver sur la tablette des copies locales des éléments préalablement téléchargés, y compris hors connexion.

Le module de reconnaissance vocale Android, lorsqu'il est accessible, peut dépendre du fournisseur installé sur le terminal. **Son transfert éventuel à ce fournisseur reste à auditer**, avant déclaration définitive.

## 3. Finalités

Autorisation d'accès, réalisation et traçabilité des visites professionnelles, synchronisation avec les systèmes d'information autorisés, préparation des rapports, gestion des dossiers et assistance technique lorsque demandée.

**Bases légales à préciser avec E&S / les clients et leurs contrats.**

## 4. Destinataires et transferts

Les données sont destinées exclusivement aux collaborateurs et interlocuteurs autorisés, aux systèmes métiers correspondants et aux prestataires contractuels intervenant pour leur compte.

**À compléter :** liste des sous-traitants, hébergeurs, services Google/Android effectivement utilisés, lieux d'hébergement, transferts hors EEE, mesures et bases juridiques associées.

## 5. Sécurité

L'application restreint l'accès à l'Intranet via une activation de tablette et des jetons ; les communications de l'API existante emploient HTTPS et le mécanisme DPoP. Des fichiers peuvent être stockés localement sur l'appareil et exportés à la demande de l'utilisateur autorisé.

**Important :** à la date de ce projet, la base SQLite n'est pas encore chiffrée au repos ; ne pas affirmer que l'ensemble du stockage local est chiffré.

## 6. Durées de conservation, sauvegarde et suppression

**À compléter obligatoirement :** durées par catégorie, justification, purge des données sur l'Intranet, procédures de retrait d'accès tablette et de suppression des copies locales, sauvegardes et fichiers exportés.

## 7. Droits

Les personnes concernées peuvent demander l'accès, la rectification, l'effacement, la limitation ou l'opposition dans les conditions prévues par les textes et les contrats applicables.

**À valider :** adresse de contact et procédure de réorientation lorsqu'E&S agit comme sous-traitant pour un client responsable du traitement.

## 8. Publicité

Aucune fonctionnalité publicitaire n'est prévue dans le périmètre métier examiné. À confirmer après revue du binaire final et des SDK.

## 9. Disponibilité

La politique finale doit être publiée sur une page Web HTTPS publique, sans connexion ni restrictions géographiques, et être accessible **dans METRA** et **depuis la fiche Play Store**.

La politique générale du site https://energieetservice.fr/politique-de-confidentialite/ ne suffit pas sans adaptation aux traitements METRA.
