import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "motion/react"
import { createContext, useContext, useId } from "react"

import { springSnappy } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TabsIndicatorContext = createContext<{
  id: string
  variant: "default" | "line"
} | null>(null)

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "gap-2 group/tabs flex data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

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
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const indicatorId = useId()

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      <TabsIndicatorContext.Provider
        value={{ id: indicatorId, variant: variant ?? "default" }}
      >
        {children}
      </TabsIndicatorContext.Provider>
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: TabsPrimitive.Tab.Props) {
  const indicator = useContext(TabsIndicatorContext)

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium group-data-vertical/tabs:py-[calc(--spacing(1.25))] [&_svg:not([class*='size-'])]:size-3.5 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-[color] group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      render={(props, state) => {
        // Don't show indicator for disabled tabs even if active
        const showIndicator = indicator && state.active && !state.disabled
        return (
          <button {...props}>
            {showIndicator && (
              <motion.span
                layoutId={indicator.id}
                className={cn(
                  "pointer-events-none absolute -z-10",
                  indicator.variant === "line"
                    ? "bg-foreground group-data-[orientation=horizontal]/tabs:inset-x-0 group-data-[orientation=horizontal]/tabs:bottom-[-5px] group-data-[orientation=horizontal]/tabs:h-0.5 group-data-[orientation=vertical]/tabs:inset-y-0 group-data-[orientation=vertical]/tabs:-right-1 group-data-[orientation=vertical]/tabs:w-0.5"
                    : "inset-0 rounded-md bg-background dark:border-input dark:bg-input/30 border"
                )}
                transition={springSnappy}
              />
            )}
            {children}
          </button>
        )
      }}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("text-xs/relaxed flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
