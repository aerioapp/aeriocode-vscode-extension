import { Controller } from ".."
import { Empty, EmptyRequest } from "@shared/proto/aeriocode/common"

export async function refreshRemoteConfig(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	return Empty.create({})
}
