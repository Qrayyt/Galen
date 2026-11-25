using System;
using System.Windows;

namespace GalenInstaller
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            // Command-line callers (including the existing updater) retain the
            // original Inno contract, exit code, language, logging and flags.
            if (e.Args.Length != 0)
            {
                int result = 1;
                try
                {
                    using (var backend = new InstallerBackend())
                    {
                        backend.Extract();
                        result = backend.Run(e.Args);
                    }
                }
                catch (Exception ex)
                {
                    InstallerBackend.WriteFailure(ex);
                    // Unattended invocations must never open a wrapper dialog.
                    if (!InstallerBackend.IsUnattended(e.Args))
                        MessageBox.Show("Не удалось запустить установку Galen.\n" + ex.Message,
                            "Galen", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                Shutdown(result);
                return;
            }
            var window = new MainWindow();
            MainWindow = window;
            window.Closed += (s, args) => Shutdown(window.ResultCode);
            window.Show();
        }
    }
}
