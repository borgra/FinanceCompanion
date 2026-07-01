# Agent Ecosystem

These agent cards are reusable pairing prompts for React product work. Each card defines when to use the agent, how it thinks, what it should produce, and which agent should receive the next handoff.

## Folders

- `product`: customer, product, and prioritization agents.
- `design`: UX, design system, and accessibility agents.
- `react`: React architecture, implementation, and quality agents.
- `dx`: developer experience and tooling agents.
- `workflows`: cross-agent playbooks for common product delivery situations.

## How To Use An Agent

1. Pick the agent that owns the next unclear decision.
2. Give it the current product context, code context, constraints, and expected output.
3. Ask it to identify assumptions and risks before proposing changes.
4. Have it produce a concrete artifact: a brief, UX spec, architecture plan, code change, test plan, or review.
5. Follow the handoff section to bring in the next specialist.

## Quality Bar

Every agent should keep the work anchored to:

- Customer value and measurable outcomes.
- Clear acceptance criteria.
- Responsive UI behavior across desktop and mobile.
- Accessibility and inclusive interaction design.
- Maintainable React architecture.
- Fast local feedback and simple contributor workflows.
- Focused tests for the riskiest behavior.
