# VieForce HQ ↔ Patrol API contract

Patrol and **VieForce HQ** share auth, admin user flows, and API expectations. The canonical contract (acknowledgments, endpoints, versioning) lives in the HQ repo:

**[PATROL_HQ_CONTRACT.md](https://github.com/mathieu-hash/vieforce-hq/blob/master/.planning/PATROL_HQ_CONTRACT.md)** (`vieforce-hq` → `.planning/PATROL_HQ_CONTRACT.md`)

When HQ changes session rules, `/api/admin/*`, or SAP-related admin behavior, update that document first, then align Patrol clients.
