export type AiFallbackCode = "unavailable" | "insufficient_context" | "invalid_output" | "audit_failure";

export function aiFallbackMessage(code: AiFallbackCode): string {
  if (code === "insufficient_context") {
    return "Decision support has no approved facts to explain.";
  }
  if (code === "invalid_output") {
    return "Decision support was discarded. The operational facts are unchanged.";
  }
  if (code === "audit_failure") {
    return "Decision support was not recorded. The operational facts are unchanged.";
  }
  return "Decision support is unavailable. Planning and delivery continue without it.";
}
