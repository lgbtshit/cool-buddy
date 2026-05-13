!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; Macro: preInit
; Purpose:
;   Initializes the default installation directory before the standard NSIS pages
;   are shown, and sets the initial desktop shortcut selection state for install
;   flows.
; Parameters:
;   None.
; Returns:
;   None. Updates installer variables such as $INSTDIR and
;   $CreateDesktopShortcutSelection in-place.
; Example:
;   The installer opens with the default path:
;   "$LOCALAPPDATA\Programs\cool-buddy"
;   and the desktop shortcut checkbox is checked by default.
!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\cool-buddy"
  !ifndef BUILD_UNINSTALLER
    StrCpy $CreateDesktopShortcutSelection ${BST_CHECKED}
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  Var DesktopShortcutCheckbox
  Var CreateDesktopShortcutSelection

  ; Macro: customPageAfterChangeDir
  ; Purpose:
  ;   Injects a custom page after the install directory page so the user can
  ;   choose whether a desktop shortcut should be created.
  ; Parameters:
  ;   None.
  ; Returns:
  ;   None. Registers the DesktopShortcutPageCreate and
  ;   DesktopShortcutPageLeave handlers with NSIS.
  ; Example:
  ;   After selecting an install directory, the user sees a checkbox page for
  ;   desktop shortcut creation.
  !macro customPageAfterChangeDir
    Page Custom DesktopShortcutPageCreate DesktopShortcutPageLeave
  !macroend

  ; Function: DesktopShortcutPageCreate
  ; Purpose:
  ;   Creates the custom NSIS dialog that lets the user decide whether to create
  ;   a desktop shortcut during installation.
  ; Parameters:
  ;   None.
  ; Returns:
  ;   None. Stores the checkbox handle in $DesktopShortcutCheckbox.
  ; Example:
  ;   The page shows the label "Choose whether to create a desktop shortcut for
  ;   cool-buddy." and a checked checkbox by default.
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

  ; Function: DesktopShortcutPageLeave
  ; Purpose:
  ;   Reads the user's checkbox selection when leaving the custom desktop
  ;   shortcut page.
  ; Parameters:
  ;   None.
  ; Returns:
  ;   None. Persists the checkbox state into
  ;   $CreateDesktopShortcutSelection.
  ; Example:
  ;   If the user unchecks the checkbox, the later install step will skip
  ;   desktop shortcut creation.
  Function DesktopShortcutPageLeave
    ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcutSelection
  FunctionEnd
!endif

; Function: NormalizeInstallDir
; Purpose:
;   Normalizes the selected install directory so the final path always ends with
;   "cool-buddy". This keeps the install layout stable even when the user picks
;   a parent folder.
; Parameters:
;   Stack top: candidate install directory path.
; Returns:
;   Stack top: normalized directory path.
; Example:
;   Input:  "D:\Apps"
;   Output: "D:\Apps\cool-buddy"
;   Input:  "D:\Apps\cool-buddy"
;   Output: "D:\Apps\cool-buddy"
Function NormalizeInstallDir
  Exch $0

  ${GetFileName} "$0" $1
  ${If} $1 != "cool-buddy"
    StrCpy $0 "$0\cool-buddy"
  ${EndIf}

  Exch $0
FunctionEnd

; Function: IsInstallDirEmpty
; Purpose:
;   Checks whether the target installation directory is empty, ignoring only
;   the synthetic "." and ".." entries returned by file enumeration.
; Parameters:
;   Stack top: target directory path.
; Returns:
;   Stack top: "1" when the directory is empty or does not exist, otherwise
;   "0".
; Example:
;   Input:  "D:\Apps\cool-buddy"
;   Output: "1" when the directory has no files;
;           "0" when unrelated files are already present.
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

; Function: IsExistingCoolBuddyInstall
; Purpose:
;   Detects whether the selected directory already contains a compatible
;   cool-buddy installation, allowing reinstall or upgrade into the same
;   folder without forcing the user to choose an empty directory.
; Parameters:
;   Stack top: target directory path.
; Returns:
;   Stack top: "1" when both "cool-buddy.exe" and "resources\app.asar"
;   exist; otherwise "0".
; Example:
;   Input:  "C:\Users\<user>\AppData\Local\Programs\cool-buddy"
;   Output: "1" for an existing installed app folder;
;           "0" for a random non-empty folder.
Function IsExistingCoolBuddyInstall
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\cool-buddy.exe" 0 done
  IfFileExists "$0\resources\app.asar" 0 done
  StrCpy $1 "1"

done:
  StrCpy $0 $1
  Exch $0
FunctionEnd

; Function: .onVerifyInstDir
; Purpose:
;   Validates the installation directory during the NSIS directory selection
;   flow. The installer accepts either an empty folder or an existing
;   cool-buddy installation folder.
; Parameters:
;   None. Reads and updates $INSTDIR.
; Returns:
;   None. Aborts the page flow with a message box when the directory is not
;   allowed.
; Example:
;   "D:\Tools" with unrelated files -> blocked.
;   "D:\Tools\cool-buddy" containing the current app -> allowed.
Function .onVerifyInstDir
  Push "$INSTDIR"
  Call NormalizeInstallDir
  Pop $INSTDIR

  Push "$INSTDIR"
  Call IsInstallDirEmpty
  Pop $0

  ${If} $0 != "1"
    Push "$INSTDIR"
    Call IsExistingCoolBuddyInstall
    Pop $0

    ${If} $0 != "1"
      MessageBox MB_ICONSTOP|MB_OK "Please choose an empty install folder, or an existing cool-buddy install folder. The installer will use:$\r$\n$INSTDIR"
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

!ifndef BUILD_UNINSTALLER
  ; Function: RefreshShellIcons
  ; Purpose:
  ;   Requests Windows Explorer to refresh shell associations and desktop icon
  ;   cache immediately after shortcut changes, so a newly created desktop
  ;   shortcut can display the correct icon without requiring a system reboot.
  ; Parameters:
  ;   None.
  ; Returns:
  ;   None. Best-effort refresh only; failures are ignored so installation is not
  ;   interrupted.
  ; Example:
  ;   After recreating "$DESKTOP\cool-buddy.lnk", Explorer is nudged to reload
  ;   the icon shown on the desktop right away.
  Function RefreshShellIcons
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
    IfFileExists "$SYSDIR\ie4uinit.exe" 0 done
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
  done:
  FunctionEnd

  ; Macro: customInstall
  ; Purpose:
  ;   Creates or removes the desktop shortcut based on the user's selection and
  ;   then refreshes the Windows shell icon cache so the shortcut icon is updated
  ;   immediately.
  ; Parameters:
  ;   None.
  ; Returns:
  ;   None. Operates on "$newDesktopLink" and "$appExe".
  ; Example:
  ;   When the checkbox is selected, the installer recreates the desktop
  ;   shortcut, sets the AppUserModelID, and refreshes Explorer so the correct
  ;   icon appears right after setup finishes.
  !macro customInstall
    ${If} $CreateDesktopShortcutSelection == ${BST_CHECKED}
      Delete "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${Else}
      Delete "$newDesktopLink"
    ${EndIf}
    Call RefreshShellIcons
  !macroend
!endif
