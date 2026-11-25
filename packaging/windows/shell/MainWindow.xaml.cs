using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace GalenInstaller
{
    public partial class MainWindow : Window
    {
        private readonly DispatcherTimer ticker = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
        private InstallerBackend backend;
        private int state, displayedPercent = -1;
        private bool transitioning, closing;
        private string launchPath;
        internal int ResultCode { get; private set; } = 2; // cancelled before start

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public MainWindow()
        {
            InitializeComponent();
            ticker.Tick += Tick;
            Closed += (s,e) => { closing = true; ticker.Stop(); };
            Closing += OnClosing;
            SourceInitialized += (s,e) => {
                try { int rounded = 2; DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 33, ref rounded, sizeof(int)); }
                catch (DllNotFoundException) { } catch (EntryPointNotFoundException) { }
            };
        }

        private static DoubleAnimation Animation(double from, double to, int ms)
        {
            return new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(ms))
            { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }, FillBehavior = FillBehavior.HoldEnd };
        }

        private void EnterStage()
        {
            Stage.BeginAnimation(OpacityProperty, Animation(0, 1, 360));
            StageMove.BeginAnimation(TranslateTransform.YProperty, Animation(9, 0, 400));
        }

        private async Task ChangeStage(Action change)
        {
            Stage.BeginAnimation(OpacityProperty, Animation(1, 0, 160));
            StageMove.BeginAnimation(TranslateTransform.YProperty, Animation(0, -5, 160));
            await Task.Delay(175);
            if (closing) return;
            change();
            EnterStage();
        }

        private void StartPulse()
        {
            var pulse = new DoubleAnimation(1, 1.055, TimeSpan.FromMilliseconds(1700))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            LogoScale.BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
            LogoScale.BeginAnimation(ScaleTransform.ScaleYProperty, pulse);
            var glowPulse = new DoubleAnimation(0.58, 0.92, TimeSpan.FromMilliseconds(1700))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            Glow.BeginAnimation(OpacityProperty, glowPulse);
        }

        private void StopPulse()
        {
            LogoScale.BeginAnimation(ScaleTransform.ScaleXProperty, Animation(LogoScale.ScaleX, 1, 350));
            LogoScale.BeginAnimation(ScaleTransform.ScaleYProperty, Animation(LogoScale.ScaleY, 1, 350));
            Glow.BeginAnimation(OpacityProperty, Animation(Glow.Opacity, 0.72, 350));
        }

        private void ProgressTo(int value)
        {
            value = Math.Max(0, Math.Min(100, value));
            if (value <= displayedPercent) return;
            displayedPercent = value;
            Percent.Text = value + "%";
            ProgressScale.BeginAnimation(ScaleTransform.ScaleXProperty, Animation(ProgressScale.ScaleX, value / 100.0, 260));
        }

        private void Tick(object sender, EventArgs e)
        {
            if (backend == null || state != 1) return;
            try
            {
                if (!File.Exists(backend.ProgressFile)) return;
                string last = null;
                using (var file = new FileStream(backend.ProgressFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (var reader = new StreamReader(file))
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                        if (line.Length > 0) last = line;
                }
                int value;
                if (last == null || !int.TryParse(last, out value)) return;
                value = Math.Min(99, Math.Max(0, value));
                ProgressTo(value);
                string message = value < 5 ? "Подготовка компонентов" :
                    value < 95 ? "Установка файлов" : "Завершение установки";
                if (Status.Text != message)
                {
                    Status.Text = message;
                    Status.BeginAnimation(OpacityProperty, Animation(.35, 1, 220));
                }
            }
            catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private async Task Install(bool advanced)
        {
            if (state != 0 || transitioning || closing) return;
            state = 1; transitioning = true;
            PrimaryButton.IsEnabled = false;
            CloseButton.IsEnabled = false;
            OptionsButton.Visibility = Visibility.Collapsed;
            ResultCode = 1;
            string failure = null;
            try
            {
                await ChangeStage(() => {
                    Heading.Text = "Устанавливаем Galen";
                    Description.Text = advanced ? "Открываем параметры установки." : "Подготавливаем всё к первому запуску.";
                    PrimaryButton.Visibility = Visibility.Collapsed;
                    ProgressArea.Visibility = Visibility.Visible;
                    Status.Text = "Подготовка пакета"; Percent.Text = "";
                    ProgressScale.BeginAnimation(ScaleTransform.ScaleXProperty, null);
                    ProgressScale.ScaleX = 0; displayedPercent = -1;
                    StartPulse();
                });
                backend = new InstallerBackend();
                await Task.Run(() => backend.Extract());
                if (advanced)
                {
                    // Preserve the original installer’s complete directory,
                    // scope and task choices for users who need them.
                    Hide();
                    ResultCode = await Task.Run(() => backend.Run(new string[0]));
                    CloseButton.IsEnabled = true;
                    state = 3; transitioning = false;
                    backend.Dispose(); backend = null;
                    Close();
                    return;
                }
                Status.Text = "Подготовка компонентов";
                ticker.Start();
                ResultCode = await Task.Run(() => backend.RunDefault());
                ticker.Stop();
                if (ResultCode == 0)
                {
                    if (File.Exists(backend.AppPathFile))
                    {
                        try { launchPath = File.ReadAllText(backend.AppPathFile).Trim(); }
                        catch (IOException) { } catch (UnauthorizedAccessException) { }
                    }
                    ProgressTo(100);
                    await Task.Delay(350);
                }
                else
                    failure = "Код завершения: " + ResultCode + "\nЖурнал: " + backend.LogFile;
            }
            catch (Exception ex)
            {
                ResultCode = 1;
                InstallerBackend.WriteFailure(ex);
                failure = ex.Message;
            }
            finally
            {
                ticker.Stop();
                if (backend != null) { backend.Dispose(); backend = null; }
            }
            if (closing) return;
            if (!IsVisible) Show();
            StopPulse();
            await ChangeStage(() => {
                if (ResultCode == 0)
                {
                    Heading.Text = "Всё готово";
                    Description.Text = "Galen установлен.\\nМожно начинать работу.".Replace("\\n", "\n");
                    PrimaryButton.Content = !string.IsNullOrEmpty(launchPath) && File.Exists(launchPath) ? "Открыть Galen" : "Готово";
                }
                else
                {
                    Heading.Text = "Не удалось установить";
                    Description.Text = "Установка не завершена.\\nПодробности доступны в журнале.".Replace("\\n", "\n");
                    PrimaryButton.Content = "Закрыть";
                }
                ProgressArea.Visibility = Visibility.Collapsed;
                PrimaryButton.Visibility = Visibility.Visible;
                PrimaryButton.IsEnabled = true;
                CloseButton.IsEnabled = true;
                state = 3;
            });
            transitioning = false;
            if (failure != null)
                MessageBox.Show(this, failure, "Установка Galen", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        private async void PrimaryClick(object sender, RoutedEventArgs e)
        {
            if (state == 0) await Install(false);
            else if (state == 3)
            {
                if (ResultCode == 0 && !string.IsNullOrEmpty(launchPath) && File.Exists(launchPath))
                {
                    try { Process.Start(new ProcessStartInfo(launchPath) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(launchPath) }); }
                    catch (Exception ex) { MessageBox.Show(this, ex.Message, "Galen", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
                }
                Close();
            }
        }

        private async void OptionsClick(object sender, RoutedEventArgs e) { await Install(true); }
        // Never kill an installer in the middle of replacing program files.
        private void OnClosing(object sender, CancelEventArgs e) { if (state == 1 || transitioning) e.Cancel = true; }
        private void DragHeader(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left && e.ButtonState == MouseButtonState.Pressed)
            { try { DragMove(); } catch (InvalidOperationException) { } }
        }

        private void CloseClick(object sender, RoutedEventArgs e) => Close();
        private void OnKeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) Close(); }
        private void OnLoaded(object sender, RoutedEventArgs e) { EnterStage(); }
    }
}
