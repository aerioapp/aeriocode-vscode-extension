# Aeriocode API

The Aeriocode extension exposes an API that can be used by other extensions. To use this API in your extension:

1. Copy `src/extension-api/aeriocode.d.ts` to your extension's source directory.
2. Include `aeriocode.d.ts` in your extension's compilation.
3. Get access to the API with the following code:

    ```ts
    const aeriocodeExtension = vscode.extensions.getExtension<AeriocodeAPI>("aeriocode.aeriocode")

    if (!aeriocodeExtension?.isActive) {
    	throw new Error("Aeriocode extension is not activated")
    }

    const aeriocode = aeriocodeExtension.exports

    if (aeriocode) {
    	// Now you can use the API

    	// Start a new task with an initial message
    	await aeriocode.startNewTask("Hello, Aeriocode! Let's make a new project...")

    	// Start a new task with an initial message and images
    	await aeriocode.startNewTask("Use this design language", ["data:image/webp;base64,..."])

    	// Send a message to the current task
    	await aeriocode.sendMessage("Can you fix the @problems?")

    	// Simulate pressing the primary button in the chat interface (e.g. 'Save' or 'Proceed While Running')
    	await aeriocode.pressPrimaryButton()

    	// Simulate pressing the secondary button in the chat interface (e.g. 'Reject')
    	await aeriocode.pressSecondaryButton()
    } else {
    	console.error("Aeriocode API is not available")
    }
    ```

    **Note:** To ensure that the `aeriocode.aeriocode` extension is activated before your extension, add it to the `extensionDependencies` in your `package.json`:

    ```json
    "extensionDependencies": [
        "aeriocode.aeriocode"
    ]
    ```

For detailed information on the available methods and their usage, refer to the `aeriocode.d.ts` file.
