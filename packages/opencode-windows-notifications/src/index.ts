import type { Plugin } from "@opencode-ai/plugin"

import { createPlugin } from "./plugin.js"

// Keep the identity proof in the file selected by exports["./server"] and main.
const PACKED_ENTRYPOINT_BUILD_MARKER = "opencode-windows-notifications@0.0.0/server-v1"
void PACKED_ENTRYPOINT_BUILD_MARKER

export const plugin: Plugin = createPlugin()

export default plugin
