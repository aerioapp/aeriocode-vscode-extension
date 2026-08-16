import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import {
	AvailableProfilesResponse,
	CertificationProfile,
	CertificationLevel,
	SourceDocument,
} from "@shared/proto/aeriocode/certification"
import { ProfileLoader } from "@/certification/ProfileLoader"

export async function getAvailableProfiles(_controller: Controller, _request: EmptyRequest): Promise<AvailableProfilesResponse> {
	// ⚠️ The built-ins declared in code, not `listBuiltinProfiles()` — which reads the profiles
	// *directory*, so on a machine where nothing has been seeded yet it returns an empty list and the
	// selection screen offers nothing at all. Seeding happens as a side effect of loading a profile,
	// which cannot happen until the user picks one, which they cannot do from an empty list.
	const profileNames = ProfileLoader.builtinProfileNames()
	const profiles = profileNames
		.map((name) => {
			const profile = ProfileLoader.loadProfileByName(name)
			if (!profile) {
				return null
			}
			return CertificationProfile.create({
				standard: profile.standard,
				version: profile.version,
				publisher: profile.publisher,
				title: profile.title ?? "",
				basedOn: (profile.based_on ?? []).map((document) =>
					SourceDocument.create({
						id: document.id,
						revision: document.revision,
						title: document.title,
						role: document.role,
					}),
				),
				regime: profile.regime ?? "",
				levelBasis: profile.level_basis ?? "",
				unsupportedArtifacts: profile.unsupported_artifacts ?? [],
				levels: Object.entries(profile.levels).map(([id, level]) =>
					CertificationLevel.create({
						id,
						label: level.label,
						failureCondition: level.failure_condition,
						coverageMetric: level.coverage_metric,
						assignedFrom: level.assigned_from ?? "",
					}),
				),
			})
		})
		.filter(Boolean)
	return AvailableProfilesResponse.create({ profiles: profiles as CertificationProfile[] })
}
