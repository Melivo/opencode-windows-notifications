import { describe, expect, test } from "bun:test"
import type { Permission } from "@opencode-ai/sdk"

import type {
  EligibleEvent,
  HostContext,
  Notification,
  Notify,
} from "../src/contract.js"
import {
  createOnEvent,
  createOnPermission,
  MAX_PERMISSION_IDS_PER_SESSION,
  MAX_RESPONSE_IDS_PER_SESSION,
  MAX_TRACKED_SESSIONS,
} from "../src/eligibility/index.js"

const rootSession = (id = "session-root"): HostContext => ({
  resolveSession: async () => ({ id }),
})

function permission(
  id: string,
  sessionID = "session-root",
): Permission {
  return {
    id,
    type: "bash",
    sessionID,
    messageID: "message-1",
    title: "Run command",
    metadata: {},
    time: { created: 1 },
  }
}

function recorder() {
  const notifications: Notification[] = []
  const notify: Notify = async (notification) => {
    notifications.push(notification)
    return { delivered: true }
  }

  return { notifications, notify }
}

describe("server-event eligibility", () => {
  test("requires a known primary session", async () => {
    const { notifications, notify } = recorder()
    const onPermission = createOnPermission({ notify })

    const contexts: HostContext[] = [
      { resolveSession: async () => undefined },
      {
        resolveSession: async () => ({
          id: "session-child",
          parentID: "session-root",
        }),
      },
    ]

    for (const context of contexts) {
      await onPermission(permission("permission-1"), context)
    }

    expect(notifications).toEqual([])
  })

  test("treats an empty parentID as primary but rejects unstable IDs", async () => {
    const { notifications, notify } = recorder()
    const onEvent = createOnEvent({ notify })

    await onEvent(
      { type: "assistant.response.completed", sessionID: "session-root", assistantResponseID: "response-1" },
      { resolveSession: async () => ({ id: "session-root", parentID: "" }) },
    )
    await onEvent(
      { type: "session.idle", sessionID: "session-root" },
      { resolveSession: async () => ({ id: "session-root", parentID: "" }) },
    )
    await onEvent(
      { type: "session.idle", sessionID: " " },
      rootSession(),
    )

    expect(notifications).toHaveLength(1)
  })

  test("emits one fixed idle notification for each new assistant epoch", async () => {
    const { notifications, notify } = recorder()
    const onEvent = createOnEvent({ notify })
    const context = rootSession()
    const idle: EligibleEvent = { type: "session.idle", sessionID: "session-root" }
    const completed = (assistantResponseID: string): EligibleEvent => ({
      type: "assistant.response.completed",
      sessionID: "session-root",
      assistantResponseID,
    })

    await onEvent(idle, context)
    await onEvent(completed("response-1"), context)
    await onEvent(completed("response-1"), context)
    await onEvent(idle, context)
    await onEvent(idle, context)
    await onEvent(completed("response-2"), context)
    await onEvent(idle, context)

    expect(notifications).toEqual([
      {
        event: "session.idle",
        title: "OpenCode",
        body: "Antwort abgeschlossen",
        sessionID: "session-root",
      },
      {
        event: "session.idle",
        title: "OpenCode",
        body: "Antwort abgeschlossen",
        sessionID: "session-root",
      },
    ])
  })

  test("emits each stable permission once without mutating host session state", async () => {
    const { notifications, notify } = recorder()
    const onPermission = createOnPermission({ notify })
    const hostSession = Object.freeze({ id: "session-root" })
    const context: HostContext = {
      resolveSession: async () => hostSession,
    }
    await onPermission(permission("permission-1"), context)
    await onPermission(permission("permission-1"), context)
    await onPermission(permission("permission-2"), context)
    await onPermission(permission(" "), context)

    expect(notifications).toEqual([
      {
        event: "permission.asked",
        title: "OpenCode",
        body: "Aktion erfordert deine Freigabe",
        sessionID: "session-root",
      },
      {
        event: "permission.asked",
        title: "OpenCode",
        body: "Aktion erfordert deine Freigabe",
        sessionID: "session-root",
      },
    ])
    expect(hostSession).toEqual({ id: "session-root" })
  })

  test("bounds permission dedupe while retaining recently observed IDs", async () => {
    const { notifications, notify } = recorder()
    const onPermission = createOnPermission({ notify })
    const context = rootSession()

    for (let index = 1; index <= MAX_PERMISSION_IDS_PER_SESSION; index += 1) {
      await onPermission(permission(`permission-${index}`), context)
    }
    await onPermission(permission("permission-1"), context)
    await onPermission(
      permission(`permission-${MAX_PERMISSION_IDS_PER_SESSION + 1}`),
      context,
    )
    await onPermission(permission("permission-2"), context)

    expect(notifications).toHaveLength(MAX_PERMISSION_IDS_PER_SESSION + 2)
  })

  test("bounds response dedupe while retaining recently observed IDs", async () => {
    const { notifications, notify } = recorder()
    const onEvent = createOnEvent({ notify })
    const context = rootSession()
    const completed = (assistantResponseID: string): EligibleEvent => ({
      type: "assistant.response.completed",
      sessionID: "session-root",
      assistantResponseID,
    })
    const idle: EligibleEvent = { type: "session.idle", sessionID: "session-root" }

    for (let index = 1; index <= MAX_RESPONSE_IDS_PER_SESSION; index += 1) {
      await onEvent(completed(`response-${index}`), context)
    }
    await onEvent(idle, context)

    await onEvent(completed("response-1"), context)
    await onEvent(completed(`response-${MAX_RESPONSE_IDS_PER_SESSION + 1}`), context)
    await onEvent(idle, context)
    await onEvent(completed("response-1"), context)
    await onEvent(idle, context)
    await onEvent(completed("response-2"), context)
    await onEvent(idle, context)

    expect(notifications).toHaveLength(3)
  })

  test("bounds session state with least-recently-used eviction", async () => {
    const { notifications, notify } = recorder()
    const onEvent = createOnEvent({ notify })
    const completed = (sessionID: string): EligibleEvent => ({
      type: "assistant.response.completed",
      sessionID,
      assistantResponseID: "response-1",
    })

    for (let index = 0; index < MAX_TRACKED_SESSIONS; index += 1) {
      const sessionID = `session-${index}`
      await onEvent(completed(sessionID), rootSession(sessionID))
    }

    await onEvent(completed("session-0"), rootSession("session-0"))
    await onEvent(
      completed(`session-${MAX_TRACKED_SESSIONS}`),
      rootSession(`session-${MAX_TRACKED_SESSIONS}`),
    )
    await onEvent(
      { type: "session.idle", sessionID: "session-1" },
      rootSession("session-1"),
    )
    await onEvent(
      { type: "session.idle", sessionID: "session-0" },
      rootSession("session-0"),
    )

    expect(notifications.map(({ sessionID }) => sessionID)).toEqual(["session-0"])
  })

  test("fails open when lookup or delivery rejects", async () => {
    const lookupFailure = createOnEvent({
      notify: async () => {
        throw new Error("must not run")
      },
    })
    let deliveryAttempts = 0
    const deliveryFailure = createOnEvent({
      notify: async () => {
        deliveryAttempts += 1
        throw new Error("delivery failed")
      },
    })
    let permissionDeliveryAttempts = 0
    const permissionDeliveryFailure = createOnPermission({
      notify: async () => {
        permissionDeliveryAttempts += 1
        throw new Error("permission delivery failed")
      },
    })

    await expect(
      lookupFailure(
        { type: "session.idle", sessionID: "session-root" },
        { resolveSession: async () => { throw new Error("lookup failed") } },
      ),
    ).resolves.toBeUndefined()
    await deliveryFailure(
      {
        type: "assistant.response.completed",
        sessionID: "session-root",
        assistantResponseID: "response-1",
      },
      rootSession(),
    )
    await expect(
      deliveryFailure(
        { type: "session.idle", sessionID: "session-root" },
        rootSession(),
      ),
    ).resolves.toBeUndefined()
    await expect(
      permissionDeliveryFailure(
        permission("permission-1"),
        rootSession(),
      ),
    ).resolves.toBeUndefined()
    await expect(
      permissionDeliveryFailure(
        permission("permission-1"),
        rootSession(),
      ),
    ).resolves.toBeUndefined()
    expect(deliveryAttempts).toBe(1)
    expect(permissionDeliveryAttempts).toBe(1)
  })
})
