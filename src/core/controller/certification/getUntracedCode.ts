import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { UntracedCodeResponse, UntracedFunction } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getUntracedCode(_controller: Controller, _request: EmptyRequest): Promise<UntracedCodeResponse> {
	const certManager = CertificationManager.getInstance()
	if (!certManager.getStatus().active) {
		return UntracedCodeResponse.create({ functions: [] })
	}

	const untraced = certManager.getUntracedCode()
	const functions = untraced.map((f) =>
		UntracedFunction.create({
			name: f.name,
			startLine: f.start_line,
			endLine: f.end_line,
			filePath: f.file_path,
			language: f.language,
		}),
	)

	return UntracedCodeResponse.create({ functions })
}
