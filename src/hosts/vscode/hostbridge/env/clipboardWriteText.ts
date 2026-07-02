import { StringRequest, Empty } from "@shared/proto/aeriocode/common"
import * as vscode from "vscode"

export async function clipboardWriteText(request: StringRequest): Promise<Empty> {
	await vscode.env.clipboard.writeText(request.value)
	return Empty.create({})
}
