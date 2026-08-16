---
"Aerio-Code": patch
---

Check Ada and Rust against the Aerio Safety Coding Standard.

The engine parsed C and C++ and nothing else, which ruled out the two languages a safety-critical
programme is most likely to arrive with today: Ada, which most European space flight software is
written in, and Rust, which most new work is starting in.

**Ada was previously recorded as blocked, and that assessment was wrong on both counts.** No Ada
grammar exists on npm — `tree-sitter-ada` and every obvious variant are 404 — but `briot/tree-sitter-ada`
is MIT-licensed source and builds to a working WASM in about a minute. It is vendored under
`core/grammars/` with its commit, hash and rebuild instructions, because a binary in the tree is a
supply-chain decision rather than a build step.

The second objection was that the rules could not be invented. That is true of a pack claiming to
implement Ravenscar or the ESA/BSSC standards, and attributing rules to a document nobody holds is
exactly what withdrew the two MISRA packs — but the Aerio Safety Coding Standard is Aerio's own
document. Extending it to a language is authoring Aerio's rules for that language. There was never a
licensing question to answer.

Most rules needed no new text, because the requirement was already language-neutral: CTRL-1 finds
Ada's `goto`, CTRL-7 finds a `case` with no `when others`, LOOP-1 finds a bare `loop` with no exit
and a Rust `loop` with no break, ERR-4 finds `when others => null`, and the size and complexity
limits apply to a `subprogram_body` and a `function_item` as readily as to a function definition.

Three rules are new, for hazards with no C or C++ equivalent:

- **LIB-12** — a construct that switches off a compiler or run-time check is used only where the
  plans permit it, and each use states at the site what makes it sound. Ada's `pragma Suppress` and
  Rust's `unsafe`. ⚠️ Not a prohibition: a driver or an FFI boundary genuinely needs one. What the
  rule asks is that the reasoning be written down, because after the construct it is the only
  verification evidence there will be — and an `unsafe` block with a stated justification passes.
- **ERR-8** — an operation that terminates the program is not used where the failure is recoverable.
  Rust's `unwrap`, `expect`, `panic!`, `todo!`. Not reported inside `#[test]` or `#[cfg(test)]`,
  because `unwrap` in a test is the correct thing to write and reporting it would put a finding in
  every test file in the project.
- **TYPE-16** — a value's representation is not reinterpreted as a different type. Ada's
  `Unchecked_Conversion`, Rust's `transmute`. The general form of what TYPE-11 says about
  `reinterpret_cast`.

`metricsProfile` may now be keyed by language. C and C++ share their node type names closely enough
that one profile served both, which is why this was a single object; Ada and Rust share nothing with
them — a function is `subprogram_body`, `function_item` and `function_definition` in the three
grammars — and a profile naming node types that do not occur makes every metric read zero, which
presents as a simple clean file rather than an unmeasured one.

Two bugs the tests caught and one found in the field are fixed. Ada's parameter count read the type
mark as a parameter, so `procedure Q (A, B, C : Integer)` reported four; the Rust metrics check read
`metrics.parameterCount` where the engine returns `metrics.parameters`, so `undefined > 7` was
always false and IFACE-2 could never fire in Rust. Separately, the evidence store compared a numeric
user id against a TEXT column with `!==`, so every project-scoped request 404'd immediately after the
project registered successfully — that made the audit trail and evidence sync unusable for any user
the SSO could resolve, and looked like a permissions problem rather than a type coercion.
