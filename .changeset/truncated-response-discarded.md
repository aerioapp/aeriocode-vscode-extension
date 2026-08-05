---
"Aerio-Code": patch
---

Never save a file from a response that was cut off part-way.

When a generation hit its output token limit, the incomplete tool call it contained was completed
and executed anyway, so a source file that stopped mid-function was written to disk looking whole —
and then analysed, and reported on, as though it were the file the model meant to write.

A truncated response now discards its incomplete tool call and asks the model to retry with a
smaller one. Nothing is written in the meantime, and the retry is not counted against the mistake
limit, because being cut off is not the model's error.
