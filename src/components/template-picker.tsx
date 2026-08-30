import { useState } from "react";
import { TEMPLATES, getTemplatesByCategory } from "@/lib/project-templates";
import { autoDetectProject, setProjectPath } from "@/lib/file-ops";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Template } from "@/lib/project-templates";

interface TemplatePickerProps {
  onSelect: (template: Template) => void;
  onOpenProject?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  template: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  obby: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  simulator: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  rpg: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  fps: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  social: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
};

export function TemplatePicker({ onSelect, onOpenProject }: TemplatePickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<Template["category"] | "all">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  const filteredTemplates =
    selectedCategory === "all" ? TEMPLATES : getTemplatesByCategory(selectedCategory);

  const handleSelect = (template: Template) => {
    setSelectedTemplate(template);
  };

  const handleConfirm = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate);
      setIsOpen(false);
      setSelectedTemplate(null);
    }
  };

  const handleOpenProject = async () => {
    setIsDetecting(true);
    setDetectResult(null);
    try {
      const path = await autoDetectProject();
      if (path) {
        await setProjectPath(path);
        setDetectResult(`Opened: ${path}`);
        onOpenProject?.();
      } else {
        setDetectResult("No Roblox project found. Make sure you're in a project folder.");
      }
    } catch (err) {
      setDetectResult(`Error: ${err}`);
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FolderOpen className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Project Templates</DialogTitle>
          <DialogDescription>
            Choose a template to start your Roblox game development
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap mb-4">
          <Button
            size="sm"
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
          >
            All
          </Button>
          {(["template", "obby", "simulator", "rpg", "fps", "social"] as const).map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "default" : "outline"}
              onClick={() => setSelectedCategory(cat)}
              className="capitalize"
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto flex-1">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={cn(
                "p-4 rounded-lg border cursor-pointer transition-colors hover:border-primary",
                selectedTemplate?.id === template.id
                  ? "border-primary bg-primary/5"
                  : "border-border"
              )}
              onClick={() => handleSelect(template)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium">{template.name}</h3>
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-full capitalize",
                    CATEGORY_COLORS[template.category]
                  )}
                >
                  {template.category}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
              <div className="flex flex-wrap gap-1">
                {template.features.slice(0, 3).map((feature, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs bg-muted rounded"
                  >
                    {feature}
                  </span>
                ))}
                {template.features.length > 3 && (
                  <span className="px-2 py-0.5 text-xs bg-muted rounded">
                    +{template.features.length - 3} more
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {template.files.length} files
              </p>
            </div>
          ))}
        </div>

        {selectedTemplate && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-2">Selected: {selectedTemplate.name}</h4>
            <p className="text-sm text-muted-foreground mb-3">
              This will create {selectedTemplate.files.length} files in your project.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConfirm} className="gap-2">
                <Plus className="h-4 w-4" />
                Create from Template
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenProject}
                className="gap-2"
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                Open Project Folder
              </Button>
            </div>
            {detectResult && <p className="mt-2 text-sm text-muted-foreground">{detectResult}</p>}
          </div>
        )}

        {!selectedTemplate && (
          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-muted-foreground mb-2">Or open an existing project:</p>
            <Button
              variant="outline"
              onClick={handleOpenProject}
              className="gap-2"
              disabled={isDetecting}
            >
              {isDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              Open Project Folder
            </Button>
            {detectResult && <p className="mt-2 text-sm text-muted-foreground">{detectResult}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
