# Feature Delivery Workflow

Use this workflow for new React product features.

## Sequence

1. Product CX Strategist
   - Define customer problem, release slice, acceptance criteria, success metrics, and non-goals.
2. UX Interaction Designer
   - Define the flow, layout, interaction behavior, responsive behavior, and edge states.
3. Design Systems Agent
   - Identify reusable components, variants, tokens, and feature-local UI.
4. React Architecture Agent
   - Define state ownership, data loading, routing, component boundaries, and test strategy.
5. React Component Engineer
   - Implement the feature and focused tests.
6. React Quality Engineer
   - Review behavior, tests, regressions, and release readiness.
7. Accessibility Reviewer
   - Validate keyboard, semantics, focus, contrast, and assistive technology behavior.

## Done Criteria

- Customer-visible acceptance criteria are satisfied.
- Loading, empty, error, success, disabled, and mobile states are defined and implemented where relevant.
- Important behavior is covered by tests.
- Keyboard and screen reader basics are valid.
- Relevant local checks pass.
- Any remaining risk is documented with an owner or follow-up.
