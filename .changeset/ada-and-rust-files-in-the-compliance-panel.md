---
"Aerio-Code": patch
---

Fix the compliance panel refusing every Ada and Rust file.

The engine has checked Ada and Rust against the Aerio Safety Coding Standard since 0.0.8, but the
panel's file-scope resolver only knew the C/C++ extensions — so choosing "active file" on a `.adb`,
`.ads` or `.rs` file always answered "not a file this standard applies to", regardless of the
standard selected or the file's actual name. `LANGUAGE_EXTENSIONS` now carries Ada's `.ads`/`.adb`/`.ada`
and Rust's `.rs`, matching the backend's own `core/parser.js` mapping.
