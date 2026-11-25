; Based on Windows Setup Shell (MIT), MrUmid2oo4; see LICENSE.upstream.
; Visual preview ONLY. No payload, no registry, no shortcuts, no install stage.
#define MyAppName "Galen"
#define MyRequiredMB "0"
[Setup]
AppId=Galen-Installer-Visual-Preview
AppName=Galen Installer Preview
AppVersion=1.0.0
AppPublisher=Galenite
CreateAppDir=no
DefaultDirName={tmp}\GalenVisualPreview
Uninstallable=no
CreateUninstallRegKey=no
DisableWelcomePage=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
ChangesEnvironment=no
PrivilegesRequired=lowest
MinVersion=10.0
OutputDir=out
OutputBaseFilename=Galen-Installer-Visual-Preview
SetupIconFile=..\..\..\assets\galen-brand\icon.ico
WizardStyle=modern dark hidebevels includetitlebar
WizardSizePercent=100
ShowLanguageDialog=no
Compression=lzma2/max
SolidCompression=yes
[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
[Files]
Source: "ui\generated\*.bmp"; Flags: dontcopy
[Code]

const
  WIN_W  = 1024;
  WIN_H  = 640;
  LEFT_W = 400;
  BAR_H  = 52;
  BAR_Y  = 588;
  RP_PAD = 36;

  CLR_BG     = $00101010;
  CLR_PANEL  = $00181818;
  CLR_BAR    = $00101010;
  CLR_ACCENT = $00CCCCCC; { BGR — overwritten visually by generated BMPs }
  CLR_CREAM  = $00F2F2F2;
  CLR_MUTED  = $00AAAAAA;
  CLR_INPUT  = $00222222;
  CLR_BORDER = $00333333;

var
  IsRussian: Boolean;
  DemoTimer: UINT_PTR;
  DemoPct: Integer;
  DemoState: Integer;
  HeroWelcome, HeroInstalling, HeroFinished: string;
  BmpInstall, BmpNext, BmpLaunch: string;
  Hero: TBitmapImage;
  RightPanel: TPanel;
  Page1: TPanel;
  DirEdit: TNewEdit;
  BrowseBtn: TNewButton;
  SpaceLabel: TNewStaticText;
  LangCombo: TNewComboBox;
  DesktopChk: TNewCheckBox;
  StartMenuChk: TNewCheckBox;
  Page2: TPanel;
  P2Status: TNewStaticText;
  ProgressTrack: TBitmapImage;
  ProgressFill: TBitmapImage;
  PctLabel: TNewStaticText;
  Page3: TPanel;
  LaunchChk: TNewCheckBox;
  BottomBar: TPanel;
  BottomSep: TPanel;
  HelpLbl: TNewStaticText;
  CancelLbl: TNewStaticText;
  NextBtn: TBitmapImage;
  LaunchBtn: TBitmapImage;

procedure LoadBmp(Img: TBitmapImage; const FileName: string);
begin
  Img.Bitmap.LoadFromFile(ExpandConstant('{tmp}\') + FileName);
end;

procedure StylePanel(P: TPanel; Clr: Integer);
begin
  P.Color := Clr;
  P.BevelOuter := bvNone;
end;

procedure StyleLabel(L: TNewStaticText; Clr: Integer; Bold: Boolean; SizePt: Integer);
begin
  L.Font.Color := Clr;
  L.Font.Size := SizePt;
  L.Font.Name := 'Segoe UI';
  if Bold then L.Font.Style := [fsBold] else L.Font.Style := [];
end;

procedure StyleEdit(E: TNewEdit);
begin
  E.Color := CLR_INPUT;
  E.Font.Color := CLR_CREAM;
  E.Font.Name := 'Segoe UI';
  E.Font.Size := 10;
end;

procedure StyleCheckBox(C: TNewCheckBox; Clr: Integer);
begin
  C.Font.Color := Clr;
  C.Font.Name := 'Segoe UI';
  C.Font.Size := 10;
end;

function RW: Integer;
begin
  Result := ScaleX(WIN_W - LEFT_W) - 2 * ScaleX(RP_PAD);
end;

procedure AddHeading(Parent: TPanel; const Caption: string; X, Y, W: Integer);
var
  L: TNewStaticText;
begin
  L := TNewStaticText.Create(Parent);
  L.Parent := Parent;
  L.Left := X;
  L.Top := Y;
  L.Width := W;
  L.Caption := Caption;
  StyleLabel(L, CLR_CREAM, True, 10);
end;

procedure UpdateSpaceLabel;
var
  Free, Total: Cardinal;
  GB: Extended;
  S: string;
begin
  if not GetSpaceOnDisk(DirEdit.Text, True, Total, Free) then Free := 0;
  if Free = 0 then S := '-'
  else begin
    GB := Free / 1024;
    S := Format('%.1f', [GB]);
    if IsRussian then S := S + ' ГБ' else S := S + ' GB';
  end;
  if IsRussian then
    SpaceLabel.Caption := 'Требуется: ~{#MyRequiredMB} МБ    |    Доступно: ' + S
  else
    SpaceLabel.Caption := 'Required: ~{#MyRequiredMB} MB    |    Available: ' + S;
end;

procedure OnBrowseClick(Sender: TObject);
var
  Dir: string;
begin
  Dir := DirEdit.Text;
  if BrowseForFolder('', Dir, False) then begin
    DirEdit.Text := Dir;
    UpdateSpaceLabel;
  end;
end;

procedure ShowInstalling; forward;
procedure ShowFinished; forward;
function SetTimer(hWnd: HWND; nIDEvent: UINT_PTR; uElapse: UINT; lpTimerFunc: LongWord): UINT_PTR;
  external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd: HWND; nIDEvent: UINT_PTR): BOOL;
  external 'KillTimer@user32.dll stdcall';

procedure StopDemoTimer;
begin
  if DemoTimer <> 0 then begin
    KillTimer(0, DemoTimer);
    DemoTimer := 0;
  end;
end;

procedure DemoTick(Arg1: HWND; Arg2: UINT; Arg3: UINT_PTR; Arg4: DWORD);
begin
  if DemoState <> 1 then Exit;
  Inc(DemoPct);
  ProgressFill.Width := (ProgressTrack.Width * DemoPct) div 100;
  PctLabel.Caption := IntToStr(DemoPct) + '%';
  if DemoPct < 25 then P2Status.Caption := 'Подготовка компонентов...'
  else if DemoPct < 80 then P2Status.Caption := 'Распаковка файлов...'
  else if DemoPct < 95 then P2Status.Caption := 'Настройка приложения...'
  else P2Status.Caption := 'Завершение установки...';
  if DemoPct >= 100 then begin
    StopDemoTimer;
    DemoState := 2;
    ShowFinished;
  end;
end;

procedure OnHelpClick(Sender: TObject);
begin
  MsgBox('Это визуальный прототип Galen. Приложение не устанавливается.', mbInformation, MB_OK);
end;

procedure OnCancelClick(Sender: TObject);
begin
  WizardForm.Close;
end;

procedure OnNextClick(Sender: TObject);
begin
  if DemoState <> 0 then Exit;
  DemoState := 1;
  DemoPct := 0;
  ProgressFill.Width := ScaleX(1);
  PctLabel.Caption := '0%';
  P2Status.Caption := 'Подготовка компонентов...';
  ShowInstalling;
  DemoTimer := SetTimer(0, 0, 65, CreateCallback(@DemoTick));
  if DemoTimer = 0 then begin
    DemoState := 2;
    ShowFinished;
  end;
end;

procedure OnLaunchClick(Sender: TObject);
begin
  WizardForm.Close;
end;

procedure ShowPage(P: TPanel);
begin
  Page1.Visible := (P = Page1);
  Page2.Visible := (P = Page2);
  Page3.Visible := (P = Page3);
end;

procedure ShowWelcome;
begin
  LoadBmp(Hero, HeroWelcome);
  ShowPage(Page1);
  NextBtn.Visible := True;
  LaunchBtn.Visible := False;
  CancelLbl.Visible := True;
end;

procedure ShowInstalling;
begin
  LoadBmp(Hero, HeroInstalling);
  ShowPage(Page2);
  NextBtn.Visible := False;
  LaunchBtn.Visible := False;
  CancelLbl.Visible := True;
end;

procedure ShowFinished;
begin
  LoadBmp(Hero, HeroFinished);
  ShowPage(Page3);
  NextBtn.Visible := False;
  LaunchBtn.Visible := True;
  CancelLbl.Visible := False;
end;

procedure BuildPage1;
var
  Lbl: TNewStaticText;
  Sep: TPanel;
  W: Integer;
begin
  W := RW;
  Page1 := TPanel.Create(RightPanel);
  Page1.Parent := RightPanel;
  Page1.Left := 0; Page1.Top := 0;
  Page1.Width := RightPanel.Width; Page1.Height := ScaleY(BAR_Y);
  StylePanel(Page1, CLR_PANEL);

  Lbl := TNewStaticText.Create(Page1);
  Lbl.Parent := Page1; Lbl.Left := ScaleX(RP_PAD); Lbl.Top := ScaleY(44); Lbl.Width := W;
  if IsRussian then Lbl.Caption := 'Параметры установки' else Lbl.Caption := 'Installation options';
  StyleLabel(Lbl, CLR_CREAM, True, 15);

  Lbl := TNewStaticText.Create(Page1);
  Lbl.Parent := Page1; Lbl.Left := ScaleX(RP_PAD); Lbl.Top := ScaleY(80); Lbl.Width := W;
  if IsRussian then Lbl.Caption := 'Выберите папку и другие параметры (демо)'
               else Lbl.Caption := 'Choose the install folder and other options';
  StyleLabel(Lbl, CLR_MUTED, False, 10);

  Sep := TPanel.Create(Page1); Sep.Parent := Page1;
  Sep.Left := ScaleX(RP_PAD); Sep.Top := ScaleY(108); Sep.Width := W; Sep.Height := 1;
  StylePanel(Sep, CLR_BORDER);

  if IsRussian then AddHeading(Page1, 'Папка установки', ScaleX(RP_PAD), ScaleY(124), W)
               else AddHeading(Page1, 'Install folder', ScaleX(RP_PAD), ScaleY(124), W);

  DirEdit := TNewEdit.Create(Page1);
  DirEdit.Parent := Page1;
  DirEdit.Left := ScaleX(RP_PAD); DirEdit.Top := ScaleY(146);
  DirEdit.Width := W - ScaleX(90); DirEdit.Height := ScaleY(34);
  DirEdit.Text := ExpandConstant('{localappdata}\Programs\Galen');
  StyleEdit(DirEdit);

  BrowseBtn := TNewButton.Create(Page1);
  BrowseBtn.Parent := Page1;
  BrowseBtn.Left := DirEdit.Left + DirEdit.Width + ScaleX(8);
  BrowseBtn.Top := ScaleY(146); BrowseBtn.Width := ScaleX(80); BrowseBtn.Height := ScaleY(34);
  BrowseBtn.OnClick := @OnBrowseClick;
  if IsRussian then BrowseBtn.Caption := 'Обзор' else BrowseBtn.Caption := 'Browse';

  SpaceLabel := TNewStaticText.Create(Page1);
  SpaceLabel.Parent := Page1;
  SpaceLabel.Left := ScaleX(RP_PAD); SpaceLabel.Top := ScaleY(188); SpaceLabel.Width := W;
  StyleLabel(SpaceLabel, CLR_MUTED, False, 9);
  UpdateSpaceLabel;

  if IsRussian then AddHeading(Page1, 'Язык интерфейса', ScaleX(RP_PAD), ScaleY(224), W)
               else AddHeading(Page1, 'Interface language', ScaleX(RP_PAD), ScaleY(224), W);

  LangCombo := TNewComboBox.Create(Page1);
  LangCombo.Parent := Page1;
  LangCombo.Left := ScaleX(RP_PAD); LangCombo.Top := ScaleY(246); LangCombo.Width := W;
  LangCombo.Style := csDropDownList;
  LangCombo.Items.Add('Русский');
  { Russian preview only }
  if IsRussian then LangCombo.ItemIndex := 0 else LangCombo.ItemIndex := 1;

  Sep := TPanel.Create(Page1); Sep.Parent := Page1;
  Sep.Left := ScaleX(RP_PAD); Sep.Top := ScaleY(296); Sep.Width := W; Sep.Height := 1;
  StylePanel(Sep, CLR_BORDER);

  if IsRussian then AddHeading(Page1, 'Создать ярлыки', ScaleX(RP_PAD), ScaleY(310), W)
               else AddHeading(Page1, 'Create shortcuts', ScaleX(RP_PAD), ScaleY(310), W);

  DesktopChk := TNewCheckBox.Create(Page1);
  DesktopChk.Parent := Page1;
  DesktopChk.Left := ScaleX(RP_PAD); DesktopChk.Top := ScaleY(334); DesktopChk.Width := W;
  DesktopChk.Checked := False; StyleCheckBox(DesktopChk, CLR_CREAM);
  if IsRussian then DesktopChk.Caption := 'Создать ярлык на рабочем столе'
               else DesktopChk.Caption := 'Create a desktop shortcut';

  StartMenuChk := TNewCheckBox.Create(Page1);
  StartMenuChk.Parent := Page1;
  StartMenuChk.Left := ScaleX(RP_PAD); StartMenuChk.Top := ScaleY(362); StartMenuChk.Width := W;
  StartMenuChk.Checked := True; StyleCheckBox(StartMenuChk, CLR_CREAM);
  if IsRussian then StartMenuChk.Caption := 'Создать ярлык в меню «Пуск»'
               else StartMenuChk.Caption := 'Create a Start Menu shortcut';
end;

procedure BuildPage2;
var
  Heading: TNewStaticText;
  TrackTop, TrackW: Integer;
begin
  TrackW := RW;
  Page2 := TPanel.Create(RightPanel);
  Page2.Parent := RightPanel;
  Page2.Left := 0; Page2.Top := 0;
  Page2.Width := RightPanel.Width; Page2.Height := ScaleY(BAR_Y);
  Page2.Visible := False; StylePanel(Page2, CLR_PANEL);

  Heading := TNewStaticText.Create(Page2);
  Heading.Parent := Page2; Heading.Left := ScaleX(RP_PAD); Heading.Top := ScaleY(60); Heading.Width := TrackW;
  if IsRussian then Heading.Caption := 'Установка Galen' else Heading.Caption := 'Installing...';
  StyleLabel(Heading, CLR_CREAM, True, 15);

  P2Status := TNewStaticText.Create(Page2);
  P2Status.Parent := Page2; P2Status.Left := ScaleX(RP_PAD); P2Status.Top := ScaleY(100); P2Status.Width := TrackW;
  P2Status.Caption := ''; StyleLabel(P2Status, CLR_MUTED, False, 9);

  TrackTop := ScaleY(130);
  ProgressTrack := TBitmapImage.Create(Page2);
  ProgressTrack.Parent := Page2;
  ProgressTrack.Left := ScaleX(RP_PAD); ProgressTrack.Top := TrackTop;
  ProgressTrack.Width := TrackW; ProgressTrack.Height := ScaleY(6);
  ProgressTrack.Stretch := True; LoadBmp(ProgressTrack, 'progress-track.bmp');

  ProgressFill := TBitmapImage.Create(Page2);
  ProgressFill.Parent := Page2;
  ProgressFill.Left := ScaleX(RP_PAD); ProgressFill.Top := TrackTop;
  ProgressFill.Width := ScaleX(8); ProgressFill.Height := ScaleY(4);
  ProgressFill.Stretch := True; LoadBmp(ProgressFill, 'progress-fill.bmp');

  PctLabel := TNewStaticText.Create(Page2);
  PctLabel.Parent := Page2;
  PctLabel.Left := ScaleX(RP_PAD); PctLabel.Top := TrackTop + ScaleY(12); PctLabel.Width := ScaleX(80);
  PctLabel.Caption := '0%'; StyleLabel(PctLabel, CLR_MUTED, False, 9);
end;

procedure BuildPage3;
var
  Heading, Body: TNewStaticText;
  W: Integer;
begin
  W := RW;
  Page3 := TPanel.Create(RightPanel);
  Page3.Parent := RightPanel;
  Page3.Left := 0; Page3.Top := 0;
  Page3.Width := RightPanel.Width; Page3.Height := ScaleY(BAR_Y);
  Page3.Visible := False; StylePanel(Page3, CLR_PANEL);

  Heading := TNewStaticText.Create(Page3);
  Heading.Parent := Page3; Heading.Left := ScaleX(RP_PAD); Heading.Top := ScaleY(60); Heading.Width := W;
  if IsRussian then Heading.Caption := 'Готово!' else Heading.Caption := 'Done!';
  StyleLabel(Heading, CLR_CREAM, True, 22);

  Body := TNewStaticText.Create(Page3);
  Body.Parent := Page3; Body.Left := ScaleX(RP_PAD); Body.Top := ScaleY(110); Body.Width := W;
  if IsRussian then Body.Caption := 'Демонстрация завершена. Galen не установлен.'
               else Body.Caption := '{#MyAppName} is installed. You can launch it now.';
  StyleLabel(Body, CLR_MUTED, False, 11);

  LaunchChk := TNewCheckBox.Create(Page3);
  LaunchChk.Parent := Page3;
  LaunchChk.Left := ScaleX(RP_PAD); LaunchChk.Top := ScaleY(160); LaunchChk.Width := W;
  LaunchChk.Checked := True; LaunchChk.Enabled := False; StyleCheckBox(LaunchChk, CLR_CREAM);
  if IsRussian then LaunchChk.Caption := 'Открыть Galen (демо)'
               else LaunchChk.Caption := 'Open {#MyAppName}';
end;

procedure BuildBottomBar;
var
  BtnW, BtnH, CenterY: Integer;
begin
  BtnW := ScaleX(206); BtnH := ScaleY(48);
  CenterY := (ScaleY(BAR_H) - BtnH) div 2;

  BottomSep := TPanel.Create(WizardForm);
  BottomSep.Parent := WizardForm;
  BottomSep.Left := 0; BottomSep.Top := ScaleY(BAR_Y);
  BottomSep.Width := ScaleX(WIN_W); BottomSep.Height := 1;
  StylePanel(BottomSep, CLR_BORDER);

  BottomBar := TPanel.Create(WizardForm);
  BottomBar.Parent := WizardForm;
  BottomBar.Left := 0; BottomBar.Top := ScaleY(BAR_Y) + 1;
  BottomBar.Width := ScaleX(WIN_W); BottomBar.Height := ScaleY(BAR_H) - 1;
  StylePanel(BottomBar, CLR_BAR);

  HelpLbl := TNewStaticText.Create(BottomBar);
  HelpLbl.Parent := BottomBar; HelpLbl.AutoSize := True; HelpLbl.Cursor := crHand;
  HelpLbl.OnClick := @OnHelpClick;
  if IsRussian then HelpLbl.Caption := 'Galenite  ·  Демо' else HelpLbl.Caption := '?  Help';
  StyleLabel(HelpLbl, CLR_MUTED, False, 10);
  HelpLbl.Left := ScaleX(24);
  HelpLbl.Top := CenterY + (BtnH - ScaleY(16)) div 2;

  CancelLbl := TNewStaticText.Create(BottomBar);
  CancelLbl.Parent := BottomBar; CancelLbl.AutoSize := True; CancelLbl.Cursor := crHand;
  CancelLbl.OnClick := @OnCancelClick;
  if IsRussian then CancelLbl.Caption := 'Отмена' else CancelLbl.Caption := 'Cancel';
  StyleLabel(CancelLbl, CLR_MUTED, False, 10);
  CancelLbl.Top := HelpLbl.Top;
  CancelLbl.Left := ScaleX(WIN_W) - BtnW - ScaleX(RP_PAD) - ScaleX(100);

  NextBtn := TBitmapImage.Create(BottomBar);
  NextBtn.Parent := BottomBar;
  NextBtn.Width := BtnW; NextBtn.Height := BtnH; NextBtn.Stretch := True;
  NextBtn.Cursor := crHand; NextBtn.OnClick := @OnNextClick;
  NextBtn.Left := ScaleX(WIN_W) - BtnW - ScaleX(RP_PAD); NextBtn.Top := CenterY;
  LoadBmp(NextBtn, BmpInstall);

  LaunchBtn := TBitmapImage.Create(BottomBar);
  LaunchBtn.Parent := BottomBar;
  LaunchBtn.Width := BtnW; LaunchBtn.Height := BtnH; LaunchBtn.Stretch := True;
  LaunchBtn.Cursor := crHand; LaunchBtn.OnClick := @OnLaunchClick;
  LaunchBtn.Left := NextBtn.Left; LaunchBtn.Top := CenterY; LaunchBtn.Visible := False;
  LoadBmp(LaunchBtn, BmpLaunch);
end;

procedure HideStockChrome;
begin
  WizardForm.OuterNotebook.Hide;
  WizardForm.InnerNotebook.Hide;
  WizardForm.MainPanel.Hide;
  WizardForm.Bevel.Hide;
  WizardForm.NextButton.Visible := False;
  WizardForm.BackButton.Visible := False;
  WizardForm.CancelButton.Visible := False;
  if WizardForm.BeveledLabel <> nil then WizardForm.BeveledLabel.Visible := False;
  WizardForm.NextButton.Left := WizardForm.ClientWidth + ScaleX(80);
  WizardForm.BackButton.Left := WizardForm.ClientWidth + ScaleX(80);
  WizardForm.CancelButton.Left := WizardForm.ClientWidth + ScaleX(80);
end;

procedure InitializeWizard;
begin
  if WizardSilent then Exit;

  IsRussian := True;
  if IsRussian then begin
    HeroWelcome := 'hero-welcome-ru.bmp';
    HeroInstalling := 'hero-installing-ru.bmp';
    HeroFinished := 'hero-finished-ru.bmp';
    BmpInstall := 'btn-install-ru.bmp';
    BmpNext := 'btn-next-ru.bmp';
    BmpLaunch := 'btn-launch-ru.bmp';
  end else begin
    HeroWelcome := 'hero-welcome-en.bmp';
    HeroInstalling := 'hero-installing-en.bmp';
    HeroFinished := 'hero-finished-en.bmp';
    BmpInstall := 'btn-install-en.bmp';
    BmpNext := 'btn-next-en.bmp';
    BmpLaunch := 'btn-launch-en.bmp';
  end;

  ExtractTemporaryFile(HeroWelcome);
  ExtractTemporaryFile(HeroInstalling);
  ExtractTemporaryFile(HeroFinished);
  ExtractTemporaryFile(BmpInstall);
  ExtractTemporaryFile(BmpNext);
  ExtractTemporaryFile(BmpLaunch);
  ExtractTemporaryFile('progress-track.bmp');
  ExtractTemporaryFile('progress-fill.bmp');

  WizardForm.ClientWidth := ScaleX(WIN_W);
  WizardForm.ClientHeight := ScaleY(WIN_H);
  WizardForm.Color := CLR_BG;
  WizardForm.Position := poScreenCenter;
  WizardForm.Caption := 'Galen — визуальный прототип';

  HideStockChrome;

  Hero := TBitmapImage.Create(WizardForm);
  Hero.Parent := WizardForm;
  Hero.Left := 0; Hero.Top := 0;
  Hero.Width := ScaleX(LEFT_W); Hero.Height := ScaleY(WIN_H);
  Hero.Stretch := True; Hero.Enabled := False;
  LoadBmp(Hero, HeroWelcome);

  RightPanel := TPanel.Create(WizardForm);
  RightPanel.Parent := WizardForm;
  RightPanel.Left := ScaleX(LEFT_W); RightPanel.Top := 0;
  RightPanel.Width := ScaleX(WIN_W - LEFT_W); RightPanel.Height := ScaleY(WIN_H);
  StylePanel(RightPanel, CLR_PANEL);

  BuildPage1; BuildPage2; BuildPage3; BuildBottomBar;
  RightPanel.BringToFront; BottomSep.BringToFront; BottomBar.BringToFront;
  ShowWelcome;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  HideStockChrome;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := False;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  Cancel := True;
  Confirm := False;
end;

procedure DeinitializeSetup;
begin
  StopDemoTimer;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := 'Visual preview only. Installation is disabled.';
end;

function InitializeSetup(): Boolean;
begin
  Result := not WizardSilent;
end;
