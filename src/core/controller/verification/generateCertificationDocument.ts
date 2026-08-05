import { Controller } from ".."
import { DocumentSection, GenerateDocumentRequest, GenerateDocumentResponse } from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"

/**
 * Draft a DO-178C life cycle document.
 *
 * The property that matters more than everything else here: **no section is ever filled with
 * generic prose.** A generator that wrote plausible text into every section would produce a
 * document that reads as complete, passes a skim, and is discovered to be boilerplate at the
 * certification review — after it has been submitted. A blank section is visible; generic text is
 * not.
 *
 * So a section is either backed by data Aerio holds or it is empty and marked
 * `applicant-must-supply` with a note saying what it must contain and why nobody else can write
 * it. `complete` is always false, and the panel shows that beside the title rather than in a
 * footnote.
 *
 * Both shapes come back in one call: the structured sections for the panel to render, and the
 * Markdown for the user to save. Fetching them separately would mean two generations of the same
 * document, and two content hashes for one artifact.
 */
export async function generateCertificationDocument(
	_controller: Controller,
	request: GenerateDocumentRequest,
): Promise<GenerateDocumentResponse> {
	try {
		if (!request.documentId) {
			return GenerateDocumentResponse.create({ error: "No document was selected." })
		}

		const client = VerificationClient.getInstance()
		// No project data yet: the sections Aerio can fill without any are the tool qualification
		// position and the coding standards in use, and those are exactly what a programme starting
		// its PSAC wants to see first.
		const data: Record<string, unknown> = {}

		const document = await client.generateDocument(request.documentId, data, request.projectName || undefined)
		const markdown = await client.renderDocumentMarkdown(request.documentId, data, request.projectName || undefined)

		return GenerateDocumentResponse.create({
			documentId: document.documentId,
			title: document.title,
			clause: document.clause,
			sections: document.sections.map((section) =>
				DocumentSection.create({
					id: section.id,
					title: section.title,
					clause: section.clause,
					source: section.source,
					note: section.note ?? "",
					filled: section.content !== null && section.content !== undefined,
				}),
			),
			sectionsGenerated: document.completeness.sectionsGenerated,
			sectionsForApplicant: document.completeness.sectionsForApplicant,
			complete: document.completeness.complete,
			completenessStatement: document.completeness.statement,
			contentHash: document.seal.contentHash,
			markdown,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return GenerateDocumentResponse.create({ error: message })
	}
}
