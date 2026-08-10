import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

const packageRoot = resolve(import.meta.dir, "..")
const lcovPath = resolve(packageRoot, "coverage", "lcov.info")

function sourcePathFrom(record: string): string | undefined {
  const sourceLine = record
    .split(/\r?\n/u)
    .find((line) => line.startsWith("SF:"))
  if (!sourceLine) return undefined

  const lcovPath = sourceLine.slice("SF:".length).replaceAll("\\", "/")
  const absolutePath = isAbsolute(lcovPath)
    ? lcovPath
    : resolve(packageRoot, lcovPath)
  return relative(packageRoot, absolutePath).replaceAll("\\", "/")
}

function metric(record: string, name: "LF" | "LH"): number {
  const prefix = `${name}:`
  const metricLine = record
    .split(/\r?\n/u)
    .find((line) => line.startsWith(prefix))
  if (!metricLine) throw new Error(`LCOV record is missing ${name}`)

  const value = Number(metricLine.slice(prefix.length))
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`LCOV record has invalid ${name}: ${metricLine}`)
  }
  return value
}

const minimum = Number(process.argv[2] ?? "80")
if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
  throw new Error("Coverage minimum must be a number from 0 through 100")
}

const lcov = await readFile(lcovPath, "utf8")
let linesFound = 0
let linesHit = 0
let sourceRecords = 0

for (const record of lcov.split("end_of_record")) {
  const sourcePath = sourcePathFrom(record)
  if (!sourcePath?.startsWith("src/")) continue

  const found = metric(record, "LF")
  const hit = metric(record, "LH")
  if (hit > found) throw new Error(`LCOV hits exceed lines for ${sourcePath}`)

  sourceRecords += 1
  linesFound += found
  linesHit += hit
}

if (sourceRecords === 0 || linesFound === 0) {
  throw new Error("LCOV contains no instrumented source lines under src/")
}

const coverage = (linesHit / linesFound) * 100
const summary =
  `Source line coverage: ${coverage.toFixed(2)}% ` +
  `(${linesHit}/${linesFound}); minimum ${minimum.toFixed(2)}%`

if (coverage < minimum) throw new Error(summary)
console.log(summary)
