# Classifieur de chiffres LCD (recherche)

Outils pour générer des chiffres sept segments synthétiques et entraîner le petit réseau embarqué
(`native/metra-mission-tools/SevenSegmentModel.java` + `SevenSegmentWeights.java`). Python 3, numpy, OpenCV.

```
python3 train.py 240000      # génère data.npz (gros fichier, ne pas versionner)
python3 train_mlp.py 24      # entraîne et écrit SevenSegmentWeights.java
```

Le réseau est désactivé par défaut (`-Dseg.model=true` pour l'essayer) : voir `docs/QA_OCR_SEVEN_SEGMENT.md`.
