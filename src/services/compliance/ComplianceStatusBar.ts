import * as vscode from "vscode"
import { CertificationManager } from "@/certification/CertificationManager"
import { describeProfile, resolveComplianceProfile, watchComplianceProfile } from "./ComplianceProfileResolver"

/**
 * A visible indication that a coding standard is being enforced.
 *
 * Without one, the difference between a safety-critical session and an ordinary one is invisible
 * until the model starts reporting findings, and a user whose setting is scoped to the wrong folder
 * has no way to notice. That matters more here than for a typical setting: believing a standard is
 * in force when it is not is the failure this whole feature exists to prevent, and it is silent.
 *
 * ## Why the off state is shown, and only sometimes
 *
 * ⚠️ This used to hide entirely when no standard was set, on the reasoning — sound as far as it goes
 * — that an indicator permanently reading "off" is noise for every user not doing this work, and
 * noise is what gets an indicator ignored.
 *
 * The consequence was that **the one state with no UI at all was the silent failure the indicator
 * exists to prevent**. Two real sessions were run against an avionics standard the user believed was
 * in force and was not; in the second the model, asked why its file did not comply, went looking for
 * the standard's documentation on the web. Nothing anywhere said the feature was dormant.
 *
 * So the off state is shown, but only for a file in a language some pack covers. A Python or
 * TypeScript user never sees it and the original argument is preserved intact; a C or C++ user sees
 * that a standard could apply and does not, which is exactly the population for whom that is worth
 * knowing.
 */

/**
 * Languages a registered pack can analyse.
 *
 * Deliberately narrow. This decides only whether to show a dormant indicator, so being wrong costs a
 * line of status bar rather than a wrong answer about the code.
 */
const COVERED_LANGUAGES = new Set(["c", "cpp"])
export class ComplianceStatusBar implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem
	private readonly watcher: vscode.Disposable
	private readonly editorWatcher: vscode.Disposable
	private readonly certificationWatcher: vscode.Disposable

	constructor() {
		// Left-aligned with low priority: this reports state, it is not an action, and it should sit
		// beside the other things describing what the workspace is rather than competing with them.
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90)
		this.item.command = "workbench.action.openSettings"

		this.watcher = watchComplianceProfile(() => this.refresh())
		// The level can also come from the certification profile, which changes without any settings
		// event — so watching settings alone left the indicator stale after a profile was activated.
		this.certificationWatcher = CertificationManager.onActiveProfileChanged(() => this.refresh())
		// The active editor decides which folder's settings apply in a multi-root workspace, so the
		// indicator has to follow it or it would show one folder's answer while the user edits
		// another's.
		this.editorWatcher = vscode.window.onDidChangeActiveTextEditor(() => this.refresh())

		this.refresh()
	}

	refresh(): void {
		const editor = vscode.window.activeTextEditor
		const profile = resolveComplianceProfile(editor?.document.uri)

		if (!profile) {
			if (!editor || !COVERED_LANGUAGES.has(editor.document.languageId)) {
				this.item.hide()
				return
			}
			// Dormant, and said plainly. "No standard" rather than "off" because the question a
			// reader has is which standard applies, and the answer is none.
			this.item.text = "$(shield) No standard"
			this.item.tooltip = new vscode.MarkdownString(
				"**No coding standard is being enforced.**\n\n" +
					"Generated code is not held to any standard and is not analysed after a write. This file is " +
					"C or C++, so a standard could apply to it.\n\n" +
					"_Click to set `aeriocode.compliance.standard` for this workspace._",
			)
			this.item.show()
			return
		}

		this.item.text = `$(shield) ${describeProfile(profile)}`
		this.item.tooltip = new vscode.MarkdownString(
			`**Aeriocode is holding generated code to ${profile.standard}**` +
				(profile.level ? ` at ${profile.regime === "iso-26262" ? "ASIL" : "DAL"} ${profile.level}` : "") +
				".\n\n" +
				"Code written in this session is analysed after every write, and violations are returned to the " +
				"model to fix.\n\n" +
				"This reports findings. It is not a certification and does not guarantee one — whether the evidence " +
				"suffices is decided by the applicant and their certification authority.\n\n" +
				"_Click to change `aeriocode.compliance` settings._",
		)
		this.item.show()
	}

	dispose(): void {
		this.item.dispose()
		this.watcher.dispose()
		this.editorWatcher.dispose()
		this.certificationWatcher.dispose()
	}
}
