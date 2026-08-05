---
"Aerio-Code": patch
---

Report a rule by its own id, not under another standard's prefix.

Every compliance finding was rendered `AV Rule <id>` — correct while JF-AV++ was the only pack, and
inherited unchanged by the four packs added since. So an Aerio Safety Coding Standard violation
reached the user as `AV CTRL-4`, and a MISRA one as `AV Rule Rule 17.6`: identifiers belonging to no
standard, in the Problems panel, the compliance panel, and the text the compliance gate feeds
straight into its repair turn.

Rule ids already carry their own namespace, so there is nothing for a prefix to add and any fixed
one is wrong for four of the five packs. Fixed in all four places that rendered it, with a test
using an id that carries its own namespace — every existing fixture used a bare JF-AV++ number,
where the wrong prefix reads as the right one, which is why no test caught this.
