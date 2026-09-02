# LAB 3D

Module de maquette technique 3D rattachee au site.

- `Lab3DScreen.js` : interface et projection isometrique.
- `lab3dDb.js` : acces aux scenes, objets, reseaux et equipements du site.
- `database/` : adaptateurs temporaires vers la couche SQLite partagee.

La migration de schema reste dans `database/migrations/022_lab_3d_site.js` afin de conserver un registre unique des migrations.
