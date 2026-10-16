#!/bin/sh
# Builds the two CrazyGames preview videos (17 s, 30 fps, no sound): 0.5 s on
# the matching cover, then gameplay recorded by tools/record-preview.cjs.
# Needs ffmpeg, Playwright and a local server on :8080.
set -e
cd "$(dirname "$0")/.."
OUT=assets/crazygames
TMP=${TMPDIR:-/tmp}/planetfall-frames
node tools/record-preview.cjs 1920 1080 "$TMP/land" xythera
node tools/record-preview.cjs 1080 1620 "$TMP/port" xythera
make() { # frames cover width height output
  ffmpeg -y -loglevel error -loop 1 -framerate 30 -t 0.5 -i "$2" -framerate 30 -i "$1/f%04d.jpg"     -filter_complex "[0:v]scale=$3:$4:flags=neighbor,format=yuv420p,setsar=1[a];[1:v]scale=$3:$4,format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1[v]"     -map "[v]" -r 30 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -an "$5"
}
make "$TMP/land" $OUT/cover-landscape-1920x1080.png 1920 1080 $OUT/preview-landscape-1920x1080.mp4
make "$TMP/port" $OUT/video-intro-portrait-1080x1620.png 1080 1620 $OUT/preview-portrait-1080x1620.mp4
