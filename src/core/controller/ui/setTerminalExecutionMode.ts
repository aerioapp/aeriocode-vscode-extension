import { Controller } from ".."
import { BooleanRequest, KeyValuePair } from "@shared/proto/aeriocode/common"

export async function setTerminalExecutionMode(_controller: Controller, _request: BooleanRequest): Promise<KeyValuePair> {
	return KeyValuePair.create({})
}
