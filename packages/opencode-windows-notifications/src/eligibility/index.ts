import type { CreateOnEvent, CreateOnPermission } from "../contract.js"

const IDLE_CONTENT = Object.freeze({
  title: "OpenCode" as const,
  body: "Antwort abgeschlossen" as const,
})

const PERMISSION_CONTENT = Object.freeze({
  title: "OpenCode" as const,
  body: "Aktion erfordert deine Freigabe" as const,
})

export const MAX_TRACKED_SESSIONS = 256
export const MAX_RESPONSE_IDS_PER_SESSION = 128
export const MAX_PERMISSION_IDS_PER_SESSION = 128

type SessionState = {
  readonly assistantResponseIDs: Set<string>
  readonly permissionIDs: Set<string>
  assistantEpoch: number
  lastIdleEpoch: number
}

function hasStableID(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function createSessionState(): SessionState {
  return {
    assistantResponseIDs: new Set<string>(),
    permissionIDs: new Set<string>(),
    assistantEpoch: 0,
    lastIdleEpoch: 0,
  }
}

function sessionStateFor(
  stateBySessionID: Map<string, SessionState>,
  sessionID: string,
): SessionState {
  const existing = stateBySessionID.get(sessionID)
  if (existing) {
    stateBySessionID.delete(sessionID)
    stateBySessionID.set(sessionID, existing)
    return existing
  }

  if (stateBySessionID.size >= MAX_TRACKED_SESSIONS) {
    const oldest = stateBySessionID.keys().next()
    if (!oldest.done) stateBySessionID.delete(oldest.value)
  }

  const state = createSessionState()
  stateBySessionID.set(sessionID, state)
  return state
}

function trackID(ids: Set<string>, id: string, maximum: number): boolean {
  if (ids.delete(id)) {
    ids.add(id)
    return false
  }

  if (ids.size >= maximum) {
    const oldest = ids.values().next()
    if (!oldest.done) ids.delete(oldest.value)
  }

  ids.add(id)
  return true
}

export const createOnEvent: CreateOnEvent = ({ notify }) => {
  const stateBySessionID = new Map<string, SessionState>()

  return async (event, hostContext): Promise<void> => {
    try {
      if (!hasStableID(event.sessionID)) return

      const session = await hostContext.resolveSession(event.sessionID)
      if (
        !session ||
        !hasStableID(session.id) ||
        (session.parentID !== undefined && session.parentID !== "")
      ) {
        return
      }

      const state = sessionStateFor(stateBySessionID, session.id)

      if (event.type === "assistant.response.completed") {
        if (
          hasStableID(event.assistantResponseID) &&
          trackID(
            state.assistantResponseIDs,
            event.assistantResponseID,
            MAX_RESPONSE_IDS_PER_SESSION,
          )
        ) {
          state.assistantEpoch += 1
        }
        return
      }

      if (state.assistantEpoch <= state.lastIdleEpoch) return
      state.lastIdleEpoch = state.assistantEpoch

      await notify(
        Object.freeze({
          event: "session.idle",
          title: IDLE_CONTENT.title,
          body: IDLE_CONTENT.body,
          sessionID: session.id,
        }),
      )
    } catch {
      // Eligibility and transport failures must never escape into the host.
    }
  }
}

export const createOnPermission: CreateOnPermission = ({ notify }) => {
  const stateBySessionID = new Map<string, SessionState>()

  return async (permission, hostContext): Promise<void> => {
    try {
      if (!hasStableID(permission.sessionID) || !hasStableID(permission.id)) {
        return
      }

      const session = await hostContext.resolveSession(permission.sessionID)
      if (
        !session ||
        !hasStableID(session.id) ||
        (session.parentID !== undefined && session.parentID !== "")
      ) {
        return
      }

      const state = sessionStateFor(stateBySessionID, session.id)
      if (
        !trackID(
          state.permissionIDs,
          permission.id,
          MAX_PERMISSION_IDS_PER_SESSION,
        )
      ) {
        return
      }

      await notify(
        Object.freeze({
          event: "permission.asked",
          title: PERMISSION_CONTENT.title,
          body: PERMISSION_CONTENT.body,
          sessionID: session.id,
        }),
      )
    } catch {
      // Permission eligibility and transport failures must fail open.
    }
  }
}
