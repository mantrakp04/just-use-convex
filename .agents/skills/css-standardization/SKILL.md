---
name: css-standardization
description: CSS standardization guidelines for consistent, maintainable, and scalable styling. Use when writing, reviewing, or refactoring component styles to ensure consistent spacing, layout patterns, and component usage.
license: MIT
metadata:
  author: better-convex
  version: "1.0.0"
---

# CSS Standardization Guidelines

Comprehensive guidelines for maintaining consistent, maintainable, and scalable CSS across React components. Focuses on standardized spacing, layout patterns, and proper component usage.

## When to Apply

Reference these guidelines when:
- Writing new React components
- Refactoring existing component styles
- Reviewing code for CSS consistency
- Standardizing spacing and layout patterns
- Working with shadcn/ui or similar component libraries

## Core Principles

### 1. Layout: Use Flexbox
- Always use flexbox (`flex`, `flex-col`, `flex-row`) for layouts
- Avoid using margins for spacing between elements
- Use flex properties for alignment (`items-center`, `justify-between`, etc.)

### 2. Spacing: Padding and Gap
- Use `p-2` (padding-2) consistently for container padding
- Use `gap-1` for tight spacing (within form fields, related items)
- Use `gap-2` for larger spacing (between major sections, form fields)
- Never use margin utilities (`mt-*`, `mb-*`, `mx-*`, `my-*`)
- Never use `space-y-*` or `space-x-*` utilities

### 3. Component Libraries: Minimal Customization
- Remove unnecessary custom classnames from shadcn/ui components
- Let component variants handle styling (e.g., `variant="link"` handles link styling)
- Only add custom classnames when necessary for layout (e.g., `w-full` for full-width buttons)
- Don't override component defaults unless required

## Rule Categories

| Category | Rules | Priority |
|----------|-------|----------|
| Layout | Use flexbox, avoid margins | HIGH |
| Spacing | Use padding-2, gap-1 or gap-2 | HIGH |
| Components | Remove unnecessary custom classnames | MEDIUM |

## Quick Reference

### Layout Rules

**Use Flexbox**
- ✅ `flex flex-col gap-2 p-2` - Standard container
- ✅ `flex flex-row items-center justify-between` - Horizontal layout
- ❌ `mt-4`, `mb-6`, `space-y-4` - Avoid margins and space utilities

**Spacing Standards**
- Container padding: `p-2`
- Major section gaps: `gap-2`
- Tight spacing (within fields): `gap-1`
- Navigation links: `gap-2`

### Component Rules

**shadcn/ui Components**
- ✅ `<Button variant="link">` - Use variants, no custom colors
- ✅ `<Button className="w-full">` - Layout classes are OK
- ❌ `<Button className="text-indigo-600 hover:text-indigo-800">` - Don't override variant styles
- ❌ `<DropdownMenuContent className="bg-card">` - Don't override defaults

## Examples

### ✅ Correct: Standardized Form Container

```tsx
<div className="mx-auto flex w-full max-w-md flex-col gap-2 p-2">
  <h1 className="text-center text-3xl font-bold">Title</h1>
  
  <form className="flex flex-col gap-2">
    <div className="flex flex-col gap-1">
      <Label>Email</Label>
      <Input />
    </div>
    
    <Button className="w-full" type="submit">
      Submit
    </Button>
  </form>
</div>
```

### ❌ Incorrect: Using Margins and Space Utilities

```tsx
<div className="mx-auto w-full mt-10 max-w-md p-6">
  <h1 className="mb-6 text-center text-3xl font-bold">Title</h1>
  
  <form className="space-y-4">
    <div className="space-y-2">
      <Label>Email</Label>
      <Input />
    </div>
    
    <Button className="w-full mt-4" type="submit">
      Submit
    </Button>
  </form>
</div>
```

### ✅ Correct: Clean Component Usage

```tsx
<Button variant="link" onClick={handleClick}>
  Switch to Sign Up
</Button>
```

### ❌ Incorrect: Overriding Component Styles

```tsx
<Button
  variant="link"
  className="text-indigo-600 hover:text-indigo-800"
  onClick={handleClick}
>
  Switch to Sign Up
</Button>
```

## Implementation Checklist

When standardizing CSS:

- [ ] Replace all margin utilities with flex + gap
- [ ] Replace `space-y-*` and `space-x-*` with `gap-*`
- [ ] Standardize padding to `p-2`
- [ ] Use `gap-1` for tight spacing, `gap-2` for larger spacing
- [ ] Remove unnecessary custom classnames from shadcn components
- [ ] Keep only layout-related classnames (e.g., `w-full`)

## Benefits

- **Consistency**: Uniform spacing and layout patterns across the codebase
- **Maintainability**: Easy to update spacing scale globally
- **Scalability**: Predictable patterns for new components
- **Cleaner Code**: Less custom styling, more component library defaults
