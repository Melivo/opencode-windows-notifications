# Umbau opencode-windows-notifications auf den offiziell dokumentierten OpenCode-Pluginvertrag

> Release-faehiges Windows-only OpenCode-Plugin auf den offiziell dokumentierten Pluginvertrag umbauen (exportierte typisierte Plugin-Funktion; isolierter NPM-Ladepfad mit Build-Identitaet; keine undokumentierten Vertragsvarianten).

**Status**: Active
**Created**: 2026-08-10
**Revised**: 2026-08-10 (Revision 5)
**Owner**: architecture / backend / qa / docs
**Plan-JSON**: `.agents/results/plan-20260810-041536.json`

## Goal
Das Paket `packages/opencode-windows-notifications/` von den unbestaetigten Annahmen (TuiPluginModule, `./tui`-Subpath, `opencode plugin ... --global`, `PluginModule.server`-Variante, Console-Logging-Fallback) auf den offiziell dokumentierten OpenCode-Pluginvertrag umbauen. Kanonische Autorisierungsform: benannter exportierter typisierter `Plugin`-Export. NPM-Plugin via `opencode.json` plugin-Array (Paketname). Logging ausschliesslich via `client.app.log({body})` (fail-open = no-op). Windows-only via `os:["win32"]` + Runtime-Inertness. Das Paket emitiert einen deterministischen Build-Marker/Hash fuer den isolierten Loader-Beweis. Sicherheitsinvarianten werden durch KONKRETE Tests gesichert. Codeaenderungen erfolgen in der Ultrawork-Sitzung, nicht in diesem Plan. Zusaetzlich (Rev. 4): T8 isoliert nachweislich den OpenCode-Bun-Plugin-Cache `~/.cache/opencode/node_modules/` (`npm_config_cache` allein genuegt nicht); regulaere Tests und Loader-Gate werden in separate Scripts (`test:regular`, `test:loader`) getrennt; T3 erhaelt Event->Transport-Integrationstests (genau ein Spawn je berechtigtem Event, Erfolgs- + Fehlerpfad nach Timern/Microtasks, kein Fallback/Retry). Zusaetzlich (Rev. 5, CCR-Meta-Review; lokal verifizierte OpenCode-1.18.15-Loader-Fakten VERBINDLICH): Packaging-PASS erfordert `exports["./server"]` ODER `main` (`exports["."]` allein unzureichend); `engines.opencode` ist konditionales Gate (falls vorhanden, muss der Range 1.18.15 einschliessen); T8 nutzt Kandidaten-Tarball + SHA256 ueber eine temporaere Loopback-Registry (externer Registryzugriff verweigert; Resolverpfad im temp. Bun-Plugin-Cache; Tarball-Hash + Buildmarker muessen uebereinstimmen, sonst BLOCKED); die Child-Umgebung ist strikt allowlisted (HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG/ProgramData/npm-Cache gesetzt; `OPENCODE_CONFIG`/`_DIR`/`_CONTENT`/`_CONSOLE_TOKEN` geloescht; leerer Auth-/State-Kontext; Loopback-only; Timeout mit Prozessbaumabbruch; Zugriffsaudit); doppelte Registrierung wird verhindert (Default-Export nur identische Referenz wie benannter Export oder verboten; genau EINE Initialisierung/Hooks-Registrierung belegt).

## Context
- Autorisierungsform-Korrektur (Rev. 2): dokumentierter Vertrag verlangt exportierte Plugin-Funktion; Default-Export NICHT verpflichtend.
- Load-Smoke-Verschaerfung (Rev. 3): echter, ISOLIERTER OpenCode-Load mit Build-Identitaet oder ehrliches GATE BLOCKED. Ein Dynamic-Import-Fallback ist unzulaessig; ein bloszes Load-Signal ohne Build-Marker ist kein PASS.
- T6 vs. NPM-Ladepfad (Rev. 3): T6 beweist NUR Toast-Sichtbarkeit, NIEMALS den NPM-Ladepfad. Ein Plugin-Verzeichnispfad ist hoechstens eine optionale Sichtbarkeitshilfe.
- Getrennte Verdicte (Rev. 3): regulaere Tests und Loader-Gate werden getrennt ausgewiesen; BLOCKED ist KEIN Gesamtabschluss.
- engines.opencode (Rev. 3): KEIN Vertragsgate (keine autoritative Policy-Quelle; nur informational).
- Bun-Plugin-Cache (Rev. 4): T8 muss `~/.cache/opencode/node_modules/` nachweislich in den temp. Test-Root aufloesen; `npm_config_cache` allein genuegt nicht; ohne Isolierung GATE BLOCKED.
- Separate Test-Scripts (Rev. 4): `test:regular` und `test:loader` als operativ getrennte Befehle; Loader-BLOCKED darf nicht als regulaerer PASS/Skip erscheinen.
- Event->Transport-Integration (Rev. 4): T3 erhaelt Integrationstests (1 Spawn/Event, Erfolg+Error, nach Timern/Microtasks, kein Fallback/Retry); T4 behaelt Unit-Tests.
- Packaging-Entrypoint (Rev. 5, verbindlich): Packaging-PASS erfordert `exports["./server"]` ODER `main`; `exports["."]` allein ist unzureichend.
- engines.opencode (Rev. 5): KONDITIONALES Gate - vorhandenes Feld muss 1.18.15 einschliessen (superseded Rev.-3-Herabstufung); nicht vorhandenes Feld bleibt informational.
- Tarball + Loopback-Registry (Rev. 5): T8 packt Kandidaten-Tarball + SHA256; temp. Loopback-Registry serviert exakt dieses Paket/Version; externer Zugriff verweigert; Resolverpfad im temp. Bun-Plugin-Cache; Tarball-Hash + Buildmarker muessen uebereinstimmen, sonst BLOCKED.
- Child-Env-Allowlist (Rev. 5): strikt allowlisted Umgebung; `OPENCODE_CONFIG*`/`OPENCODE_CONSOLE_TOKEN` geloescht; leerer Auth-/State-Kontext; Loopback-only; Timeout mit Prozessbaumabbruch; Zugriffsaudit; nicht isolierbar => BLOCKED.
- Single-Registration (Rev. 5): Default-Export nur als identische Referenz wie der benannte Plugin-Export oder verboten; T8 belegt genau EINE Initialisierung/Hooks-Registrierung ueber den echten Loader.

## Constraints
- Windows ausschliesslich (`os:["win32"]` + Runtime-Inertness auf Nicht-Windows).
- Sitzungen mit nicht-leerem `parentID` sind Subagents und duerfen keine Toasts ausloesen (Heuristik, keine TUI-Garantie).
- Kein Shell-Interpolation, keine dynamischen Toastinhalte, kein OSC/BEL/ESC, kein Retry-Timer/Loop, kein Fallback-Transport, maximal ein Spawn je berechtigtem Event.
- Release-Gates: `gate-process-api`, `gate-event-data`, `gate-client-identity`, `gate-entrypoint-install`, `gate-windows-toast`, `gate-loader-isolated-load`. engines.opencode ist KONDITIONALES Gate (Rev. 5): vorhandener Range muss 1.18.15 einschliessen.
- Packaging-Entrypoint (Rev. 5): `exports["./server"]` ODER `main` erforderlich; `exports["."]` allein unzureichend.
- Loader-Test (Rev. 5): Kandidaten-Tarball + SHA256 ueber temp. Loopback-Registry (externer Zugriff verweigert); strikt allowlisted Child-Env (OPENCODE_CONFIG*/CONSOLE_TOKEN geloescht, leerer Auth-/State-Kontext, Loopback-only, Timeout mit Prozessbaumabbruch, Zugriffsaudit); genau eine Initialisierung/Hooks-Registrierung.
- Load-Smoke-Isolation (Rev. 4): globaler OpenCode-Bun-Plugin-Cache `~/.cache/opencode/node_modules/` wird in den temp. Test-Root aufgeloest; `npm_config_cache` allein unzureichend.
- Operative Trennung (Rev. 4): `test:regular` (inkl. event-transport) und `test:loader` als getrennte Scripts; T7 protokolliert beide getrennt.

## Tasks

| # | Task | Agent | Priority | Status | Dependencies |
|---|------|-------|----------|--------|--------------|
| T1 | Typaudit: installierter vs. dokumentierter OpenCode-Plugin-/SDK-Vertrag (PluginModule.server undokumentiert; engines.opencode-Gate-Quelle + Isolationsunterstuetzung + Bun-Plugin-Cache-Pfad/-Env pruefen) | architecture | 1 | TODO | - |
| T2 | ADR: Error-Toast-Scope + TUI-Diskriminator + PluginModule.server-Entfernung + no-op-Logging + Plugin-Exportform + Load-Smoke-Gate (isoliert+Build-Identitaet+Bun-Plugin-Cache) + engines.opencode-Policy + Sicherheits-Invariant-Tests + separate Test-Scripts + Event->Transport-Integrationstests (Rev. 4) | architecture | 1 | TODO | - |
| T4 | Transport verifizieren: shell-free/fail-open/no-op-Logging + KONKRETE Sicherheits-Invariant-Tests (kein OSC/BEL/ESC, max. ein Spawn, kein Retry, kein Fallback) [UNIT-Ebene; Integration bei T3, Rev. 4] | backend | 1 | TODO | - |
| T3 | Entrypoint + internen Vertrag + Eligibility + Build-Marker auf dokumentierten Plugin-Vertrag umbauen (TDD) + separate Test-Scripts (`test:regular`/`test:loader`) + Event->Transport-Integrationstests (Rev. 4) + Packaging-Entrypoint `exports["./server"]`/`main` + engines.opencode konditionales Gate + Single-Registration-Referenzidentitaet (Rev. 5) | backend | 2 | TODO | T1, T2, T4 |
| T5 | README + Doku auf offiziellen Installationspfad, Plugin-Exportform (Default nur identische Referenz), no-op-Logging, os:[win32], Build-Marker, Bun-Plugin-Cache-Isolierung, separate Test-Scripts, Packaging-Entrypoint, Release-Gates (engines.opencode konditionales Gate, Rev. 5) | docs | 3 | TODO | T3, T4 |
| T6 | Smoke-Harness NUR fuer Toast-SICHTBARKEIT + Ehrlichkeits-Assertionen; KEIN Beweis des NPM-Ladepfads (neue Testdatei) | qa | 3 | TODO | T3, T4 |
| T8 | Echter ISOLIERTER OpenCode-NPM-Load-Smoke via Kandidaten-Tarball + SHA256 ueber temp. Loopback-Registry (externer Zugriff verweigert; Resolverpfad im temp. Bun-Plugin-Cache; Tarball-Hash + Buildmarker-Abgleich) mit allowlisted Child-Env + Single-Registration-Beweis ODER GATE BLOCKED; kein Dynamic-Import-PASS + statische Packaging-Assertionen (os:win32, exports["./server"]/main, engines konditionales Gate) (Rev. 5) | qa | 3 | TODO | T3, T4 |
| T7 | End-QA-Gate: GETRENTE Verdicte (regulaere Tests via `test:regular` vs. Loader-Gate via `test:loader`) + typecheck/build/coverage >=80% + Sicherheits-Invariant-Tests-Verifikation + Event->Transport-Integrationsverifikation + Packaging-/Engines- + Tarball-/Registry-/Child-Env-/Single-Registration-Evidenz + Release-Gate-Verdict (Rev. 5) | qa | 4 | TODO | T3, T4, T5, T6, T8 |

## Done When

Gesamtabschluss = ZWEI GETRENNTE Verdicte, BEIDE erfuellt (Rev. 3, Finding 4):

**Verdict (A) - Regulaere Tests:**
- [ ] Plugin-Entrypoint konform zu offiziell dokumentiertem Plugin-Vertrag (exportierte typisierte Plugin-Funktion; kanonisch benannter Export `plugin: Plugin`, Default-Export nur identische Referenz oder verboten (Rev. 5); Hooks.event; client.app.log({body}); client.session.get({path:{id}}))
- [ ] Build-Identitaet: Paket emitiert deterministischen Build-Marker/Hash, aus der geladenen Plugin-Instanz auslesbar
- [ ] PluginModule.server nirgends verwendet (nur T1 zitiert es als Audit-Finding)
- [ ] Kein TuiPluginModule, kein ./tui-Import, kein `opencode plugin --global` in Code oder Doku
- [ ] Kein Console-Fallback; fail-open Logging-Fallback ist no-op (src/ frei von console.*)
- [ ] Sicherheitsanforderungen vollstaendig erhalten (Windows-only, feste Texte, shell-free, Primaer-Session-Proxy, fail-open, no-op-Logging, keine sensiblen Logs)
- [ ] KONKRETE Sicherheits-Invariant-Tests vorhanden und gruen: keine OSC/BEL/ESC-Ausgabe, max. ein Spawn je berechtigtem Event, kein Retry-Timer/Loop, kein Fallback-Transport
- [ ] EVENT->TRANSPORT-INTEGRATIONSTESTS vorhanden und gruen (Rev. 4): genau ein Spawn je berechtigtem Event im Erfolgs- + Fehlerpfad nach Timern/Microtasks, kein Fallback-/Retry-Spawn
- [ ] SEPARATE TEST-SCRIPTS (Rev. 4): `test:regular` und `test:loader` als operativ getrennte Befehle; ein Loader-BLOCKED ist kein regulaerer PASS/Skip
- [ ] Keine erfundene Error-Transition-ID; session.error aus Release-Scope ausgeschlossen
- [ ] TUI-only als Restrisiko dokumentiert (nicht als Garantie behauptet)
- [ ] README + Tests + Smoke-Harness bilden offiziellen Installationspfad ab; T6 beweist NUR Toast-Sichtbarkeit, NIEMALS den NPM-Ladepfad
- [ ] PACKAGING-ENTRYPOINT (Rev. 5): `exports["./server"]` ODER `main` zeigt auf den Plugin-Entrypoint; `exports["."]` allein ist unzureichend (Packaging-FAIL)
- [ ] engines.opencode ist KONDITIONALES Gate (Rev. 5): falls vorhanden, schliesst der Range 1.18.15 ein (sonst FAIL); nicht vorhandenes Feld = informational
- [ ] SINGLE-REGISTRATION (Rev. 5): etwaiger Default-Export = identische Referenz wie benannter Plugin-Export (T3-Test gruen); T8 belegt genau EINE Initialisierung/Hooks-Registrierung ueber den echten Loader
- [ ] entrypoint/eligibility/transport/smoke-harness/event-transport gruen via `bun run test:regular`; typecheck + build gruen; Coverage >=80%

**Verdict (B) - Loader-Gate:**
- [ ] T8 = echter, ISOLIERTER OpenCode-Load via Kandidaten-Tarball + SHA256 ueber temp. Loopback-Registry (EXAKT dieses Paket/Version; externer Registryzugriff verweigert) in strikt allowlisted Child-Env (HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG/ProgramData/npm-Cache auf temp. Pfade; `OPENCODE_CONFIG`/`_DIR`/`_CONTENT`/`_CONSOLE_TOKEN` geloescht; leerer Auth-/State-Kontext; Loopback-only; Timeout mit Prozessbaumabbruch; Zugriffsaudit; globale Config/Plugins + NPM-Cache + Bun-Plugin-Cache weder gelesen noch ausgefuehrt) via temp. opencode.json-Paketnamen-Pfad, Resolverpfad im temp. Bun-Plugin-Cache, aufgeloester Tarball-Hash = Kandidaten-SHA256 UND Buildmarker = Build-Artefakt, genau EINE Initialisierung/Hooks-Registrierung = PASS
- [ ] HINWEIS: Ist die Quelle nicht isolierbar, keine autorisierte Isolationsmethode dokumentiert oder der echte Load nicht moeglich -> GATE BLOCKED, und das ist KEIN Gesamtabschluss (auch nicht via interaktivem Smoke, der nur Sichtbarkeit beweist)

> BLOCKED ist KEIN Gesamtabschluss: Ist (B) BLOCKED, ist der Gesamtabschluss NICHT erreicht, selbst wenn (A) komplett gruen ist.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-10 | errorToast = B (session.error aus Release-Scope ausschliessen) | Kernwert ohne Abhaengigkeit von undokumentiertem Feld; keine erfundene ID |
| 2026-08-10 | tuiDiscriminator = B (dok. server-Vertrag + Primaer-Session-Proxy) | Offizieller Vertrag; parentID-Proxy mit ausgewiesenem Restrisiko |
| 2026-08-10 | pluginModuleServer = B (nur exportierte typisierte Plugin-Funktion) | Undokumentierte Typ-Variante entfernen |
| 2026-08-10 | pluginExportForm = B (benannter Export kanonisch; Default optional) | Dokumentierter Vertrag verlangt exportierte Plugin-Funktion, nicht zwingend Default-Export |
| 2026-08-10 | loadSmokeGate = B (echter isolierter Load mit Build-Identitaet ODER BLOCKED) | Dynamic-Import beweist nur Importierbarkeit; Load-Signal ohne Identitaet ist kein PASS |
| 2026-08-10 | loadSmokeIsolation = B (vollstaendige Benutzer-/Config-/Cache-Isolation) | Globale Config/Plugins + NPM-Cache duerfen weder gelesen noch ausgefuehrt werden |
| 2026-08-10 | buildIdentityGate = B (Build-Marker/Hash-Identitaet erforderlich) | Sonst nicht bewiesen, WELCHER Build geladen wurde |
| 2026-08-10 | enginesOpencodePolicy = B (herabgestuft auf informational) | Keine autoritative Policy-Quelle; Docs-Fakt ist kein Vertragsgate |
| 2026-08-10 | securityInvariantTests = B (konkrete Tests in T4 erforderlich) | Checkliste ohne ausfuehrbare Tests ist eine Behauptung, kein Beweis |
| 2026-08-10 | loggingFallback = B (no-op) | client.app.log verfuegbar; Console im Produktionspfad unzulaessig |
| 2026-08-10 | bunPluginCacheIsolation = B (`~/.cache/opencode/node_modules/` in temp. Test-Root aufloesen) | `npm_config_cache` allein genuegt nicht; ohne Isolierung GATE BLOCKED |
| 2026-08-10 | separateTestScripts = B (`test:regular` + `test:loader`) | Ein Befehl vermengt regulaere Suite mit Loader-Gate; BLOCKED darf nicht als PASS/Skip einsickern |
| 2026-08-10 | eventTransportIntegrationTests = B (T3 Integration; T4 Unit) | Unit-Tests beweisen nicht die Event->Spawn-Verkabelung Ende-zu-Ende |
| 2026-08-10 | packagingEntrypointGate = B (`exports["./server"]` oder `main` erforderlich; `exports["."]` allein unzureichend) | Lokal verifizierter OpenCode-1.18.15-Loader-Fakt ist verbindlich |
| 2026-08-10 | enginesOpencodeVersionGate = B (konditionales Gate: vorhandener Range muss 1.18.15 einschliessen; superseded Rev.-3-Herabstufung fuer vorhandenes Feld) | Verbindliche lokale Loader-Fakten; nicht vorhandenes Feld bleibt informational |
| 2026-08-10 | tarballLoopbackRegistry = B (Kandidaten-Tarball + SHA256 ueber temp. Loopback-Registry; externer Zugriff verweigert; Tarball-Hash + Buildmarker-Abgleich, sonst BLOCKED) | Nur so ist bewiesen, dass der Loader das Kandidaten-Artefakt ueber seinen Registry-Resolve-Pfad laedt |
| 2026-08-10 | childEnvAllowlist = B (strikt allowlisted Child-Env; OPENCODE_CONFIG*/CONSOLE_TOKEN geloescht; leerer Auth-/State-Kontext; Loopback-only; Timeout mit Prozessbaumabbruch; Zugriffsaudit) | Override-Listen sind unvollstaendig; jede geerbte Variable ist ein potenzieller Isolationsbruch |
| 2026-08-10 | singleRegistrationGate = B (Default-Export nur identische Referenz wie benannter Export oder verboten; genau eine Initialisierung/Hooks-Registrierung belegt) | Divergierende Referenz = doppelte Hooks-Registrierung = doppelte Spawns (Sicherheitsinvarianten-Bruch) |

## Progress Notes

- [2026-08-10] Plan erstellt und vom Nutzer bestaetigt.
- [2026-08-10] Revision 1: Completeness-Review (PluginModule.server entfernt; Console-Fallback = no-op; os:win32-Kriterien; session.error aus Scope).
- [2026-08-10] Revision 2: Exportform + Load-Smoke-Gate (benannter Export kanonisch; echter Load ODER BLOCKED).
- [2026-08-10] Revision 3 (sechs Funde): (1) T8-Isolation verschaerft - temp. Benutzer-/Config-/Cache-Kontext, globale Config/Plugins + NPM-Cache weder gelesen noch ausgefuehrt, keine autorisierte Methode -> GATE BLOCKED; (2) PASS braucht Build-Marker/Hash-Identitaet; (3) T6 nur Toast-Sichtbarkeit, nie NPM-Ladepfad-Beweis; (4) regulaere Tests und Loader-Gate getrennt, BLOCKED ist kein Gesamtabschluss; (5) engines.opencode als Vertragsgate entfernt (informational); (6) konkrete Sicherheits-Invariant-Tests in T4/T7. Neue Entscheidungen: loadSmokeIsolation, buildIdentityGate, enginesOpencodePolicy, securityInvariantTests. Interaktiver Smoke als Loader-PASS-Ersatz zurueckgenommen (separate Sichtbarkeits-Saeule).
- [2026-08-10] Revision 4 (drei HIGH-Funde): (1) T8 isoliert zusaetzlich den OpenCode-Bun-Plugin-Cache `~/.cache/opencode/node_modules/` in den temp. Test-Root; `npm_config_cache` allein genuegt nicht; ohne Isolierung GATE BLOCKED. (2) `test:regular` und `test:loader` als operativ getrennte Scripts; T7 protokolliert beide getrennt; Loader-BLOCKED darf nicht als regulaerer PASS/Skip erscheinen. (3) T3 erhaelt Event->Transport-Integrationstests (1 Spawn/Event, Erfolg+Error, nach Timern/Microtasks, kein Fallback/Retry); T4 behaelt Unit-Tests. Neue Entscheidungen: bunPluginCacheIsolation, separateTestScripts, eventTransportIntegrationTests.
- [2026-08-10] Revision 5 (CCR-Meta-Review; lokal verifizierte OpenCode-1.18.15-Loader-Fakten verbindlich): (1) Packaging-PASS erfordert `exports["./server"]` ODER `main`; `exports["."]` allein unzureichend. (2) engines.opencode konditionales Gate: vorhandener Range muss 1.18.15 einschliessen (superseded Rev.-3-Herabstufung). (3) T8 = echter isolierter Loader-Test via Kandidaten-Tarball + SHA256 ueber temp. Loopback-Registry (externer Zugriff verweigert; Resolverpfad im temp. Bun-Plugin-Cache; Tarball-Hash + Buildmarker-Abgleich, sonst BLOCKED). (4) Child-Env strikt allowlisted (OPENCODE_CONFIG*/CONSOLE_TOKEN geloescht; leerer Auth-/State-Kontext; Loopback-only; Timeout mit Prozessbaumabbruch; Zugriffsaudit; nicht isolierbar => BLOCKED). (5) Doppelregistrierung verhindert: Default-Export nur identische Referenz wie benannter Export oder verboten; genau eine Initialisierung/Hooks-Registrierung belegt. Neue Entscheidungen: packagingEntrypointGate, enginesOpencodeVersionGate, tarballLoopbackRegistry, childEnvAllowlist, singleRegistrationGate. T3/T8/T7 (+ T5-Konsistenz) aktualisiert. Keine Source-Aenderungen.
