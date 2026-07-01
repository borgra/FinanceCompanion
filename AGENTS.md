# React Agent Ecosystem

This workspace uses a small ecosystem of specialist agents to build React product experiences with strong engineering quality, developer experience, UI/UX craft, and customer outcome focus.

Use these agents as pairing partners. Start with Product to clarify the customer problem, move through Design to shape the experience, then use React engineering and quality agents to implement and verify the work.

## Agent Directory

| Agent | Use when | Primary output |
| --- | --- | --- |
| [Product CX Strategist](.agents/product/product-cx-strategist.md) | Defining outcomes, scope, customer journeys, acceptance criteria, and tradeoffs | Product brief, story map, success metrics |
| [UX Interaction Designer](.agents/design/ux-interaction-designer.md) | Designing workflows, layout, content hierarchy, and interaction behavior | UX spec, flow notes, edge states |
| [Design Systems Agent](.agents/design/design-systems-agent.md) | Creating reusable UI patterns, tokens, component APIs, and consistency rules | Component guidelines, token guidance |
| [Accessibility Reviewer](.agents/design/accessibility-reviewer.md) | Checking keyboard, semantics, focus, contrast, and assistive technology behavior | Accessibility findings and fixes |
| [React Architecture Agent](.agents/react/react-architecture-agent.md) | Choosing structure, state ownership, routing, data loading, and component boundaries | Implementation plan and architecture notes |
| [React Component Engineer](.agents/react/react-component-engineer.md) | Building components, hooks, pages, forms, and stateful UI | Production-ready React code |
| [React Quality Engineer](.agents/react/react-quality-engineer.md) | Testing, review, performance checks, regressions, and release readiness | Test plan, defects, verification notes |
| [DX Tooling Agent](.agents/dx/dx-tooling-agent.md) | Improving linting, formatting, build speed, local setup, scripts, and repo ergonomics | DX improvements and standards |

## Default Collaboration Flow

1. Product CX Strategist defines the customer problem, target users, value, success metrics, non-goals, and acceptance criteria.
2. UX Interaction Designer turns the product intent into screens, flows, interaction states, and content hierarchy.
3. Design Systems Agent maps the UX to reusable components, tokens, and variants.
4. React Architecture Agent chooses the implementation shape and identifies risks before code is written.
5. React Component Engineer implements the feature using established project patterns.
6. React Quality Engineer verifies behavior, tests, accessibility basics, performance, and regression risk.
7. Accessibility Reviewer performs a focused pass on keyboard, semantics, focus, and perceivable UI quality.
8. DX Tooling Agent improves scripts or project ergonomics when friction appears repeatedly.

## Operating Principles

- Customer experience is the deciding factor when technical and design tradeoffs are otherwise close.
- Prefer small, reviewable feature increments over broad rewrites.
- Reuse existing React patterns, project structure, design tokens, and test utilities before adding new ones.
- Keep state as local as practical, and make shared state explicit.
- Treat loading, empty, error, permission, slow network, and mobile states as first-class product states.
- Components should have clear ownership of data, behavior, accessibility semantics, and visual variants.
- Tests should cover user-visible behavior and important integration contracts, not implementation trivia.
- Accessibility is part of done, not a final polish pass.

## Pairing Prompt

Use this prompt to activate the full ecosystem:

```text
Use the React Agent Ecosystem in this repository. Start with the relevant specialist agent card from .agents, follow its operating mode, and hand off to the next agent when the output needs another discipline. Prioritize customer experience, React best practices, accessibility, testability, and developer experience.
```

For single-discipline work, open the matching agent file and use its "Pairing Instructions" section directly.

## Session Template

Use [.agents/workflows/pairing-session-template.md](.agents/workflows/pairing-session-template.md) to start a structured pairing session with the right context, agents, requested output, and done criteria.
