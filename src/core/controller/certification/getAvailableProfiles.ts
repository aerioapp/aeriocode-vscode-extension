import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { AvailableProfilesResponse, CertificationProfile, CertificationLevel } from "@shared/proto/aeriocode/certification"
import { ProfileLoader } from "@/certification/ProfileLoader"

export async function getAvailableProfiles(_controller: Controller, _request: EmptyRequest): Promise<AvailableProfilesResponse> {
	const profileNames = ProfileLoader.listBuiltinProfiles()
	const profiles = profileNames
		.map((name) => {
			const profile = ProfileLoader.loadProfileByName(name)
			if (!profile) return null
			return CertificationProfile.create({
				standard: profile.standard,
				version: profile.version,
				publisher: profile.publisher,
				levels: Object.entries(profile.levels).map(([id, level]) =>
					CertificationLevel.create({
						id,
						label: level.label,
						failureCondition: level.failure_condition,
						coverageMetric: level.coverage_metric,
					}),
				),
			})
		})
		.filter(Boolean)
	return AvailableProfilesResponse.create({ profiles: profiles as CertificationProfile[] })
}
