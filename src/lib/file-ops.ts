/**
 * File System Operations via Tauri
 *
 * These functions allow reading and writing files in the project directory.
 * They work without needing Roblox Studio connection.
 */

import { invoke } from "@tauri-apps/api/core";

export interface FileInfo {
  name: string;
  path: string;
  is_directory: boolean;
  size: number | null;
}

export interface ReadFileResult {
  success: boolean;
  content: string | null;
  error: string | null;
  path: string;
}

export interface WriteFileResult {
  success: boolean;
  bytes_written: number | null;
  error: string | null;
  path: string;
}

export interface ListDirResult {
  success: boolean;
  files: FileInfo[];
  error: string | null;
  path: string;
}

export interface EditResult {
  success: boolean;
  replacements: number;
  new_content: string | null;
  error: string | null;
}

export interface GitStatusResult {
  success: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
  clean: boolean;
  error: string | null;
}

export interface GitDiffResult {
  success: boolean;
  diff: string;
  error: string | null;
}

export interface GitCommitResult {
  success: boolean;
  commit_hash: string | null;
  message: string | null;
  error: string | null;
}

/**
 * Get the currently set project path
 */
export async function getProjectPath(): Promise<string | null> {
  return invoke<string | null>("get_project_path");
}

/**
 * Set the project path for relative file operations
 */
export async function setProjectPath(path: string): Promise<string> {
  return invoke<string>("set_project_path", { path });
}

/**
 * Auto-detect Roblox project folder from .rbxl/.rbxmx files
 */
export async function autoDetectProject(): Promise<string | null> {
  return invoke<string | null>("auto_detect_project");
}

/**
 * Read a file's contents
 * @param path Absolute path or path relative to project directory
 */
export async function readFile(path: string): Promise<ReadFileResult> {
  return invoke<ReadFileResult>("read_file", { path });
}

/**
 * Write content to a file
 * @param path Absolute path or path relative to project directory
 * @param content The content to write
 */
export async function writeFile(path: string, content: string): Promise<WriteFileResult> {
  return invoke<WriteFileResult>("write_file", { path, content });
}

/**
 * Edit a file by replacing text (diff-based)
 */
export async function fileEdit(path: string, oldText: string, newText: string): Promise<EditResult> {
  return invoke<EditResult>("file_edit", { path, oldText, newText });
}

/**
 * List files in a directory
 * @param path Absolute path or path relative to project directory (empty = project root)
 */
export async function listDirectory(path: string = ""): Promise<ListDirResult> {
  return invoke<ListDirResult>("list_directory", { path });
}

/**
 * Check if a file or directory exists
 * @param path Absolute path or path relative to project directory
 */
export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>("file_exists", { path });
}

/**
 * Create a directory (and parent directories if needed)
 * @param path Absolute path or path relative to project directory
 */
export async function createDirectory(path: string): Promise<string> {
  return invoke<string>("create_directory", { path });
}

/**
 * Delete a file or directory
 * @param path Absolute path or path relative to project directory
 */
export async function deleteFile(path: string): Promise<string> {
  return invoke<string>("delete_file", { path });
}

/**
 * Read a file and return content, or error message
 */
export async function readFileContent(path: string): Promise<string> {
  const result = await readFile(path);
  if (!result.success) {
    throw new Error(result.error || `Failed to read ${path}`);
  }
  return result.content || "";
}

/**
 * Read a file with line numbers for display
 */
export async function readFileWithLineNumbers(path: string): Promise<{ path: string; lines: string }> {
  const content = await readFileContent(path);
  const lines = content.split("\n");
  const numbered = lines.map((line, i) => `${(i + 1).toString().padStart(5, "0")}| ${line}`).join("\n");
  return { path, lines: numbered };
}

/**
 * Get git status for the project
 */
export async function gitStatus(): Promise<GitStatusResult> {
  return invoke<GitStatusResult>("git_status");
}

/**
 * Get git diff for a file
 */
export async function gitDiff(path: string): Promise<GitDiffResult> {
  return invoke<GitDiffResult>("git_diff", { path });
}

/**
 * Commit changes with a message
 */
export async function gitCommit(message: string): Promise<GitCommitResult> {
  return invoke<GitCommitResult>("git_commit", { message });
}

/**
 * Get git log
 */
export async function gitLog(limit: number = 10): Promise<string> {
  return invoke<string>("git_log", { limit });
}

/**
 * Run a shell command
 */
export async function runCommand(command: string, workingDir?: string): Promise<string> {
  return invoke<string>("run_command", { command, workingDir });
}

/**
 * Open a native folder picker dialog
 */
export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}
