import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { SubmitLimitIncreaseResponse } from "@shared/proto/aeriocode/account"

export async function submitLimitIncreaseRequest(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<SubmitLimitIncreaseResponse> {
	return SubmitLimitIncreaseResponse.create({})
}
