import { Plugin, TFile } from "obsidian";
import { getAPI, LocalRestApiPublicApi } from "obsidian-local-rest-api";

export default class ObsidianLocalRESTAPISamplePlugin extends Plugin {
	private api: LocalRestApiPublicApi;
	private lastActiveFile: TFile | null = null;

	registerRoutes() {
		this.api = getAPI(this.app, this.manifest);

		// GET /last-active/
		//
		// Returns the currently active note. When no note is active, falls
		// back to the most recently active note cached by this plugin. The
		// `X-Obsidian-Note-Active` response header indicates whether the
		// returned note is currently active (`true`) or a cached fallback
		// (`false`).
		this.api.addRoute("/last-active/").get(async (request, response) => {
			const current = this.app.workspace.getActiveFile();
			let file: TFile | null;
			if (current) {
				response.set("X-Obsidian-Note-Active", "true");
				file = current;
			} else if (this.lastActiveFile) {
				response.set("X-Obsidian-Note-Active", "false");
				file = this.lastActiveFile;
			} else {
				response.status(404).json({
					message:
						"No note is currently active and no last-active note has been cached.",
				});
				return;
			}

			try {
				const content = await this.app.vault.read(file);
				response.set("Content-Location", encodeURI(file.path));
				response.type("text/markdown").send(content);
			} catch (err) {
				response.status(500).json({ message: err.message });
			}
		});
	}

	//
	//
	//
	//
	// Everything below this point can be left as it is -- this is just
	// setting up machinery to properly register your routes with
	// Obsidian Local REST API
	//
	//
	//
	//

	async onload() {
		// Seed the cache with whatever note is open when the plugin loads.
		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile) {
			this.lastActiveFile = currentFile;
		}

		// Refresh the cache whenever the user opens a different note.
		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				if (file) {
					this.lastActiveFile = file;
				}
			})
		);

		if (this.app.plugins.enabledPlugins.has("obsidian-local-rest-api")) {
			this.registerRoutes();
		}

		this.registerEvent(
			this.app.workspace.on(
				"obsidian-local-rest-api:loaded",
				this.registerRoutes.bind(this)
			)
		);
	}

	onunload() {
		if (this.api) {
			this.api.unregister();
		}
	}
}

declare module "obsidian" {
	interface App {
		plugins: {
			enabledPlugins: Set<string>;
		};
	}
	interface Workspace {
		on(
			name: "obsidian-local-rest-api:loaded",
			callback: () => void,
			ctx?: any
		): EventRef;
	}
}
