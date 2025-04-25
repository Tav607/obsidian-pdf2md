/// <reference types="obsidian" />
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, Menu, MenuItem } from 'obsidian';

// Remember to rename these classes and interfaces!

interface PDF2MDSettings {
	apiKey: string;
	modelName: string;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
}

const DEFAULT_SETTINGS: PDF2MDSettings = {
	apiKey: 'your_api_key',
	modelName: 'gemini-2.5-flash-preview-04-17',
	systemPrompt: `You are an AI assistant specialized in converting PDF documents into clean, well-formatted Markdown text. Your goal is to accurately represent the structure and content of the provided PDF, adhering strictly to the following guidelines:
- Format Preservation: Properly convert and represent headings (using #, ##, ###, etc.), ordered lists (1., 2.), unordered lists (* or -), tables (using standard Markdown table syntax), and blockquotes (>). Maintain the original document structure as closely as possible.
- For images that are actually tables, output as Markdown tables; for images that are not tables, just semantically describe them without embedding.
- Content Exclusion: Explicitly EXCLUDE any headers, footers, page numbers, or other peripheral metadata present in the original PDF. Focus solely on the main body content.
- Output Format: The output MUST be only the raw Markdown text. Do NOT include any introductory phrases, explanations, summaries, concluding remarks, or surround the output with Markdown code fences. The response should begin directly with the first line of the converted Markdown content and end with the last line, with no extra formatting or text.`,
	userPrompt: 'Please convert the uploaded PDF document into raw Markdown format, strictly following the conversion rules defined in the system prompt.',
	temperature: 0.5,
};

export default class PDF2MDWithGemini extends Plugin {
	settings: PDF2MDSettings;

	async onload() {
		await this.loadSettings();
		// Add context menu item for PDF files
		this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
			if (file.extension === 'pdf') {
				menu.addItem((item: MenuItem) => {
					item
						.setTitle('Convert to Markdown')
						.setIcon('file-pdf')
						.onClick(() => this.convertFile(file));
				});
			}
		});
		this.addSettingTab(new PDF2MDSettingTab(this.app, this));
	}

	async convertFile(file: TFile) {
		new Notice(`Converting ${file.name} to Markdown...`);
		try {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const u8array = new Uint8Array(arrayBuffer);
			const mimeType = 'application/pdf';
			const fileSize = u8array.byteLength;
			const displayName = file.name;

			const apiKey = this.settings.apiKey.trim();

			// Ensure API key is provided
			if (!apiKey) {
				new Notice("Please set your API key in plugin settings.");
				return;
			}

			// Start resumable upload via Google API (no CORS) using fetch for better error handling
			const startResponse = await fetch(
				`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
				{
					method: 'POST',
					headers: {
						'X-Goog-Upload-Protocol': 'resumable',
						'X-Goog-Upload-Command': 'start',
						'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
						'X-Goog-Upload-Header-Content-Type': mimeType,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ file: { display_name: displayName } }),
				}
			);
			const startText = await startResponse.text();
			console.log("startResponse status:", startResponse.status, "body:", startText);
			if (!startResponse.ok) {
				new Notice(`Upload start failed: ${startResponse.status} - ${startText}`);
				return;
			}
			const uploadUrl = startResponse.headers.get('x-goog-upload-url') || startResponse.headers.get('X-Goog-Upload-URL');
			console.log("uploadUrl", uploadUrl);
			if (!uploadUrl) {
				new Notice('No upload URL returned');
				return;
			}

			// Upload PDF bytes and finalize
			const uploadResponse = await fetch(uploadUrl, {
				method: 'POST',
				headers: {
					'Content-Type': mimeType,
					'Content-Length': fileSize.toString(),
					'X-Goog-Upload-Offset': '0',
					'X-Goog-Upload-Command': 'upload, finalize',
				},
				body: u8array.buffer,
			});
			const uploadText = await uploadResponse.text();
			console.log("uploadResponse status:", uploadResponse.status, "body:", uploadText);
			if (!uploadResponse.ok) {
				new Notice(`Upload content failed: ${uploadResponse.status} - ${uploadText}`);
				return;
			}
			const fileInfo = JSON.parse(uploadText);
			const fileUri = fileInfo.file.uri;
			console.log("fileUri", fileUri);
			if (!fileUri) {
				new Notice('No file URI returned');
				return;
			}

			// Generate Markdown via Gemini model (omit unsupported temperature field)
			const generateResponse = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.settings.modelName)}:generateContent?key=${apiKey}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contents: [
							{
								parts: [
									{ text: this.settings.systemPrompt },
									{ text: this.settings.userPrompt },
									{ file_data: { file_uri: fileUri, mime_type: mimeType } }
								]
							}
						]
					}),
				}
			);
			const generateText = await generateResponse.text();
			console.log("generateResponse status:", generateResponse.status, "body:", generateText);
			if (!generateResponse.ok) {
				new Notice(`Generate content failed: ${generateResponse.status} - ${generateText}`);
				return;
			}
			const genData = JSON.parse(generateText);
			const candidates = genData.candidates;
			if (!candidates?.length) throw new Error('No candidates returned');
			const contentParts: string[] = candidates[0].content.parts.map(
				(part: any) => part.text
			);
			let markdown = contentParts.join('');
			// Remove wrapping markdown code fences if present
			markdown = markdown.replace(/^```(?:markdown)?\r?\n?/, '').replace(/\r?\n?```$/, '');

			const newPath = file.path.replace(/\.pdf$/i, '.md');
			const existing = this.app.vault.getAbstractFileByPath(newPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, markdown);
			} else {
				await this.app.vault.create(newPath, markdown);
			}
			new Notice(`Converted ${file.name} to ${newPath}`);
		} catch (error: any) {
			console.error("Error converting file:", error);
			new Notice(`Error converting file: ${error.message}`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PDF2MDSettingTab extends PluginSettingTab {
	plugin: PDF2MDWithGemini;

	constructor(app: App, plugin: PDF2MDWithGemini) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Google Gemini API Key')
			.addText(text =>
				text
					.setPlaceholder('API Key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async value => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('Gemini model name')
			.addText(text =>
				text
					.setPlaceholder('gemini-1.5-flash')
					.setValue(this.plugin.settings.modelName)
					.onChange(async value => {
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('System-level instructions for PDF conversion')
			.addTextArea(text =>
				text
					.setPlaceholder('You are a professional document-conversion and analysis assistant...')
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async value => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('User Prompt')
			.setDesc('User-level prompt for PDF conversion')
			.addText(text =>
				text
					.setPlaceholder('I have uploaded a PDF...')
					.setValue(this.plugin.settings.userPrompt)
					.onChange(async value => {
						this.plugin.settings.userPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Temperature for generation (0-2)')
			.addSlider(slider =>
				slider
					.setLimits(0, 2, 0.1)
					.setValue(this.plugin.settings.temperature)
					.onChange(async value => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			)
			.addText(text =>
				text
					.setValue(this.plugin.settings.temperature.toString())
					.onChange(async value => {
						const num = parseFloat(value);
						if (!isNaN(num)) {
							this.plugin.settings.temperature = num;
							await this.plugin.saveSettings();
						}
						text.setValue(this.plugin.settings.temperature.toString());
					})
			);
	}
}
