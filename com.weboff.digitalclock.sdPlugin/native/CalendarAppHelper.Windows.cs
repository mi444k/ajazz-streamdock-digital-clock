using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace Weboff.DigitalClock.Windows {
    public sealed class ShellApplication {
        public readonly string AppUserModelId;
        public readonly string Name;
        public ShellApplication(string appUserModelId, string name) { AppUserModelId = appUserModelId; Name = name; }
    }
    public interface IApplicationPlatform {
        IList<ShellApplication> Enumerate();
        bool Invoke(ShellApplication application);
    }
    public sealed class ApplicationEngine {
        private readonly IApplicationPlatform platform;
        public ApplicationEngine(IApplicationPlatform platform) { if (platform == null) throw new ArgumentNullException("platform"); this.platform = platform; }
        public static string ApplicationId(string exactAumid) {
            using (var sha = System.Security.Cryptography.SHA256.Create()) {
                var value = new System.Text.StringBuilder();
                foreach (byte item in sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(exactAumid))) value.Append(item.ToString("x2"));
                return value.ToString();
            }
        }
        private static bool Text(string value, int maximum) {
            if (String.IsNullOrWhiteSpace(value) || value.Length > maximum) return false;
            foreach (char character in value) if (Char.IsControl(character)) return false;
            return true;
        }
        private static Dictionary<string, object> Error(string code) { return new Dictionary<string, object> { { "type", "error" }, { "code", code } }; }
        private IList<ShellApplication> Catalog() {
            var applications = platform.Enumerate();
            if (applications == null || applications.Count > 1024) throw new InvalidOperationException();
            var result = new List<ShellApplication>(); var identities = new HashSet<string>(StringComparer.Ordinal); var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var app in applications) {
                if (app == null || !Text(app.AppUserModelId, 1024) || !Text(app.Name, 1024) || !identities.Add(app.AppUserModelId) || !ids.Add(ApplicationId(app.AppUserModelId))) throw new InvalidOperationException();
                result.Add(app);
            }
            return result;
        }
        public Dictionary<string, object> List() {
            try {
                var values = new List<object>();
                foreach (var app in Catalog()) values.Add(new Dictionary<string, object> { { "id", ApplicationId(app.AppUserModelId) }, { "name", app.Name }, { "appUserModelId", app.AppUserModelId } });
                var result = new Dictionary<string, object> { { "type", "applications" }, { "applications", values } };
                var json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 }.Serialize(result);
                if (System.Text.Encoding.UTF8.GetByteCount(json) > 1024 * 1024) return Error("invalid_response");
                return result;
            } catch { return Error("invalid_response"); }
        }
        public Dictionary<string, object> Open(string opaqueId) {
            if (opaqueId == null || !System.Text.RegularExpressions.Regex.IsMatch(opaqueId, "^[a-f0-9]{64}$")) return Error("invalid_request");
            try {
                ShellApplication selected = null;
                foreach (var app in Catalog()) if (ApplicationId(app.AppUserModelId) == opaqueId) selected = app;
                if (selected == null) return Error("missing_app");
                if (!platform.Invoke(selected)) return Error("open_failed");
                return new Dictionary<string, object> { { "type", "opened" }, { "applicationId", opaqueId } };
            } catch { return Error("invalid_response"); }
        }
    }
    public sealed class WindowsApplicationPlatform : IApplicationPlatform {
        private static void Release(object value) {
            if (value != null && System.Runtime.InteropServices.Marshal.IsComObject(value)) {
                try { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(value); } catch { }
            }
        }
        private static object Shell() {
            var type = Type.GetTypeFromProgID("Shell.Application", true);
            return Activator.CreateInstance(type);
        }
        public IList<ShellApplication> Enumerate() {
            object shell = null, folder = null, items = null;
            try {
                shell = Shell();
                folder = ((dynamic)shell).NameSpace("shell:AppsFolder");
                if (folder == null) throw new InvalidOperationException();
                items = ((dynamic)folder).Items();
                int count = (int)((dynamic)items).Count;
                if (count < 0 || count > 1024) throw new InvalidOperationException();
                var result = new List<ShellApplication>();
                for (int index = 0; index < count; index++) {
                    object item = null;
                    try {
                        item = ((dynamic)items).Item(index);
                        string appId = ((dynamic)item).ExtendedProperty("System.AppUserModel.ID") as string;
                        if (String.IsNullOrWhiteSpace(appId)) continue;
                        string name = ((dynamic)item).Name as string;
                        result.Add(new ShellApplication(appId, name));
                    } finally { Release(item); }
                }
                return result;
            } finally { Release(items); Release(folder); Release(shell); }
        }
        public bool Invoke(ShellApplication application) {
            object shell = null, folder = null, items = null, selected = null;
            try {
                // Re-resolve the exact installed identity immediately before dispatch.
                shell = Shell(); folder = ((dynamic)shell).NameSpace("shell:AppsFolder");
                if (folder == null) return false;
                items = ((dynamic)folder).Items();
                int count = (int)((dynamic)items).Count;
                if (count < 0 || count > 1024) return false;
                for (int index = 0; index < count; index++) {
                    object item = ((dynamic)items).Item(index);
                    string appId;
                    try { appId = ((dynamic)item).ExtendedProperty("System.AppUserModel.ID") as string; }
                    catch { Release(item); throw; }
                    if (String.Equals(appId, application.AppUserModelId, StringComparison.Ordinal)) {
                        if (selected != null) { Release(item); return false; }
                        selected = item;
                    } else Release(item);
                }
                if (selected == null) return false;
                ((dynamic)selected).InvokeVerb();
                // Shell dispatch acceptance is not proof that an application window opened.
                return true;
            } catch { return false; }
            finally { Release(selected); Release(items); Release(folder); Release(shell); }
        }
    }
    public static class Program {
        [STAThread]
        public static int Main(string[] args) {
            Console.OutputEncoding = new System.Text.UTF8Encoding(false);
            Console.InputEncoding = new System.Text.UTF8Encoding(false);
            Dictionary<string, object> result;
            try {
                var engine = new ApplicationEngine(new WindowsApplicationPlatform());
                if (args.Length == 1 && args[0] == "--list") result = engine.List();
                else if (args.Length == 2 && args[0] == "--open") result = engine.Open(args[1]);
                else result = Error("invalid_request");
            } catch { result = Error("unavailable"); }
            var serializer = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
            string json;
            try {
                json = serializer.Serialize(result);
                if (System.Text.Encoding.UTF8.GetByteCount(json) > 1024 * 1024) throw new InvalidOperationException();
            } catch { json = serializer.Serialize(Error("invalid_response")); }
            Console.WriteLine(json); Console.Out.Flush();
            return 0;
        }
        private static Dictionary<string, object> Error(string code) { return new Dictionary<string, object> { { "type", "error" }, { "code", code } }; }
    }
}

