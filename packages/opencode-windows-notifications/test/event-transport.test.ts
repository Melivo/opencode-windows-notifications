import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"

const packageRoot = resolve(import.meta.dir, "..")

async function runScenario(scenario: "success" | "failure" | "subsession") {
  const probe = Bun.spawn(
    [process.execPath, "test/fixtures/entrypoint-probe.ts", scenario],
    { cwd: packageRoot, stdout: "pipe", stderr: "pipe" },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ])

  expect(exitCode, stderr).toBe(0)
  return JSON.parse(stdout.trim())
}

describe("documented hook to transport integration", () => {
  test("dispatches one transport call per new eligible idle and permission input", async () => {
    const result = await runScenario("success")

    expect(result.transportCalls).toBe(2)
    expect(result.notifications).toHaveLength(2)
  })

  test("does not retry or fall back after a failed transport call", async () => {
    const result = await runScenario("failure")

    expect(result.transportCalls).toBe(2)
    expect(result.notifications).toHaveLength(2)
    expect(result.logs).toHaveLength(3)
  })

  test("does not call transport for a subsession", async () => {
    const result = await runScenario("subsession")

    expect(result.transportCalls).toBe(0)
    expect(result.notifications).toEqual([])
  })
})
