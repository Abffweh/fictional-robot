#!/bin/bash
# compose.sh <帧目录> <音效.wav> <输出前缀>
# 单层 2D 画面 + 音效 → 原画质 / ≤30MB 高清 / 手机版 三个 mp4
set -euo pipefail
F=$1; A=$2; OUT=$3
ffmpeg -y -v error -framerate 24 -i "$F/f%06d.png" -i "$A" \
  -map 0:v -map 1:a -vf format=yuv420p -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${OUT}_原画质.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT}_原画质.mp4")
VB=$(python3 -c "print(int(27.5*8*1024/$DUR - 170))")   # 目标 ~28MB
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset slow -b:v ${VB}k -pass 1 -passlogfile /tmp/p2_$$ -an -f mp4 /dev/null
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset slow -b:v ${VB}k -pass 2 -passlogfile /tmp/p2_$$ -c:a aac -b:a 160k -movflags +faststart "${OUT}_高清30M内.mp4"
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset medium -crf 27 -c:a copy -movflags +faststart "${OUT}_手机版.mp4"
ls -la "${OUT}"_*.mp4
