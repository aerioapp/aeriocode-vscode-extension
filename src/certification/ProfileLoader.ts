import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { CertificationProfile } from "./types"

const PROFILES_DIR = path.join(os.homedir(), ".aeriocode", "profiles")
const DO178C_PROFILE_NAME = "DO-178C.json"

// Default DO-178C profile config
const DEFAULT_DO178C_PROFILE: CertificationProfile = {
	standard: "DO-178C",
	version: "C",
	publisher: "RTCA/EUROCAE",
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
	safety_coding_rules: "power-of-10",
	coding_standards: ["MISRA-C-2012", "MISRA-CPP-2023"],
}

export class ProfileLoader {
	/**
	 * Load the DO-178C built-in profile.
	 * Ensures the profiles directory and default profile file exist.
	 */
	static loadDO178CProfile(): CertificationProfile {
		// Ensure profiles directory exists
		if (!fs.existsSync(PROFILES_DIR)) {
			fs.mkdirSync(PROFILES_DIR, { recursive: true })
		}

		const profilePath = path.join(PROFILES_DIR, DO178C_PROFILE_NAME)

		// Create default profile if it doesn't exist
		if (!fs.existsSync(profilePath)) {
			fs.writeFileSync(profilePath, JSON.stringify(DEFAULT_DO178C_PROFILE, null, 2), "utf8")
		}

		// Read and parse profile
		try {
			const content = fs.readFileSync(profilePath, "utf8")
			return JSON.parse(content) as CertificationProfile
		} catch {
			// Corrupted profile file — fall back to default
			return DEFAULT_DO178C_PROFILE
		}
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
	static getEffectiveProfile(projectRoot: string): CertificationProfile | null {
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

		return this.loadDO178CProfile()
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
		// For known built-in profiles, ensure the file exists
		if (standard === "DO-178C") {
			return this.loadDO178CProfile()
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
