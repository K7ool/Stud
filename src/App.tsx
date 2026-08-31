import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PrereqWizard } from "@/components/prereq/PrereqWizard";
import { useOAuthCallbackPoller } from "@/stores/auth";
import Home from "@/pages/Home";
import "./index.css";

const isWebMode =
  typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

function App() {
  // Process ?code&state after an OAuth redirect and poll device-code login.
  useOAuthCallbackPoller();

  return (
    <TooltipProvider>
      {isWebMode ? null : <PrereqWizard />}
      <Home />
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}

export default App;
