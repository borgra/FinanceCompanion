

## Goal

## Execution Loop

Repeat until the goal is complete or the maximum iteration count is reached.

**Maximum iterations:** 5

### 1. Plan

* Inspect the repository and relevant conventions.
* Define the smallest complete change that satisfies the goal.
* Identify affected files, risks, assumptions, and verification steps.
* Do not implement unrelated improvements.

### 2. Implement

* Make the planned changes.
* Follow existing architecture, naming, and style.
* Prefer simple, maintainable, defensive code.
* Validate inputs, handle failure paths, and avoid exposing sensitive data.
* Never introduce hardcoded secrets, credentials, tokens, or insecure defaults.
* Add or update unit tests for changed behavior.

### 3. Verify

Run the repository’s applicable checks:

* Unit tests
* Build or compile
* Linting and formatting
* Static analysis or type checking
* Secret and credential exposure checks
* Security-relevant validation for changed code

Fix failures caused by the change, then repeat the loop.

## Completion Criteria

Stop only when:

* The goal is fully implemented.
* Relevant unit tests pass.
* The build passes.
* Linting, formatting, and static checks pass.
* No secrets or sensitive values are exposed.
* Defensive failure paths are covered.
* No unrelated regressions or scope expansion were introduced.

## Final Response

Report:

* What changed
* Key implementation decisions
* Tests and checks executed
* Any unresolved risks, limitations, or blockers

Do not claim a check passed unless it was actually executed.
