using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

namespace GalenInstaller
{
    // Format: original WPF PE, unchanged Inno EXE, 8-byte magic, Int64 LE
    // payload length, SHA-256 (32 bytes). Streaming keeps memory bounded.
    // If the outer PE is Authenticode-signed, its certificate table is after
    // the overlay; allow up to seven alignment bytes before that table.
    internal sealed class InstallerBackend : IDisposable
    {
        private static readonly byte[] Magic = Encoding.ASCII.GetBytes("GLNTIS01");
        private const int FooterSize = 48;
        private const int BufferSize = 1024 * 1024;
        private readonly string directory;
        internal string ProgressFile { get { return Path.Combine(directory, "progress.txt"); } }
        internal string AppPathFile { get { return Path.Combine(directory, "app-path.txt"); } }
        internal string LogFile { get { return Path.Combine(directory, "setup.log"); } }
        private string Exe { get { return Path.Combine(directory, "Galen-Setup-Engine.exe"); } }
        private bool keepLog;

        internal InstallerBackend()
        {
            directory = Path.Combine(Path.GetTempPath(), "GalenSetup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
        }

        private static long OverlayEnd(FileStream input)
        {
            using (var reader = new BinaryReader(input, Encoding.UTF8, true))
            {
                input.Position = 0x3c;
                long pe = reader.ReadUInt32();
                if (pe < 0x40 || pe > input.Length - 152) throw new InvalidDataException("Invalid setup PE");
                input.Position = pe;
                if (reader.ReadUInt32() != 0x4550) throw new InvalidDataException("Invalid setup PE");
                long optional = pe + 24;
                input.Position = optional;
                int kind = reader.ReadUInt16();
                int tableOffset = kind == 0x20b ? 112 : kind == 0x10b ? 96 : -1;
                if (tableOffset < 0) throw new InvalidDataException("Invalid PE optional header");
                input.Position = optional + tableOffset + 8 * 4;
                long certificate = reader.ReadUInt32(), certificateSize = reader.ReadUInt32();
                if (certificate == 0 && certificateSize == 0) return input.Length;
                if (certificate <= optional || certificateSize <= 0 || certificate > input.Length - certificateSize)
                    throw new InvalidDataException("Invalid setup signature table");
                return certificate;
            }
        }

        internal void Extract()
        {
            string self = Assembly.GetExecutingAssembly().Location;
            using (var input = File.Open(self, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var reader = new BinaryReader(input, Encoding.UTF8, true))
            {
                long end = OverlayEnd(input);
                long start = -1, length = 0;
                byte[] expected = null;
                for (int pad = 0; pad <= 7; pad++)
                {
                    long footer = end - FooterSize - pad;
                    if (footer < 0) break;
                    input.Position = footer;
                    if (!reader.ReadBytes(8).SequenceEqual(Magic)) continue;
                    length = reader.ReadInt64();
                    expected = reader.ReadBytes(32);
                    if (length > 0 && length < footer && expected.Length == 32)
                    {
                        start = footer - length;
                        break;
                    }
                }
                if (start < 0) throw new InvalidDataException("В установщике отсутствует пакет Galen.");
                input.Position = start;
                using (var output = new FileStream(Exe, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                using (var hash = SHA256.Create())
                {
                    var buffer = new byte[BufferSize];
                    long remaining = length;
                    while (remaining > 0)
                    {
                        int n = input.Read(buffer, 0, (int)Math.Min(remaining, buffer.Length));
                        if (n <= 0) throw new EndOfStreamException();
                        output.Write(buffer, 0, n);
                        hash.TransformBlock(buffer, 0, n, buffer, 0);
                        remaining -= n;
                    }
                    hash.TransformFinalBlock(new byte[0], 0, 0);
                    if (!hash.Hash.SequenceEqual(expected))
                        throw new InvalidDataException("Контрольная сумма пакета Galen не совпадает.");
                }
            }
        }

        // Windows CRT command-line quoting. Preserves spaces, embedded quotes
        // and trailing backslashes (notably /DIR and /LOG from older clients).
        internal static string Quote(string value)
        {
            var result = new StringBuilder("\"");
            int slash = 0;
            foreach (char c in value)
            {
                if (c == '\\') { slash++; continue; }
                if (c == '"') { result.Append('\\', slash * 2 + 1); result.Append(c); }
                else { result.Append('\\', slash); result.Append(c); }
                slash = 0;
            }
            result.Append('\\', slash * 2).Append('"');
            return result.ToString();
        }

        internal static bool IsUnattended(string[] args)
        {
            return args.Any(a => a.Equals("/SILENT", StringComparison.OrdinalIgnoreCase) ||
                a.Equals("/VERYSILENT", StringComparison.OrdinalIgnoreCase) ||
                a.Equals("/SUPPRESSMSGBOXES", StringComparison.OrdinalIgnoreCase));
        }

        internal int Run(string[] args)
        {
            var info = new ProcessStartInfo(Exe, string.Join(" ", args.Select(Quote)))
            {
                UseShellExecute = false,
                WorkingDirectory = directory
            };
            // Preserve the caller's working directory for external arguments
            // such as relative /LOG, /LOADINF or /SAVEINF paths.
            info.WorkingDirectory = Environment.CurrentDirectory;
            using (var process = Process.Start(info))
            {
                if (process == null) throw new InvalidOperationException("Не удалось запустить движок установки.");
                process.WaitForExit();
                int code = process.ExitCode;
                if (code != 0) keepLog = true;
                return code;
            }
        }

        internal int RunDefault()
        {
            return Run(new[] { "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART",
                "/GALENPROGRESS=" + ProgressFile, "/GALENAPPPATH=" + AppPathFile, "/LOG=" + LogFile });
        }

        internal static void WriteFailure(Exception ex)
        {
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GalenData", "logs");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "setup-wrapper.log"), DateTime.UtcNow.ToString("o") + " " + ex + Environment.NewLine);
            }
            catch { }
        }

        public void Dispose()
        {
            // The backend has exited. Keep an explicitly named diagnostic log
            // on failure, but never keep the half-gigabyte executable.
            try { File.Delete(Exe); } catch { }
            try { File.Delete(ProgressFile); } catch { }
            try { File.Delete(AppPathFile); } catch { }
            if (!keepLog || !File.Exists(LogFile))
            {
                try { Directory.Delete(directory, true); } catch { }
            }
        }
    }
}
