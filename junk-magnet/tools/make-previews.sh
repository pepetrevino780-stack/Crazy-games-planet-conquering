#!/bin/sh
# Builds the CrazyGames preview videos (17 s, 30 fps, no sound): 0.5 s on the matching
# cover, then gameplay recorded frame by frame by tools/record-preview.cjs.
# Needs ffmpeg, Playwright and `npm run dev` running on :5173.
set -e
cd "$(dirname "$0")/.."
TMP=${TMPDIR:-/tmp}/junk-magnet-frames
if [ -z "$SKIP_RECORD" ]; then
  node tools/record-preview.cjs 1280 720 "$TMP/land"
  node tools/record-preview.cjs 560 840 "$TMP/port"
fi
make() { # frames cover width height output
  ffmpeg -y -loglevel error -loop 1 -framerate 30 -t 0.5 -i "$2" -framerate 30 -i "$1/f%04d.jpg" \
    -filter_complex "[0:v]scale=$3:$4:flags=lanczos,format=yuv420p,setsar=1[a];[1:v]scale=$3:$4:flags=lanczos,format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1[v]" \
    -map "[v]" -r 30 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart -an "$5"
}
make "$TMP/land" store/cover-1920x1080.png 1920 1080 store/preview-landscape-1920x1080.mp4
make "$TMP/port" store/cover-800x1200.png 1080 1620 store/preview-portrait-1080x1620.mp4
