/** One parsed frontmatter outcome (official provider semantics). */
export interface FrontmatterValue {
    name: string;
    description: string;
    whenToUse?: string;
    invocation: {
        modelInvocable: boolean;
        userInvocable: boolean;
    };
    /** Instruction body after the frontmatter block, trimmed. */
    content: string;
}
/** Parse a SKILL.md the way the official filesystem provider does. */
export declare function parseFrontmatter(text: string): {
    value: FrontmatterValue;
} | {
    error: string;
};
/** Try to repair a SKILL.md's frontmatter in place (unquoted colon etc.). Returns the new file text or null when not fixable. */
export declare function repairFrontmatterFileText(text: string): string | null;
/** 调用方式的期望值（「可调」语义，与 wire 上的 invocation 一致）。 */
export interface InvocationPolicy {
    modelInvocable: boolean;
    userInvocable: boolean;
}
/**
 * Rewrite the two invocation keys in a SKILL.md text.
 *
 * Only the two line-level keys change; every other frontmatter byte keeps its
 * position, comments, quoting and block scalars, and the body is untouched.
 * Defaults are written as "key absent" so a file toggled back keeps a clean
 * header:
 *  - modelInvocable=true  → drop `disable-model-invocation`; false → `disable-model-invocation: true`
 *  - userInvocable=true   → drop `user-invocable`; false → `user-invocable: false`
 *
 * A key that is not a top-level mapping key (inside a block scalar, indented,
 * etc.) is never touched: the pattern anchors at column 0, and a column-0 key
 * always terminates any preceding block scalar, so appending is safe.
 *
 * @returns the rewritten text (validated by re-parsing), or the reason it was refused.
 */
export declare function setInvocationInText(text: string, policy: InvocationPolicy): {
    text: string;
} | {
    error: string;
};
//# sourceMappingURL=frontmatter.d.ts.map