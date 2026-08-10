import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"

const scriptsRoot = resolve(import.meta.dir, "../scripts")
const harnessPath = resolve(scriptsRoot, "windows-toast-smoke.ps1")

async function readHarness() {
  return Bun.file(harnessPath).text()
}

describe("manual Windows toast visibility harness", () => {
  test("uses only the current documented server-plugin setup", async () => {
    const source = await readHarness()

    expect(source).toContain(
      '`"plugin": ["opencode-windows-notifications"]`',
    )
    expect(source).toContain("named, typed Plugin export `plugin`")
    expect(source).toContain("default export is optional")
    expect(source).not.toContain("PluginModule.server")
    expect(source).not.toContain("./tui")
    expect(source).not.toContain("opencode plugin")
  })

  test("keeps loader verification separate from manual visibility", async () => {
    const source = await readHarness()

    expect(source).toContain(
      "the harness does not prove the npm loader path or package/build identity",
    )
    expect(source).toContain("npmLoader = 'not-evaluated'")
    expect(source).not.toMatch(/npm[- ]loader.{0,50}\b(pass|passed)\b/i)
    expect(source).not.toMatch(/\b(pass|passed)\b.{0,50}npm[- ]loader/i)
  })

  test("requires explicit visual and exactly-once operator confirmation", async () => {
    const source = await readHarness()

    expect(source).toContain("'windows-terminal', 'editor-terminal'")
    expect(source).toContain("visibility = 'not-confirmed'")
    expect(source).toContain("exactlyOnce = 'not-confirmed'")
    expect(source).toContain("visibility = 'operator-confirmed'")
    expect(source).toContain("exactlyOnce = 'operator-confirmed'")
    expect(source).toContain(
      "Eine erfolgreiche Transport-Rueckgabe beweist keine Sichtbarkeit",
    )
    expect(source).toContain("verification = 'manual-windows-visual-check'")
    expect(source.match(/& opencode /g)).toHaveLength(1)
    expect(source).not.toMatch(/\$visible\s*=\s*\$true/i)
  })

  test("does not simulate delivery or expose unavailable events", async () => {
    const [source, scripts] = await Promise.all([
      readHarness(),
      readdir(scriptsRoot),
    ])

    expect(source).toContain("event = 'session.idle'")
    expect(source).not.toContain("permission.asked")
    expect(source).not.toContain("session.error")
    expect(source).not.toContain("createNotify")
    expect(source).not.toContain("windows-toast-smoke.ts")
    expect(scripts).toEqual([
      "check-source-coverage.ts",
      "windows-toast-smoke.ps1",
    ])
  })
})
