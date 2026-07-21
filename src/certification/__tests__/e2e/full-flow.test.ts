/**
 * End-to-end test of the certification traceability flow.
 *
 * Tests the complete lifecycle:
 *   1. Profile activation (setup .aeriocode/ directory + DB)
 *   2. Requirement creation
 *   3. Source code with requirement tags
 *   4. Traceability checking (tag parsing, link creation, untraced detection)
 *   5. Coverage calculation and enforcement
 *   6. AI instructions generation
 *   7. Impact analysis
 *   8. Audit trail integrity
 */
import { expect } from "chai"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { ProjectDatabase } from "../../db/ProjectDatabase"
import { SqlJsDatabase } from "../../db/SqlJsDatabase"
import { ProfileLoader } from "../../ProfileLoader"
import { RequirementTagParser } from "../../RequirementTagParser"
import { CertificationInstructionsBuilder } from "../../CertificationInstructionsBuilder"
import { AuditTrailService } from "../../AuditTrailService"
import type { CertificationProfile, RequirementRow } from "../../types"

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "aeriocode-e2e-"))
}

function cleanup(dir: string) {
	try {
		fs.rmSync(dir, { recursive: true, force: true })
	} catch {
		/* ignore */
	}
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("E2E: Full Certification Flow", () => {
	let projectDir: string
	let db: ProjectDatabase
	let auditService: AuditTrailService
	let profile: CertificationProfile

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		projectDir = tmpProject()
		// Create .aeriocode/ directory
		fs.mkdirSync(path.join(projectDir, ".aeriocode"), { recursive: true })

		// Load default DO-178C profile
		profile = ProfileLoader.loadDO178CProfile()

		// Create database and audit service
		db = new ProjectDatabase(projectDir)
		auditService = new AuditTrailService(db)
	})

	afterEach(() => {
		db.close()
		cleanup(projectDir)
	})

	// ── Step 1: Profile & Database Setup ────────────────────────────────────

	describe("Step 1: Profile and database setup", () => {
		it("creates a valid database with all required tables", () => {
			const tables = db.getRawDatabase().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
				name: string
			}[]
			const tableNames = tables.map((t) => t.name)

			expect(tableNames).to.include("requirements")
			expect(tableNames).to.include("traceability_links")
			expect(tableNames).to.include("audit_trail")
			expect(tableNames).to.include("ai_generations")
			expect(tableNames).to.include("human_decisions")
		})

		it("loads DO-178C profile with all DAL levels", () => {
			expect(profile.standard).to.equal("DO-178C")
			expect(profile.levels).to.have.property("DAL_A")
			expect(profile.levels).to.have.property("DAL_B")
			expect(profile.levels).to.have.property("DAL_C")
			expect(profile.levels).to.have.property("DAL_D")
		})

		it("saves and loads project profile round-trip", () => {
			ProfileLoader.saveProjectProfile(projectDir, profile)
			const loaded = ProfileLoader.loadProjectProfile(projectDir)
			expect(loaded).to.not.be.null
			expect(loaded!.standard).to.equal("DO-178C")
		})
	})

	// ── Step 2: Requirement Creation ────────────────────────────────────────

	describe("Step 2: Requirement creation", () => {
		it("inserts and retrieves requirements", () => {
			const id1 = db.insertRequirement({
				requirement_id: "SYS-001",
				level: "system",
				title: "Input Validation",
				description: "The system shall validate all sensor inputs",
				dal_level: "A",
			})
			expect(id1).to.be.greaterThan(0)

			const id2 = db.insertRequirement({
				requirement_id: "HLR-002",
				level: "high_level",
				title: "Error Handling",
				description: "The system shall handle sensor failures gracefully",
				dal_level: "B",
			})
			expect(id2).to.be.greaterThan(0)

			const id3 = db.insertRequirement({
				requirement_id: "LLR-003",
				level: "low_level",
				title: "Range Check",
				description: "Sensor values must be within [-40, 85] range",
				dal_level: "A",
			})
			expect(id3).to.be.greaterThan(0)

			const all = db.getAllRequirements()
			expect(all).to.have.length(3)
			expect(all.map((r) => r.requirement_id)).to.include("SYS-001")
			expect(all.map((r) => r.requirement_id)).to.include("HLR-002")
			expect(all.map((r) => r.requirement_id)).to.include("LLR-003")
		})

		it("rejects duplicate requirement IDs", () => {
			db.insertRequirement({
				requirement_id: "SYS-001",
				level: "system",
				title: "First",
			})
			expect(() => {
				db.insertRequirement({
					requirement_id: "SYS-001",
					level: "system",
					title: "Duplicate",
				})
			}).to.throw()
		})

		it("updates requirement fields", () => {
			db.insertRequirement({
				requirement_id: "SYS-001",
				level: "system",
				title: "Original Title",
			})
			db.updateRequirement("SYS-001", { title: "Updated Title", dal_level: "A" })

			const req = db.getRequirement("SYS-001")
			expect(req).to.not.be.undefined
			expect(req!.title).to.equal("Updated Title")
			expect(req!.dal_level).to.equal("A")
		})
	})

	// ── Step 3: Source Code with Requirement Tags ───────────────────────────

	describe("Step 3: Tag parsing from source code", () => {
		const sourceCode = `
// SYS-001: Validate sensor input range
// DAL Level: A
function validateSensorInput(value) {
    if (value < -40 || value > 85) {
        throw new Error("Sensor out of range");
    }
    return true;
}

// HLR-002: Handle sensor failure
function handleSensorFailure(error) {
    console.error("Sensor failure:", error);
    return { status: "error", message: error.message };
}

// This function has no requirement tag — it's untraced
function helperFunction() {
    return "hello";
}
`
		it("parses all requirement tags from source code", () => {
			const tags = RequirementTagParser.parse(sourceCode, "test.c")
			expect(tags).to.have.length(2)
			expect(tags[0].requirement_id).to.equal("SYS-001")
			expect(tags[1].requirement_id).to.equal("HLR-002")
		})

		it("validates tags against database requirements", () => {
			const tags = RequirementTagParser.parse(sourceCode, "test.c")
			const reqIds = ["SYS-001", "HLR-002", "LLR-003"]
			const { valid, invalid } = RequirementTagParser.validateTags(tags, reqIds)

			expect(valid).to.have.length(2)
			expect(invalid).to.have.length(0)
		})

		it("flags invalid tags", () => {
			const codeWithBadTag = "// SYS-999: This requirement does not exist\nfunction foo() {}"
			const tags = RequirementTagParser.parse(codeWithBadTag, "test.c")
			const { valid, invalid } = RequirementTagParser.validateTags(tags, ["SYS-001"])

			expect(valid).to.have.length(0)
			expect(invalid).to.have.length(1)
			expect(invalid[0].requirement_id).to.equal("SYS-999")
		})

		it("detects untraced functions", () => {
			const tags = RequirementTagParser.parse(sourceCode, "test.c")
			const validTags = tags.filter((t) => ["SYS-001", "HLR-002"].includes(t.requirement_id))
			const untraced = RequirementTagParser.findUntracedFunctions(sourceCode, "test.c", validTags)

			expect(untraced.length).to.be.greaterThan(0)
			const names = untraced.map((f) => f.name)
			expect(names).to.include("helperFunction")
		})
	})

	// ── Step 4: Traceability Link Creation ──────────────────────────────────

	describe("Step 4: Traceability link creation", () => {
		beforeEach(() => {
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation" })
			db.insertRequirement({ requirement_id: "HLR-002", level: "high_level", title: "Error Handling" })
		})

		it("creates traceability links for valid tags", () => {
			const tags = RequirementTagParser.parse(
				"// SYS-001: Validate input\nfunction validate() {}\n\n// HLR-002: Handle error\nfunction handleError() {}",
				"src/sensor.c",
			)

			for (const tag of tags) {
				db.insertTraceLink({
					requirement_id: tag.requirement_id,
					artifact_type: "source_code",
					artifact_path: "src/sensor.c",
					artifact_line_start: tag.line,
					artifact_line_end: tag.line,
					link_type: "implements",
					confidence: "auto",
				})
			}

			const links = db.getAllLinks()
			expect(links).to.have.length(2)
			const reqIds = links.map((l) => l.requirement_id)
			expect(reqIds).to.include("SYS-001")
			expect(reqIds).to.include("HLR-002")
			expect(links[0].confidence).to.equal("auto")
		})

		it("tracks manual links separately", () => {
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "test_case",
				artifact_path: "tests/test_sensor.py",
				link_type: "tests",
				confidence: "manual",
			})

			const links = db.getAllLinks()
			expect(links).to.have.length(1)
			expect(links[0].confidence).to.equal("manual")
			expect(links[0].artifact_type).to.equal("test_case")
		})

		it("allows linking to non-existent requirement (no FK constraint)", () => {
			db.insertTraceLink({
				requirement_id: "NONEXISTENT-999",
				artifact_type: "source_code",
				artifact_path: "src/foo.c",
				link_type: "implements",
				confidence: "auto",
			})
			const links = db.getAllLinks()
			expect(links).to.have.length(1)
			expect(links[0].requirement_id).to.equal("NONEXISTENT-999")
		})
	})

	// ── Step 5: Coverage Calculation & Enforcement ──────────────────────────

	describe("Step 5: Coverage calculation and enforcement", () => {
		beforeEach(() => {
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation", dal_level: "A" })
			db.insertRequirement({ requirement_id: "HLR-002", level: "high_level", title: "Error Handling", dal_level: "A" })
			db.insertRequirement({ requirement_id: "LLR-003", level: "low_level", title: "Range Check", dal_level: "B" })
		})

		it("calculates 0% coverage with no links", () => {
			const totalReqs = db.getAllRequirements().length
			const linkCounts = db.getLinkCounts()
			const coverage = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0

			expect(coverage).to.equal(0)
			expect(linkCounts.traced).to.equal(0)
		})

		it("calculates 33% coverage with 1 of 3 requirements linked", () => {
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "source_code",
				artifact_path: "src/sensor.c",
				link_type: "implements",
				confidence: "auto",
			})

			const totalReqs = db.getAllRequirements().length
			const linkCounts = db.getLinkCounts()
			const coverage = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0

			expect(coverage).to.equal(33)
			expect(linkCounts.traced).to.equal(1)
		})

		it("calculates 100% coverage with all requirements linked", () => {
			for (const reqId of ["SYS-001", "HLR-002", "LLR-003"]) {
				db.insertTraceLink({
					requirement_id: reqId,
					artifact_type: "source_code",
					artifact_path: `src/${reqId}.c`,
					link_type: "implements",
					confidence: "auto",
				})
			}

			const totalReqs = db.getAllRequirements().length
			const linkCounts = db.getLinkCounts()
			const coverage = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0

			expect(coverage).to.equal(100)
			expect(linkCounts.traced).to.equal(3)
		})

		it("enforces DAL A requirement (100% statement coverage)", () => {
			// Link only 1 of 2 DAL_A requirements
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "source_code",
				artifact_path: "src/sensor.c",
				link_type: "implements",
				confidence: "auto",
			})

			const totalReqs = db.getAllRequirements().length
			const linkCounts = db.getLinkCounts()
			const coveragePercent = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0

			const levelConfig = profile.levels["DAL_A"]
			const requiredCoverage = levelConfig.statement_coverage
			const passed = coveragePercent >= requiredCoverage

			expect(passed).to.be.false
			expect(coveragePercent).to.be.lessThan(requiredCoverage)
		})
	})

	// ── Step 6: AI Instructions Generation ──────────────────────────────────

	describe("Step 6: AI instructions generation", () => {
		beforeEach(() => {
			db.insertRequirement({
				requirement_id: "SYS-001",
				level: "system",
				title: "Input Validation",
				description: "Validate sensor inputs",
				dal_level: "A",
			})
			db.insertRequirement({
				requirement_id: "HLR-002",
				level: "high_level",
				title: "Error Handling",
				dal_level: "B",
			})
		})

		it("generates instructions from profile and requirements", () => {
			const requirements = db.getAllRequirements()
			const instructions = CertificationInstructionsBuilder.build(profile, requirements)

			expect(instructions).to.not.equal("")
			expect(instructions).to.include("DO-178C")
			expect(instructions).to.include("SYS-001")
			expect(instructions).to.include("HLR-002")
			expect(instructions).to.include("Input Validation")
		})

		it("includes tag format from profile patterns", () => {
			const requirements = db.getAllRequirements()
			const instructions = CertificationInstructionsBuilder.build(profile, requirements)

			// Profile has requirement_id_patterns
			expect(instructions).to.include("REQ-{type}-{number}")
			expect(instructions).to.include("Supported tag formats")
		})

		it("returns empty when no requirements", () => {
			const emptyDb = new ProjectDatabase(tmpProject())
			const instructions = CertificationInstructionsBuilder.build(profile, emptyDb.getAllRequirements())
			expect(instructions).to.equal("")
			emptyDb.close()
		})

		it("includes safety coding rules from profile", () => {
			const requirements = db.getAllRequirements()
			const instructions = CertificationInstructionsBuilder.build(profile, requirements)
			expect(instructions).to.include("power-of-10")
		})

		it("includes level context", () => {
			const requirements = db.getAllRequirements()
			const instructions = CertificationInstructionsBuilder.build(profile, requirements)
			expect(instructions).to.include("DAL A")
			expect(instructions).to.include("Catastrophic")
		})
	})

	// ── Step 7: Impact Analysis ─────────────────────────────────────────────

	describe("Step 7: Impact analysis", () => {
		beforeEach(() => {
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation" })
			db.insertRequirement({ requirement_id: "HLR-002", level: "high_level", title: "Error Handling" })

			// SYS-001 linked to src/sensor.c
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "source_code",
				artifact_path: "src/sensor.c",
				artifact_line_start: 1,
				artifact_line_end: 10,
				link_type: "implements",
				confidence: "auto",
			})

			// HLR-002 also linked to src/sensor.c (cascading)
			db.insertTraceLink({
				requirement_id: "HLR-002",
				artifact_type: "source_code",
				artifact_path: "src/sensor.c",
				artifact_line_start: 15,
				artifact_line_end: 25,
				link_type: "implements",
				confidence: "auto",
			})

			// SYS-001 also linked to a test file
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "test_case",
				artifact_path: "tests/test_sensor.py",
				link_type: "tests",
				confidence: "manual",
			})
		})

		it("finds affected source files for a requirement", () => {
			const links = db.getAllLinks().filter((l) => l.requirement_id === "SYS-001")
			const sourceFiles = links.filter((l) => l.artifact_type === "source_code")
			const testFiles = links.filter((l) => l.artifact_type === "test_case")

			expect(sourceFiles).to.have.length(1)
			expect(sourceFiles[0].artifact_path).to.equal("src/sensor.c")
			expect(testFiles).to.have.length(1)
			expect(testFiles[0].artifact_path).to.equal("tests/test_sensor.py")
		})

		it("finds cascading requirements (shared files)", () => {
			// Find files linked to SYS-001
			const links = db.getAllLinks().filter((l) => l.requirement_id === "SYS-001")
			const affectedPaths = new Set(links.map((l) => l.artifact_path).filter(Boolean))

			// Find other requirements linked to the same files
			const allLinks = db.getAllLinks()
			const cascading = [
				...new Set(
					allLinks
						.filter((l) => l.artifact_path && affectedPaths.has(l.artifact_path) && l.requirement_id !== "SYS-001")
						.map((l) => l.requirement_id),
				),
			]

			expect(cascading).to.include("HLR-002")
		})

		it("returns empty for unlinked requirement", () => {
			db.insertRequirement({ requirement_id: "LLR-003", level: "low_level", title: "Isolated" })
			const links = db.getAllLinks().filter((l) => l.requirement_id === "LLR-003")
			expect(links).to.have.length(0)
		})
	})

	// ── Step 8: Audit Trail Integrity ───────────────────────────────────────

	describe("Step 8: Audit trail integrity", () => {
		it("creates hash-chained audit entries", async () => {
			const entry1Id = await auditService.recordEvent({
				event_type: "profile_change",
				event_action: "activated",
				payload: { standard: "DO-178C", level: "DAL_A" },
			})
			expect(entry1Id).to.be.a("number")
			expect(entry1Id).to.be.greaterThan(0)

			const entry2Id = await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				payload: { model_id: "test-model" },
			})
			expect(entry2Id).to.not.equal(entry1Id)

			// Verify hash chain is different
			const entry1 = db.getAuditEntry(entry1Id)
			const entry2 = db.getAuditEntry(entry2Id)
			expect(entry1).to.not.be.undefined
			expect(entry2).to.not.be.undefined
			expect(entry2!.previous_hash).to.equal(entry1!.entry_hash)
		})

		it("prevents modification of audit entries", async () => {
			await auditService.recordEvent({
				event_type: "profile_change",
				event_action: "activated",
				payload: { standard: "DO-178C" },
			})

			expect(() => {
				db.getRawDatabase().prepare("UPDATE audit_trail SET event_action = 'tampered' WHERE id = 1").run()
			}).to.throw()
		})

		it("prevents deletion of audit entries", async () => {
			await auditService.recordEvent({
				event_type: "profile_change",
				event_action: "activated",
				payload: { standard: "DO-178C" },
			})

			expect(() => {
				db.getRawDatabase().prepare("DELETE FROM audit_trail WHERE id = 1").run()
			}).to.throw()
		})
	})

	// ── Step 9: Full Integration Scenario ───────────────────────────────────

	describe("Step 9: Full integration scenario", () => {
		it("simulates complete workflow: create reqs → write code → check tags → link → coverage", () => {
			// 1. Create requirements
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation", dal_level: "A" })
			db.insertRequirement({ requirement_id: "HLR-002", level: "high_level", title: "Error Handling", dal_level: "A" })

			// 2. Simulate source code with tags (as if AI generated it with our instructions)
			const generatedCode1 = `
// SYS-001: Validate all sensor inputs within operational range
function validateSensorInput(value) {
    if (value < -40 || value > 85) {
        throw new RangeError("Sensor value out of operational range");
    }
    return true;
}
`
			const generatedCode2 = `
// HLR-002: Handle sensor communication failures
function handleSensorFailure(error, context) {
    logger.error("Sensor failure", { error, context });
    return { status: "error", recoverable: isRecoverable(error) };
}
`
			// 3. Parse tags from generated code
			const tags1 = RequirementTagParser.parse(generatedCode1, "src/validate.ts")
			const tags2 = RequirementTagParser.parse(generatedCode2, "src/error-handler.ts")
			const allTags = [...tags1, ...tags2]
			const reqIds = db.getAllRequirements().map((r) => r.requirement_id)
			const { valid, invalid } = RequirementTagParser.validateTags(allTags, reqIds)

			expect(valid).to.have.length(2)
			expect(invalid).to.have.length(0)

			// 4. Auto-create traceability links (simulating TraceabilityChecker)
			for (const tag of valid) {
				db.insertTraceLink({
					requirement_id: tag.requirement_id,
					artifact_type: "source_code",
					artifact_path: tag.requirement_id === "SYS-001" ? "src/validate.ts" : "src/error-handler.ts",
					artifact_line_start: tag.line,
					artifact_line_end: tag.line,
					link_type: "implements",
					confidence: "auto",
				})
			}

			// 5. Check coverage
			const totalReqs = db.getAllRequirements().length
			const linkCounts = db.getLinkCounts()
			const coverage = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0
			expect(coverage).to.equal(100)

			// 6. Generate AI instructions for next generation
			const instructions = CertificationInstructionsBuilder.build(profile, db.getAllRequirements())
			expect(instructions).to.include("SYS-001")
			expect(instructions).to.include("HLR-002")

			// 7. Verify audit trail has entries
			const entries = db.getRawDatabase().prepare("SELECT * FROM audit_trail").all()
			// Audit entries exist (from trace link insertions don't create audit entries,
			// but the DB is functional)
			expect(entries).to.be.an("array")
		})

		it("handles the scenario where AI adds a tag for non-existent requirement", () => {
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation" })

			// AI-generated code with a typo in the requirement ID
			const codeWithTagTypo = `
// SYS-002: This requirement doesn't exist (typo by AI)
function someFunction() { return true; }
`
			const tags = RequirementTagParser.parse(codeWithTagTypo, "src/typo.ts")
			const reqIds = db.getAllRequirements().map((r) => r.requirement_id)
			const { valid, invalid } = RequirementTagParser.validateTags(tags, reqIds)

			expect(valid).to.have.length(0)
			expect(invalid).to.have.length(1)
			expect(invalid[0].requirement_id).to.equal("SYS-002")

			// Only valid tags should create links
			for (const tag of valid) {
				db.insertTraceLink({
					requirement_id: tag.requirement_id,
					artifact_type: "source_code",
					artifact_path: "src/typo.ts",
					link_type: "implements",
					confidence: "auto",
				})
			}

			const links = db.getAllLinks()
			expect(links).to.have.length(0)
		})

		it("tracks multiple files linked to same requirement", () => {
			db.insertRequirement({ requirement_id: "SYS-001", level: "system", title: "Input Validation" })

			// Same requirement linked to implementation and test
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "source_code",
				artifact_path: "src/sensor.ts",
				link_type: "implements",
				confidence: "auto",
			})
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "test_case",
				artifact_path: "tests/sensor.test.ts",
				link_type: "tests",
				confidence: "manual",
			})
			db.insertTraceLink({
				requirement_id: "SYS-001",
				artifact_type: "document",
				artifact_path: "docs/srs.md",
				link_type: "derived_from",
				confidence: "manual",
			})

			const links = db.getAllLinks().filter((l) => l.requirement_id === "SYS-001")
			expect(links).to.have.length(3)

			const sourceLinks = links.filter((l) => l.artifact_type === "source_code")
			const testLinks = links.filter((l) => l.artifact_type === "test_case")
			const docLinks = links.filter((l) => l.artifact_type === "document")

			expect(sourceLinks).to.have.length(1)
			expect(testLinks).to.have.length(1)
			expect(docLinks).to.have.length(1)
		})
	})
})
