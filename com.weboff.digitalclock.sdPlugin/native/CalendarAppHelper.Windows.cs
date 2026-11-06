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
    public static class Program {
        public static int Main(string[] args) {
            Console.OutputEncoding = new System.Text.UTF8Encoding(false);
            Console.InputEncoding = new System.Text.UTF8Encoding(false);
            Console.WriteLine(new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "type", "error" }, { "code", "unavailable" } }));
            return 0;
        }
    }
}

