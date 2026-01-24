"use client"

import * as React from "react"
import type { Theme } from "@/lib/tweakcn"

type ThemeMode = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  resolvedTheme: "light" | "dark"
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: ThemeMode
  storageKey?: string
  attribute?: string
  enableSystem?: boolean
}

const themeScript = (storageKey: string, defaultTheme: string, attribute: string, enableSystem: boolean) => {
  const el = document.documentElement
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

  let theme: string
  try {
    theme = localStorage.getItem(storageKey) || defaultTheme
  } catch {
    theme = defaultTheme
  }

  const resolved = theme === "system" && enableSystem ? systemTheme : theme

  if (attribute === "class") {
    el.classList.remove("light", "dark")
    el.classList.add(resolved)
  } else {
    el.setAttribute(attribute, resolved)
  }
  el.style.colorScheme = resolved

  // Also load TweakCN custom theme styles
  try {
    const stored = localStorage.getItem("theme-config")
    if (stored) {
      const themeConfig = JSON.parse(stored)
      if (themeConfig?.cssVars) {
        const getCSSVariables = (vars: Record<string, string>) => {
          return Object.entries(vars)
            .map(([key, value]: [string, string]) => `  --${key}: ${value};`)
            .join("\n")
        }

        const cssLines: string[] = []
        if (themeConfig.cssVars.theme) {
          cssLines.push(`:root {\n${getCSSVariables(themeConfig.cssVars.theme)}\n}`)
        }
        if (themeConfig.cssVars.light) {
          cssLines.push(`:root {\n${getCSSVariables(themeConfig.cssVars.light)}\n}`)
        }
        if (themeConfig.cssVars.dark) {
          cssLines.push(`.dark {\n${getCSSVariables(themeConfig.cssVars.dark)}\n}`)
        }

        const styleTag = document.createElement("style")
        styleTag.id = "tweakcn-theme-styles"
        styleTag.textContent = cssLines.join("\n\n")
        document.head.appendChild(styleTag)
      }
    }
  } catch {
    // Ignore TweakCN theme loading errors
  }
}

export function ThemeScript({
  storageKey = "theme",
  defaultTheme = "dark",
  attribute = "class",
  enableSystem = true,
}: Omit<ThemeProviderProps, "children">) {
  const scriptArgs = JSON.stringify([storageKey, defaultTheme, attribute, enableSystem])
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(${themeScript.toString()})(${scriptArgs.slice(1, -1)})`,
      }}
    />
  )
}

// TweakCN Theme utilities
const THEME_STYLE_ID = "tweakcn-theme-styles"
const THEME_STORAGE_KEY = "theme-config"

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as Theme
  } catch {
    return null
  }
}

function getCSSVariables(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")
}

function generateThemeCSS(theme: Theme): string {
  const cssLines: string[] = []

  if (theme.cssVars.theme) {
    cssLines.push(`:root {\n${getCSSVariables(theme.cssVars.theme)}\n}`)
  }
  cssLines.push(`:root {\n${getCSSVariables(theme.cssVars.light)}\n}`)
  cssLines.push(`.dark {\n${getCSSVariables(theme.cssVars.dark)}\n}`)

  return cssLines.join("\n\n")
}

function removeThemeStyleElement() {
  document.getElementById(THEME_STYLE_ID)?.remove()
}

function applyThemeStyles(theme: Theme) {
  removeThemeStyleElement()
  const styleTag = document.createElement("style")
  styleTag.id = THEME_STYLE_ID
  styleTag.textContent = generateThemeCSS(theme)
  document.head.appendChild(styleTag)
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "theme",
  attribute = "class",
  enableSystem = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<ThemeMode>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("dark")

  const getSystemTheme = React.useCallback((): "light" | "dark" => {
    if (typeof window === "undefined") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }, [])

  const applyTheme = React.useCallback((resolved: "light" | "dark") => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (attribute === "class") {
      root.classList.remove("light", "dark")
      root.classList.add(resolved)
    } else {
      root.setAttribute(attribute, resolved)
    }
  }, [attribute])

  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey) as ThemeMode | null
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setThemeState(stored)
    }
  }, [storageKey])

  React.useEffect(() => {
    const resolved = theme === "system" ? getSystemTheme() : theme
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [theme, getSystemTheme, applyTheme])

  React.useEffect(() => {
    if (!enableSystem || theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const resolved = getSystemTheme()
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme, enableSystem, getSystemTheme, applyTheme])

  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme)
    localStorage.setItem(storageKey, newTheme)
  }, [storageKey])

  const value = React.useMemo(() => ({
    theme,
    setTheme,
    resolvedTheme,
  }), [theme, setTheme, resolvedTheme])

  // Re-apply TweakCN theme after hydration (inline script may be removed by React)
  React.useLayoutEffect(() => {
    const storedTheme = getStoredTheme()
    if (storedTheme) {
      applyThemeStyles(storedTheme)
    }
  }, [])

  return (
    <ThemeContext.Provider value={value}>
      <ThemeScript storageKey={storageKey} defaultTheme={defaultTheme} attribute={attribute} enableSystem={enableSystem} />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTweakCNThemes() {
  const [currentTheme, setCurrentTheme] = React.useState<Theme | null>(getStoredTheme)

  const applyTheme = React.useCallback((theme: Theme | null) => {
    if (typeof window === 'undefined') return

    if (theme) {
      applyThemeStyles(theme)
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme))
      setCurrentTheme(theme)
    } else {
      removeThemeStyleElement()
      localStorage.removeItem(THEME_STORAGE_KEY)
      setCurrentTheme(null)
    }
  }, [])

  return {
    currentTheme,
    applyTheme,
    setTheme: applyTheme,
  }
}
