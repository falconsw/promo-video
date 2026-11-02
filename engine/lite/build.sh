#!/bin/zsh
# Renders each cut and mixes narration + sound cues. SLUG and DEST per project.
#   ./build.sh [tiktok youtube x]   → out/<slug>-<cut>.mp4, copied to $DEST
# Needs narration/<voice>/words*.json and voice*.wav (tts.py). Delete out/common.mp4 after changing the scene.
set -euo pipefail
cd "$(dirname "$0")"
V=${VOICE:-sadachbia}
SLUG=${SLUG:-my-app}
DEST=${DEST:-~/Movies/My\ App\ Promo}
SPLIT=${SPLIT:-0}   # frames every cut shares (end before the CTA / outro starts); 0 = draw each cut whole
mkdir -p out "$DEST"
for P in ${@:-tiktok youtube x}; do
  page="compose-tiktok.html?voice=$V&p=$P"
  wav=narration/$V/voice.$P.wav; [[ -s $wav ]] || wav=narration/$V/voice.wav
  # REUSE=1 keeps an existing silent render (only the sound is mixed again).
  # Every cut is identical up to SPLIT (the frame before the platform outro differs): that part is drawn once
  # (out/common.mp4) and each cut only draws its own tail.
  if [[ -z ${REUSE:-} || ! -s out/$P-silent.mp4 ]]; then
    if (( SPLIT > 0 )); then
      [[ -s out/common.mp4 ]] || SIZE=1080x1920 PAGE="compose-tiktok.html?voice=$V&p=tiktok" TO=$SPLIT node render.mjs video out/common.mp4 60
      SIZE=1080x1920 PAGE="$page" FROM=$SPLIT node render.mjs video out/$P-tail.mp4 60
      printf "file '%s'\nfile '%s'\n" $PWD/out/common.mp4 $PWD/out/$P-tail.mp4 > out/$P.list
      ffmpeg -y -loglevel error -f concat -safe 0 -i out/$P.list -c copy out/$P-silent.mp4
      rm out/$P.list out/$P-tail.mp4
    else
      SIZE=1080x1920 PAGE="$page" node render.mjs video out/$P-silent.mp4 60
    fi
  fi
  # sound cues: sfx/<name>.wav per [time, name], under the voice (glass = the app's own "agent finished" sound)
  cues=$(SIZE=1080x1920 PAGE="$page" node render.mjs sfx)
  args=(-i out/$P-silent.mp4 -i $wav); filt=""; n=0
  for cue in $(echo $cues | python3 -c 'import json,sys; print(" ".join(f"{round(t*1000)}:{name}" for t, name in json.load(sys.stdin)))'); do
    ms=${cue%%:*}; name=${cue#*:}
    case $name in tap) vol=0.355;; tapf) vol=0.447;; glass) vol=0.5;; thud) vol=0.45;; tick) vol=0.18;; type) vol=0.22;; whoosh|shutter) vol=0.28;; *) vol=0.35;; esac
    src=$name; [[ $name == tapf ]] && src=tap   # tapf = the follow tap (cta.js), louder
    args+=(-i sfx/$src.wav); n=$((n+1)); filt+="[$((n+1))]adelay=delays=${ms}:all=1,volume=${vol}[s${n}];"
  done
  mix="[1]"; for i in $(seq 1 $n); do mix+="[s$i]"; done
  ffmpeg -y -loglevel error "${args[@]}" -filter_complex "${filt}${mix}amix=inputs=$((n+1)):normalize=0:duration=first[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart out/$SLUG-$P.mp4
  rm out/$P-silent.mp4
  cp out/$SLUG-$P.mp4 "$DEST/"
  echo "→ $DEST/$SLUG-$P.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 out/$SLUG-$P.mp4)s)"
done
