import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { TestConnectionResult } from "@shared/proto/aeriocode/state"

export async function testOtelConnection(_controller: Controller, _request: EmptyRequest): Promise<TestConnectionResult> {
	return TestConnectionResult.create({})
}
