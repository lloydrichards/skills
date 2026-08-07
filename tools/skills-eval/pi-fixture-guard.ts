import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { relative, resolve } from "node:path"

const isInside = (candidate: string, root: string) => {
  const path = relative(root, resolve(candidate))
  return path === "" || (!path.startsWith("..") && !path.includes("../"))
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (!["read", "write", "edit"].includes(event.toolName)) return
    if (!isToolCallEventType<"read" | "write" | "edit">(event.toolName as "read" | "write" | "edit", event)) return
    const path = event.input.path
    const skillPath = process.env.SKILLS_EVAL_SKILL_PATH
    const readable = typeof path === "string" && (
      isInside(path, ctx.cwd) ||
      (event.toolName === "read" && skillPath !== undefined && isInside(path, skillPath))
    )
    if (typeof path === "string" && !readable) {
      return { block: true, reason: `Fixture guard blocks direct file access outside ${ctx.cwd}` }
    }
  })
}
