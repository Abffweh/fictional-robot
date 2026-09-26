#!/usr/bin/env bash
# Full pipeline: music -> beat grid -> UI sounds -> contact sheet -> 60 fps video.
set -euo pipefail
cd "$(dirname "$0")"
export FFMPEG=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')}

(cd music && python3 compose.py && python3 analyze.py track.wav)   # beat grid -> index.html
node render.js sfx                                                 # cue list from the page
python3 music/mix.py                                               # out/loop.wav
node render.js sheet 0.42 sheet.png                                # one frame per beat
node render.js video                                               # out/frames.mkv (tmix motion blur)

"$FFMPEG" -y -v error -i out/frames.mkv -i out/loop.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -tune animation \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -shortest -movflags +faststart out/ui-loop.mp4
echo "out/ui-loop.mp4"
