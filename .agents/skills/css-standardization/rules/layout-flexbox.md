# Layout: Use Flexbox

Always use flexbox for layouts instead of margins or space utilities.

## Why

- Flexbox provides predictable, consistent layouts
- Eliminates margin collapse issues
- Makes spacing explicit and maintainable
- Works better with responsive design

## ❌ Incorrect

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

## ✅ Correct

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

## Patterns

### Container
```tsx
<div className="flex flex-col gap-2 p-2">
  {/* content */}
</div>
```

### Horizontal Layout
```tsx
<div className="flex flex-row items-center justify-between">
  {/* content */}
</div>
```

### Form Fields
```tsx
<div className="flex flex-col gap-1">
  <Label>Field</Label>
  <Input />
</div>
```
