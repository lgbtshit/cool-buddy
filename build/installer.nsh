!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\cool-buddy"
  StrCpy $CreateDesktopShortcutSelection ${BST_CHECKED}
!macroend

Var DesktopShortcutCheckbox
Var CreateDesktopShortcutSelection

!macro customPageAfterChangeDir
  Page Custom DesktopShortcutPageCreate DesktopShortcutPageLeave
!macroend

Function DesktopShortcutPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose whether to create a desktop shortcut for cool-buddy."
  Pop $0

  ${NSD_CreateCheckbox} 0 32u 100% 12u "Create a desktop shortcut"
  Pop $DesktopShortcutCheckbox

  ${NSD_Check} $DesktopShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function DesktopShortcutPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcutSelection
FunctionEnd

Function NormalizeInstallDir
  Exch $0

  ${GetFileName} "$0" $1
  ${If} $1 != "cool-buddy"
    StrCpy $0 "$0\cool-buddy"
  ${EndIf}

  Exch $0
FunctionEnd

Function IsInstallDirEmpty
  Exch $0
  StrCpy $1 "1"
  IfFileExists "$0\*" 0 done

  FindFirst $2 $3 "$0\*"
loop:
  IfErrors close
  StrCmp $3 "." next
  StrCmp $3 ".." next
  StrCpy $1 "0"
  Goto close
next:
  FindNext $2 $3
  Goto loop
close:
  FindClose $2
done:
  StrCpy $0 $1
  Exch $0
FunctionEnd

Function .onVerifyInstDir
  Push "$INSTDIR"
  Call NormalizeInstallDir
  Pop $INSTDIR

  Push "$INSTDIR"
  Call IsInstallDirEmpty
  Pop $0

  ${If} $0 != "1"
    MessageBox MB_ICONSTOP|MB_OK "Please choose an empty install folder. The installer will use:$\r$\n$INSTDIR"
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $CreateDesktopShortcutSelection == ${BST_CHECKED}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
