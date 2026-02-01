import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "motion/react"

import { tapButton, transitionDefault } from "@/lib/motion"
import { cn } from "@/lib/utils"

// Outer button: handles sizing, focus ring, disabled state
const buttonVariants = cva(
  "relative rounded-md cursor-pointer focus-visible:ring-ring/30 focus-visible:ring-[2px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-[2px] inline-flex items-center justify-center disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
        secondary: "",
        ghost: "",
        destructive: "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "",
      },
      size: {
        default: "h-7",
        xs: "h-5 rounded-sm",
        sm: "h-6",
        lg: "h-8",
        icon: "size-7",
        "icon-xs": "size-5 rounded-sm",
        "icon-sm": "size-6",
        "icon-lg": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Inner span: visual styles that transform on tap
const buttonInnerVariants = cva(
  "rounded-[inherit] border border-transparent bg-clip-padding text-xs/relaxed font-medium [&_svg:not([class*='size-'])]:size-4 flex items-center justify-center whitespace-nowrap transition-all [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground group-hover/button:bg-primary/80",
        outline: "border-border dark:bg-input/30 group-hover/button:bg-input/50 group-hover/button:text-foreground group-aria-expanded/button:bg-muted group-aria-expanded/button:text-foreground",
        secondary: "bg-secondary text-secondary-foreground group-hover/button:bg-secondary/80 group-aria-expanded/button:bg-secondary group-aria-expanded/button:text-secondary-foreground",
        ghost: "group-hover/button:bg-muted group-hover/button:text-foreground dark:group-hover/button:bg-muted/50 group-aria-expanded/button:bg-muted group-aria-expanded/button:text-foreground",
        destructive: "bg-destructive/10 group-hover/button:bg-destructive/20 dark:bg-destructive/20 text-destructive group-focus-visible/button:border-destructive/40 dark:group-hover/button:bg-destructive/30",
        link: "text-primary underline-offset-4 group-hover/button:underline",
      },
      size: {
        default: "h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      <motion.span
        className={cn(buttonInnerVariants({ variant, size }))}
        whileTap={tapButton}
        transition={transitionDefault}
      >
        {children}
      </motion.span>
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
