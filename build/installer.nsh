; Keep personal data on uninstall. Remove only our login entry on full uninstall.
; electron-builder sets isUpdated when replacing an installed version.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Daymark"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Daymark"
  ${endIf}
!macroend
