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
        public ApplicationEngine(IApplicationPlatform platform) { }
        public static string ApplicationId(string exactAumid) { return ""; }
        public Dictionary<string, object> List() { return new Dictionary<string, object> { { "type", "applications" }, { "applications", new object[0] } }; }
        public Dictionary<string, object> Open(string opaqueId) { return new Dictionary<string, object> { { "type", "error" }, { "code", "unavailable" } }; }
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

