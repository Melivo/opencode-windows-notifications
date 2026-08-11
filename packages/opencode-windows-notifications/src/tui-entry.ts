import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

import type { HostContext, QuestionRequest } from "./contract.js"
import { createOnQuestion } from "./eligibility/index.js"
import { createNotify } from "./transport/index.js"

const BUILD_MARKER = "opencode-windows-notifications@0.0.0/tui-v1"

const tui: TuiPlugin = async (api) => {
  try {
    const notify = createNotify({
      log: () => undefined,
    })
    const onQuestion = createOnQuestion({ notify })
    const hostContext: HostContext = Object.freeze({
      async resolveSession(sessionID: string) {
        try {
          const session = api.state.session.get(sessionID)

          if (!session) return undefined

          return session.parentID
            ? { id: session.id, parentID: session.parentID }
            : { id: session.id }
        } catch {
          return undefined
        }
      },
    })

    api.event.on("question.asked", (event) => {
      try {
        const question: QuestionRequest = Object.freeze({
          id: event.properties.id,
          sessionID: event.properties.sessionID,
        })
        void onQuestion(question, hostContext)
      } catch {
        // Malformed host event envelopes must not disrupt the TUI.
      }
    })
  } catch {
    // TUI initialization and subscription failures remain fail-open.
  }
}

/** Documented external OpenCode TUI plugin entrypoint. */
const entry = Object.freeze({ id: BUILD_MARKER, tui }) satisfies TuiPluginModule

export default entry
