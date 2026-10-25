; CK Pluely NSIS hooks. Data folders are removed by Tauri when the user ticks
; "Delete application data" (never during updates). Here we also clear the
; Windows Credential Manager entries written by the app (service com.ck.pluely).
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "cmdkey /list | Select-String 'com.ck.pluely' | ForEach-Object { ($$_ -split 'target=')[1].Trim() } | ForEach-Object { cmdkey /delete:$$_ }"`
    Pop $0
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}
!macroend
