# Generated media fixtures

These clips are original test signals: a solid color and a 220 Hz sine wave. They contain no movie or trailer content and require no external service. Generated with FFmpeg:

```bash
ffmpeg -f lavfi -i 'color=c=0x294c63:s=320x180:r=24:d=6' \
  -f lavfi -i 'sine=frequency=220:duration=6' \
  -c:v libvpx -b:v 80k -c:a libvorbis -shortest preview.webm

ffmpeg -f lavfi -i 'color=c=0x294c63:s=320x180:r=24:d=6' \
  -f lavfi -i 'sine=frequency=220:duration=6' \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p -c:a aac \
  -f hls -hls_time 2 -hls_list_size 0 \
  -hls_segment_filename segment-%d.ts preview.m3u8
```

Browser tests intercept Plex-shaped media requests and serve these files, exercising the real Chromium media element and the HLS fallback. No Plex API response from a real user is included.
