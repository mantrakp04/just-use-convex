# CSS Standardization Guidelines

Comprehensive guidelines for maintaining consistent, maintainable, and scalable CSS across React components.

## Overview

This skill provides rules for:
- Using flexbox for all layouts
- Standardizing spacing with padding-2 and gap-1/gap-2
- Removing unnecessary custom classnames from component libraries

## Core Principles

1. **Layout**: Always use flexbox (`flex`, `flex-col`, `flex-row`) instead of margins
2. **Spacing**: Use `p-2` for padding and `gap-1` or `gap-2` for spacing
3. **Components**: Remove unnecessary custom classnames from shadcn/ui components

---

## Rule: Layout - Use Flexbox

Always use flexbox for layouts instead of margins or space utilities.

### Why

- Flexbox provides predictable, consistent layouts
- Eliminates margin collapse issues
- Makes spacing explicit and maintainable
- Works better with responsive design

### ❌ Incorrect

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

**Problems:**
- Uses `mt-10`, `mb-6`, `mt-4` margins
- Uses `space-y-4` and `space-y-2` utilities
- Spacing is inconsistent and hard to maintain

### ✅ Correct

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

**Benefits:**
- Uses `flex flex-col` for vertical layout
- Uses `gap-2` for consistent spacing
- No margins, all spacing via gap
- Easy to adjust spacing scale globally

### Common Patterns

**Container:**
```tsx
<div className="flex flex-col gap-2 p-2">
  {/* content */}
</div>
```

**Horizontal Layout:**
```tsx
<div className="flex flex-row items-center justify-between">
  {/* content */}
</div>
```

**Form Fields:**
```tsx
<div className="flex flex-col gap-1">
  <Label>Field</Label>
  <Input />
</div>
```

---

## Rule: Spacing - Standard Padding and Gap

Use consistent padding (`p-2`) and gap values (`gap-1` or `gap-2`) instead of margins or space utilities.

### Why

- Consistent spacing scale across the application
- Easy to maintain and update globally
- Predictable spacing patterns
- No margin collapse issues

### Standards

- **Container padding**: `p-2` (always)
- **Major section gaps**: `gap-2` (between form and switch link, between title and form)
- **Form field gaps**: `gap-2` (between form fields)
- **Tight spacing**: `gap-1` (within field groups: label/input/error, status indicator and text)
- **Navigation links**: `gap-2`

### ❌ Incorrect

```tsx
<div className="mx-auto w-full mt-10 max-w-md p-6">
  <h1 className="mb-6 text-center text-3xl font-bold">Title</h1>
  
  <form className="space-y-4">
    <div className="space-y-2">
      <Label>Email</Label>
      <Input />
    </div>
  </form>
  
  <div className="mt-4 text-center">
    <Button>Action</Button>
  </div>
</div>
```

**Problems:**
- Uses `p-6` instead of `p-2`
- Uses `mt-10`, `mb-6`, `mt-4` margins
- Uses `space-y-4` and `space-y-2` utilities
- Inconsistent spacing values

### ✅ Correct

```tsx
<div className="mx-auto flex w-full max-w-md flex-col gap-2 p-2">
  <h1 className="text-center text-3xl font-bold">Title</h1>
  
  <form className="flex flex-col gap-2">
    <div className="flex flex-col gap-1">
      <Label>Email</Label>
      <Input />
    </div>
  </form>
  
  <div className="flex justify-center">
    <Button>Action</Button>
  </div>
</div>
```

**Benefits:**
- Uses `p-2` for consistent padding
- Uses `gap-2` for major spacing
- Uses `gap-1` for tight spacing within fields
- No margins, all spacing via gap

### Spacing Guide

| Use Case | Value | Example |
|----------|-------|---------|
| Container padding | `p-2` | `<div className="p-2">` |
| Between major sections | `gap-2` | `<div className="flex flex-col gap-2">` |
| Between form fields | `gap-2` | `<form className="flex flex-col gap-2">` |
| Within field groups | `gap-1` | `<div className="flex flex-col gap-1">` |
| Navigation links | `gap-2` | `<nav className="flex gap-2">` |
| Status indicators | `gap-1` | `<div className="flex items-center gap-1">` |

### Never Use

- ❌ `mt-*`, `mb-*`, `mx-*`, `my-*` - Use gap instead
- ❌ `space-y-*`, `space-x-*` - Use gap instead
- ❌ `p-1`, `p-4`, `p-6` - Use `p-2` consistently
- ❌ `gap-3`, `gap-4`, `gap-6` - Use `gap-1` or `gap-2` only

---

## Rule: Components - Remove Unnecessary Custom Classnames

Remove unnecessary custom classnames from shadcn/ui and similar component libraries. Let component variants handle styling.

### Why

- Component libraries provide well-designed defaults
- Variants handle styling consistently
- Reduces custom CSS maintenance
- Keeps components clean and predictable

### Rules

1. **Use component variants** - Don't override variant styles with custom classes
2. **Keep layout classes** - Layout-related classes like `w-full` are acceptable
3. **Remove style overrides** - Don't override colors, backgrounds, or other style properties
4. **Trust defaults** - Component defaults are usually correct

### ❌ Incorrect

```tsx
<Button
  variant="link"
  className="text-indigo-600 hover:text-indigo-800"
  onClick={handleClick}
>
  Switch to Sign Up
</Button>

<DropdownMenuContent className="bg-card">
  {/* content */}
</DropdownMenuContent>
```

**Problems:**
- Overrides `link` variant's default text color
- Overrides dropdown menu's default background
- Creates inconsistency with component library defaults
- Hard to maintain if component library updates

### ✅ Correct

```tsx
<Button variant="link" onClick={handleClick}>
  Switch to Sign Up
</Button>

<DropdownMenuContent>
  {/* content */}
</DropdownMenuContent>
```

**Benefits:**
- Uses component variant's default styling
- Consistent with component library design
- Automatically benefits from library updates
- Cleaner, more maintainable code

### When Custom Classnames Are OK

**Layout Classes:**
```tsx
<Button className="w-full" type="submit">
  Submit
</Button>
```
✅ `w-full` is necessary for full-width button layout

**Functional Classes:**
```tsx
<Input className="uppercase" />
```
✅ If the component doesn't have a variant for this functionality

### When to Remove Custom Classnames

**Style Overrides:**
```tsx
// ❌ Remove these
className="text-indigo-600 hover:text-indigo-800"
className="bg-card"
className="text-primary hover:text-primary/80"
```

**Redundant Classes:**
```tsx
// ❌ Remove if variant already handles it
<Button variant="outline" className="border border-gray-300" />
```

### Component-Specific Guidelines

**Button:**
- ✅ Use variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`
- ✅ Keep layout classes: `w-full`, `flex`, etc.
- ❌ Don't override colors, backgrounds, or hover states

**DropdownMenu:**
- ✅ Use component defaults
- ❌ Don't override `bg-popover` or other default styles

**Input:**
- ✅ Use component defaults
- ✅ Add functional classes if needed (e.g., `uppercase`)

**Label:**
- ✅ Use component defaults
- ❌ Don't override text colors or sizes

---

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
