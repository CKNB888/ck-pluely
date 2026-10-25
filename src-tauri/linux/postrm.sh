#!/bin/sh
# CK Pluely: on purge/erase remove per-user data written by the app.
# Only folders named after the bundle id, plus its autostart entry.
ID=io.github.cknb6.ckpluely
case "$1" in
  purge|0)
    for h in /root /home/*; do
      [ -d "$h" ] || continue
      rm -rf "$h/.config/$ID" "$h/.local/share/$ID" "$h/.cache/$ID" "$h/.config/autostart/CK Pluely.desktop"
    done
    ;;
esac
exit 0
