---
name: skill-updater
description: Meta-skill for updating and adapting other skills based on user preferences and feedback. Use when the user provides feedback about code patterns, styling preferences, or workflow adjustments that should be remembered for future sessions. Triggers on phrases like "remember this", "update the rules", "change the guidelines", "I prefer", "from now on", "always do", "never do", "add this to the rules".
license: MIT
metadata:
  author: better-convex
  version: "1.0.0"
---

# Skill Updater

A meta-skill that maintains and evolves other skills based on user preferences, feedback, and instructions. Acts as a memory system that persists learnings across sessions.

## When to Apply

Reference this skill when:
- User expresses a preference about code style, patterns, or conventions
- User says "remember this", "from now on", "always", "never"
- User provides feedback that should be incorporated into existing skills
- User explicitly asks to update guidelines or rules
- A pattern emerges from repeated corrections or feedback
- User requests new rules or modifications to existing rules

## Capabilities

### 1. Update Existing Skills
- Modify rules in existing skill files
- Add new examples (correct/incorrect patterns)
- Adjust priority levels
- Update descriptions and when-to-apply sections

### 2. Create New Rules
- Add new rule files to skill `rules/` directories
- Extend AGENTS.md with new guidelines
- Update SKILL.md quick reference tables

### 3. Track Preferences
- Recognize implicit preferences from corrections
- Aggregate related feedback into coherent rules
- Maintain consistency across skill files

## Skill File Structure

```
.agents/skills/<skill-name>/
├── SKILL.md           # Main skill definition with frontmatter
├── AGENTS.md          # Detailed rules and guidelines
└── rules/             # Individual rule files (optional)
    └── <rule-name>.md
```

## Quick Reference

| Action | Trigger Phrases | Example |
|--------|-----------------|---------|
| Add rule | "always", "never", "from now on" | "Always use gap instead of margin" |
| Update rule | "change", "modify", "update" | "Update the spacing rule to use gap-3" |
| Remove rule | "remove", "delete", "ignore" | "Remove the p-2 padding requirement" |
| Create skill | "create skill", "new skill for" | "Create a skill for database patterns" |

## How to Use

Read the full implementation guide in `AGENTS.md` for:
- Step-by-step update procedures
- File format specifications
- Conflict resolution strategies
- Validation checklists
