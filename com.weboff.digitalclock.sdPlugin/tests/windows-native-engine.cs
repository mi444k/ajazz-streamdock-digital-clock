using System;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Weboff.DigitalClock.Windows;

public static class Tests {
    static int failures = 0;
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static string Text(Dictionary<string, object> value, string key) { return value.ContainsKey(key) ? Convert.ToString(value[key]) : ""; }
    static List<object> Items(object value) { var result = new List<object>(); foreach (object item in (IEnumerable)value) result.Add(item); return result; }
    static Dictionary<string, object> Map(object value) { return (Dictionary<string, object>)value; }
    static void Run(string name, Action test) { try { test(); Console.WriteLine("PASS " + name); } catch (Exception error) { failures++; Console.WriteLine("FAIL " + name + ": " + error.Message); } }
    sealed class Fake : IApplicationPlatform {
        public IList<ShellApplication> Applications = new List<ShellApplication> { new ShellApplication("Example.Package!Calendar", "Календарь"), new ShellApplication("Example.Other!App", "Other application") };
        public int Reads, Invocations; public ShellApplication Invoked; public bool Accepted = true;
        public IList<ShellApplication> Enumerate() { Reads++; return Applications; }
        public bool Invoke(ShellApplication application) { Invocations++; Invoked = application; return Accepted; }
    }
    static string Hash(string value) { using (var sha = SHA256.Create()) { var text = new StringBuilder(); foreach(byte item in sha.ComputeHash(Encoding.UTF8.GetBytes(value))) text.Append(item.ToString("x2")); return text.ToString(); } }
    public static int Main() {
        Run("catalog-sanitized-stable-identities", () => {
            var fake = new Fake(); var engine = new ApplicationEngine(fake); var output = engine.List();
            Check(Text(output, "type") == "applications", "list returns installed application catalog");
            var items = Items(output["applications"]); Check(items.Count == 2, "all installed catalog items are exposed");
            var app = Map(items[0]); Check(Text(app, "name") == "Календарь", "Cyrillic catalog name is preserved");
            Check(Text(app, "id") == Hash("Example.Package!Calendar"), "opaque identity hashes exact installed AUMID");
            Check(Text(app, "appUserModelId") == "Example.Package!Calendar" && !app.ContainsKey("path"), "Windows provenance cannot become arbitrary executable path");
            Check(ApplicationEngine.ApplicationId("Example.Package!Calendar") == Hash("Example.Package!Calendar"), "hash is stable independently of enumeration order");
            Check(fake.Invocations == 0, "listing is read-only");
        });
        Run("open-fresh-catalog-only", () => {
            var fake = new Fake(); var engine = new ApplicationEngine(fake); engine.List();
            var fresh = new ShellApplication("Example.Package!Calendar", "Renamed"); fake.Applications = new List<ShellApplication> { fresh };
            string id = Hash(fresh.AppUserModelId); var output = engine.Open(id);
            Check(fake.Reads == 2 && fake.Invocations == 1, "open owns a fresh enumeration and one invocation");
            Check(Object.ReferenceEquals(fake.Invoked, fresh), "the exact fresh catalog item is dispatched, never an older or caller-provided item");
            Check(Text(output, "type") == "opened" && Text(output, "applicationId") == id, "success acknowledges exact application ID");
        });
        Run("missing-invalid-identities-no-launch", () => {
            foreach (string id in new [] { "apple-calendar", "../app", "C:\\arbitrary.exe", "https://invalid.example", new string('a',64) }) {
                var fake = new Fake(); var output = new ApplicationEngine(fake).Open(id);
                Check(Text(output, "type") == "error", "uninstalled identity never produces success"); Check(fake.Invocations == 0, "no arbitrary caller input is launched");
            }
        });
        Run("removed-and-duplicate-identities-fail-closed", () => {
            var fake = new Fake(); var engine = new ApplicationEngine(fake); engine.List();
            fake.Applications = new List<ShellApplication>();
            Check(Text(engine.Open(Hash("Example.Package!Calendar")), "code") == "missing_app", "removed applications are revalidated");
            fake.Applications = new List<ShellApplication> { new ShellApplication("Example.Package!Calendar", "One"), new ShellApplication("Example.Package!Calendar", "Two") };
            Check(Text(engine.List(), "code") == "invalid_response", "duplicate hashed identities invalidate the complete catalog");
            Check(Text(engine.Open(Hash("Example.Package!Calendar")), "type") == "error" && fake.Invocations == 0, "ambiguous catalog identity never dispatches");
        });
        Run("invalid-catalog-and-rejected-invocation", () => {
            foreach (var application in new [] { new ShellApplication("bad\nidentity", "App"), new ShellApplication(new string('x',1025), "App"), new ShellApplication("Example!App", "bad\u0000name") }) {
                var fake = new Fake { Applications = new List<ShellApplication> { application } };
                Check(Text(new ApplicationEngine(fake).List(), "code") == "invalid_response", "untrusted native metadata fails bounded validation");
                Check(fake.Invocations == 0, "bad metadata does not launch");
            }
            var rejected = new Fake { Accepted = false }; var output = new ApplicationEngine(rejected).Open(Hash("Example.Package!Calendar"));
            Check(Text(output, "code") == "open_failed" && rejected.Invocations == 1, "native dispatch failure is never success or automatically retried");
        });
        Console.WriteLine("native-engine failures=" + failures); return failures == 0 ? 0 : 1;
    }
}
