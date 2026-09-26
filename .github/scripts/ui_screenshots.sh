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
adb logcat -d > shots/logcat-full.txt || true
# Diagnostic lisible directement dans le journal du job.
echo "=== Application au premier plan ==="
adb shell dumpsys activity activities | tr -d '\r' | grep -m3 -E "mResumedActivity|topResumedActivity" || true
echo "=== Plantages (AndroidRuntime) ==="
grep -n -A25 "FATAL EXCEPTION" shots/logcat-full.txt | head -80 || true
echo "=== Erreurs JavaScript ==="
grep -n -iE "ReactNativeJS.*(error|exception|warn)" shots/logcat-full.txt | head -40 || true
if grep -q "FATAL EXCEPTION" shots/logcat-full.txt; then
  if grep -A5 "FATAL EXCEPTION" shots/logcat-full.txt | grep -q "$PKG"; then echo "::warning::Plantage de l'application détecté (voir journal)"; else echo "::notice::Plantage d'un autre processus de l'émulateur (pas l'application)"; fi
fi
exit 0
