import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { OnboardingProgressRequest } from "@shared/proto/aeriocode/state"

export async function captureOnboardingProgress(_controller: Controller, _request: OnboardingProgressRequest): Promise<Empty> {
	return Empty.create({})
}
