import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { CertificationProfile } from "./types"
import { COMPLIANCE_REGIMES, REGIME_IDS } from "@shared/compliance/regimes"

const PROFILES_DIR = path.join(os.homedir(), ".aeriocode", "profiles")
const DO178C_PROFILE_NAME = "DO-178C.json"

// Default DO-178C profile config
const DEFAULT_DO178C_PROFILE: CertificationProfile = {
	standard: "DO-178C",
	version: "C",
	publisher: "RTCA/EUROCAE",
	title: "Software Considerations in Airborne Systems and Equipment Certification",
	based_on: [
		{
			id: "DO-178C",
			revision: "2011",
			title: "Software Considerations in Airborne Systems and Equipment Certification",
			role: "Objectives, their applicability by design assurance level, and the section 11 life cycle data.",
		},
		{
			id: "DO-330",
			revision: "2011",
			title: "Software Tool Qualification Considerations",
			// INTERNAL, not for the UI: Aerio does not hold a copy of DO-330, so the clause references
			// in the qualification kit have not been checked against the published text. Buy the
			// document and verify them before the kit goes to a customer or an authority.
			role: "Tool qualification criteria. Aerio's stated qualification position is Criteria 3, TQL-5.",
		},
	],
	regime: "do-178c",
	level_basis:
		"DO-178C Table 2-1, which assigns a software level from the failure condition classification of the system safety assessment",
	levels: {
		DAL_A: {
			label: "DAL A",
			failure_condition: "Catastrophic",
			coverage_metric: "MC/DC",
			statement_coverage: 100,
			decision_coverage: 100,
			mcdc_coverage: 100,
			verification_independence: true,
			required_artifacts: ["PSAC", "SDP", "SVP", "SCMP", "SQAP", "SRS", "SDS", "SCS", "SVCP", "SVR", "SCI", "SAS"],
		},
		DAL_B: {
			label: "DAL B",
			failure_condition: "Hazardous",
			coverage_metric: "Decision",
			statement_coverage: 100,
			decision_coverage: 100,
			mcdc_coverage: 0,
			verification_independence: true,
			required_artifacts: ["PSAC", "SDP", "SVP", "SCMP", "SQAP", "SRS", "SDS", "SCS", "SVCP", "SVR", "SCI", "SAS"],
		},
		DAL_C: {
			label: "DAL C",
			failure_condition: "Major",
			coverage_metric: "Statement",
			statement_coverage: 100,
			decision_coverage: 0,
			mcdc_coverage: 0,
			verification_independence: false,
			required_artifacts: ["PSAC", "SDP", "SVP", "SCMP", "SQAP", "SRS", "SDS", "SCS"],
		},
		DAL_D: {
			label: "DAL D",
			failure_condition: "Minor",
			coverage_metric: "Requirements-based testing",
			statement_coverage: 0,
			decision_coverage: 0,
			mcdc_coverage: 0,
			verification_independence: false,
			required_artifacts: ["PSAC", "SDP", "SVP", "SCMP", "SQAP"],
		},
	},
	requirement_id_patterns: ["REQ-{type}-{number}", "HLR-{number}", "LLR-{number}", "SYS-{number}"],
	requirement_levels: ["system", "high_level", "low_level", "derived"],
	traceability_directions: ["bidirectional"],
	// The Aerio Safety Coding Standard: 158 rules, 137 checked automatically, and adoptable as a
	// programme's Software Code Standards under DO-178C §11.8 without licensing anything. The
	// previous default named Power of 10, which is ten rules — a sound set and far short of what
	// §11.8(a)-(e) asks a code standard to define.
	safety_coding_rules: "aerio-scs",
	// Standards a programme may additionally hold itself to.
	//
	// ⚠️ Empty since the MISRA packs were withdrawn. Naming them here declared a standard the
	// backend now answers 404 for, so a profile created from this default described a programme
	// holding itself to something no request could select. Their checks still run — `aerio-scs`
	// adopts them — and a programme that licenses MISRA supplies its own rule mapping per request
	// rather than declaring it here, because a mapping derived from a licensed copy must not be
	// stored on Aerio's side.
	coding_standards: [],
}

/**
 * The ECSS document requirements definitions, from the normative annexes of ECSS-E-ST-40C Rev.1.
 *
 * ⚠️ The **same list at every criticality category**, and that is the finding rather than an
 * oversight. Annex R's Table R-1 tailors by category at *clause* granularity: of the rows parsed,
 * the overwhelming majority are `Y` at all four, and the C/D relaxations are design-model and
 * verification sections marked `Ytba` — "some DRD information may be missing if justified and agreed
 * by the customer". The deliverable stays; part of its content becomes negotiable. That is the
 * opposite of DO-178C, where the artifact list itself shrinks from twelve to five.
 */
const ECSS_DRDS = [
	"Software System Specification (SSS)",
	"Software Interface Requirements Document (IRD)",
	"Software Requirements Specification (SRS)",
	"Interface Control Document (ICD)",
	"Software Design Document (SDD)",
	"Software Release Document (SRelD)",
	"Software User Manual (SUM)",
	"Software Verification Plan (SVerP)",
	"Software Validation Plan (SValP)",
	"Software Unit and Integration Test Plan (SUITP)",
	"Software Validation Specification (SVS)",
	"Software Verification Report (SVR)",
	"Software Reuse File (SRF)",
	"Software Development Plan (SDP)",
	"Software Review Plan (SRevP)",
	"Software Maintenance Plan (SMP)",
]

/**
 * ECSS, from ECSS-E-ST-40C Rev.1 and ECSS-Q-ST-80C Rev.2.
 *
 * ⚠️ **Not DO-178C's shape with different letters, and every field below is a place that matters.**
 * The three differences were read off the documents rather than projected:
 *
 * **Categories A and B are identical in the applicability matrix.** Annex R's Table R-1 gives a
 * per-clause applicability by criticality category, and across all 303 rows parsed, **every one is
 * `Y` for both A and B**; the variation is entirely at C and D. DO-178C distinguishes every level.
 *
 * **The document set does not shrink — the content inside it does.** 256 of those rows are `Y` at
 * all four categories. Of the 47 that differ, the C/D relaxations are design-model and verification
 * *sections* (`Ytba`, meaning DRD information may be missing if justified and agreed), not whole
 * deliverables. So `required_artifacts` is the same DRD list at every category, which is the
 * opposite of the DO-178C profile above, where the list goes 12 → 12 → 8 → 5.
 *
 * **Coverage is fixed at A and B and deferred below them.** Clause 5.8.3.5's table gives 100%
 * statement and decision coverage at A and B, 100% MC/DC at A only, and TBA everywhere else —
 * "to be agreed with the customer and measured as per ECSS-Q-ST-80 clause 6.3.5.2".
 *
 * ⚠️ Note also that MC/DC is **TBA at category B**, where DO-178C Level B does not require MC/DC at
 * all. Reading one as the other gets this backwards in both directions.
 *
 * Independence is not a judgement call either: Table R-1 marks the independent software verification
 * plan (5.8.2.2) and the independent software validation plan (5.6.2.2) `Y Y N N`.
 */
const DEFAULT_ECSS_PROFILE: CertificationProfile = {
	// ⚠️ `ECSS-E-ST-40C`, not `ECSS`. The publisher has dozens of standards and this profile is of
	// exactly one of them; a panel reading "ECSS" told a supplier nothing about what their project
	// had been activated against. The criticality categories it projects come from a *different*
	// ECSS document, which is why `based_on` exists and names both.
	standard: "ECSS-E-ST-40C",
	version: "Rev.1",
	publisher: "ECSS / ESA",
	title: "Space engineering — Software general requirements",
	based_on: [
		{
			id: "ECSS-E-ST-40C",
			revision: "Rev.1 (30 April 2025)",
			title: "Space engineering — Software general requirements",
			role: "Life cycle processes, the Annex R Table R-1 expected outputs, and the sixteen DRDs Aerio drafts.",
		},
		{
			id: "ECSS-Q-ST-80C",
			revision: "Rev.2 (30 April 2025)",
			title: "Space product assurance — Software product assurance",
			role: "Software criticality categories A to D and the rules for assigning them.",
		},
		{
			id: "ECSS-Q-ST-30C",
			revision: "Rev.1 (15 February 2017)",
			title: "Space product assurance — Dependability",
			role: "Severity of failure consequences, from which criticality is derived.",
		},
	],
	regime: "ecss",
	level_basis:
		"ECSS-Q-ST-80C Rev.2 Annex D.1, which assigns a software criticality category from the severity category of the function the software is involved in and whether a compensating provision exists outside it",
	levels: {
		CAT_A: {
			label: "Category A",
			failure_condition: "Catastrophic severity, no compensating provision",
			assigned_from:
				"Assigned from the severity category of the function the software is involved in and whether a compensating provision exists outside it. Category A is a catastrophic-severity function with no compensating provision, or software that is itself the provision for one.",
			coverage_metric: "MC/DC",
			statement_coverage: 100,
			decision_coverage: 100,
			mcdc_coverage: 100,
			// The only regime of the three that states an object-code requirement as a level value,
			// and only where source-to-object traceability cannot be verified.
			object_code_coverage: 100,
			verification_independence: true,
			required_artifacts: ECSS_DRDS,
		},
		CAT_B: {
			label: "Category B",
			failure_condition: "Catastrophic with a provision, or critical without",
			assigned_from:
				"A catastrophic-severity function where a compensating provision exists outside the software, or a critical-severity function where none does.",
			coverage_metric: "Statement and decision",
			statement_coverage: 100,
			decision_coverage: 100,
			// ⚠️ TBA, not 0 and not 100. DO-178C Level B requires no MC/DC; ECSS category B defers the
			// figure to the supplier and customer. Those are different statements.
			mcdc_coverage: "to-be-agreed",
			object_code_coverage: "not-applicable",
			verification_independence: true,
			required_artifacts: ECSS_DRDS,
		},
		CAT_C: {
			label: "Category C",
			failure_condition: "Critical with a provision, or major without",
			assigned_from:
				"A critical-severity function where a compensating provision exists, or a major-severity function where none does.",
			coverage_metric: "To be agreed with the customer",
			statement_coverage: "to-be-agreed",
			decision_coverage: "to-be-agreed",
			mcdc_coverage: "to-be-agreed",
			object_code_coverage: "not-applicable",
			// Table R-1 marks the independent verification and validation plans not applicable here.
			verification_independence: false,
			required_artifacts: ECSS_DRDS,
		},
		CAT_D: {
			label: "Category D",
			failure_condition: "Major with a provision, or minor severity",
			assigned_from: "A major-severity function where a compensating provision exists, or a minor-severity function.",
			coverage_metric: "To be agreed with the customer",
			statement_coverage: "to-be-agreed",
			decision_coverage: "to-be-agreed",
			mcdc_coverage: "to-be-agreed",
			object_code_coverage: "not-applicable",
			verification_independence: false,
			required_artifacts: ECSS_DRDS,
		},
	},
	requirement_id_patterns: ["SSS-{number}", "SRS-{number}", "SRD-{number}", "REQ-{type}-{number}"],
	/**
	 * ⚠️ ECSS's own layers, not DO-178C's.
	 *
	 * This read `["system", "high_level", "low_level", "derived"]` — which is DO-178C's vocabulary,
	 * carried over unchanged onto a profile for a different publisher. ECSS does not organise
	 * requirements into high-level and low-level: it has the **requirements baseline** (RB) and the
	 * **technical specification** (TS), and clauses 5.6.3 and 5.6.4 validate against each separately.
	 *
	 * ⚠️ And `derived` is gone rather than translated. The phrase "derived requirement" does not occur
	 * once in ECSS-E-ST-40C Rev.1. It is a DO-178C concept with a specific obligation attached — 5.1.2.h
	 * requires derived requirements to be provided to the system safety assessment — and offering it as
	 * an ECSS requirement level would invite a supplier to classify requirements into a bucket their
	 * standard neither defines nor asks anything of.
	 */
	requirement_levels: ["system", "requirements-baseline", "technical-specification"],
	traceability_directions: ["bidirectional"],
	safety_coding_rules: "aerio-scs",
	coding_standards: [],
	// Empty on purpose. This list held two entries describing DO-178C artifacts an ECSS programme
	// does not get, which only reads as an absence if you assume DO-178C is the default and ECSS a
	// variant of it. An ECSS project is told what Aerio produces for ECSS — Annex R expected-output
	// status and the sixteen DRD drafts — and has no reason to be shown another regime's deliverables.
	unsupported_artifacts: [],
}

/**
 * NASA, from NPR 7150.2D.
 *
 * ⚠️ **The one structural difference that matters most: coverage is gated on safety-criticality,
 * not on class.** SWE-219 requires 100% MC/DC "if a project has safety-critical software … for all
 * identified safety-critical software components", and SWE-220 caps cyclomatic complexity at 15 on
 * the same condition. Neither is a property of the classification. So a class A project whose
 * software is not safety-critical has **no coverage percentage stated for it at all** — which is why
 * these read `conditional` with the condition spelled out, rather than `100`.
 *
 * The classes themselves are not one severity scale: A–D descend, E is design-concept and research
 * software, and F is general-purpose business and IT software on a separate axis. **F is not below
 * E** — F carries requirements E does not.
 *
 * `required_artifacts` genuinely shrinks by class here, unlike ECSS, and it is derived from the
 * Appendix C requirements matrix rather than assigned: SWE-200 is classes A–B, SWE-090 is A–C,
 * SWE-087 is A–C plus F, and class E carries only the software plans and the assurance plan.
 */
/**
 * ⚠️ **Two of these citations named the wrong requirement, and both were checked against NPR 7150.2D
 * only for existence.**
 *
 * `assertClaimsResolve` asks whether an identifier is in Appendix C's matrix. SWE-016 and SWE-024
 * both are, so nothing failed — but SWE-016 is *"document and maintain a software schedule"* and it
 * was cited as the Software Requirements Specification, and SWE-024 is *"track the actual results and
 * performance of software activities against the software plans"* and it was cited as the Software
 * Test Plan. A citation can be well-formed, resolvable, and about something else entirely; that is
 * the failure mode a guard on existence cannot see.
 *
 * On a certification screen this is the worst kind of wrong. A reader who trusts it writes SWE-016
 * on a schedule deliverable in front of a technical authority who knows the directive.
 *
 * Corrected against the published text: requirements are **SWE-050** (§4.1.2, "establish, capture,
 * record, approve, and maintain software requirements … as part of the technical specification"), and
 * test plans belong to **SWE-065** (§4.5.2), which already covers plans, procedures, tests and reports
 * as one obligation — so the separate test-plan line was also a double count. SWE-016 keeps its real
 * subject and SWE-024 its own.
 */
const NASA_CORE_ARTIFACTS = [
	"Software Plans [SWE-013]",
	"Software Schedule [SWE-016]",
	"Software Requirements Specification [SWE-050]",
	"Bi-directional Traceability Record [SWE-052]",
	"Software Version Description [SWE-063]",
	"Software Test Plans, Procedures, Tests and Reports [SWE-065]",
	"Software Plan Tracking Record [SWE-024]",
	"Software Maintenance/Operations Plan [SWE-075]",
	"Software Configuration Management Plan [SWE-079]",
	"COTS/GOTS/MOTS/Reuse Assessment [SWE-027]",
]
const NASA_MCDC_CONDITION =
	"the project has safety-critical software; SWE-219 applies to identified safety-critical software components, and any deviation is reviewed and waived with rationale by the technical authority"

const DEFAULT_NASA_PROFILE: CertificationProfile = {
	// ⚠️ `NPR-7150.2D` — the directive's own identifier — rather than `NASA-NPR-7150.2D`, which
	// prefixes the publisher onto a name that already carries it. NASA publishes several software
	// standards and they bind different parties: this profile is of the engineering requirements, and
	// NASA-STD-8739.8B in `based_on` is the assurance and safety standard, whose deliverables Aerio
	// deliberately does not draft.
	standard: "NPR-7150.2D",
	version: "D",
	publisher: "NASA",
	title: "NASA Software Engineering Requirements",
	based_on: [
		{
			id: "NPR 7150.2D",
			revision: "D",
			title: "NASA Software Engineering Requirements",
			role: "Software classifications A to F and the Appendix C matrix of applicable SWE requirements.",
		},
		{
			id: "NASA-STD-8739.8B",
			revision: "B (approved 2022-09-08)",
			title: "Software Assurance and Software Safety Standard",
			// Their work products are listed so a project can see what it owes, but Aerio does not draft
			// them: software assurance is the function that reviews Aerio's output, so drafting its
			// deliverables would remove the independence they exist to provide.
			role: "Software assurance and safety obligations referenced by NPR 7150.2D §3.7.2.",
		},
		{
			id: "NASA-HDBK-2203",
			// Published as a NASA wiki, so there is no PDF edition or page numbering to cite.
			revision: "Version D",
			title: "NASA Software Engineering and Assurance Handbook",
			// Published as a NASA wiki only; there is no PDF edition to cite page numbers from.
			role: "Work product content, which NPR 7150.2D §6.2 defers to it rather than specifying itself.",
		},
	],
	regime: "nasa",
	level_basis: "NPR 7150.2D Appendix D, with the per-class requirement applicability in Appendix C Table 2",
	levels: {
		CLASS_A: {
			label: "Class A",
			failure_condition: "Human-rated space flight",
			assigned_from:
				"Ground and flight software a crewed mission depends on to operate the vehicle, sustain a habitable environment for the crew, or achieve the primary mission objective.",
			coverage_metric: "MC/DC where the software is safety-critical",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			mcdc_coverage: "conditional",
			coverage_condition: NASA_MCDC_CONDITION,
			// Recommended rather than required — the note to SWE-219 recommends that someone
			// independent of the developer design and perform the testing. Recording that as `false`
			// would understate the directive; as `true` would overstate it.
			verification_independence: "recommended",
			required_artifacts: [
				...NASA_CORE_ARTIFACTS,
				"Software Assurance and Software Safety Plan [SWE-022]",
				"Safety-Critical Software Implementation Record [SWE-134]",
				"Software Peer Review/Inspection Records [SWE-087]",
				"Software Measurement/Metrics Report [SWE-090]",
				"Software Requirements Volatility Metrics [SWE-200]",
			],
		},
		CLASS_B: {
			label: "Class B",
			failure_condition: "Non-human-rated space flight",
			assigned_from: "Space flight software that is not human-rated, and the software of large-scale aeronautics vehicles.",
			coverage_metric: "MC/DC where the software is safety-critical",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			mcdc_coverage: "conditional",
			coverage_condition: NASA_MCDC_CONDITION,
			verification_independence: "recommended",
			required_artifacts: [
				...NASA_CORE_ARTIFACTS,
				"Software Assurance and Software Safety Plan [SWE-022]",
				"Safety-Critical Software Implementation Record [SWE-134]",
				"Software Peer Review/Inspection Records [SWE-087]",
				"Software Measurement/Metrics Report [SWE-090]",
				"Software Requirements Volatility Metrics [SWE-200]",
			],
		},
		CLASS_C: {
			label: "Class C",
			failure_condition: "Mission support / major engineering",
			assigned_from: "Mission support software, aeronautic vehicle software, and major engineering or research software.",
			coverage_metric: "MC/DC where the software is safety-critical",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			mcdc_coverage: "conditional",
			coverage_condition: NASA_MCDC_CONDITION,
			verification_independence: "recommended",
			required_artifacts: [
				...NASA_CORE_ARTIFACTS,
				"Software Assurance and Software Safety Plan [SWE-022]",
				"Safety-Critical Software Implementation Record [SWE-134]",
				"Software Peer Review/Inspection Records [SWE-087]",
				"Software Measurement/Metrics Report [SWE-090]",
			],
		},
		CLASS_D: {
			label: "Class D",
			failure_condition: "Basic science and engineering design",
			assigned_from: "Basic science and engineering design software, and research and technology software.",
			coverage_metric: "MC/DC where the software is safety-critical",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			mcdc_coverage: "conditional",
			coverage_condition: NASA_MCDC_CONDITION,
			verification_independence: false,
			required_artifacts: [
				...NASA_CORE_ARTIFACTS,
				"Software Assurance and Software Safety Plan [SWE-022]",
				"Safety-Critical Software Implementation Record [SWE-134]",
			],
		},
		CLASS_E: {
			label: "Class E",
			failure_condition: "Design concept and research",
			assigned_from:
				"Design concept, research, technology and general-purpose software. NPR 7150.2D marks only management and planning requirements applicable at this class — no coding or verification requirement.",
			coverage_metric: "None required",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			mcdc_coverage: "not-applicable",
			verification_independence: false,
			// ⚠️ Two, and that is the directive's position rather than an omission here. Of the
			// requirements Appendix C marks applicable at class E, every one is a management or
			// planning requirement from chapter 3 — none is a coding or verification requirement.
			required_artifacts: ["Software Plans [SWE-013]", "Software Assurance and Software Safety Plan [SWE-022]"],
		},
		CLASS_F: {
			label: "Class F",
			failure_condition: "General-purpose computing, business and IT",
			assigned_from:
				"A separate axis from classes A to E, not a continuation of them. Class F carries a coding-standard requirement that class E does not, and has its own approving authority.",
			coverage_metric: "None stated by classification",
			statement_coverage: "not-applicable",
			decision_coverage: "not-applicable",
			// SWE-219 and SWE-220 are marked applicable at classes A-D and not at F.
			mcdc_coverage: "not-applicable",
			verification_independence: false,
			required_artifacts: [...NASA_CORE_ARTIFACTS, "Software Peer Review/Inspection Records [SWE-087]"],
		},
	},
	requirement_id_patterns: ["SWE-{number}", "REQ-{type}-{number}", "SYS-{number}"],
	/**
	 * ⚠️ The layers NPR 7150.2D names, not DO-178C's.
	 *
	 * This read `["system", "high_level", "low_level", "derived"]`, which is DO-178C's vocabulary
	 * standing in for a directive that states its own. SWE-052's Table 1 lists the associations a
	 * project must trace bi-directionally, and they are these: higher-level requirements to software
	 * requirements, software requirements to design components, design components to code, software
	 * requirements to verifications — and, separately, **software requirements to system hazards**.
	 *
	 * ⚠️ `hazard` is on this list and is not a synonym for anything in the other two profiles. NPR
	 * 7150.2D requires traceability from software requirements to software-related system hazards,
	 * including hazardous controls, mitigations, conditions and events. DO-178C routes that concern
	 * through the system safety assessment rather than through the trace matrix, so a profile that
	 * reused DO-178C's levels had nowhere to record it at all.
	 */
	requirement_levels: ["higher-level", "software", "design-component", "hazard"],
	traceability_directions: ["bidirectional"],
	safety_coding_rules: "aerio-scs",
	coding_standards: [],
	// Only what a NASA project does not get *within its own regime*. The two DO-178C comparisons that
	// used to head this list were removed: NPR 7150.2D is not a dialect of DO-178C, and describing a
	// NASA profile by the airborne deliverables it lacks tells a NASA project nothing it can act on.
	//
	// The entry below stays because it is a genuine gap in NASA's own terms — NASA-STD-8739.8B assigns
	// these to the assurance organisation, whose remit includes reviewing Aerio's own output, so Aerio
	// shows their required structure but does not draft them.
	unsupported_artifacts: [
		"Drafts of the software assurance deliverables — Software Assurance Plan, Safety Plan, SA Status Report, IV&V Project Execution Plan, Hazard Report and Audit Report. Their required structure is shown, but your assurance organisation writes them.",
	],
}

/**
 * The built-in profiles, keyed by the `standard` a profile declares.
 *
 * ⚠️ A map rather than a chain of `if (standard === …)`, because the previous shape is what made
 * DO-178C the only profile anybody could load: `loadProfileByName` special-cased it and fell through
 * to the filesystem for everything else, so ECSS and NASA would have silently returned `null` and
 * the certification module would have reported "no profile" rather than "not supported".
 */
const BUILTIN_PROFILES = new Map<string, CertificationProfile>([
	["DO-178C", DEFAULT_DO178C_PROFILE],
	["ECSS-E-ST-40C", DEFAULT_ECSS_PROFILE],
	["NPR-7150.2D", DEFAULT_NASA_PROFILE],
])

/**
 * Names a profile used to be registered under, and still answers to.
 *
 * ⚠️ **A project that activated `ECSS` before this release has that string written into
 * `.aeriocode/profile.json`.** Renaming the profile without this map would make `loadProfileByName`
 * return null for it, and the certification module reports a missing profile as *no certification
 * profile* — so a supplier's project would silently drop out of certification mode, keeping its
 * requirements and audit trail while no longer holding anything to them. The rename is cosmetic; the
 * failure it could cause is not.
 *
 * These are aliases, not profiles: `builtinProfileNames` does not list them, so the picker offers
 * each profile once, under its real name.
 */
const PROFILE_ALIASES = new Map<string, string>([
	["ECSS", "ECSS-E-ST-40C"],
	["NASA-NPR-7150.2D", "NPR-7150.2D"],
	["NASA", "NPR-7150.2D"],
])

/**
 * Which built-in profile serves a coding-standard regime.
 *
 * This is the seam that had the certification screen and the coding-standard picker disagreeing:
 * one said "DO-178C — DAL A active" while the other said ECSS, and nothing reconciled them. Keyed on
 * the regime ids in `@shared/compliance/regimes` so the two cannot drift.
 *
 * `iso-26262` is deliberately absent — Aerio holds no copy of it, and a certification profile
 * asserting ASIL artifacts and coverage figures would be inventing the very thing the empty
 * applicability map exists to refuse.
 *
 * ⚠️ Both of these are `Map`s rather than object literals, and that is not style. They are indexed
 * with a string off a protobus request — `loadProfileByName(request.standard)` — and a plain object
 * answers `"constructor"` with a truthy `Function` from `Object.prototype`. The profile screen could
 * be made to activate one.
 *
 * ⚠️ And this one is **derived from `@shared/compliance/regimes`, not written out here.** The webview
 * needs the same three pairs in the opposite direction — it holds the active profile's standard name
 * and has to know which status dashboard that profile has — so declaring them here would have put one
 * mapping in two files, written from opposite ends. That is the defect `regimes.ts` was created to
 * end, and it very nearly recurred inside the change that added the dashboards.
 */
const REGIME_TO_PROFILE = new Map<string, string>(
	REGIME_IDS.flatMap((id) => {
		const standard = COMPLIANCE_REGIMES[id].certificationProfileStandard
		return standard ? [[id, standard] as [string, string]] : []
	}),
)

/**
 * Freeze a profile and everything reachable from it.
 *
 * ⚠️ `loadBuiltin` used to hand back `JSON.parse` of a file, so every caller got a private copy.
 * Building the profiles in code made them **shared singletons** without changing a single call site:
 * one caller mutating `profile.levels.CAT_C.required_artifacts` would rewrite what every later
 * caller sees, for the rest of the session. `ECSS_DRDS` makes that sharper still — it is the same
 * array object on all four categories, so a push at one category appears at the other three.
 *
 * Freezing turns that into a thrown error in development rather than a profile that quietly drifts
 * from what the document says. Cloning per call was the alternative and is worse: it costs a deep
 * copy on every status refresh to defend against a mutation nobody intends.
 */
function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const inner of Object.values(value)) {
			deepFreeze(inner)
		}
	}
	return value
}

for (const profile of BUILTIN_PROFILES.values()) {
	deepFreeze(profile)
}

export class ProfileLoader {
	/** Every built-in profile a user may activate, for a picker to list. */
	static builtinProfileNames(): string[] {
		return [...BUILTIN_PROFILES.keys()]
	}

	/** The built-in profile serving a coding-standard regime, or null where none does. */
	static profileForRegime(regime: string): CertificationProfile | null {
		const name = REGIME_TO_PROFILE.get(regime)
		const profile = name && BUILTIN_PROFILES.get(name)
		return profile ? this.loadBuiltin(profile) : null
	}

	/**
	 * A built-in profile, from code.
	 *
	 * ⚠️ **It no longer seeds a copy into `~/.aeriocode/profiles`, and no longer reads one.** Seeding
	 * looked like a courtesy — the file is the user's to tailor — and what it actually created was a
	 * permanent stale fork of data the product ships. A profile seeded by one build kept that build's
	 * values forever: shortening the ECSS level descriptions had no effect on any machine that had
	 * ever opened the profile screen, and the *tests* passed or failed depending on what was in the
	 * developer's home directory. A function whose answer depends on `$HOME` is not one CI and a
	 * workstation can agree about.
	 *
	 * Tailoring has a supported route that is better scoped anyway: `.aeriocode/profile.json` in the
	 * project, which {@link getEffectiveProfile} checks first. A certification profile is a property
	 * of a programme, not of whoever is logged in — the same argument that moved the coding standard
	 * off an account-level model id and into workspace settings.
	 *
	 * Files already seeded by an earlier build are left on disk rather than deleted, and ignored.
	 */
	private static loadBuiltin(profile: CertificationProfile): CertificationProfile {
		return profile
	}

	/**
	 * The DO-178C built-in.
	 *
	 * Kept as a named method because callers and tests use it, and delegating rather than duplicating
	 * means it cannot drift from {@link loadBuiltin} — which is where the decision not to seed a copy
	 * into the user's home directory is explained.
	 */
	static loadDO178CProfile(): CertificationProfile {
		return this.loadBuiltin(DEFAULT_DO178C_PROFILE)
	}

	/**
	 * Load a project-level profile override from .aeriocode/profile.json
	 */
	static loadProjectProfile(projectRoot: string): CertificationProfile | null {
		const profilePath = path.join(projectRoot, ".aeriocode", "profile.json")
		if (!fs.existsSync(profilePath)) {
			return null
		}

		try {
			const content = fs.readFileSync(profilePath, "utf8")
			return JSON.parse(content) as CertificationProfile
		} catch {
			return null
		}
	}

	/**
	 * Save a project-level profile to .aeriocode/profile.json
	 */
	static saveProjectProfile(projectRoot: string, profile: CertificationProfile): void {
		const dir = path.join(projectRoot, ".aeriocode")
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}

		const profilePath = path.join(dir, "profile.json")
		fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf8")
	}

	/**
	 * Remove the project-level profile (.aeriocode/profile.json).
	 * This deactivates certification for the project while preserving the .aeriocode/ directory
	 * (audit trail and database are kept intact).
	 */
	static removeProjectProfile(projectRoot: string): void {
		const profilePath = path.join(projectRoot, ".aeriocode", "profile.json")
		if (fs.existsSync(profilePath)) {
			fs.unlinkSync(profilePath)
		}
	}

	/**
	 * Get the effective profile for a project.
	 * Priority: project-level override > built-in profile
	 */
	static getEffectiveProfile(projectRoot: string, regime?: string): CertificationProfile | null {
		// Check for project-level override first
		const projectProfile = this.loadProjectProfile(projectRoot)
		if (projectProfile) {
			return projectProfile
		}

		// Fall back to built-in profile
		// Only load if .aeriocode/ directory exists (user has opted in)
		const aeriocodeDir = path.join(projectRoot, ".aeriocode")
		if (!fs.existsSync(aeriocodeDir)) {
			return null
		}

		// ⚠️ The regime decides which built-in serves, and this returned `loadDO178CProfile()`
		// unconditionally — so a workspace configured for ECSS or NASA got the airborne profile with
		// DAL A-D levels, and the certification screen would have shown "DAL A" beside a status bar
		// reading "Category A". Two screens disagreeing about one fact is the defect this module has
		// already been through once.
		//
		// DO-178C stays the default for a workspace that names no regime: it is what a project opting
		// into certification without saying more has always got, and changing that silently would be
		// a different wrong answer.
		return (regime && this.profileForRegime(regime)) || this.loadDO178CProfile()
	}

	/**
	 * List all available built-in profiles
	 */
	static listBuiltinProfiles(): string[] {
		if (!fs.existsSync(PROFILES_DIR)) {
			return []
		}

		return fs
			.readdirSync(PROFILES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
	}

	/**
	 * Load a profile by standard name
	 */
	static loadProfileByName(standard: string): CertificationProfile | null {
		// An alias resolves to the profile it was renamed from, so a project activated under the old
		// name keeps working. See PROFILE_ALIASES.
		const builtin = BUILTIN_PROFILES.get(standard) ?? BUILTIN_PROFILES.get(PROFILE_ALIASES.get(standard) ?? "")
		if (builtin) {
			return this.loadBuiltin(builtin)
		}

		// ⚠️ `standard` arrives from a protobus request and is about to become a path segment.
		// Anything that is not a plain profile name is refused rather than joined: `..%2ffoo` or an
		// absolute path would otherwise read a JSON file outside the profiles directory and parse it
		// as a certification profile.
		if (!/^[A-Za-z0-9._-]+$/.test(standard) || standard.startsWith(".")) {
			return null
		}

		const profilePath = path.join(PROFILES_DIR, `${standard}.json`)
		if (!fs.existsSync(profilePath)) {
			return null
		}

		try {
			const content = fs.readFileSync(profilePath, "utf8")
			return JSON.parse(content) as CertificationProfile
		} catch {
			return null
		}
	}
}
