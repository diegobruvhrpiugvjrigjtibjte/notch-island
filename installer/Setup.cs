// NotchIsland Setup: installer con interfaccia completamente personalizzata (nessuna finestra standard di Windows).
// L'installazione vera e' fatta in silenzio dal pacchetto incorporato; qui c'e' tutta l'esperienza: animazioni, faccina, scelte, avanzamento reale.
// Compilabile con il csc di .NET Framework (C# 5): niente interpolazione di stringhe, niente "?.".
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace NotchIslandSetup
{
    class Options { public bool Autostart = true; public bool Desktop = false; public bool Launch = true; public string Lang = "auto"; }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            List<string> a = new List<string>(args);
            if (a.Contains("/S") || a.Contains("--silent"))
            {
                Worker w = new Worker(new Options(), false);
                w.Run();
                return w.Error == null ? 0 : 1;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string shots = null; int si = a.IndexOf("--shots"); if (si >= 0 && si + 1 < a.Count) shots = a[si + 1];
            Application.Run(new SetupForm(a.Contains("--auto"), a.Contains("--dry"), shots, a.Contains("--english") ? "en" : null));
            return 0;
        }
    }

    // ------------------------------------------------------------------ installazione (thread di lavoro)
    class Worker
    {
        public const long EXPECTED = EXPECTED_BYTES;
        public volatile float Progress; public volatile string StatusKey = "prep"; public volatile string Error; public volatile bool Done;
        Options o; bool dry;
        public static string InstallDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "notch-island"); } }
        public static string ExePath { get { return Path.Combine(InstallDir, "NotchIsland.exe"); } }
        public Worker(Options opts, bool simulate) { o = opts; dry = simulate; }

        public void Run()
        {
            try
            {
                StatusKey = "prep"; Progress = 0.02f;
                if (dry) { for (int i = 1; i <= 100; i++) { Thread.Sleep(55); Progress = 0.02f + 0.96f * i / 100f; StatusKey = i < 30 ? "unpack" : i < 80 ? "files" : "finish"; } Progress = 1; Done = true; return; }
                foreach (Process p in Process.GetProcessesByName("NotchIsland")) { try { p.Kill(); p.WaitForExit(3000); } catch (Exception) { } }
                Thread.Sleep(500);
                string tmp = Path.Combine(Path.GetTempPath(), "notchisland-setup-" + Guid.NewGuid().ToString("N").Substring(0, 8));
                Directory.CreateDirectory(tmp);
                string inner = Path.Combine(tmp, "engine.exe");
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("engine"))
                using (FileStream f = File.Create(inner)) { s.CopyTo(f); }
                Progress = 0.06f; StatusKey = "unpack";
                ProcessStartInfo psi = new ProcessStartInfo(inner, "/S"); psi.WorkingDirectory = tmp; psi.UseShellExecute = false; psi.CreateNoWindow = true;
                Process proc = Process.Start(psi);
                DateTime t0 = DateTime.Now;
                while (!proc.HasExited)
                {
                    long size = DirSize(InstallDir);
                    float frac = Math.Min(1f, (float)size / EXPECTED);
                    float target = 0.06f + 0.86f * frac;
                    if (target > Progress) Progress = Progress + (target - Progress) * 0.5f;
                    StatusKey = frac < 0.25f ? "unpack" : frac < 0.85f ? "files" : "finish";
                    if ((DateTime.Now - t0).TotalMinutes > 6) { try { proc.Kill(); } catch (Exception) { } throw new Exception("timeout"); }
                    Thread.Sleep(150);
                }
                if (proc.ExitCode != 0) throw new Exception("installer exit code " + proc.ExitCode);
                StatusKey = "finish"; Progress = 0.94f;
                if (!File.Exists(ExePath)) throw new Exception("NotchIsland.exe not found after install");
                WriteSettings(); ApplyAutostart(); if (o.Desktop) MakeShortcut();
                try { Directory.Delete(tmp, true); } catch (Exception) { }
                Progress = 1f; Done = true;
            }
            catch (Exception ex) { Error = ex.Message; }
        }

        static long DirSize(string d)
        {
            long n = 0;
            try { foreach (string f in Directory.GetFiles(d, "*", SearchOption.AllDirectories)) { try { n += new FileInfo(f).Length; } catch (Exception) { } } } catch (Exception) { }
            return n;
        }

        void WriteSettings()
        {
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NotchIsland");
                Directory.CreateDirectory(dir);
                string file = Path.Combine(dir, "settings.json");
                JavaScriptSerializer js = new JavaScriptSerializer();
                Dictionary<string, object> root = new Dictionary<string, object>();
                if (File.Exists(file)) { try { root = js.Deserialize<Dictionary<string, object>>(File.ReadAllText(file)); } catch (Exception) { root = new Dictionary<string, object>(); } }
                Dictionary<string, object> st = root.ContainsKey("settings") ? root["settings"] as Dictionary<string, object> : null;
                if (st == null) st = new Dictionary<string, object>();
                st["autostart"] = o.Autostart;
                if (o.Lang != "auto") st["lang"] = o.Lang;
                root["settings"] = st;
                File.WriteAllText(file, js.Serialize(root));
            }
            catch (Exception) { }
        }

        void ApplyAutostart()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (k == null) return;
                    if (o.Autostart) k.SetValue("NotchIsland", "\"" + ExePath + "\""); else k.DeleteValue("NotchIsland", false);
                }
            }
            catch (Exception) { }
        }

        void MakeShortcut()
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WScript.Shell"); object sh = Activator.CreateInstance(t);
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "NotchIsland.lnk");
                object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { path });
                Type lt = lnk.GetType();
                lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { ExePath });
                lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { InstallDir });
                lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
            }
            catch (Exception) { }
        }
    }

    // ------------------------------------------------------------------ interfaccia
    enum Page { Welcome, Options, Installing, Done, Failed }

    class Hit { public string Id; public Rectangle R; public bool Primary; public string Text; public float Hover; }
    class Spark { public float X, Y, Vx, Vy, S, R, Vr; public Color C; }

    class SetupForm : Form
    {
        const int W = 780, H = 500;
        float sc = 1f;
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int m, int w, int l);
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);

        System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer();
        Stopwatch clock = Stopwatch.StartNew();
        Page page = Page.Welcome; float pageT = 0; Page lastPage = Page.Welcome;
        Options opt = new Options();
        string lang; bool installed;
        Point mouse = new Point(-999, -999);
        float pillW = 230, pillTarget = 230;
        List<Hit> hits = new List<Hit>();
        Dictionary<string, float> hover = new Dictionary<string, float>();
        Worker worker; Thread workerThread; float shownProgress = 0;
        List<Spark> sparks = new List<Spark>(); Random rnd = new Random(7);
        bool autoMode, dry; string shotsDir; int shotCount = 0; double nextShot = 1.4; double autoAt = 2.2;
        Font fTitle, fBig, fH, fBody, fSmall, fBold, fPct;

        public SetupForm(bool auto, bool simulate, string shots, string forceLang)
        {
            autoMode = auto; dry = simulate; shotsDir = shots; if (auto) opt.Launch = false;
            lang = forceLang ?? (CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "it" ? "it" : "en");
            installed = File.Exists(Worker.ExePath);
            Text = "NotchIsland Setup"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
            using (Graphics gg = CreateGraphics()) { sc = gg.DpiX / 96f; }
            ClientSize = new Size((int)(W * sc), (int)(H * sc));
            DoubleBuffered = true; SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            BackColor = Color.FromArgb(10, 14, 26); KeyPreview = true;
            try { using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("icon")) { if (s != null) Icon = new Icon(s); } } catch (Exception) { }
            fTitle = Fnt(44, FontStyle.Bold); fBig = Fnt(30, FontStyle.Bold); fH = Fnt(15, FontStyle.Regular); fBody = Fnt(13, FontStyle.Regular); fSmall = Fnt(11, FontStyle.Regular); fBold = Fnt(13, FontStyle.Bold); fPct = Fnt(72, FontStyle.Bold);
            for (int i = 0; i < 70; i++) stars.Add(new float[] { (float)rnd.NextDouble() * W, (float)rnd.NextDouble() * H, (float)rnd.NextDouble() * 6.28f, 0.6f + (float)rnd.NextDouble() * 1.6f });
            tick.Interval = 16; tick.Tick += OnTick; tick.Start();
            MouseMove += delegate (object s, MouseEventArgs e) { mouse = new Point((int)(e.X / sc), (int)(e.Y / sc)); };
            MouseDown += OnDown; MouseLeave += delegate { mouse = new Point(-999, -999); };
            KeyDown += delegate (object s, KeyEventArgs e) { if (e.KeyCode == Keys.Escape && page != Page.Installing) Close(); };
        }
        List<float[]> stars = new List<float[]>();

        protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.ClassStyle |= 0x20000; return cp; } }
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); try { int v = 2; DwmSetWindowAttribute(Handle, 33, ref v, 4); } catch (Exception) { } }

        static Font Fnt(float size, FontStyle st)
        {
            string[] names = { "Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI" };
            foreach (string n in names) { using (Font f = new Font(n, 10)) { if (f.Name == n) return new Font(n, size, st, GraphicsUnit.Point); } }
            return new Font(FontFamily.GenericSansSerif, size, st);
        }

        // ---------------- testi
        string T(string k)
        {
            bool it = lang == "it";
            switch (k)
            {
                case "tagline": return it ? "Una Dynamic Island per Windows, con una faccina, una voce e Claude Code." : "A Dynamic Island for Windows, with a face, a voice and Claude Code.";
                case "install": return installed ? (it ? "Aggiorna" : "Update") : (it ? "Installa" : "Install");
                case "options": return it ? "Opzioni" : "Options";
                case "optTitle": return it ? "Rendila tua" : "Make it yours";
                case "o1": return it ? "Avvia con Windows" : "Start with Windows";
                case "o2": return it ? "Collegamento sul desktop" : "Desktop shortcut";
                case "o3": return it ? "Apri NotchIsland alla fine" : "Open NotchIsland when finished";
                case "o4": return it ? "Lingua" : "Language";
                case "auto": return it ? "Auto" : "Auto";
                case "back": return it ? "Indietro" : "Back";
                case "inst": return it ? "Sto installando" : "Installing";
                case "prep": return it ? "Preparo tutto..." : "Getting things ready...";
                case "unpack": return it ? "Disimballo la pillola..." : "Unpacking the pill...";
                case "files": return it ? "Copio i file e le estensioni..." : "Copying files and extensions...";
                case "finish": return it ? "Ultimi ritocchi..." : "Final touches...";
                case "wait": return it ? "Ci vuole qualche secondo." : "This takes a few seconds.";
                case "doneTitle": return it ? "Tutto pronto" : "You're all set";
                case "doneSub": return it ? "Passa con il mouse sulla pillola in alto sullo schermo.\nCtrl+Alt+Spazio per parlarle." : "Hover the pill at the top of your screen.\nPress Ctrl+Alt+Space to talk to it.";
                case "open": return it ? "Apri NotchIsland" : "Open NotchIsland";
                case "close": return it ? "Chiudi" : "Close";
                case "failTitle": return it ? "Qualcosa non ha funzionato" : "Something went wrong";
                case "retry": return it ? "Riprova" : "Try again";
                case "ready": return it ? "Pronto" : "Ready";
                case "c1": return it ? "Musica" : "Music";
                case "c2": return it ? "Assistente vocale" : "Voice assistant";
                case "c3": return "Claude Code";
                case "c4": return it ? "15 widget" : "15 widgets";
                case "c5": return "VS Code · Chrome";
            }
            return k;
        }

        // ---------------- logica
        void Go(Page p) { page = p; pageT = 0; hover.Clear(); }

        void StartInstall()
        {
            Go(Page.Installing); shownProgress = 0;
            worker = new Worker(opt, dry);
            workerThread = new Thread(worker.Run); workerThread.IsBackground = true; workerThread.Start();
        }

        void OnTick(object s, EventArgs e)
        {
            double t = clock.Elapsed.TotalSeconds;
            pageT = Math.Min(1f, pageT + 0.05f);
            switch (page) { case Page.Welcome: case Page.Options: pillTarget = 230; break; case Page.Installing: pillTarget = 400; break; case Page.Done: pillTarget = 300; break; default: pillTarget = 330; break; }
            pillW += (pillTarget - pillW) * 0.14f;
            if (page == Page.Installing && worker != null)
            {
                shownProgress += (worker.Progress - shownProgress) * 0.12f;
                if (worker.Error != null) { Go(Page.Failed); }
                else if (worker.Done && shownProgress > 0.985f) { shownProgress = 1; Go(Page.Done); Burst(); }
            }
            // scintille
            for (int i = sparks.Count - 1; i >= 0; i--) { Spark k = sparks[i]; k.X += k.Vx; k.Y += k.Vy; k.Vy += 0.12f; k.R += k.Vr; if (k.Y > H + 20) sparks.RemoveAt(i); }
            if (autoMode) AutoDrive(t);
            Invalidate();
        }

        void Burst()
        {
            Color[] cs = { Color.FromArgb(138, 180, 255), Color.FromArgb(195, 155, 255), Color.FromArgb(126, 224, 176), Color.FromArgb(255, 184, 107), Color.FromArgb(255, 122, 144) };
            for (int i = 0; i < 90; i++) { Spark k = new Spark(); k.X = W / 2f + (float)(rnd.NextDouble() - 0.5) * 120; k.Y = 70; double a = rnd.NextDouble() * Math.PI; float sp = 3 + (float)rnd.NextDouble() * 7; k.Vx = (float)Math.Cos(a * 2 - Math.PI / 2 + Math.PI / 2) * sp * 0.9f; k.Vy = -(float)Math.Sin(a) * sp * 0.6f; k.S = 3 + (float)rnd.NextDouble() * 5; k.C = cs[rnd.Next(cs.Length)]; k.R = (float)rnd.NextDouble() * 6; k.Vr = (float)(rnd.NextDouble() - 0.5) * 0.4f; sparks.Add(k); }
        }

        int autoStep = 0; double autoT = 0;
        void AutoDrive(double t)
        {
            if (t < autoT) return;
            if (page == Page.Welcome && autoStep == 0)
            {
                if (shotsDir != null) { Shot(); autoStep = 1; autoT = t + 1.2; Go(Page.Options); }
                else { autoStep = 3; StartInstall(); }
            }
            else if (page == Page.Options && autoStep == 1) { Shot(); autoStep = 2; autoT = t + 0.8; StartInstall(); }
            else if (page == Page.Installing && autoStep == 2 && shownProgress > 0.45f) { if (shotsDir != null) Shot(); autoStep = 3; }
            else if (page == Page.Done && autoStep == 3 && pageT >= 1f) { autoStep = 4; autoT = t + 1.8; }
            else if (page == Page.Done && autoStep == 4) { if (shotsDir != null) Shot(); autoStep = 5; autoT = t + 0.5; }
            else if (page == Page.Done && autoStep == 5) { autoMode = false; Close(); }
            else if (page == Page.Failed) { autoMode = false; Close(); }
        }

        void Shot()
        {
            try { Directory.CreateDirectory(shotsDir); using (Bitmap b = new Bitmap(ClientSize.Width, ClientSize.Height)) { DrawToBitmap(b, new Rectangle(0, 0, ClientSize.Width, ClientSize.Height)); b.Save(Path.Combine(shotsDir, "setup-" + (++shotCount) + "-" + page.ToString().ToLower() + ".png"), System.Drawing.Imaging.ImageFormat.Png); } nextShot = clock.Elapsed.TotalSeconds + 1.2; }
            catch (Exception) { }
        }

        void OnDown(object s, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            Point lp = new Point((int)(e.X / sc), (int)(e.Y / sc));
            foreach (Hit h in hits)
            {
                if (!h.R.Contains(lp)) continue;
                switch (h.Id)
                {
                    case "xclose": Close(); return;
                    case "close": Close(); return;
                    case "min": WindowState = FormWindowState.Minimized; return;
                    case "lang": lang = lang == "it" ? "en" : "it"; return;
                    case "install": StartInstall(); return;
                    case "options": Go(Page.Options); return;
                    case "back": Go(Page.Welcome); return;
                    case "t1": opt.Autostart = !opt.Autostart; return;
                    case "t2": opt.Desktop = !opt.Desktop; return;
                    case "t3": opt.Launch = !opt.Launch; return;
                    case "l0": opt.Lang = "auto"; return;
                    case "l1": opt.Lang = "it"; return;
                    case "l2": opt.Lang = "en"; return;
                    case "open": try { Process.Start(Worker.ExePath); } catch (Exception) { } Close(); return;
                    case "retry": StartInstall(); return;
                }
            }
            ReleaseCapture(); SendMessage(Handle, 0xA1, 2, 0);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (page == Page.Installing && !autoMode) { e.Cancel = true; return; }
            if (page == Page.Done && opt.Launch && !dry && autoMode == false && !launched) { launched = true; try { Process.Start(Worker.ExePath); } catch (Exception) { } }
            base.OnFormClosing(e);
        }
        bool launched = false;

        // ---------------- disegno
        static GraphicsPath Round(RectangleF r, float rad)
        {
            GraphicsPath p = new GraphicsPath(); float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90); p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90); p.CloseFigure(); return p;
        }
        static Color A(Color c, float a) { return Color.FromArgb((int)Math.Max(0, Math.Min(255, c.A * a)), c.R, c.G, c.B); }
        static readonly Color Acc1 = Color.FromArgb(138, 180, 255), Acc2 = Color.FromArgb(195, 155, 255);

        void Txt(Graphics g, string s, Font f, Color c, RectangleF r, StringAlignment al, StringAlignment v)
        {
            using (StringFormat sf = new StringFormat()) { sf.Alignment = al; sf.LineAlignment = v; sf.Trimming = StringTrimming.None; using (Brush b = new SolidBrush(c)) g.DrawString(s, f, b, r, sf); }
        }
        void GradTxt(Graphics g, string s, Font f, RectangleF r, float a)
        {
            using (StringFormat sf = new StringFormat()) { sf.Alignment = StringAlignment.Center; sf.LineAlignment = StringAlignment.Center; using (LinearGradientBrush b = new LinearGradientBrush(new RectangleF(r.X, r.Y, r.Width, r.Height), A(Acc1, a), A(Acc2, a), 20f)) g.DrawString(s, f, b, r, sf); }
        }

        float Hov(string id, Rectangle r)
        {
            float v; hover.TryGetValue(id, out v); float target = r.Contains(mouse) ? 1f : 0f; v += (target - v) * 0.25f; hover[id] = v; return v;
        }

        void Button(Graphics g, string id, string text, Rectangle r, bool primary, float a)
        {
            float h = Hov(id, r); hits.Add(new Hit { Id = id, R = r, Primary = primary, Text = text });
            Rectangle rr = Rectangle.Inflate(r, (int)(h * 3), (int)(h * 2));
            using (GraphicsPath p = Round(rr, rr.Height / 2f))
            {
                if (primary)
                {
                    for (int i = 5; i >= 1; i--) using (GraphicsPath gp = Round(Rectangle.Inflate(rr, i * 3, i * 2), (rr.Height + i * 4) / 2f)) using (Brush b = new SolidBrush(Color.FromArgb((int)((10 + 14 * h) * a), 138, 180, 255))) g.FillPath(b, gp);
                    using (LinearGradientBrush b = new LinearGradientBrush(rr, A(Acc1, a), A(Acc2, a), 0f)) g.FillPath(b, p);
                    Txt(g, text, fBold, A(Color.FromArgb(8, 10, 20), a), rr, StringAlignment.Center, StringAlignment.Center);
                }
                else
                {
                    using (Brush b = new SolidBrush(Color.FromArgb((int)((24 + 30 * h) * a), 255, 255, 255))) g.FillPath(b, p);
                    using (Pen pen = new Pen(Color.FromArgb((int)((50 + 50 * h) * a), 255, 255, 255), 1f)) g.DrawPath(pen, p);
                    Txt(g, text, fBold, A(Color.White, a), rr, StringAlignment.Center, StringAlignment.Center);
                }
            }
        }

        void Toggle(Graphics g, string id, string label, bool on, Rectangle card, float a)
        {
            float h = Hov(id, card); hits.Add(new Hit { Id = id, R = card });
            using (GraphicsPath p = Round(card, 14)) { using (Brush b = new SolidBrush(Color.FromArgb((int)((18 + 16 * h) * a), 255, 255, 255))) g.FillPath(b, p); using (Pen pen = new Pen(Color.FromArgb((int)(40 * a), 255, 255, 255))) g.DrawPath(pen, p); }
            Txt(g, label, fBody, A(Color.White, a), new RectangleF(card.X + 18, card.Y, card.Width - 90, card.Height), StringAlignment.Near, StringAlignment.Center);
            Rectangle sw = new Rectangle(card.Right - 66, card.Y + (card.Height - 24) / 2, 46, 24);
            using (GraphicsPath p = Round(sw, 12)) using (Brush b = new SolidBrush(on ? A(Color.FromArgb(111, 212, 154), a) : Color.FromArgb((int)(60 * a), 255, 255, 255))) g.FillPath(b, p);
            using (Brush b = new SolidBrush(A(Color.White, a))) g.FillEllipse(b, sw.X + (on ? 25 : 3), sw.Y + 3, 18, 18);
        }

        protected override void OnPaint(PaintEventArgs pe)
        {
            Graphics g = pe.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit; g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.ScaleTransform(sc, sc);
            float t = (float)clock.Elapsed.TotalSeconds; hits.Clear();
            g.Clear(Color.FromArgb(10, 14, 26));
            Aurora(g, t);
            // bordo sottile
            using (Pen pen = new Pen(Color.FromArgb(45, 255, 255, 255))) g.DrawRectangle(pen, 0, 0, W - 1, H - 1);
            DrawPill(g, t);
            float a = Ease(pageT); float dy = (1 - a) * 22;
            GraphicsState st = g.Save(); g.TranslateTransform(0, dy);
            switch (page)
            {
                case Page.Welcome: DrawWelcome(g, t, a); break;
                case Page.Options: DrawOptions(g, a); break;
                case Page.Installing: DrawInstalling(g, t, a); break;
                case Page.Done: DrawDone(g, a); break;
                default: DrawFailed(g, a); break;
            }
            g.Restore(st);
            // scintille (sopra a tutto)
            foreach (Spark k in sparks) { using (Brush b = new SolidBrush(k.C)) { GraphicsState s2 = g.Save(); g.TranslateTransform(k.X, k.Y); g.RotateTransform(k.R * 57f); g.FillRectangle(b, -k.S / 2, -k.S / 4, k.S, k.S / 2); g.Restore(s2); } }
            DrawChrome(g);
        }
        static float Ease(float x) { return 1 - (float)Math.Pow(1 - x, 3); }

        void Aurora(Graphics g, float t)
        {
            Blob(g, W * 0.2f + (float)Math.Sin(t * 0.4) * 90, H * 0.25f + (float)Math.Cos(t * 0.3) * 50, 360, Color.FromArgb(95, 59, 91, 255));
            Blob(g, W * 0.85f + (float)Math.Cos(t * 0.35) * 80, H * 0.7f + (float)Math.Sin(t * 0.45) * 60, 400, Color.FromArgb(85, 155, 77, 255));
            Blob(g, W * 0.55f + (float)Math.Sin(t * 0.25 + 2) * 120, H * 1.0f + (float)Math.Cos(t * 0.5) * 30, 300, Color.FromArgb(55, 24, 200, 180));
            foreach (float[] s in stars) { float al = 0.25f + 0.75f * (float)(0.5 + 0.5 * Math.Sin(t * s[3] + s[2])); using (Brush b = new SolidBrush(Color.FromArgb((int)(150 * al), 255, 255, 255))) g.FillEllipse(b, s[0], s[1], 1.8f, 1.8f); }
        }
        void Blob(Graphics g, float cx, float cy, float r, Color c)
        {
            using (GraphicsPath p = new GraphicsPath()) { p.AddEllipse(cx - r, cy - r, r * 2, r * 2); using (PathGradientBrush b = new PathGradientBrush(p)) { b.CenterColor = c; b.SurroundColors = new Color[] { Color.FromArgb(0, c.R, c.G, c.B) }; g.FillPath(b, p); } }
        }

        // ---------------- pillola con la faccina
        void DrawPill(Graphics g, float t)
        {
            float ph = 46; RectangleF r = new RectangleF((W - pillW) / 2f, 30, pillW, ph);
            for (int i = 6; i >= 1; i--) using (GraphicsPath gp = Round(RectangleF.Inflate(r, i * 2.5f, i * 1.6f), (ph + i * 3) / 2f)) using (Brush b = new SolidBrush(Color.FromArgb(7, 120, 150, 255))) g.FillPath(b, gp);
            using (GraphicsPath p = Round(r, ph / 2)) { using (Brush b = new SolidBrush(Color.Black)) g.FillPath(b, p); using (Pen pen = new Pen(Color.FromArgb(70, 255, 255, 255), 1.2f)) g.DrawPath(pen, p); }
            string mood = page == Page.Installing ? "think" : page == Page.Done ? "love" : page == Page.Failed ? "oops" : "idle";
            Face(g, r.X + 30, r.Y + ph / 2, 30, mood, t);
            string label; Color col = Color.White;
            if (page == Page.Installing) label = Math.Round(shownProgress * 100) + "%  " + T("inst");
            else if (page == Page.Done) label = T("ready");
            else if (page == Page.Failed) label = "!";
            else label = "NotchIsland";
            Txt(g, label, fBold, col, new RectangleF(r.X + 54, r.Y, r.Width - 70, ph), StringAlignment.Near, StringAlignment.Center);
            if (page == Page.Installing)
            {
                RectangleF bar = new RectangleF(r.X + 26, r.Bottom - 7, r.Width - 52, 3);
                using (Brush b = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillRectangle(b, bar);
                using (Brush b = new SolidBrush(Acc1)) g.FillRectangle(b, bar.X, bar.Y, bar.Width * shownProgress, bar.Height);
            }
        }

        void Face(Graphics g, float cx, float cy, float s, string mood, float t)
        {
            float lx = (mouse.X - cx), ly = (mouse.Y - cy); float d = (float)Math.Sqrt(lx * lx + ly * ly); if (d < 1) d = 1; float mag = Math.Min(1f, d / 160f); lx = lx / d * mag; ly = ly / d * mag;
            bool blink = ((t % 3.6f) > 3.45f) && mood == "idle";
            float ew = s * 0.17f, eh = s * 0.40f; if (blink) eh = s * 0.05f;
            float ox = lx * s * 0.07f, oy = ly * s * 0.06f; if (mood == "think") { ox = s * 0.08f; oy = -s * 0.07f; }
            Brush white = Brushes.White;
            if (mood == "love")
            {
                for (int k = -1; k <= 1; k += 2) Heart(g, cx + k * s * 0.24f, cy - s * 0.05f, s * 0.3f);
                using (Pen pen = new Pen(Color.White, 2.2f)) { pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; g.DrawArc(pen, cx - s * 0.17f, cy + s * 0.0f, s * 0.34f, s * 0.3f, 20, 140); }
                return;
            }
            for (int k = -1; k <= 1; k += 2)
            {
                RectangleF e = new RectangleF(cx + k * s * 0.24f - ew / 2 + ox, cy - eh / 2 - s * 0.06f + oy, ew, eh);
                if (mood == "oops") e = new RectangleF(cx + k * s * 0.24f - ew / 2, cy - s * 0.12f, ew, s * 0.1f);
                using (GraphicsPath p = Round(e, ew / 2)) g.FillPath(white, p);
            }
            using (Pen pen = new Pen(Color.White, 2.2f))
            {
                pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round;
                if (mood == "think") { g.DrawLine(pen, cx - s * 0.12f, cy + s * 0.27f, cx + s * 0.12f, cy + s * 0.27f); for (int i = 0; i < 3; i++) { float al = (float)(0.35 + 0.65 * Math.Abs(Math.Sin(t * 5 - i * 0.7))); using (Brush b = new SolidBrush(Color.FromArgb((int)(255 * al), Acc1))) g.FillEllipse(b, cx + s * 0.52f + i * 5, cy - s * 0.46f, 3.4f, 3.4f); } }
                else if (mood == "oops") g.DrawArc(pen, cx - s * 0.14f, cy + s * 0.2f, s * 0.28f, s * 0.2f, 200, 140);
                else g.DrawArc(pen, cx - s * 0.14f, cy + s * 0.12f, s * 0.28f, s * 0.24f, 25, 130);
            }
        }
        void Heart(Graphics g, float cx, float cy, float s)
        {
            using (GraphicsPath p = new GraphicsPath())
            {
                p.AddEllipse(cx - s * 0.5f, cy - s * 0.42f, s * 0.55f, s * 0.55f); p.AddEllipse(cx - s * 0.05f, cy - s * 0.42f, s * 0.55f, s * 0.55f);
                p.AddPolygon(new PointF[] { new PointF(cx - s * 0.48f, cy - s * 0.1f), new PointF(cx + s * 0.48f, cy - s * 0.1f), new PointF(cx, cy + s * 0.5f) });
                using (Brush b = new SolidBrush(Color.FromArgb(255, 107, 138))) g.FillPath(b, p);
            }
        }

        // ---------------- pagine
        void DrawWelcome(Graphics g, float t, float a)
        {
            GradTxt(g, "NotchIsland", fTitle, new RectangleF(0, 118, W, 70), a);
            Txt(g, T("tagline"), fH, A(Color.FromArgb(190, 200, 225), a), new RectangleF(120, 190, W - 240, 56), StringAlignment.Center, StringAlignment.Near);
            string[] chips = { T("c1"), T("c2"), T("c3"), T("c4"), T("c5") }; float total = 0; float[] ws = new float[chips.Length];
            for (int i = 0; i < chips.Length; i++) { ws[i] = g.MeasureString(chips[i], fSmall).Width + 28; total += ws[i] + 8; }
            float x = (W - total + 8) / 2f;
            for (int i = 0; i < chips.Length; i++)
            {
                float bob = (float)Math.Sin(t * 1.6 + i * 0.8) * 2.5f; RectangleF c = new RectangleF(x, 268 + bob, ws[i], 28);
                using (GraphicsPath p = Round(c, 14)) { using (Brush b = new SolidBrush(Color.FromArgb((int)(22 * a), 255, 255, 255))) g.FillPath(b, p); using (Pen pen = new Pen(Color.FromArgb((int)(60 * a), 255, 255, 255))) g.DrawPath(pen, p); }
                Txt(g, chips[i], fSmall, A(Color.White, a), c, StringAlignment.Center, StringAlignment.Center); x += ws[i] + 8;
            }
            Button(g, "install", T("install"), new Rectangle(W / 2 - 120, 352, 240, 56), true, a);
            Rectangle lk = new Rectangle(W / 2 - 60, 424, 120, 28); float h = Hov("options", lk); hits.Add(new Hit { Id = "options", R = lk });
            Txt(g, T("options"), fBody, A(Color.FromArgb(160 + (int)(95 * h), 190, 215, 255), a), lk, StringAlignment.Center, StringAlignment.Center);
        }

        void DrawOptions(Graphics g, float a)
        {
            GradTxt(g, T("optTitle"), fBig, new RectangleF(0, 112, W, 50), a);
            int x = (W - 480) / 2;
            Toggle(g, "t1", T("o1"), opt.Autostart, new Rectangle(x, 178, 480, 46), a);
            Toggle(g, "t2", T("o2"), opt.Desktop, new Rectangle(x, 232, 480, 46), a);
            Toggle(g, "t3", T("o3"), opt.Launch, new Rectangle(x, 286, 480, 46), a);
            Rectangle card = new Rectangle(x, 340, 480, 46);
            using (GraphicsPath p = Round(card, 14)) { using (Brush b = new SolidBrush(Color.FromArgb((int)(18 * a), 255, 255, 255))) g.FillPath(b, p); using (Pen pen = new Pen(Color.FromArgb((int)(40 * a), 255, 255, 255))) g.DrawPath(pen, p); }
            Txt(g, T("o4"), fBody, A(Color.White, a), new RectangleF(card.X + 18, card.Y, 150, card.Height), StringAlignment.Near, StringAlignment.Center);
            string[] ids = { "l0", "l1", "l2" }; string[] vals = { "auto", "it", "en" }; string[] labs = { T("auto"), "Italiano", "English" };
            for (int i = 0; i < 3; i++)
            {
                Rectangle sg = new Rectangle(card.Right - 292 + i * 94, card.Y + 8, 90, 30); bool on = opt.Lang == vals[i]; float h = Hov(ids[i], sg); hits.Add(new Hit { Id = ids[i], R = sg });
                using (GraphicsPath p = Round(sg, 15)) { using (Brush b = new SolidBrush(on ? A(Acc1, a) : Color.FromArgb((int)((25 + 25 * h) * a), 255, 255, 255))) g.FillPath(b, p); }
                Txt(g, labs[i], fSmall, on ? A(Color.FromArgb(8, 10, 20), a) : A(Color.White, a), sg, StringAlignment.Center, StringAlignment.Center);
            }
            Button(g, "back", T("back"), new Rectangle(x, 420, 140, 46), false, a);
            Button(g, "install", T("install"), new Rectangle(x + 480 - 200, 420, 200, 46), true, a);
        }

        void DrawInstalling(Graphics g, float t, float a)
        {
            int pct = (int)Math.Round(shownProgress * 100);
            GradTxt(g, pct + "%", fPct, new RectangleF(0, 120, W, 110), a);
            Rectangle bar = new Rectangle((W - 480) / 2, 262, 480, 12);
            using (GraphicsPath p = Round(bar, 6)) using (Brush b = new SolidBrush(Color.FromArgb((int)(40 * a), 255, 255, 255))) g.FillPath(b, p);
            int fw = Math.Max(12, (int)(bar.Width * shownProgress));
            Rectangle fill = new Rectangle(bar.X, bar.Y, fw, bar.Height);
            for (int i = 4; i >= 1; i--) using (GraphicsPath gp = Round(Rectangle.Inflate(fill, i * 2, i * 2), 6 + i * 2)) using (Brush b = new SolidBrush(Color.FromArgb((int)(10 * a), 138, 180, 255))) g.FillPath(b, gp);
            using (GraphicsPath p = Round(fill, 6)) using (LinearGradientBrush b = new LinearGradientBrush(bar, Acc1, Acc2, 0f)) { g.FillPath(b, p); GraphicsState s = g.Save(); g.SetClip(p); float sx = bar.X + ((t * 220) % (bar.Width + 120)) - 60; using (LinearGradientBrush sh = new LinearGradientBrush(new RectangleF(sx, bar.Y, 60, bar.Height), Color.FromArgb(0, 255, 255, 255), Color.FromArgb(120, 255, 255, 255), 0f)) g.FillRectangle(sh, sx, bar.Y, 60, bar.Height); g.Restore(s); }
            Txt(g, T(worker != null ? worker.StatusKey : "prep"), fH, A(Color.White, a), new RectangleF(0, 296, W, 30), StringAlignment.Center, StringAlignment.Center);
            Txt(g, T("wait"), fSmall, A(Color.FromArgb(150, 160, 190), a), new RectangleF(0, 326, W, 24), StringAlignment.Center, StringAlignment.Center);
        }

        void DrawDone(Graphics g, float a)
        {
            GradTxt(g, T("doneTitle"), fBig, new RectangleF(0, 124, W, 60), a);
            Txt(g, T("doneSub"), fH, A(Color.FromArgb(190, 200, 225), a), new RectangleF(100, 196, W - 200, 70), StringAlignment.Center, StringAlignment.Near);
            Button(g, "open", T("open"), new Rectangle(W / 2 - 130, 330, 260, 56), true, a);
            Button(g, "close", T("close"), new Rectangle(W / 2 - 70, 404, 140, 40), false, a);
        }

        void DrawFailed(Graphics g, float a)
        {
            GradTxt(g, T("failTitle"), fBig, new RectangleF(0, 124, W, 60), a);
            string msg = worker != null && worker.Error != null ? worker.Error : "";
            Txt(g, msg, fBody, A(Color.FromArgb(255, 150, 160), a), new RectangleF(100, 200, W - 200, 80), StringAlignment.Center, StringAlignment.Near);
            Button(g, "retry", T("retry"), new Rectangle(W / 2 - 130, 330, 260, 56), true, a);
            Button(g, "close", T("close"), new Rectangle(W / 2 - 70, 404, 140, 40), false, a);
        }

        void DrawChrome(Graphics g)
        {
            Rectangle cl = new Rectangle(W - 46, 14, 30, 30), mn = new Rectangle(W - 82, 14, 30, 30), lg = new Rectangle(W - 190, 17, 92, 24);
            float hc = Hov("xclose", cl), hm = Hov("min", mn), hl = Hov("lang", lg);
            hits.Add(new Hit { Id = "xclose", R = cl }); hits.Add(new Hit { Id = "min", R = mn }); hits.Add(new Hit { Id = "lang", R = lg });
            using (Brush b = new SolidBrush(Color.FromArgb((int)(60 * hc), 255, 90, 100))) g.FillEllipse(b, cl);
            using (Pen pen = new Pen(Color.FromArgb(200, 255, 255, 255), 1.6f)) { g.DrawLine(pen, cl.X + 10, cl.Y + 10, cl.Right - 10, cl.Bottom - 10); g.DrawLine(pen, cl.Right - 10, cl.Y + 10, cl.X + 10, cl.Bottom - 10); }
            using (Brush b = new SolidBrush(Color.FromArgb((int)(40 * hm), 255, 255, 255))) g.FillEllipse(b, mn);
            using (Pen pen = new Pen(Color.FromArgb(200, 255, 255, 255), 1.6f)) g.DrawLine(pen, mn.X + 9, mn.Y + 15, mn.Right - 9, mn.Y + 15);
            using (GraphicsPath p = Round(lg, 12)) { using (Brush b = new SolidBrush(Color.FromArgb((int)(22 + 30 * hl), 255, 255, 255))) g.FillPath(b, p); using (Pen pen = new Pen(Color.FromArgb(60, 255, 255, 255))) g.DrawPath(pen, p); }
            Rectangle l1 = new Rectangle(lg.X, lg.Y, lg.Width / 2, lg.Height), l2 = new Rectangle(lg.X + lg.Width / 2, lg.Y, lg.Width / 2, lg.Height);
            Txt(g, "IT", fSmall, lang == "it" ? Acc1 : Color.FromArgb(140, 255, 255, 255), l1, StringAlignment.Center, StringAlignment.Center);
            Txt(g, "EN", fSmall, lang == "en" ? Acc1 : Color.FromArgb(140, 255, 255, 255), l2, StringAlignment.Center, StringAlignment.Center);
        }
    }
}
