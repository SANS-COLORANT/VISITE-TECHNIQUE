# Build 45 — diagnostic et correction CI

- Run 45363330113 / job 138338619709 : 23 tests de sauvegarde et récupération PASS; audit transverse 32 PASS / 1 FAIL.
- Échec avant compilation native : verify_play_security.py vérifiait le fichier de travail comme si Expo n'avait pas déjà activé le profil Play.
- La valeur Git (HEAD) doit impérativement rester false. Le mode par défaut vérifie aussi le fichier de travail false. Le mode explicite --generated-play impose au fichier de travail true, tout en contrôlant indépendamment HEAD false. Le scan des permissions et secrets reste identique. Le workflow exige également true au bundling.
- Aucun test de restauration ni de sécurité retiré; aucun changement des données métier. Le prochain candidat doit repasser l'intégralité des contrôles, puis la recette native sur le nouveau AAB.
