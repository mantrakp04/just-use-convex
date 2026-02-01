import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { AnimatePresence, motion } from "motion/react"
import type React from "react"

import { collapseVariants } from "@/lib/motion"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsibleContent({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      render={(renderProps, state) => {
        const resolvedClassName =
          typeof className === "function" ? className(state) : className
        return (
          <AnimatePresence initial={false}>
            {state.open && (
              <motion.div
                {...(renderProps as React.ComponentProps<typeof motion.div>)}
                key="collapsible-content"
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                variants={collapseVariants}
                className={resolvedClassName}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        )
      }}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
