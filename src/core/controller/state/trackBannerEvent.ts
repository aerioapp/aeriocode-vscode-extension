import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { TrackBannerEventRequest } from "@shared/proto/aeriocode/state"

export async function trackBannerEvent(_controller: Controller, _request: TrackBannerEventRequest): Promise<Empty> {
	return Empty.create({})
}
