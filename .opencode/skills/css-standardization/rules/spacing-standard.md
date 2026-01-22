# Spacing: Standard Padding and Gap

Use consistent padding (`p-2`) and gap values (`gap-1` or `gap-2`) instead of margins or space utilities.

## Why

- Consistent spacing scale across the application
- Easy to maintain and update globally
- Predictable spacing patterns
- No margin collapse issues

## Standards

- **Container padding**: `p-2` (always)
- **Major section gaps**: `gap-2` (between form and switch link, between title and form)
- **Form field gaps**: `gap-2` (between form fields)
- **Tight spacing**: `gap-1` (within field groups: label/input/error, status indicator and text)
- **Navigation links**: `gap-2`

## ❌ Incorrect

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

## ✅ Correct

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

## Spacing Guide

| Use Case | Value | Example |
|----------|-------|---------|
| Container padding | `p-2` | `<div className="p-2">` |
| Between major sections | `gap-2` | `<div className="flex flex-col gap-2">` |
| Between form fields | `gap-2` | `<form className="flex flex-col gap-2">` |
| Within field groups | `gap-1` | `<div className="flex flex-col gap-1">` |
| Navigation links | `gap-2` | `<nav className="flex gap-2">` |
| Status indicators | `gap-1` | `<div className="flex items-center gap-1">` |

## Never Use

- ❌ `mt-*`, `mb-*`, `mx-*`, `my-*` - Use gap instead
- ❌ `space-y-*`, `space-x-*` - Use gap instead
- ❌ `p-1`, `p-4`, `p-6` - Use `p-2` consistently
- ❌ `gap-3`, `gap-4`, `gap-6` - Use `gap-1` or `gap-2` only
