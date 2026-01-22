# Skill Updater Guide

A comprehensive guide for updating, creating, and maintaining skills based on user preferences and feedback.

## Overview

This skill enables the AI to learn and adapt by modifying skill files when users express preferences, provide corrections, or explicitly request rule changes. It acts as a persistent memory system that improves code generation quality over time.

---

## 1. Recognizing Update Triggers

### Explicit Triggers
When users directly request skill updates:

| Phrase Pattern | Action | Example |
|----------------|--------|---------|
| "Remember that..." | Add new rule or preference | "Remember that I prefer arrow functions" |
| "From now on..." | Add persistent rule | "From now on, use `const` over `let`" |
| "Always..." / "Never..." | Add hard rule | "Always add error boundaries to async components" |
| "Update the rule..." | Modify existing rule | "Update the spacing rule to allow gap-4" |
| "Add this to..." | Extend existing skill | "Add this pattern to the React best practices" |
| "Create a rule for..." | Create new rule file | "Create a rule for API error handling" |

### Implicit Triggers
Recognize patterns from user behavior:

- **Repeated corrections**: User corrects the same pattern 2+ times
- **Consistent preferences**: User always modifies generated code the same way
- **Style feedback**: User comments on code style preferences
- **Rejection patterns**: User consistently rejects certain suggestions

### Confirmation Required
Before updating skills, confirm with the user:

```
I noticed you prefer [pattern]. Would you like me to add this to the [skill-name] skill so I remember it for future sessions?
```

---

## 2. Update Procedures

### 2.1 Updating Existing Rules

**Step 1: Locate the rule**
```
.agents/skills/<skill-name>/AGENTS.md
.agents/skills/<skill-name>/rules/<rule-name>.md
```

**Step 2: Identify the change type**
- **Value change**: Update specific values (e.g., `gap-2` → `gap-3`)
- **Example addition**: Add new correct/incorrect examples
- **Scope expansion**: Add new contexts where rule applies
- **Exception addition**: Add cases where rule doesn't apply

**Step 3: Apply the change**
Preserve the existing structure and format. Only modify the relevant section.

**Step 4: Update related files**
If AGENTS.md references the rule, update those references too.

### 2.2 Adding New Rules

**Rule File Template:**

```markdown
## Rule: [Category] - [Rule Name]

[Brief description of what this rule enforces]

### Why

- [Reason 1]
- [Reason 2]

### ❌ Incorrect

```[language]
// Code example showing what NOT to do
```

**Problems:**
- [Problem 1]
- [Problem 2]

### ✅ Correct

```[language]
// Code example showing the correct approach
```

**Benefits:**
- [Benefit 1]
- [Benefit 2]

### When to Apply

- [Context 1]
- [Context 2]

### Exceptions

- [Exception 1, if any]
```

### 2.3 Creating New Skills

**Step 1: Create skill directory**
```
.agents/skills/<new-skill-name>/
```

**Step 2: Create SKILL.md**
```markdown
---
name: <skill-name>
description: <When and why to use this skill. Be specific about trigger conditions.>
license: MIT
metadata:
  author: <author>
  version: "1.0.0"
---

# [Skill Title]

[Brief overview of the skill]

## When to Apply

Reference these guidelines when:
- [Trigger condition 1]
- [Trigger condition 2]

## Core Principles

### 1. [Principle Name]
- [Key point 1]
- [Key point 2]

## Quick Reference

| Category | Rules | Priority |
|----------|-------|----------|
| [Cat 1]  | [Rule summary] | HIGH |

## Examples

### ✅ Correct: [Description]

```[language]
// Example code
```

### ❌ Incorrect: [Description]

```[language]
// Example code
```
```

**Step 3: Create AGENTS.md**
Include comprehensive rules with full explanations and examples.

**Step 4: Create rules/ directory (optional)**
For skills with many rules, split into individual files.

---

## 3. Skill File Formats

### SKILL.md Frontmatter

```yaml
---
name: skill-name                    # Lowercase, hyphenated
description: When and why to use   # Clear trigger conditions
license: MIT                        # License type
metadata:
  author: author-name              # Creator/maintainer
  version: "1.0.0"                 # Semantic version
  argument-hint: <optional-args>   # If skill accepts arguments
---
```

### Rule Priority Levels

| Level | Description | Use For |
|-------|-------------|---------|
| CRITICAL | Must always follow | Security, data integrity, breaking changes |
| HIGH | Should follow in most cases | Performance, maintainability |
| MEDIUM | Recommended practice | Consistency, readability |
| LOW | Nice to have | Style preferences, minor optimizations |

### Example Formatting

Always include both incorrect and correct examples:

```markdown
### ❌ Incorrect

```tsx
// Bad code with explanation
```

**Problems:**
- Specific issue 1
- Specific issue 2

### ✅ Correct

```tsx
// Good code with explanation
```

**Benefits:**
- Specific benefit 1
- Specific benefit 2
```

---

## 4. Conflict Resolution

### When Rules Conflict

1. **Check priority levels**: Higher priority wins
2. **Check specificity**: More specific rule wins
3. **Check recency**: User's latest preference wins
4. **Ask user**: When ambiguous, confirm with user

### Merging Preferences

When a new preference partially overlaps with existing rules:

1. **Preserve core rule**: Keep the main intent
2. **Add exception**: Document the user's preferred exception
3. **Update examples**: Add examples showing both cases

Example:
```markdown
### Standard Rule
Use `gap-2` for spacing between elements.

### Exception (User Preference)
Use `gap-4` for spacing between major sections.
```

---

## 5. Validation Checklist

Before finalizing any skill update:

- [ ] Frontmatter is valid YAML
- [ ] Description clearly states when to apply
- [ ] Examples use correct language tags
- [ ] Both incorrect and correct examples provided
- [ ] No conflicting rules introduced
- [ ] Related files updated (SKILL.md ↔ AGENTS.md)
- [ ] Version number incremented for significant changes

---

## 6. Update Examples

### Example 1: Adding a Spacing Preference

**User says:** "From now on, use gap-3 for form fields instead of gap-2"

**Action:** Update css-standardization skill

**File:** `.agents/skills/css-standardization/AGENTS.md`

**Change:**
```diff
### Spacing Standards

- **Container padding**: `p-2` (always)
- **Major section gaps**: `gap-2` (between form and switch link)
-- **Form field gaps**: `gap-2` (between form fields)
+- **Form field gaps**: `gap-3` (between form fields)
- **Tight spacing**: `gap-1` (within field groups)
```

### Example 2: Adding a New Rule

**User says:** "Always wrap async components in error boundaries"

**Action:** Add rule to vercel-react-best-practices

**File:** `.agents/skills/vercel-react-best-practices/rules/rendering-error-boundaries.md`

**Content:**
```markdown
## Rule: Rendering - Error Boundaries for Async Components

Wrap async React Server Components in Error Boundaries to handle failures gracefully.

### Why

- Prevents entire page from crashing on data fetch failures
- Provides better user experience with fallback UI
- Isolates failures to specific components

### ❌ Incorrect

```tsx
async function Page() {
  return (
    <div>
      <AsyncUserProfile /> {/* No error boundary */}
    </div>
  )
}
```

### ✅ Correct

```tsx
import { ErrorBoundary } from 'react-error-boundary'

async function Page() {
  return (
    <div>
      <ErrorBoundary fallback={<ProfileError />}>
        <AsyncUserProfile />
      </ErrorBoundary>
    </div>
  )
}
```
```

### Example 3: Creating a New Skill

**User says:** "Create a skill for our Convex database patterns"

**Action:** Create new skill directory and files

**Files created:**
- `.agents/skills/convex-patterns/SKILL.md`
- `.agents/skills/convex-patterns/AGENTS.md`

---

## 7. Memory Persistence

### What Gets Remembered

- Explicit rule additions/modifications
- Confirmed implicit preferences
- User-approved new skills
- Exception patterns

### What Doesn't Get Remembered

- One-time corrections without confirmation
- Context-specific adjustments
- Temporary overrides

### Updating After Session

At the end of a session where preferences were expressed but not yet persisted:

```
I noticed some preferences during our session:
1. [Preference 1]
2. [Preference 2]

Would you like me to add these to the relevant skills for future sessions?
```

---

## 8. Quick Commands

| Command | Description |
|---------|-------------|
| "Show me the current rules for [skill]" | Display current skill configuration |
| "What preferences have I set?" | List all custom rules/preferences |
| "Reset [skill] to defaults" | Remove custom modifications |
| "Export my preferences" | Generate summary of all customizations |

---

## References

- Skill files location: `.agents/skills/`
- Frontmatter spec: YAML with required `name`, `description`, `metadata`
- Rule file format: Markdown with sections for Why, Incorrect, Correct, When to Apply
