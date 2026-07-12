import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { StringRequest } from "@shared/proto/aeriocode/common"

export async function requestyAuthClicked(_controller: Controller, _request: StringRequest): Promise<Empty> {
	return Empty.create({})
}
