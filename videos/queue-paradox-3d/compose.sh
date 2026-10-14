#!/bin/bash
# compose.sh <base帧目录> <文字层目录> <音效.wav> <输出前缀>
# 3D 画面层 + 文字层 + 音效 → 原画质 / ≤30MB 高清 / 手机版 三个 mp4
set -euo pipefail
B=$1; O=$2; A=$3; OUT=$4
ffmpeg -y -v error -framerate 24 -i "$B/f%06d.png" -framerate 24 -i "$O/h%06d.png" -i "$A" \
  -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${OUT}_原画质.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT}_原画质.mp4")
VB=$(python3 -c "print(int(27.5*8*1024/$DUR - 170))")   # 目标 ~28MB
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset slow -b:v ${VB}k -pass 1 -passlogfile /tmp/p2_$$ -an -f mp4 /dev/null
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset slow -b:v ${VB}k -pass 2 -passlogfile /tmp/p2_$$ -c:a aac -b:a 160k -movflags +faststart "${OUT}_高清30M内.mp4"
ffmpeg -y -v error -i "${OUT}_原画质.mp4" -c:v libx264 -preset medium -crf 27 -c:a copy -movflags +faststart "${OUT}_手机版.mp4"
ls -la "${OUT}"_*.mp4
