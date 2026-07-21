// Core services
export { CertificationManager } from "./CertificationManager"
export { ProjectDatabase } from "./db/ProjectDatabase"
export { UserDatabase } from "./db/UserDatabase"
export { AuditTrailService } from "./AuditTrailService"
export { IntegrityVerifier } from "./IntegrityVerifier"
export { ProfileLoader } from "./ProfileLoader"
export { RequirementTagParser } from "./RequirementTagParser"
export { TraceabilityChecker } from "./TraceabilityChecker"
export { HumanDecisionCapture } from "./HumanDecisionCapture"
export { ExportService } from "./ExportService"

// Types
export type {
	CertificationProfile,
	CertificationLevel,
	RequirementRow,
	TraceabilityLinkRow,
	AuditTrailRow,
	AiGenerationRow,
	HumanDecisionRow,
	ParsedRequirementTag,
	UntracedFunction,
	AuditEventParams,
	GenerationStartParams,
	DecisionParams,
	IntegrityResult,
	CertificationStatus,
	ExportOptions,
	TraceabilityMatrixRow,
	ImpactAnalysisResult,
} from "./types"

// Database migrations
export { migrateProjectDatabase, migrateUserDatabase } from "./db/migrations"
