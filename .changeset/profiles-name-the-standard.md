---
"Aerio-Code": patch
---

Name the standard a profile certifies against, not the body that publishes it.

The ECSS profile identified itself as `ECSS` and the NASA one as `NASA-NPR-7150.2D`. ECSS is a
standards body with dozens of publications, several of which bear on a space software programme, so a
panel reading "ECSS" told a supplier which organisation they answered to and not which document.
DO-178C was already specific, because DO-178C *is* the document — which is why the problem was easy to
miss on the screen where all three appear together.

They are now `ECSS-E-ST-40C` Rev.1 and `NPR-7150.2D`, each carrying the title of the standard so a
screen can say what it is rather than only identify it.

**And a profile now names every document it is built from, because none of them is one document.**
That is not presentation: the ECSS profile's criticality categories come from **ECSS-Q-ST-80C**, not
from the standard it is named after, and without that document the four categories are four letters
with no defined meaning. The NASA profile draws on NPR 7150.2D for classifications and applicability,
NASA-STD-8739.8B for the assurance obligations it deliberately does not draft, and NASA-HDBK-2203 for
what each work product contains. Naming only the headline standard would credit it with obligations it
does not contain.

The DO-178C entry states its own gap in the same place: DO-330 is listed, with a note that Aerio does
not hold it and the qualification kit's clause references are unverified against it.

⚠️ A project activated under an old name keeps working. `ECSS` and `NASA-NPR-7150.2D` are written into
`.aeriocode/profile.json`, and a rename without aliases would have made the loader return null — which
the certification module reports as *no profile*, so the project would have kept its requirements and
audit trail while silently no longer being held to anything. The aliases resolve but are not offered,
so each profile still appears once in the picker under its real name.
