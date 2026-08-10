import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"
import { platform as runtimePlatform } from "node:process"

import type { EligibleEvent, HostContext, Notify } from "./contract.js"
import { createOnEvent, createOnPermission } from "./eligibility/index.js"
import {
  createNotify,
  type CreateNotifyDependencies,
  type TransportLogEntry,
} from "./transport/index.js"

const SERVICE = "opencode-windows-notifications"
const BUILD_MARKER = "opencode-windows-notifications@0.0.0/server-v1"

type HostLogBody = Readonly<{
  service: typeof SERVICE
  level: "debug" | "info" | "warn" | "error"
  message: string
  extra?: Record<string, unknown>
}>

type CreateNotify = (
  dependencies?: CreateNotifyDependencies,
) => Notify

export type CreatePluginDependencies = Readonly<{
  platform?: string
  createNotify?: CreateNotify
}>

async function logToHost(
  client: PluginInput["client"],
  body: HostLogBody,
): Promise<void> {
  try {
    await client.app.log({ body })
  } catch {
    // The documented host logger has no fallback channel.
  }
}

function createHostContext(
  client: PluginInput["client"],
  directory: string,
): HostContext {
  return Object.freeze({
    async resolveSession(sessionID: string) {
      try {
        const result = await client.session.get({
          path: { id: sessionID },
          query: { directory },
        })
        const session = result.data

        if (!session) return undefined

        return session.parentID
          ? { id: session.id, parentID: session.parentID }
          : { id: session.id }
      } catch {
        return undefined
      }
    },
  })
}

function transportLogBody(entry: TransportLogEntry): HostLogBody {
  return {
    service: SERVICE,
    level: "warn",
    message: "Windows notification transport failed open",
    extra: {
      category: entry.category,
      eventType: entry.eventType,
      sessionID: entry.sessionID,
    },
  }
}

export function createPlugin(
  dependencies: CreatePluginDependencies = {},
): Plugin {
  const platform = dependencies.platform ?? runtimePlatform
  const createNotificationTransport = dependencies.createNotify ?? createNotify

  return async ({ client, project, directory }) => {
    void project

    if (platform !== "win32") {
      return {
        event: async () => undefined,
      } satisfies Hooks
    }

    await logToHost(client, {
      service: SERVICE,
      level: "info",
      message: "Server plugin initialized",
      extra: { buildMarker: BUILD_MARKER },
    })

    const notify = createNotificationTransport({
      platform,
      log: (entry) => logToHost(client, transportLogBody(entry)),
    })
    const onEvent = createOnEvent({ notify })
    const onPermission = createOnPermission({ notify })
    const hostContext = createHostContext(client, directory)

    const eventHook: NonNullable<Hooks["event"]> = async ({ event }) => {
      let projected: EligibleEvent | undefined

      try {
        switch (event.type) {
          case "message.updated": {
            const { info } = event.properties
            if (info.role !== "assistant" || info.time.completed === undefined) {
              return
            }
            projected = {
              type: "assistant.response.completed",
              sessionID: info.sessionID,
              assistantResponseID: info.id,
            }
            break
          }
          case "session.idle":
            projected = {
              type: "session.idle",
              sessionID: event.properties.sessionID,
            }
            break
          default:
            // Events without an authoritative typed contract remain fail-closed.
            return
        }

        await onEvent(projected, hostContext)
      } catch {
        // Hook, lookup, eligibility, and transport failures never escape to the host.
      }
    }

    const permissionAskHook: NonNullable<Hooks["permission.ask"]> = async (
      permission,
    ) => {
      try {
        await onPermission(permission, hostContext)
      } catch {
        // Typed permission-hook failures never escape or alter host state.
      }
    }

    return {
      event: eventHook,
      "permission.ask": permissionAskHook,
    } satisfies Hooks
  }
}
