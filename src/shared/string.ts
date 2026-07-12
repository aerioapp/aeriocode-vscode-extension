/**
 * Preserves escaping style from original text when applying patches.
 * This helps maintain consistent escaping in the output.
 */
export function preserveEscaping(originalText: string, newText: string): string {
	// Simple implementation: just return the new text as-is
	// A more sophisticated version could detect escaping patterns in originalText
	// and apply them to newText
	return newText
}

/**
 * Canonicalizes a string by normalizing whitespace.
 */
export function canonicalize(str: string): string {
	return str.replace(/\s+/g, " ").trim()
}
