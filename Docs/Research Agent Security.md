# Research agent security

Implemented on `codex/stock-details-agent`, 2026-10-21. This document supplements the stock-details specification and covers both `stock-details-agent` and `dividend-history-agent`. These changes are source changes; they have not been deployed to Azure. The earlier successful local MSFT test used the previous approved definition and does not verify these new protections.

## Trust boundaries and enforced controls

The application sends bounded public listing identity and server-selected research dates. It does not send holdings, positions, balances, private account identifiers, credentials, or database/trading capabilities. Inputs, search results and web pages are data, never instructions. The registered prompt agents have web search only. Forecasting, ownership checks and persistence remain deterministic application code.

Both research flows require an explicitly approved immutable version. Before inference the backend verifies the saved kind, model deployment, canonical instructions, web-search-only tools, tool choice, low reasoning setting, strict schema, and full `rai_config.rai_policy_name`. The request contains only the approved `agent_reference`, a user data message and execution limits. It cannot override model, instructions, tools or schema; it never falls back to direct model execution, resolves latest, or creates/repairs agents at runtime.

Each research request also reads Azure Resource Manager with a separate ARM-scoped Entra token. It verifies that the policy exists, has the expected ID, uses `Microsoft.DefaultV2` and blocking mode, enables blocking user/document attacks, and retains blocking core harm filters at Medium or stricter. It verifies that the model deployment is OpenAI `gpt-6-luna` and attaches that policy. Denied access, deletion, malformed metadata or drift stops inference. Metadata reads share the request deadline and have no permissive cache. This avoids relying only on a policy reference: Azure documents that invalid references can otherwise fail open. These reads cannot eliminate the race where an Azure administrator changes a policy immediately after verification; restrict policy writers and monitor changes.

The backend rejects Azure filtering/refusals, incomplete responses, unexpected tool outputs, mismatched echoed agent references, malformed/duplicate/unknown JSON keys, unsupported listing identities, and invalid values/dates. A response marked completed cannot hide a blocked tool or a refusal beside valid-looking JSON. Accepted sources must be public HTTPS URLs actually returned by a completed web search; URLs invented in JSON or message citations alone cannot authorize persistence.

Stock results retain dated field-level evidence and validate required price/NAV freshness and optional numeric bounds. Dividend rows carry their own supporting URL, explicit distribution classification and share basis. The backend preserves `announced` status instead of promoting it solely from an old ex-date. Unknown split basis and raw historical amounts without verified complete split history stay unverified and are excluded from totals and forecasts. Unsupported distribution classifications cannot become recurring income. Cadence is inferred separately. Each successful dividend snapshot records the agent name/version, execution mode and policy ID.

Research cannot choose arbitrary storage fields. Failed research preserves saved records. Refreshes retain their in-flight guard through commit, recheck canonical listing identity, preserve current manual/position edits and use conditional writes. Safe diagnostics record internal rejection reasons, not prompts, credentials, raw model answers or provider error bodies.

Security search remains a separate, bounded two-pass identity-discovery operation against the deployment. It does not import dividend or stock metrics and is not a fallback for either registered research agent. The deployment-level RAI policy also applies to that model route. Model-invocation RBAC is not a guarantee that every possible request uses an agent reference; the application enforces this for the two refresh paths.

## Infrastructure and permissions

`infra/foundry.bicep` creates `research-injection-blocking-v1` with `mode: Blocking`, `Microsoft.DefaultV2`, Medium input/output Hate/Sexual/Violence/Selfharm filters, and enabled blocking `Jailbreak` and `Indirect Attack` prompt controls. It attaches the policy to the model deployment, disables API-key authentication, and retains the explicitly selected model version without automatic upgrades. Registered agent definitions bind the full ARM policy resource ID.

`infra/foundry-runtime-access.bicep` separates runtime and deployment privileges. Runtime gets project-scoped agent-read/Responses-invoke permissions and account-scoped read-only deployment/policy metadata. It cannot modify agent definitions, policies, deployments, role assignments or resource keys. Registration and policy updates run under a separate deployment/operator identity. Existing inherited broad grants are additive: a new narrow role does not remove them. Access tooling refuses known broad grants; review inherited/group/custom assignments in IAM before relying on least privilege.

No public-network lockdown is enabled automatically: the existing local workflow and Azure runtime need a working access path. The IaC public-network parameter supports disabling access after private endpoints, DNS and routing are configured.

## Rollout and approval

1. Review/build the IaC and deploy the Foundry policy/model changes under the deployment identity. Read the resulting `raiPolicyId` output. Do not reuse a policy from another account.
2. Remove obsolete broad grants from the API managed identity after reviewing their consumers, then apply the restricted runtime access. A local Azure CLI user also needs the metadata read permissions; the API runtime never needs agent/policy write permissions.
3. Register **both** canonical definitions using `infra/scripts/register-foundry-agent.ps1`, passing `-Endpoint`, `-SubscriptionId`, `-Deployment`, `-AgentKind` and `-RaiPolicyId`. Registration checks policy existence and model attachment and returns a new immutable version. Updating the dividend schema/prompt requires a new dividend version; existing stock v1 lacks this new policy binding.
4. Run `infra/scripts/test-foundry.ps1` for each candidate with the same arguments plus `-AgentVersion <candidate> -VerifyConfigurationOnly`. Then run the normal live research smoke against a stock and ETF; review financial evidence. These checks incur calls only when configuration-only mode is omitted.
5. Run the opt-in `-VerifyInjectionBlocking` smoke for each candidate in a non-production environment. It requires actual Azure filter evidence; an ordinary model refusal or unrelated HTTP 400 does not count as a pass. It sends synthetic public input and never writes holdings. It does not prove indirect web-search attack coverage.
6. Approve the returned versions explicitly and set these settings locally and in GitHub/runtime configuration:

   - `FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION`
   - `FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION`
   - `FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID`

   GitHub variables use the corresponding `AZURE_FOUNDRY_*` names. Both version settings are mandatory positive integers; `latest` and blanks are rejected for live research. Do not automatically promote a newly registered version. The local launcher and deployment workflow fail clearly when approvals are absent.
7. Deploy/restart the API, test both refresh paths through the application, verify stored agent versions and unchanged private/manual fields, and confirm safe failure with no writes when an approved version/policy is unavailable.

Roll back only to an explicitly approved, matching definition/policy version. If none is available, disable refresh and keep saved data. Do not silently switch to inline execution, an unpinned version or stubs.

## Additional Azure Portal choices

| Option | Where and what to select | Fit and limits |
| --- | --- | --- |
| Inspect baseline assignments | Foundry → Build → Guardrails; select the IaC policy and verify both agents and the model assignment. In the agent playground, inspect Guardrails. | Verify actual assignments after deployment. Portal edits should be reproduced in source and tested so a later deployment does not undo them. |
| Tool-response document attack protection | Foundry → Build → Agents → each agent → Guardrails → Manage. Configure Document attack at **tool response** with blocking where supported. | Preview and tool/API support dependent. Specifically verify built-in `web_search` support with a controlled adversarial retrieved page. The ARM Prompt control alone does not establish tool-response coverage. If unsupported, use controlled retrieval that scans external documents before the model sees them; this is an architectural change, not a portal toggle. |
| Task adherence / groundedness | Review the risks offered by the agent Guardrails panel or guided setup in a test project. | Availability and supported intervention points vary. Evaluate false positives and latency against normal stock/dividend requests before promotion. These controls do not independently verify market data. |
| Stricter harm filters and PII controls | Edit the policy in Build → Guardrails, evaluate Low thresholds and available PII redaction/blocking. | Core Low filters are compatible with the backend baseline. PII controls are defense in depth; private account data should still never be submitted. Preserve all required baseline controls. |
| Restricted operator access | Azure Portal → Foundry resource / project → Access control (IAM); review API identity roles including inherited/group grants. Use privileged identity management for human deployment access where available. | Remove broad runtime grants deliberately. Keep deployment access separate. Read-only metadata permissions are needed for runtime policy verification. |
| Private networking | Azure Portal → Foundry resource → Networking; plan private endpoints, DNS and Container App network routing, then disable public access in IaC. | Coordinate local developer access and hosted-tool support first. Private networking does not itself inspect instructions embedded in public search results. |
| Monitoring and evaluation | Foundry guardrail testing/evaluations and Azure monitoring for filter decisions and resource configuration changes. | Verify direct-input and retrieved-document attacks separately. Avoid raw prompts and financial data in logs. Keep agent/version/policy identifiers and actionable failure counts. |

Spotlighting is not a drop-in setting for the current Responses path: Microsoft's Prompt Shields documentation limits its documented availability to Chat Completions. Guided agent setup is preview and should not be treated as proof that every recommended intervention supports this tool/API combination.

## Verification and residual limits

Verification completed on 2026-10-21:

| Check | Result |
| --- | --- |
| Full backend suite, including attacks, policy integrity, persistence, concurrency, launcher and workflow contracts | 618 passed |
| Offline Foundry agent, deployment and runtime-access PowerShell suites | All three passed; Azure and HTTP calls mocked |
| Bicep builds: Foundry, runtime access, API runtime and main | All four compiled; existing unused `staticWebAppLocation` warning remains |
| Focused UI regression pass | 39 passed |
| Git whitespace check | Passed |
| Live Azure policy deployment / adversarial probe | Not performed in this change |

Offline tests exercise configuration drift, missing/denied agents/policies, forbidden overrides/tools, structured filtering/refusals, spoofed URLs, duplicate keys, invalid listing/value/date contracts and persistence rollback/concurrency. These prove application behavior with synthetic responses. They do not prove Azure filtering efficacy or compatibility in this subscription until live rollout probes pass.

Source membership and strict schemas establish traceability, not publisher truth. A compromised source can publish a plausible but false number, and a model can misread an otherwise valid source. The prompts request corroboration, but the current integration does not independently fetch and verify publisher tables. For stronger factual assurance, use controlled issuer/exchange retrieval with independent corroboration or a licensed structured market-data source, validate it outside the model, and keep AI responsible for extraction only. General-purpose content filters cannot guarantee financial accuracy.

## Official references

Checked 2026-10-21:

- [Configure guardrails and assign them to agents/models](https://learn.microsoft.com/en-us/azure/foundry/guardrails/how-to-create-guardrails)
- [Prompt Shields, defaults, supported intervention points, and Spotlighting limits](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-filter-prompt-shields)
- [Guided agent guardrail setup (preview)](https://learn.microsoft.com/en-us/azure/foundry/guardrails/guided-set-up)
- [RAI policy management API](https://learn.microsoft.com/en-us/rest/api/microsoftfoundry/accountmanagement/rai-policies/create-or-update?view=rest-microsoftfoundry-accountmanagement-2025-06-01)
- [Foundry agent definition/reference API](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/aiproject)
- [Azure's documented invalid-policy-reference failure mode (hosted agents)](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-hosted-agent-guardrails)
