declare module "node:buffer" {
  export const Buffer: {
    from(
      value: string,
      encoding: "utf8" | "utf16le",
    ): {
      toString(encoding: "base64"): string
    }
  }
}

declare module "node:child_process" {
  export function spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false
      windowsHide: true
      stdio: readonly ["pipe", "ignore", "ignore"]
    }>,
  ): Readonly<{
    stdin: Readonly<{
      once(event: "error", listener: (error: unknown) => void): unknown
      end(data: string): void
    }> | null
    once(event: "error", listener: (error: unknown) => void): unknown
    once(
      event: "close",
      listener: (code: number | null, signal: string | null) => void,
    ): unknown
    kill(): boolean
  }>
}

declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(value: string): {
      digest(encoding: "hex"): string
    }
  }
}

declare module "node:path" {
  export const win32: {
    isAbsolute(path: string): boolean
    resolve(...paths: readonly string[]): string
  }
}

declare module "node:process" {
  export const env: Readonly<Record<string, string | undefined>>
  export const platform: string
}
