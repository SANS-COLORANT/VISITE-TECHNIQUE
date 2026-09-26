#!/usr/bin/env bash
# Captures automatiques de l'interface sur émulateur tablette (job CI
# ui-screenshots). Installe l'APK de release, ouvre l'application et
# photographie les écrans principaux ; le journal React Native est joint
# pour repérer un plantage au démarrage. Ne bloque jamais le build.
set -u
PKG=com.visitetechnique.tablet
APK=$(ls apk/*.apk | head -1)
mkdir -p shots
adb install -r "$APK" || { echo "Installation impossible"; exit 0; }
adb logcat -c || true
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 40

shot() { adb exec-out screencap -p > "shots/$1.png"; echo "capture $1"; }
read -r W H < <(adb shell wm size | tr -d '\r' | awk -F'[ x]' '/Physical/{print $3, $4}')
DENS=$(adb shell wm density | tr -d '\r' | awk '/Physical/{print $3}')
Y=$(( H - (82 * DENS / 160) ))
SLOTS=4   # Accueil, Clients, +, Réglages (Missions masqué par défaut)
X() { echo $(( W * (2 * $1 + 1) / (2 * SLOTS) )); }
tap() { adb shell input tap "$1" "$Y"; sleep 5; }

shot 01-accueil
tap "$(X 2)"; shot 02-nouvelle-visite; adb shell input keyevent 4; sleep 3
tap "$(X 1)"; shot 03-clients
tap "$(X 3)"; shot 04-reglages
tap "$(X 0)"; shot 05-accueil-retour

adb logcat -d -s ReactNativeJS:V ReactNative:W AndroidRuntime:E > shots/logcat.txt || true
if grep -q "FATAL EXCEPTION" shots/logcat.txt; then echo "::warning::Plantage natif détecté au démarrage (voir logcat.txt)"; fi
exit 0
