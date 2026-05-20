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

		// MCP tool: last_active_get_path
		//
		// MCP counterpart of the /last-active/ REST route. Returns the
		// vault-relative path of the currently active note, falling back
		// to the most-recently-active note cached by this plugin. The
		// `active` field indicates whether the returned path is the
		// currently active note (`true`) or a cached fallback (`false`).
		this.api.addMcpTool(
			"last_active_get_path",
			"Return the vault-relative path of the file currently open in Obsidian, " +
				"falling back to the most-recently-active file when no file is currently open. " +
				"The returned `active` field is `true` if a file is currently open, " +
				"`false` if the cached fallback was used. " +
				"Use this path with vault_read, vault_write, vault_append, vault_patch, " +
				"vault_get_document_map, or vault_delete to operate on the file. " +
				"Throws if no file is currently active and no file has been cached yet.",
			{},
			async () => {
				const current = this.app.workspace.getActiveFile();
				if (current) {
					return { path: current.path, active: true };
				}
				if (this.lastActiveFile) {
					return { path: this.lastActiveFile.path, active: false };
				}
				throw new Error(
					"No note is currently active and no last-active note has been cached.",
				);
			},
		);
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
}

// The shipped `main.d.ts` of obsidian-local-rest-api hasn't been regenerated
// since v2.x and is missing `addMcpTool`. The runtime (v4.x) provides it, so
// augment the type locally.
declare module "obsidian-local-rest-api" {
	interface LocalRestApiPublicApi {
		addMcpTool(
			name: string,
			description: string,
			schema: Record<string, unknown>,
			callback: (args: Record<string, unknown>) => Promise<unknown>,
		): void;
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
