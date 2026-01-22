# Components: Remove Unnecessary Custom Classnames

Remove unnecessary custom classnames from shadcn/ui and similar component libraries. Let component variants handle styling.

## Why

- Component libraries provide well-designed defaults
- Variants handle styling consistently
- Reduces custom CSS maintenance
- Keeps components clean and predictable

## Rules

1. **Use component variants** - Don't override variant styles with custom classes
2. **Keep layout classes** - Layout-related classes like `w-full` are acceptable
3. **Remove style overrides** - Don't override colors, backgrounds, or other style properties
4. **Trust defaults** - Component defaults are usually correct

## ❌ Incorrect

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

## ✅ Correct

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

## When Custom Classnames Are OK

### Layout Classes
```tsx
<Button className="w-full" type="submit">
  Submit
</Button>
```
✅ `w-full` is necessary for full-width button layout

### Functional Classes
```tsx
<Input className="uppercase" />
```
✅ If the component doesn't have a variant for this functionality

## When to Remove Custom Classnames

### Style Overrides
```tsx
// ❌ Remove these
className="text-indigo-600 hover:text-indigo-800"
className="bg-card"
className="text-primary hover:text-primary/80"
```

### Redundant Classes
```tsx
// ❌ Remove if variant already handles it
<Button variant="outline" className="border border-gray-300" />
```

## Component-Specific Guidelines

### Button
- ✅ Use variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`
- ✅ Keep layout classes: `w-full`, `flex`, etc.
- ❌ Don't override colors, backgrounds, or hover states

### DropdownMenu
- ✅ Use component defaults
- ❌ Don't override `bg-popover` or other default styles

### Input
- ✅ Use component defaults
- ✅ Add functional classes if needed (e.g., `uppercase`)

### Label
- ✅ Use component defaults
- ❌ Don't override text colors or sizes

## Checklist

When reviewing components:
- [ ] Are custom classnames overriding component defaults?
- [ ] Can the styling be achieved with a variant instead?
- [ ] Are layout classes necessary for functionality?
- [ ] Would removing custom classes break the layout?
