#!/bin/bash
# CK Pluely 完全卸载（macOS）。只删除以 io.github.cknb6.ckpluely / CK Pluely 命名的位置。
set -u
ID="io.github.cknb6.ckpluely"; NAME="CK Pluely"
read -r -p "将删除 CK Pluely 及其全部数据，输入 y 确认：" ok; [ "$ok" = "y" ] || exit 0
osascript -e "quit app \"$NAME\"" 2>/dev/null; sleep 1
L="$HOME/Library"
launchctl unload "$L/LaunchAgents/$NAME.plist" 2>/dev/null
for p in "$L/Application Support/$ID" "$L/Caches/$ID" "$L/WebKit/$ID" "$L/HTTPStorages/$ID" \
         "$L/Logs/$ID" "$L/Preferences/$ID.plist" "$L/Saved Application State/$ID.savedState" \
         "$L/LaunchAgents/$NAME.plist"; do
  [ -e "$p" ] && rm -rf "$p" && echo "已删除 $p"
done
defaults delete "$ID" 2>/dev/null
while security delete-generic-password -s "com.ck.pluely" >/dev/null 2>&1; do :; done
for app in "/Applications/$NAME.app" "$HOME/Applications/$NAME.app"; do
  [ -d "$app" ] && { rm -rf "$app" 2>/dev/null || sudo rm -rf "$app"; } && echo "已删除 $app"
done
pkgutil --pkgs | grep -qx "$ID" && sudo pkgutil --forget "$ID"
echo "卸载完成。"
