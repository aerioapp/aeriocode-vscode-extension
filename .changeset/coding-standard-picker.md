---
"Aerio-Code": patch
---

Set the coding standard from the chat input, and show when none is set.

The standard was a workspace setting with no UI, and the only indicator hid itself when nothing was
enforced — so the state this feature exists to prevent, believing generated code is being held to a
standard when it is not, was the one state with nothing on screen. Two sessions ran that way; in the
second the model, asked why its file did not comply, went looking for the standard's documentation
on the web, because without a profile the rules never reach the prompt at all.

A picker now sits beside the model name: standard, regime, assurance level and whether to check code
after every write. It reads through the same resolver the request path and the gate use, so it
cannot show a profile the model was never instructed under, and the standards list comes from the
backend so a newly published pack needs no extension release. The status bar shows a dormant state
for C and C++ files rather than disappearing.

The assurance level now has one source. An active certification profile declares it — that is a
certification act, recorded in the audit trail — and the setting is the route for a project using
the coding standard without the certification module. Previously each had its own store, so the
certification screen could report DAL A while the coding-standard screen reported none, with nothing
telling a user which the model was actually held to.
