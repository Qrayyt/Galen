using System;
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
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace GalenInstaller
{
    public partial class MainWindow : Window
    {
        private readonly DispatcherTimer ticker = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(70) };
        private readonly Stopwatch elapsed = new Stopwatch();
        private const double DurationMs = 7600;
        private int state, statusIndex = -1;
        private bool transitioning, closing;
        private readonly bool smoke = Environment.GetCommandLineArgs().Contains("--smoke-test");
        private readonly string[] messages = { "Подготовка компонентов", "Распаковка файлов", "Настройка приложения", "Завершение установки" };

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public MainWindow()
        {
            InitializeComponent();
            ticker.Tick += Tick;
            Closed += (s,e) => { closing = true; ticker.Stop(); elapsed.Stop(); };
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
            double x = LogoScale.ScaleX, y = LogoScale.ScaleY, o = Glow.Opacity;
            LogoScale.BeginAnimation(ScaleTransform.ScaleXProperty, Animation(x, 1, 350));
            LogoScale.BeginAnimation(ScaleTransform.ScaleYProperty, Animation(y, 1, 350));
            Glow.BeginAnimation(OpacityProperty, Animation(o, 0.72, 350));
        }

        private async Task StartDemo()
        {
            if (state != 0 || transitioning || closing) return;
            transitioning = true;
            PrimaryButton.IsEnabled = false;
            await ChangeStage(() => {
                state = 1;
                Heading.Text = "Устанавливаем Galen";
                Description.Text = "Подготавливаем всё к первому запуску.";
                PrimaryButton.Visibility = Visibility.Collapsed;
                ProgressArea.Visibility = Visibility.Visible;
                Status.Text = messages[0]; statusIndex = 0; Percent.Text = "0%";
                ProgressScale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(DurationMs)) { FillBehavior = FillBehavior.HoldEnd });
                StartPulse();
                elapsed.Restart();
                ticker.Start();
            });
            transitioning = false;
        }

        private async void Tick(object sender, EventArgs e)
        {
            if (state != 1 || closing) return;
            var fraction = Math.Min(1, elapsed.Elapsed.TotalMilliseconds / DurationMs);
            Percent.Text = Math.Min(100, (int)(fraction * 100)) + "%";
            int index = fraction < .2 ? 0 : fraction < .68 ? 1 : fraction < .90 ? 2 : 3;
            if (index != statusIndex)
            {
                statusIndex = index;
                Status.Text = messages[index];
                Status.BeginAnimation(OpacityProperty, Animation(.35, 1, 220));
            }
            if (fraction < 1) return;
            ticker.Stop(); elapsed.Stop();
            Percent.Text = "100%";
            state = 2;
            await Task.Delay(280);
            if (closing) return;
            StopPulse();
            await ChangeStage(() => {
                Heading.Text = "Всё готово";
                Description.Text = "Демонстрация завершена.\nGalen и ваши данные не изменены.";
                ProgressArea.Visibility = Visibility.Collapsed;
                PrimaryButton.Content = "Готово";
                PrimaryButton.Visibility = Visibility.Visible;
                PrimaryButton.IsEnabled = true;
                state = 3;
            });
        }

        private async void PrimaryClick(object sender, RoutedEventArgs e)
        {
            if (state == 0) await StartDemo();
            else if (state == 3) Close();
        }

        private void DragHeader(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left && e.ButtonState == MouseButtonState.Pressed)
            { try { DragMove(); } catch (InvalidOperationException) { } }
        }

        private void CloseClick(object sender, RoutedEventArgs e) => Close();
        private void OnKeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) Close(); }

        private void Capture(string name)
        {
            Root.UpdateLayout();
            var dpi = VisualTreeHelper.GetDpi(Root);
            var bitmap = new RenderTargetBitmap(
                (int)Math.Ceiling(Root.ActualWidth * dpi.DpiScaleX),
                (int)Math.Ceiling(Root.ActualHeight * dpi.DpiScaleY),
                dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
            bitmap.Render(Root);
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (var file = File.Create(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, name))) encoder.Save(file);
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            EnterStage();
            if (!smoke) return;
            try
            {
                await Task.Delay(550); Capture("01-welcome.png");
                await StartDemo(); await Task.Delay(3400);
                if (state != 1 || elapsed.ElapsedMilliseconds < 1000) throw new InvalidOperationException("Progress did not advance");
                Capture("02-installing.png");
                for (int i=0; i<150 && state!=3; i++) await Task.Delay(100);
                if (state != 3) throw new InvalidOperationException("Demo did not reach completion");
                await Task.Delay(500); Capture("03-finished.png");
                Application.Current.Shutdown(0);
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smoke-error.txt"), ex.ToString());
                Application.Current.Shutdown(1);
            }
        }
    }
}
