import { Controller } from ".."
import { String } from "@shared/proto/aeriocode/common"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

export async function getRedirectUrl(_controller: Controller, _request: EmptyRequest): Promise<String> {
	return String.create({ value: "" })
}
