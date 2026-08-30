import { useState, useEffect } from "react";
import { listDirectory, readFileContent } from "@/lib/file-ops";
import { FileInfo } from "@/lib/file-ops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  File,
  FileCode,
  ChevronRight,
  ChevronDown,
  Home,
  Search,
  RefreshCw,
  Loader2,
} from "lucide-react";

interface FileBrowserProps {
  onSelect: (path: string, content?: string) => void;
  accept?: string;
}

export function FileBrowser({ onSelect, accept }: FileBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && !currentPath) {
      loadRoot();
    }
  }, [isOpen, currentPath]);

  const loadRoot = async () => {
    setLoading(true);
    try {
      const path = await invoke<string | null>("get_project_path");
      if (path) {
        setCurrentPath(path);
        await loadDirectory(path);
      }
    } catch (err) {
      console.error("Failed to get project path:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const result = await listDirectory(path);
      if (result.success) {
        const sorted = result.files.sort((a, b) => {
          if (a.is_directory === b.is_directory) {
            return a.name.localeCompare(b.name);
          }
          return a.is_directory ? -1 : 1;
        });
        setFiles(sorted);
      }
    } catch (err) {
      console.error("Failed to load directory:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file: FileInfo) => {
    if (file.is_directory) {
      toggleFolder(file.path);
    } else {
      if (accept && !file.name.endsWith(accept.replace("*", ""))) {
        return;
      }
      try {
        const content = await readFileContent(file.path);
        onSelect(file.path, content);
        setIsOpen(false);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      if (!files.find((f) => f.path === path)) {
        loadDirectory(path);
      }
    }
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (file: FileInfo) => {
    if (file.is_directory) {
      return expandedFolders.has(file.path) ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      );
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["lua", "luau"].includes(ext || "")) {
      return <FileCode className="h-4 w-4 text-blue-500" />;
    }
    if (["json", "xml", "yaml", "yml", "toml"].includes(ext || "")) {
      return <FileCode className="h-4 w-4 text-yellow-500" />;
    }
    if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext || "")) {
      return <File className="h-4 w-4 text-green-500" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
          <FolderOpen className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Project Files
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <button
            onClick={loadRoot}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            Root
          </button>
          {currentPath && (
            <span className="truncate flex-1">{currentPath}</span>
          )}
          <Button variant="ghost" size="icon" onClick={() => loadDirectory(currentPath)}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-lg p-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No files found
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => handleFileClick(file)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left",
                    file.is_directory && "font-medium"
                  )}
                >
                  {getFileIcon(file)}
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
