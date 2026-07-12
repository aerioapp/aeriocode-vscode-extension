import { Controller } from ".."
import { Empty, Int64Request } from "@shared/proto/aeriocode/common"

export async function updateCliBannerVersion(_controller: Controller, _request: Int64Request): Promise<Empty> {
	return Empty.create({})
}
