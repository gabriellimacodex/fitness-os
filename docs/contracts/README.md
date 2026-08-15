# Contracts

Agents may implement coupled components in parallel only when their shared contract has been frozen first.

A future contract such as `WorkoutSessionContract v1` would explicitly record its request, response, errors, permissions, and version before web and API implementation split into consumer and provider tasks. No workout contract or product contract is defined in Epic 00.

The only frozen technical API contract in Epic 00 is:

```text
GET /health
200 OK
{"status":"ok"}
```

Changing a frozen contract requires orchestrator coordination and updates to consumers, providers, tests, and documentation in the same controlled wave.
