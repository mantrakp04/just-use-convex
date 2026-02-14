"use client"

import * as React from "react"
import { motion } from "motion/react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { springSnappy } from "@/lib/motion"

// =============================================================================
// Context
// =============================================================================

type TabsContextValue = {
  value: string
  onValueChange: (value: string) => void
  orientation: "horizontal" | "vertical"
  layoutId: string
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("Tabs components must be used within <Tabs>")
  return ctx
}

type TabsListContextValue = {
  variant: "default" | "line" | null | undefined
}

const TabsListContext = React.createContext<TabsListContextValue>({
  variant: "default",
})

function useTabsListContext() {
  return React.useContext(TabsListContext)
}

// =============================================================================
// Tabs (Root)
// =============================================================================

type TabsProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: "horizontal" | "vertical"
  className?: string
  children?: React.ReactNode
}

function Tabs({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  orientation = "horizontal",
  className,
  children,
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolledValue
  const layoutId = React.useId()

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (!isControlled) setUncontrolledValue(newValue)
      onValueChange?.(newValue)
    },
    [isControlled, onValueChange]
  )

  const ctx = React.useMemo(
    () => ({ value, onValueChange: handleValueChange, orientation, layoutId }),
    [value, handleValueChange, orientation, layoutId]
  )

  return (
    <TabsContext.Provider value={ctx}>
      <div
        data-slot="tabs"
        data-orientation={orientation}
        {...(orientation === "horizontal"
          ? { "data-horizontal": "" }
          : { "data-vertical": "" })}
        className={cn(
          "gap-2 group/tabs flex data-[orientation=horizontal]:flex-col",
          className
        )}
      >
        {children}
      </div>
    </TabsContext.Provider>
  )
}

// =============================================================================
// TabsList
// =============================================================================

const tabsListVariants = cva(
  "rounded-lg p-[3px] group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentPropsWithRef<"div"> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsListContext.Provider value={{ variant }}>
      <div
        role="tablist"
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  )
}

// =============================================================================
// TabsTrigger
// =============================================================================

type TabsTriggerProps = Omit<
  React.ComponentPropsWithRef<"button">,
  "value"
> & {
  value: string
}

function TabsTrigger({
  className,
  value,
  children,
  onClick,
  ...props
}: TabsTriggerProps) {
  const { value: activeValue, onValueChange, orientation, layoutId } =
    useTabsContext()
  const { variant } = useTabsListContext()
  const isActive = value === activeValue

  return (
    <button
      type="button"
      role="tab"
      data-slot="tabs-trigger"
      data-active={isActive ? "" : undefined}
      aria-selected={isActive}
      onClick={(e) => {
        onValueChange(value)
        onClick?.(e)
      }}
      className={cn(
        "isolate gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium group-data-vertical/tabs:py-[calc(--spacing(1.25))] [&_svg:not([class*='size-'])]:size-3.5 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      {...props}
    >
      {isActive && variant !== "line" && (
        <motion.span
          layout
          layoutId={`${layoutId}-bg`}
          className="absolute inset-0 -z-10 rounded-md border border-transparent bg-background dark:border-input dark:bg-input/30"
          transition={springSnappy}
          initial={false}
        />
      )}
      {isActive && variant === "line" && (
        <motion.span
          layout
          layoutId={`${layoutId}-line`}
          className={cn(
            "absolute -z-10 bg-foreground",
            orientation === "horizontal" && "inset-x-0 bottom-[-5px] h-0.5",
            orientation === "vertical" && "inset-y-0 -right-1 w-0.5"
          )}
          transition={springSnappy}
          initial={false}
        />
      )}
      {children}
    </button>
  )
}

// =============================================================================
// TabsContent
// =============================================================================

type TabsContentProps = React.ComponentPropsWithRef<"div"> & {
  value: string
  keepMounted?: boolean
}

function TabsContent({
  className,
  value,
  keepMounted = false,
  children,
  ...props
}: TabsContentProps) {
  const { value: activeValue } = useTabsContext()
  const isActive = value === activeValue

  if (!isActive && !keepMounted) return null

  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn("text-xs/relaxed flex-1 outline-none", className)}
      style={keepMounted && !isActive ? { display: "none" } : undefined}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
