# BolBahi Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Every document in `suppliers`, `items`, `customers`, and `transactions` belongs strictly to a single verified shopkeeper (`ownerId == request.auth.uid` and `request.auth.token.email_verified == true`).
2. PII (`phone` in `customers` and `suppliers`, `customerPhone` in `transactions`) is strictly readable only by the owning shopkeeper (`existing().ownerId == request.auth.uid`).
3. An `Item` cannot be created without referencing an existing `Supplier` owned by the same shopkeeper (`exists()` + owner check).
4. A `Transaction` cannot be created without referencing an existing `Customer` owned by the same shopkeeper (`exists()` + owner check).
5. Confirmed `Transaction` documents are terminal (`status == 'confirmed'`) and immutable against `update` (`allow update: if false;`), while supporting owner `delete` strictly for the 5-second Undo reversal or Demo Reset.
6. All `createdAt` and `updatedAt` timestamps must match `request.time` (server timestamps only).
7. Every document ID must match `^[a-zA-Z0-9_\-]+$` (max 128 chars) and every string/array field has explicit type and size bounds.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated List Scrape**: Unauthenticated `list` on `/customers`.
2. **Cross-Tenant PII Read**: Authenticated User B calls `get` on User A's `/customers/{id}`.
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts `create` on `/items/{id}`.
4. **Identity Spoofing on Create**: User A attempts to create `/customers/{id}` with `ownerId: "user-b"`.
5. **Shadow / Ghost Field Injection**: User A creates `/items/{id}` with extra field `isAdmin: true`.
6. **ID Poisoning**: User A attempts `create` at `/items/${"a".repeat(200)}`.
7. **Orphaned Item Create**: User A creates `/items/{id}` with non-existent `supplierId: "missing-supplier"`.
8. **Orphaned Transaction Create**: User A creates `/transactions/{id}` with non-existent `customerId: "missing-customer"`.
9. **Client Timestamp Forgery**: User A creates `/transactions/{id}` with client-forged `createdAt` != `request.time`.
10. **Immutable Owner Mutation**: User A updates `/customers/{id}` attempting to change `ownerId` or `createdAt`.
11. **Terminal Transaction Tampering**: User A attempts `update` on a confirmed `/transactions/{id}` to alter `total` or `cashPaid`.
12. **Array/String Resource Poisoning**: User A creates `/items/{id}` with `aliases` containing 25 elements or `price: -50`.
