/**
 * Roblox Studio Tools for Vercel AI SDK
 *
 * These tools allow the AI to interact with Roblox Studio via the bridge server.
 */

import { tool } from "ai"
import { z } from "zod"
import { studioRequest, isStudioConnected, notConnectedError, cachedStudioRequest, invalidateCache } from "./client"
import { searchToolbox, getAssetDetails, type AssetCategory } from "./toolbox"
import * as fileOps from "@/lib/file-ops"

// ============================================================================
// Types
// ============================================================================

interface ScriptContent {
  path: string
  source: string
  className: string
}

interface InstanceInfo {
  path: string
  name: string
  className: string
  children?: InstanceInfo[]
}

interface PropertyInfo {
  name: string
  value: string
  type: string
}

// ============================================================================
// Script Tools
// ============================================================================

export const robloxGetScript = tool({
  description: `Read the source code of a script in Roblox Studio.

Use this to read scripts like ServerScriptService.MainScript or Workspace.Part.LocalScript.
The path should be the full instance path from game root.

Examples:
- game.ServerScriptService.MainScript
- game.ReplicatedStorage.Modules.Utils
- game.Workspace.SpawnLocation.TouchScript`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to the script (e.g. game.ServerScriptService.MainScript)"),
  }),
  execute: async ({ path }: { path: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    // Use fresh request instead of cache for script content to ensure we get latest version
    // Cache invalidation is handled by the non-cached request below
    const result = await studioRequest<ScriptContent>("/script/get", { path })
    if (!result.success) {
      return { error: result.error }
    }

    const lines = result.data.source.split("\n")
    const numbered = lines.map((line, i) => `${(i + 1).toString().padStart(5, "0")}| ${line}`).join("\n")

    return {
      path: result.data.path,
      className: result.data.className,
      source: numbered,
    }
  },
})

export const robloxSetScript = tool({
  description: `Replace the entire source code of a script in Roblox Studio.

Use this to completely replace a script's contents.
For partial edits, consider using roblox_edit_script instead.

The path should be the full instance path from game root.`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to the script"),
    source: z.string().describe("The new source code for the script"),
  }),
  execute: async ({ path, source }: { path: string; source: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string }>("/script/set", { path, source })
    if (!result.success) {
      return { error: result.error }
    }
    invalidateCache(path)

    const lines = source.split("\n").length
    return { success: true, path: result.data.path, lines }
  },
})

export const robloxEditScript = tool({
  description: `Edit a portion of a script by replacing specific code.

This performs a find-and-replace operation on the script source.
The oldCode must match exactly (including whitespace).
Use roblox_get_script first to see the current source.

Example:
  oldCode: "local speed = 10"
  newCode: "local speed = 20"`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to the script"),
    oldCode: z.string().describe("The exact code to find and replace"),
    newCode: z.string().describe("The new code to replace it with"),
  }),
  execute: async ({ path, oldCode, newCode }: { path: string; oldCode: string; newCode: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string; replaced: number }>("/script/edit", {
      path,
      oldCode,
      newCode,
    })

    if (!result.success) {
      return { error: result.error }
    }
    invalidateCache(path)

    return { success: true, path: result.data.path, replacements: result.data.replaced }
  },
})

// ============================================================================
// Instance Tools
// ============================================================================

export const robloxGetChildren = tool({
  description: `List the children of an instance in Roblox Studio.

Use this to explore the game hierarchy.
Set recursive=true to get all descendants (can be slow for large trees).

Examples:
- game.Workspace
- game.ServerScriptService
- game.Players.Player1.Backpack`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path (e.g. game.Workspace)"),
    recursive: z.boolean().optional().describe("If true, get all descendants recursively"),
  }),
  execute: async ({ path, recursive = false }: { path: string; recursive?: boolean }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await cachedStudioRequest<InstanceInfo[]>("/instance/children", { path, recursive }, 5_000)
    if (!result.success) {
      return { error: result.error }
    }

    const format = (items: InstanceInfo[], indent = 0): string => {
      return items
        .map((item) => {
          const prefix = "  ".repeat(indent)
          const line = `${prefix}- ${item.name} (${item.className})`
          if (item.children && item.children.length > 0) {
            return `${line}\n${format(item.children, indent + 1)}`
          }
          return line
        })
        .join("\n")
    }

    return { path, children: format(result.data) }
  },
})

export const robloxGetProperties = tool({
  description: `Get all properties of an instance in Roblox Studio.

Returns a list of property names, values, and types.
Useful for understanding what can be modified on an instance.`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path"),
  }),
  execute: async ({ path }: { path: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await cachedStudioRequest<PropertyInfo[]>("/instance/properties", { path }, 5_000)
    if (!result.success) {
      return { error: result.error }
    }

    return { path, properties: result.data }
  },
})

export const robloxSetProperty = tool({
  description: `Set a property value on an instance in Roblox Studio.

The value is parsed based on the property type:
- Numbers: "10", "3.14"
- Booleans: "true", "false"
- Strings: "Hello World"
- Vector3: "1, 2, 3"
- Color3: "255, 128, 0" (RGB 0-255) or "#FF8800"
- BrickColor: "Bright red"
- Enum: "Enum.Material.Plastic"`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path"),
    property: z.string().describe("Property name to set"),
    value: z.string().describe("New value for the property"),
  }),
  execute: async ({ path, property, value }: { path: string; property: string; value: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string }>("/instance/set", { path, property, value })
    if (!result.success) {
      return { error: result.error }
    }
    invalidateCache(path)

    return { success: true, path: result.data.path, property, value }
  },
})

export const robloxCreate = tool({
  description: `Create a new instance in Roblox Studio.

Common class names:
- Scripts: Script, LocalScript, ModuleScript
- Parts: Part, MeshPart, UnionOperation
- UI: ScreenGui, Frame, TextLabel, TextButton
- Values: StringValue, IntValue, BoolValue, ObjectValue
- Other: Folder, Model, RemoteEvent, RemoteFunction`,
  inputSchema: z.object({
    className: z.string().describe("The class name of the instance to create"),
    parent: z.string().describe("Full path to the parent instance"),
    name: z.string().optional().describe("Name for the new instance"),
  }),
  execute: async ({ className, parent, name }: { className: string; parent: string; name?: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string }>("/instance/create", { className, parent, name })
    if (!result.success) {
      return { error: result.error }
    }

    return { success: true, path: result.data.path }
  },
})

export const robloxDelete = tool({
  description: `Delete an instance from Roblox Studio.

This permanently removes the instance and all its descendants.
Use with caution - this cannot be undone through the tool.`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to delete"),
  }),
  execute: async ({ path }: { path: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ deleted: string }>("/instance/delete", { path })
    if (!result.success) {
      return { error: result.error }
    }

    invalidateCache(path)

    return { success: true, deleted: result.data.deleted }
  },
})

export const robloxClone = tool({
  description: `Clone an instance in Roblox Studio.

Creates a deep copy of the instance and all its descendants.
If parent is not specified, the clone is placed in the same parent as the original.`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to clone"),
    parent: z.string().optional().describe("Optional new parent path for the clone"),
  }),
  execute: async ({ path, parent }: { path: string; parent?: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string }>("/instance/clone", { path, parent })
    if (!result.success) {
      return { error: result.error }
    }

    return { success: true, path: result.data.path }
  },
})

export const robloxSearch = tool({
  description: `Search for instances in Roblox Studio by name or class.

At least one of name or className must be provided.
Name matching is case-insensitive and supports partial matches.`,
  inputSchema: z.object({
    root: z.string().optional().describe("Root path to search from (default: game)"),
    name: z.string().optional().describe("Name pattern to match"),
    className: z.string().optional().describe("Class name to filter by"),
    limit: z.number().optional().describe("Maximum results (default: 50)"),
  }),
  execute: async ({
    root = "game",
    name,
    className,
    limit = 50,
  }: {
    root?: string
    name?: string
    className?: string
    limit?: number
  }) => {
    if (!name && !className) {
      return { error: "At least one of name or className must be provided" }
    }

    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<InstanceInfo[]>("/instance/search", { root, name, className, limit })
    if (!result.success) {
      return { error: result.error }
    }

    if (result.data.length === 0) {
      return { message: "No instances found matching criteria", results: [] }
    }

    return {
      count: result.data.length,
      results: result.data.map((item) => ({ path: item.path, className: item.className })),
    }
  },
})

export const robloxGetSelection = tool({
  description: `Get the currently selected objects in Roblox Studio.

Returns the paths and class names of all selected instances.
Useful for operating on what the user has selected in the Explorer.`,
  inputSchema: z.object({}),
  execute: async () => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<InstanceInfo[]>("/selection/get")
    if (!result.success) {
      return { error: result.error }
    }

    if (result.data.length === 0) {
      return { message: "No objects selected in Studio", selection: [] }
    }

    return {
      count: result.data.length,
      selection: result.data.map((item) => ({ path: item.path, className: item.className })),
    }
  },
})

export const robloxRunCode = tool({
  description: `Execute Luau code in Roblox Studio.

The code runs in the command bar context with full access to game services.
Use print() to output results - they will be captured and returned.

Examples:
- print(game.Workspace:GetChildren())
- game.Players.LocalPlayer.Character:MoveTo(Vector3.new(0, 10, 0))
- for _, part in game.Workspace:GetDescendants() do if part:IsA("BasePart") then part.Anchored = true end end`,
  inputSchema: z.object({
    code: z.string().describe("Luau code to execute"),
  }),
  execute: async ({ code }: { code: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ output: string; error?: string }>("/code/run", { code })
    if (!result.success) {
      return { error: result.error }
    }

    if (result.data.error) {
      return { error: result.data.error }
    }

    return { output: result.data.output || "Code executed successfully (no output)" }
  },
})

export const robloxMove = tool({
  description: `Move an instance to a new parent (reparent).

Changes the Parent property of the instance to the new location.
The instance keeps all its properties and children.

Examples:
- Move a part to a folder: path="game.Workspace.Part1", newParent="game.Workspace.MyFolder"
- Move a script to ServerScriptService: path="game.Workspace.Script", newParent="game.ServerScriptService"`,
  inputSchema: z.object({
    path: z.string().describe("Full instance path to move"),
    newParent: z.string().describe("Full path to the new parent"),
  }),
  execute: async ({ path, newParent }: { path: string; newParent: string }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ path: string }>("/instance/move", { path, newParent })
    if (!result.success) {
      return { error: result.error }
    }

    return { success: true, path: result.data.path }
  },
})

// ============================================================================
// Bulk Operations
// ============================================================================

export const robloxBulkCreate = tool({
  description: `Create multiple instances at once.

More efficient than calling roblox_create multiple times.
Each item specifies className, parent, and optional name.

Example: Create 5 parts in workspace
[
  { className: "Part", parent: "game.Workspace", name: "Part1" },
  { className: "Part", parent: "game.Workspace", name: "Part2" },
  ...
]`,
  inputSchema: z.object({
    instances: z
      .array(
        z.object({
          className: z.string().describe("Class name of the instance"),
          parent: z.string().describe("Parent path"),
          name: z.string().optional().describe("Optional name"),
        })
      )
      .describe("Array of instances to create"),
  }),
  execute: async ({
    instances,
  }: {
    instances: Array<{ className: string; parent: string; name?: string }>
  }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ created: string[] }>("/instance/bulk-create", { instances })
    if (!result.success) {
      return { error: result.error }
    }

    return { success: true, count: result.data.created.length, paths: result.data.created }
  },
})

export const robloxBulkDelete = tool({
  description: `Delete multiple instances at once.

More efficient than calling roblox_delete multiple times.
All specified instances and their descendants will be destroyed.

WARNING: This cannot be undone through the tool.`,
  inputSchema: z.object({
    paths: z.array(z.string()).describe("Array of instance paths to delete"),
  }),
  execute: async ({ paths }: { paths: string[] }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ deleted: string[] }>("/instance/bulk-delete", { paths })
    if (!result.success) {
      return { error: result.error }
    }

    return { success: true, count: result.data.deleted.length, deleted: result.data.deleted }
  },
})

export const robloxBulkSetProperty = tool({
  description: `Set properties on multiple instances at once.

More efficient than calling roblox_set_property multiple times.
Each operation specifies path, property name, and value.

Example: Make all parts red and anchored
[
  { path: "game.Workspace.Part1", property: "BrickColor", value: "Bright red" },
  { path: "game.Workspace.Part1", property: "Anchored", value: "true" },
  { path: "game.Workspace.Part2", property: "BrickColor", value: "Bright red" },
  ...
]`,
  inputSchema: z.object({
    operations: z
      .array(
        z.object({
          path: z.string().describe("Instance path"),
          property: z.string().describe("Property name"),
          value: z.string().describe("New value"),
        })
      )
      .describe("Array of property set operations"),
  }),
  execute: async ({
    operations,
  }: {
    operations: Array<{ path: string; property: string; value: string }>
  }) => {
    if (!(await isStudioConnected())) {
      return { error: notConnectedError() }
    }

    const result = await studioRequest<{ updated: number; errors?: string[] }>("/instance/bulk-set", { operations })
    if (!result.success) {
      return { error: result.error }
    }

    return {
      success: true,
      count: result.data.updated,
      errors: result.data.errors,
    }
  },
})

// ============================================================================
// Toolbox Tools
// ============================================================================

export const robloxToolboxSearch = tool({
  description: `Search the Roblox Creator Store for free models, decals, audio, plugins, or meshes.

Use this when the user wants to FIND something in the Roblox Toolbox to insert into their game.
Returns a list of assets with names, creators, thumbnail images, and IDs.

IMPORTANT - When showing results:
- ALWAYS use roblox_ask_user with type:"single" or type:"multi" to let the user visually pick
- Format each option as: { label: "Asset Name", value: "assetId", imageUrl: "thumbnailUrl", description: "by CreatorName" }
- Show ALL results (up to limit) as options — do NOT filter or summarize
- Append two extra options: "Search again" (rerun with same query) and "Let AI pick" (auto-select the best match)
- After the user picks, call roblox_insert_asset with the selected assetId

Examples of when to search:
- "Add a sword to my game" → search "sword" in Models
- "I need some background music" → search "ambient" in Audio
- "Find a car model" → search "car" in Models`,
  inputSchema: z.object({
    query: z.string().describe("Natural language search query for what to find"),
    category: z.enum(["Model", "Decal", "Audio", "Plugin", "MeshPart"]).default("Model").describe("Asset category to search in"),
    limit: z.number().default(10).describe("Max results to return (1-50)"),
  }),
  execute: async ({ query, category = "Model", limit = 10 }: { query: string; category?: AssetCategory; limit?: number }) => {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const result = await searchToolbox(query, category, safeLimit);

    // Surface errors clearly so the AI can report them
    if (result.error) {
      return {
        error: result.error,
        message: `Toolbox search failed: ${result.error}. This may be a temporary rate limit. Try again in a few moments or use a different keyword.`,
        query,
        category,
        results: [],
      };
    }

    if (result.assets.length === 0) {
      return {
        message: `No ${category.toLowerCase()}s found for "${query}". Try a different keyword or category.`,
        query,
        category,
        results: [],
      };
    }

    return {
      count: result.assets.length,
      query,
      category,
      results: result.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        description: asset.description?.slice(0, 120) ?? "",
        creator: asset.creatorName,
        thumbnailUrl: asset.thumbnailUrl,
        askUserOption: {
          label: asset.name,
          value: String(asset.id),
          imageUrl: asset.thumbnailUrl,
          description: `by ${asset.creatorName}`,
        },
      })),
    };
  },
});

export const robloxInsertAsset = tool({
  description: `Insert a free Roblox Creator Store asset (model, decal, audio, etc.) into the user's game.

This is the primary way to add pre-made content to a Roblox game.
The asset will be loaded by the Roblox Studio plugin and inserted into the game.

Workflow:
1. Use roblox_toolbox_search to find assets first
2. Ask the user to pick one (roblox_ask_user) or pick automatically if the request is clear
3. Call roblox_insert_asset with the chosen assetId
4. The result will include a verification status — if verified=true the asset is confirmed in Studio
5. Report the success to the user with the asset name and where it was placed

Note: Only free assets can be inserted. Some models contain scripts (use caution in Studio).`,
  inputSchema: z.object({
    assetId: z.number().describe("The Roblox asset ID (from toolbox search results)"),
    parent: z.string().default("game.Workspace").describe("The parent path where to insert the asset"),
  }),
  execute: async ({ assetId, parent = "game.Workspace" }: { assetId: number; parent?: string }) => {
    const connected = await isStudioConnected();
    if (!connected) {
      return { error: notConnectedError() };
    }

    const details = await getAssetDetails(assetId);
    if (!details) {
      return { error: `Could not look up asset ID ${assetId}. It may not exist or may not be accessible.` };
    }

    const insertResult = await studioRequest<{ path: string; name: string }>("/asset/insert", {
      assetId,
      parentPath: parent,
    });

    if (!insertResult.success) {
      return {
        error: `Insertion failed: ${insertResult.error}`,
        assetId,
        assetName: details.name,
      };
    }

    // Verify the asset was actually inserted by searching for it
    let verified = false;
    let foundPath: string | null = null;

    try {
      const searchResult = await studioRequest<Array<{ path: string; name: string; className: string }>>("/instance/search", {
        root: parent,
        name: details.name,
        limit: 5,
      });

      if (searchResult.success && searchResult.data.length > 0) {
        // Find the closest match
        const match = searchResult.data.find(
          (i) => i.name === details.name || i.path === insertResult.data.path
        ) ?? searchResult.data[0];
        foundPath = match.path;
        verified = true;
      }
    } catch {
      // Verification is best-effort; don't fail the whole operation
    }

    return {
      success: true,
      verified,
      assetId,
      assetName: details.name,
      creator: details.creatorName,
      thumbnailUrl: details.thumbnailUrl,
      path: insertResult.data.path,
      foundPath,
      parent,
      message: verified
        ? `Successfully inserted "${details.name}" into ${parent}. Verified at ${foundPath}.`
        : `Insertion command sent for "${details.name}" into ${parent}. Path: ${insertResult.data.path}`,
    };
  },
});

export const robloxToolboxGetAsset = tool({
  description: `Get full details for a specific Roblox asset by its ID.

Returns: name, description, creator info, creation date, favorite count, and thumbnail.
Use this after the user has selected an asset to confirm what it is before inserting.`,
  inputSchema: z.object({
    assetId: z.number().describe("The Roblox asset ID"),
  }),
  execute: async ({ assetId }: { assetId: number }) => {
    const details = await getAssetDetails(assetId);
    if (!details) {
      return { error: `Could not find asset with ID ${assetId}. Check the ID and try again.` };
    }
    return {
      id: details.id,
      name: details.name,
      description: details.description,
      creator: {
        name: details.creatorName,
        id: details.creatorId,
      },
      thumbnailUrl: details.thumbnailUrl,
      favoriteCount: details.favoriteCount,
      created: details.created,
      updated: details.updated,
    };
  },
});

export const robloxToolboxRemove = tool({
  description: `Remove a previously inserted Roblox asset from the game.

Provide either the exact path (e.g. "Workspace.Sword") OR the asset name plus the parent path.
The plugin will find and delete the instance. Only one instance will be deleted.

Use this when the user wants to undo a toolbox insertion or remove unwanted content.`,
  inputSchema: z.object({
    path: z.string().optional().describe("Exact instance path (e.g. Workspace.FuturisticSword)"),
    name: z.string().optional().describe("Instance name to search for"),
    parent: z.string().default("game.Workspace").describe("Parent path to search within"),
  }),
  execute: async ({ path, name, parent = "game.Workspace" }: { path?: string; name?: string; parent?: string }) => {
    const connected = await isStudioConnected();
    if (!connected) {
      return { error: notConnectedError() };
    }

    let targetPath = path;

    if (!targetPath && name) {
      // Find the instance first
      const searchResult = await studioRequest<Array<{ path: string; name: string }>>("/instance/search", {
        root: parent,
        name,
        limit: 5,
      });

      if (!searchResult.success || searchResult.data.length === 0) {
        return { error: `Could not find an instance named "${name}" in ${parent}` };
      }

      targetPath = searchResult.data[0].path;
    }

    if (!targetPath) {
      return { error: "Must provide either path or name to remove." };
    }

    const result = await studioRequest<{ deleted: boolean }>("/instance/delete", {
      path: targetPath,
    });

    if (!result.success) {
      return { error: `Failed to remove ${targetPath}: ${result.error}` };
    }

    return {
      success: true,
      path: targetPath,
      message: `Successfully removed ${targetPath} from the game.`,
    };
  },
});

export const robloxToolboxInspect = tool({
  description: `Verify that a Roblox asset or instance exists in the game.

Use this AFTER roblox_insert_asset to confirm the asset was actually placed in Studio.
Returns the instance path, name, class, and immediate children if it's a Model.

This is the verification step — always check the result.verified field in the response.`,
  inputSchema: z.object({
    path: z.string().describe("The full instance path to verify (e.g. game.Workspace.Sword)"),
    includeChildren: z.boolean().default(false).describe("Whether to include immediate child instances"),
  }),
  execute: async ({ path, includeChildren = false }: { path: string; includeChildren?: boolean }) => {
    const connected = await isStudioConnected();
    if (!connected) {
      return { error: notConnectedError() };
    }

    // Extract the root and name from the path
    const parts = path.split(".");
    if (parts.length < 2) {
      return { error: "Invalid path format. Expected something like game.Workspace.MyModel" };
    }

    const name = parts[parts.length - 1];
    const root = parts.slice(0, -1).join(".");

    const result = await studioRequest<Array<{ path: string; name: string; className: string; children?: Array<{ path: string; name: string; className: string }> }>>("/instance/search", {
      root: root || "game",
      name,
      limit: 5,
    });

    if (!result.success || result.data.length === 0) {
      return {
        found: false,
        path,
        message: `Instance not found at path ${path}. It may have been moved, renamed, or deleted.`,
      };
    }

    const match = result.data.find((i) => i.path === path) ?? result.data[0];
    const childrenResult = includeChildren
      ? await studioRequest<Array<{ path: string; name: string; className: string }>>("/instance/children", {
          path: match.path,
        })
      : null;

    return {
      found: true,
      path: match.path,
      name: match.name,
      className: match.className,
      children: childrenResult?.success ? childrenResult.data : undefined,
      message: `Found ${match.name} (${match.className}) at ${match.path}`,
    };
  },
});

// ============================================================================
// Game Info Tool
// ============================================================================

export const robloxGetGameInfo = tool({
  description: `Get information about the currently open Roblox game in Studio.

Returns the game name, place ID, universe ID, version, creator info, player count, and description.
Use this to understand what game is currently open before making changes.`,
  inputSchema: z.object({}),
  execute: async () => {
    const connected = await isStudioConnected();
    if (!connected) {
      return { error: notConnectedError() };
    }

    const result = await studioRequest<{
      name: string;
      placeId: number;
      universeId: number;
      placeVersion: number;
      creatorName: string;
      creatorType: string;
      playerCount: number;
      playability: string;
      description: string;
    }>("/game/info");

    if (!result.success) {
      return { error: "Could not fetch game info. Make sure Roblox Studio is open with a place loaded." };
    }

    return result.data;
  },
});

// ============================================================================
// Agentic Tools
// ============================================================================

// Types for ask_user options
interface QuestionOption {
  label: string;
  value?: string;
  imageUrl?: string;
  description?: string;
}

interface AskUserQuestion {
  question: string;
  options?: (string | QuestionOption)[];
  type: "single" | "multi" | "text";
}

// Global store reference for ask_user tool
let askUserHandler: ((questions: AskUserQuestion[]) => Promise<(string | string[])[]>) | null = null;

export const setAskUserHandler = (handler: typeof askUserHandler) => {
  askUserHandler = handler;
};

export const robloxAskUser = tool({
  description: `Ask the user questions when you need clarification or input.

Use this tool when:
- You need to understand user preferences before proceeding
- There are multiple valid approaches and you want user input
- You need specific parameters or values the user should decide
- Confirming destructive actions before executing
- Showing toolbox search results for user to pick from

You can ask 1-4 questions at once. Each question can be:
- Single choice: User picks one option
- Multi choice: User can select multiple options
- Text: User types a free-form answer

Options can be simple strings OR objects with:
- label: Display text
- value: Return value (defaults to label)
- imageUrl: Thumbnail URL to show
- description: Short description

When showing toolbox results, use the rich option format with imageUrl from thumbnails.

Examples:
- "What color should the car be?" with options ["Red", "Blue", "Green"]
- Pick a model with options [{ label: "Car", value: "12345", imageUrl: "..." }]`,
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          question: z.string().describe("The question to ask the user"),
          options: z.array(
            z.union([
              z.string(),
              z.object({
                label: z.string().describe("Display text"),
                value: z.string().optional().describe("Return value (defaults to label)"),
                imageUrl: z.string().optional().describe("Thumbnail URL"),
                description: z.string().optional().describe("Short description"),
              }),
            ])
          ).optional().describe("Options for single/multi choice - can be strings or {label, value, imageUrl, description}"),
          type: z.enum(["single", "multi", "text"]).default("text").describe("Question type"),
        })
      )
      .min(1)
      .max(4)
      .describe("1-4 questions to ask the user"),
  }),
  execute: async ({
    questions,
  }: {
    questions: AskUserQuestion[]
  }) => {
    if (!askUserHandler) {
      return { error: "Question handler not initialized" }
    }

    const answers = await askUserHandler(questions)

    return {
      answered: true,
      questions: questions.map((q, i) => ({
        question: q.question,
        answer: answers[i],
      })),
    }
  },
})

// ============================================================================
// File System Tools (Work without Studio connection)
// ============================================================================

export const fileSetProjectPath = tool({
  description: `Set the project folder path for file operations.

  Use this first before reading or writing files. The path should be an absolute
  path to your Roblox project folder (the folder containing your .rbxl or .rbxmx file).

  Examples:
  - C:\\Users\\You\\Documents\\Roblox\\MyGame
  - /home/user/roblox/MyGame`,
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the project folder"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const result = await fileOps.setProjectPath(path)
      return { success: true, message: result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

export const fileGetProjectPath = tool({
  description: `Get the currently set project folder path.`,
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const path = await fileOps.getProjectPath()
      return { path }
    } catch (error) {
      return { path: null, error: String(error) }
    }
  },
})

export const fileRead = tool({
  description: `Read the contents of a file from the project folder.

  Use this to read Luau scripts, JSON configs, or any text files.
  The path is relative to the project folder (or absolute if starting with / or C:).

  Examples:
  - src/MainScript.lua
  - game/ReplicatedStorage/Module.lua
  - /full/path/to/file.lua`,
  inputSchema: z.object({
    path: z.string().describe("Path to the file (relative to project or absolute)"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const result = await fileOps.readFileWithLineNumbers(path)
      return {
        path: result.path,
        content: result.lines,
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
})

export const fileWrite = tool({
  description: `Write content to a file in the project folder.

  Creates the file if it doesn't exist, or overwrites it if it does.
  Creates parent directories automatically if they don't exist.

  WARNING: This will overwrite existing files without warning!

  Examples:
  - src/NewScript.lua
  - game/ServerScriptService/MyScript.lua`,
  inputSchema: z.object({
    path: z.string().describe("Path to the file (relative to project or absolute)"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({ path, content }: { path: string; content: string }) => {
    try {
      const result = await fileOps.writeFile(path, content)
      if (result.success) {
        const lines = content.split("\n").length
        return { success: true, path: result.path, lines }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

export const fileList = tool({
  description: `List files and folders in a directory.

  Shows all files and subdirectories with their types and sizes.
  Directories are marked with / suffix.

  Examples:
  - (empty for project root)
  - src
  - game/ReplicatedStorage`,
  inputSchema: z.object({
    path: z.string().optional().describe("Path to directory (empty/omitted for project root)"),
  }),
  execute: async ({ path }: { path?: string }) => {
    try {
      const result = await fileOps.listDirectory(path || "")
      if (result.success) {
        const formatted = result.files
          .map((f) => `${f.is_directory ? "[DIR]  " : "[FILE] "}${f.name}${f.is_directory ? "/" : ""}`)
          .join("\n")
        return {
          path: result.path,
          files: formatted,
          count: result.files.length,
        }
      } else {
        return { error: result.error }
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
})

export const fileExists = tool({
  description: `Check if a file or directory exists.`,
  inputSchema: z.object({
    path: z.string().describe("Path to check (relative to project or absolute)"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const exists = await fileOps.fileExists(path)
      return { exists, path }
    } catch (error) {
      return { exists: false, path, error: String(error) }
    }
  },
})

export const fileCreateDir = tool({
  description: `Create a new directory (and parent directories if needed).

  Examples:
  - src/NewFolder
  - game/ReplicatedStorage/Modules`,
  inputSchema: z.object({
    path: z.string().describe("Path to the new directory"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const result = await fileOps.createDirectory(path)
      return { success: true, message: result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

export const fileDelete = tool({
  description: `Delete a file or directory.

  WARNING: This permanently deletes the file/folder and cannot be undone!

  Examples:
  - src/OldScript.lua
  - src/UnusedFolder`,
  inputSchema: z.object({
    path: z.string().describe("Path to the file or directory to delete"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const result = await fileOps.deleteFile(path)
      return { success: true, message: result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

// ============================================================================
// Auto-detect and Project Tools
// ============================================================================

export const fileAutoDetectProject = tool({
  description: `Automatically detect a Roblox project folder.

  Searches common locations (Documents folder, home folder) for .rbxl, .rbxmx, or .rbxlx files
  and returns the project folder path. Use this to quickly set up without manually finding the path.

  Returns null if no project found.`,
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const path = await fileOps.autoDetectProject()
      if (path) {
        // Auto-set the project path
        await fileOps.setProjectPath(path)
        return { found: true, path, message: `Found project at ${path} and set as project folder` }
      }
      return { found: false, path: null, message: "No Roblox project found. Try setting the path manually with file_set_project_path." }
    } catch (error) {
      return { found: false, path: null, error: String(error) }
    }
  },
})

export const fileEdit = tool({
  description: `Edit a file by replacing specific text.

  This performs a find-and-replace operation. ALL occurrences of oldText are replaced with newText.
  Use this for partial edits without rewriting the entire file.

  Examples:
  - oldText: "local speed = 10"
    newText: "local speed = 20"
  - oldText: "-- TODO: implement"
    newText: "-- DONE: implemented"`,
  inputSchema: z.object({
    path: z.string().describe("Path to the file (relative to project or absolute)"),
    oldText: z.string().describe("The exact text to find and replace (all occurrences)"),
    newText: z.string().describe("The replacement text"),
  }),
  execute: async ({ path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
    try {
      const result = await fileOps.fileEdit(path, oldText, newText)
      if (result.success) {
        return {
          success: true,
          replacements: result.replacements,
          message: `Replaced ${result.replacements} occurrence(s) in ${path}`,
        }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

// ============================================================================
// Git Tools
// ============================================================================

export const gitStatus = tool({
  description: `Check git status of the project.

  Shows modified files, staged files, and untracked files.
  Also indicates if the working directory is clean.`,
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const result = await fileOps.gitStatus()
      if (result.success) {
        const parts: string[] = []
        if (result.clean) {
          parts.push("Working directory is clean ✓")
        } else {
          if (result.staged.length > 0) parts.push(`Staged (${result.staged.length}): ${result.staged.join(", ")}`)
          if (result.modified.length > 0) parts.push(`Modified (${result.modified.length}): ${result.modified.join(", ")}`)
          if (result.untracked.length > 0) parts.push(`Untracked (${result.untracked.length}): ${result.untracked.join(", ")}`)
        }
        return {
          clean: result.clean,
          summary: parts.join("\n"),
          staged: result.staged,
          modified: result.modified,
          untracked: result.untracked,
        }
      }
      return { error: result.error }
    } catch (error) {
      return { error: String(error) }
    }
  },
})

export const gitCommit = tool({
  description: `Commit all staged changes with a message.

  Automatically stages all changes (git add -A) then commits.
  Write descriptive commit messages explaining what changed.

  Examples:
  - "Add player movement system"
  - "Fix health bar not updating on damage"
  - "Refactor inventory UI into modules"`,
  inputSchema: z.object({
    message: z.string().describe("The commit message describing what changed"),
  }),
  execute: async ({ message }: { message: string }) => {
    try {
      const result = await fileOps.gitCommit(message)
      if (result.success) {
        return {
          success: true,
          commit_hash: result.commit_hash,
          message: result.message,
          summary: result.commit_hash ? `Committed: ${result.commit_hash}` : "Committed successfully",
        }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

export const gitDiff = tool({
  description: `Show the diff of a modified file.

  Shows what changed in a file compared to the last commit.
  Use git_status first to see which files are modified.`,
  inputSchema: z.object({
    path: z.string().describe("Path to the file to show diff for"),
  }),
  execute: async ({ path }: { path: string }) => {
    try {
      const result = await fileOps.gitDiff(path)
      if (result.success) {
        return {
          diff: result.diff || "(no changes)",
          summary: result.diff ? `Diff for ${path}:` : `No changes in ${path}`,
        }
      }
      return { error: result.error }
    } catch (error) {
      return { error: String(error) }
    }
  },
})

export const gitLog = tool({
  description: `Show recent commit history.

  Shows the commit hash (short), message, and timestamp for recent commits.`,
  inputSchema: z.object({
    limit: z.number().default(10).describe("Number of commits to show"),
  }),
  execute: async ({ limit }: { limit: number }) => {
    try {
      const log = await fileOps.gitLog(limit)
      return { commits: log }
    } catch (error) {
      return { error: String(error) }
    }
  },
})

// ============================================================================
// Terminal/CLI Tools
// ============================================================================

export const runCommand = tool({
  description: `Run a shell command in the project directory.

  Useful for running build tools like rojo, foreman, git, npm, etc.
  The command runs in the project folder context.

  Examples:
  - rojo build
  - git status
  - npm install
  - remodels run backup.json`,
  inputSchema: z.object({
    command: z.string().describe("The shell command to run"),
  }),
  execute: async ({ command }: { command: string }) => {
    try {
      const output = await fileOps.runCommand(command)
      return { success: true, output, command }
    } catch (error) {
      return { success: false, error: String(error), command }
    }
  },
})

// ============================================================================
// Game Map Tools
// ============================================================================

export const gameMapUpdate = tool({
  description: `Update the Game Map with a newly created feature.

Use this when you create a new game element (script, NPC, weapon, building, system, etc).
This helps the user visualize what has been built and see suggestions for what to add next.

Examples:
- After creating a car, call this to add "Car" to the map
- After creating an NPC, call this to add "NPC" to the map
- After building a shop system, call this to add "Shop System" to the map`,
  inputSchema: z.object({
    featureName: z.string().describe("The name of the feature created"),
    description: z.string().describe("Brief description of what was created"),
    parentFeature: z.string().optional().describe("Parent feature ID if this is a sub-feature"),
    status: z.enum(["idea", "in-progress", "completed"]).optional().describe("Status of the feature"),
  }),
  execute: async ({ featureName, description, parentFeature, status = "completed" }) => {
    return {
      success: true,
      featureName,
      description,
      parentFeature,
      status,
      _gameMapUpdate: true,
    }
  },
})

export const gameMapSuggest = tool({
  description: `Get suggestions for what to build next based on the Game Map.

Call this to show the user relevant suggestions for extending what they've built.
The suggestions are context-aware based on the current project.`,
  inputSchema: z.object({
    featureName: z.string().optional().describe("Specific feature to get suggestions for"),
  }),
  execute: async ({ featureName }) => {
    const suggestions: Record<string, string[]> = {
      car: ["Make car faster", "Add nitro boost", "Add car customizer", "Create car dealership", "Add car physics tuning"],
      npc: ["Add dialogue system", "Create NPC schedules", "Add NPC quests", "Make NPCs follow player", "Add NPC shop"],
      house: ["Add furniture", "Create rooms", "Add decoration system", "Create house customizer", "Add indoor lighting"],
      weapon: ["Add ammo system", "Create weapon upgrades", "Add reload mechanic", "Add weapon skins", "Create weapon crafting"],
      game: ["Add save system", "Create main menu", "Add settings menu", "Add player stats", "Create leaderboard"],
      default: ["Add more features", "Create UI for this", "Add save/load", "Create documentation"],
    }

    let result = suggestions.default
    if (featureName) {
      const lower = featureName.toLowerCase()
      for (const [key, vals] of Object.entries(suggestions)) {
        if (lower.includes(key)) {
          result = vals
          break
        }
      }
    }

    return {
      success: true,
      suggestions: result,
      featureName: featureName || "general",
      _gameMapSuggestions: true,
    }
  },
})

// ============================================================================
// Export all tools
// ============================================================================

export const robloxTools = {
  // Script tools
  roblox_get_script: robloxGetScript,
  roblox_set_script: robloxSetScript,
  roblox_edit_script: robloxEditScript,

  // Instance tools
  roblox_get_children: robloxGetChildren,
  roblox_get_properties: robloxGetProperties,
  roblox_set_property: robloxSetProperty,
  roblox_create: robloxCreate,
  roblox_delete: robloxDelete,
  roblox_clone: robloxClone,
  roblox_search: robloxSearch,
  roblox_get_selection: robloxGetSelection,
  roblox_run_code: robloxRunCode,
  roblox_move: robloxMove,

  // Bulk tools
  roblox_bulk_create: robloxBulkCreate,
  roblox_bulk_delete: robloxBulkDelete,
  roblox_bulk_set_property: robloxBulkSetProperty,

  // Toolbox tools
  roblox_toolbox_search: robloxToolboxSearch,
  roblox_insert_asset: robloxInsertAsset,
  roblox_toolbox_get_asset: robloxToolboxGetAsset,
  roblox_toolbox_remove: robloxToolboxRemove,
  roblox_toolbox_inspect: robloxToolboxInspect,
  roblox_get_game_info: robloxGetGameInfo,

  // Agentic tools
  roblox_ask_user: robloxAskUser,

  // File system tools
  file_set_project_path: fileSetProjectPath,
  file_get_project_path: fileGetProjectPath,
  file_read: fileRead,
  file_write: fileWrite,
  file_list: fileList,
  file_exists: fileExists,
  file_create_dir: fileCreateDir,
  file_delete: fileDelete,
  file_auto_detect_project: fileAutoDetectProject,
  file_edit: fileEdit,

  // Git tools
  git_status: gitStatus,
  git_commit: gitCommit,
  git_diff: gitDiff,
  git_log: gitLog,

  // Terminal tools
  run_command: runCommand,

  // Game Map tools
  game_map_update: gameMapUpdate,
  game_map_suggest: gameMapSuggest,
}
