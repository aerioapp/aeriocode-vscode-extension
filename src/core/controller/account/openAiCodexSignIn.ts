import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

export async function openAiCodexSignIn(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	return Empty.create({})
}
