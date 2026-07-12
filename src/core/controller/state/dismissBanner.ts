import { Controller } from ".."
import { Empty, StringRequest } from "@shared/proto/aeriocode/common"

export async function dismissBanner(_controller: Controller, _request: StringRequest): Promise<Empty> {
	return Empty.create({})
}
