import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings";

export function useTheme() {
  const { appSettings, applyTheme, getResolvedTheme } = useSettingsStore();

  useEffect(() => {
    applyTheme();

    if (appSettings.theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [appSettings.theme, applyTheme]);

  return {
    theme: appSettings.theme,
    resolvedTheme: getResolvedTheme(),
  };
}

export default useTheme;
