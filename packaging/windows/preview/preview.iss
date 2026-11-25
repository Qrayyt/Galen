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
  WIN_W = 680;
  WIN_H = 420;
  CLR_BG = $00292929;
  CLR_TEXT = $00F4F4F4;
  CLR_MUTED = $00B8B8B8;

var
  DemoTimer: UINT_PTR;
  DemoPct, DemoState: Integer;
  Page1, Page2, Page3: TPanel;
  DirEdit: TNewEdit;
  StatusLabel, PercentLabel: TNewStaticText;
  ProgressTrack, ProgressFill: TBitmapImage;
  InstallBtn, FinishBtn: TBitmapImage;
  CancelBtn: TNewButton;

procedure LoadBmp(Img: TBitmapImage; const FileName: string);
begin
  Img.Bitmap.LoadFromFile(ExpandConstant('{tmp}\') + FileName);
end;

function NewPanel: TPanel;
begin
  Result := TPanel.Create(WizardForm);
  Result.Parent := WizardForm;
  Result.Left := 0;
  Result.Top := 0;
  Result.Width := ScaleX(WIN_W);
  Result.Height := ScaleY(WIN_H);
  Result.Color := CLR_BG;
  Result.BevelOuter := bvNone;
  Result.Visible := False;
end;

function AddText(P: TPanel; const S: string; X,Y,W,H,Pt,Clr: Integer; Bold: Boolean): TNewStaticText;
begin
  Result := TNewStaticText.Create(P);
  Result.Parent := P;
  Result.AutoSize := False;
  Result.Left := ScaleX(X);
  Result.Top := ScaleY(Y);
  Result.Width := ScaleX(W);
  Result.Height := ScaleY(H);
  Result.Font.Name := 'Segoe UI';
  Result.Font.Size := Pt;
  Result.Font.Color := Clr;
  if Bold then Result.Font.Style := [fsBold];
  Result.Caption := S;
end;

function AddImage(P: TPanel; const FileName: string; X,Y,W,H: Integer): TBitmapImage;
begin
  Result := TBitmapImage.Create(P);
  Result.Parent := P;
  Result.Left := ScaleX(X);
  Result.Top := ScaleY(Y);
  Result.Width := ScaleX(W);
  Result.Height := ScaleY(H);
  Result.Stretch := True;
  LoadBmp(Result, FileName);
end;

function AddButton(P: TPanel; const S: string; X,Y,W,H: Integer): TNewButton;
begin
  Result := TNewButton.Create(P);
  Result.Parent := P;
  Result.Left := ScaleX(X);
  Result.Top := ScaleY(Y);
  Result.Width := ScaleX(W);
  Result.Height := ScaleY(H);
  Result.Caption := S;
  Result.Font.Name := 'Segoe UI';
  Result.Font.Size := 10;
end;

procedure AddCheck(P: TPanel; const S: string; Y: Integer; Initial: Boolean);
var C: TNewCheckBox;
begin
  C := TNewCheckBox.Create(P);
  C.Parent := P;
  C.Left := ScaleX(36);
  C.Top := ScaleY(Y);
  C.Width := ScaleX(470);
  C.Height := ScaleY(24);
  C.Caption := S;
  C.Font.Name := 'Segoe UI';
  C.Font.Size := 10;
  C.Checked := Initial;
end;

procedure AddBrand(P: TPanel);
begin
  AddImage(P, 'logo.bmp', 520, 48, 108, 116);
end;

procedure AddFooter(P: TPanel);
begin
  AddText(P, 'Galenite  /  Демоверсия', 36, 378, 245, 24, 9, CLR_MUTED, False);
end;

procedure ShowPage(P: TPanel);
begin
  Page1.Visible := (P = Page1);
  Page2.Visible := (P = Page2);
  Page3.Visible := (P = Page3);
  P.BringToFront;
end;

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
  PercentLabel.Caption := IntToStr(DemoPct) + '%';
  if DemoPct < 25 then StatusLabel.Caption := 'Подготовка компонентов...'
  else if DemoPct < 80 then StatusLabel.Caption := 'Распаковка файлов...'
  else if DemoPct < 95 then StatusLabel.Caption := 'Настройка приложения...'
  else StatusLabel.Caption := 'Завершение установки...';
  if DemoPct >= 100 then begin
    StopDemoTimer;
    DemoState := 2;
    ShowPage(Page3);
  end;
end;

procedure CloseDemo(Sender: TObject);
begin
  StopDemoTimer;
  WizardForm.Close;
end;

procedure StartDemo(Sender: TObject);
begin
  if DemoState <> 0 then Exit;
  DemoState := 1;
  DemoPct := 0;
  ProgressFill.Width := ScaleX(1);
  PercentLabel.Caption := '0%';
  StatusLabel.Caption := 'Подготовка компонентов...';
  ShowPage(Page2);
  DemoTimer := SetTimer(0, 0, 65, CreateCallback(@DemoTick));
  if DemoTimer = 0 then begin
    DemoState := 2;
    ShowPage(Page3);
  end;
end;

procedure BrowseClick(Sender: TObject);
var Dir: string;
begin
  Dir := DirEdit.Text;
  if BrowseForFolder('', Dir, False) then DirEdit.Text := Dir;
end;

procedure BuildWelcome;
var B: TNewButton;
begin
  Page1 := NewPanel;
  AddBrand(Page1);
  AddText(Page1, 'Установка Galen', 36, 40, 465, 42, 22, CLR_TEXT, True);
  AddText(Page1, 'Ваш персональный AI-ассистент.', 36, 94, 465, 30, 12, CLR_MUTED, False);
  AddText(Page1, 'Выберите параметры и начните установку.', 36, 125, 470, 24, 10, CLR_MUTED, False);

  AddText(Page1, 'Папка установки', 36, 175, 400, 24, 10, CLR_TEXT, True);
  DirEdit := TNewEdit.Create(Page1);
  DirEdit.Parent := Page1;
  DirEdit.Left := ScaleX(36);
  DirEdit.Top := ScaleY(201);
  DirEdit.Width := ScaleX(506);
  DirEdit.Height := ScaleY(30);
  DirEdit.Font.Name := 'Segoe UI';
  DirEdit.Font.Size := 10;
  DirEdit.Text := ExpandConstant('{localappdata}\Programs\Galen');
  B := AddButton(Page1, 'Обзор', 554, 198, 90, 32);
  B.OnClick := @BrowseClick;
  AddCheck(Page1, 'Создать ярлык на рабочем столе', 253, False);
  AddCheck(Page1, 'Добавить команду galen в PATH', 280, False);

  AddFooter(Page1);
  B := AddButton(Page1, 'Отмена', 394, 369, 104, 34);
  B.OnClick := @CloseDemo;
  InstallBtn := AddImage(Page1, 'install.bmp', 510, 369, 134, 34);
  InstallBtn.Cursor := crHand;
  InstallBtn.OnClick := @StartDemo;
end;

procedure BuildInstalling;
begin
  Page2 := NewPanel;
  AddBrand(Page2);
  AddText(Page2, 'Установка Galen', 36, 40, 465, 42, 22, CLR_TEXT, True);
  AddText(Page2, 'Ваш персональный AI-ассистент', 36, 110, 465, 30, 12, CLR_TEXT, True);
  AddText(Page2, 'Общайтесь с ИИ, работайте с файлами', 36, 147, 455, 26, 11, CLR_MUTED, False);
  AddText(Page2, 'и автоматизируйте повседневные задачи.', 36, 174, 455, 26, 11, CLR_MUTED, False);
  AddText(Page2, 'Подготавливаем Galen к первому запуску.', 36, 218, 510, 26, 10, CLR_MUTED, False);
  StatusLabel := AddText(Page2, '', 36, 294, 525, 26, 10, CLR_TEXT, False);
  PercentLabel := AddText(Page2, '0%', 600, 294, 44, 26, 10, CLR_TEXT, False);
  ProgressTrack := AddImage(Page2, 'track.bmp', 36, 326, 608, 4);
  ProgressFill := AddImage(Page2, 'fill.bmp', 36, 326, 1, 4);
  AddFooter(Page2);
  CancelBtn := AddButton(Page2, 'Отмена', 540, 369, 104, 34);
  CancelBtn.OnClick := @CloseDemo;
end;

procedure BuildFinished;
begin
  Page3 := NewPanel;
  AddBrand(Page3);
  AddText(Page3, 'Всё готово', 36, 40, 465, 42, 22, CLR_TEXT, True);
  AddText(Page3, 'Установка завершена.', 36, 110, 465, 30, 12, CLR_TEXT, True);
  AddText(Page3, 'Это визуальный прототип.', 36, 155, 490, 26, 11, CLR_MUTED, False);
  AddText(Page3, 'Приложение и ваши данные не изменены.', 36, 182, 500, 26, 11, CLR_MUTED, False);
  AddFooter(Page3);
  FinishBtn := AddImage(Page3, 'finish.bmp', 510, 369, 134, 34);
  FinishBtn.Cursor := crHand;
  FinishBtn.OnClick := @CloseDemo;
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
  ExtractTemporaryFile('logo.bmp');
  ExtractTemporaryFile('install.bmp');
  ExtractTemporaryFile('finish.bmp');
  ExtractTemporaryFile('track.bmp');
  ExtractTemporaryFile('fill.bmp');
  WizardForm.ClientWidth := ScaleX(WIN_W);
  WizardForm.ClientHeight := ScaleY(WIN_H);
  WizardForm.Color := CLR_BG;
  WizardForm.Position := poScreenCenter;
  WizardForm.Caption := 'Установка Galen';
  HideStockChrome;
  BuildWelcome;
  BuildInstalling;
  BuildFinished;
  ShowPage(Page1);
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
