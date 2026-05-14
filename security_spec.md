# Security Specification - Fluxo Inteligente

## Data Invariants
1. A **UserProfile** must be owned by the user (UID match).
2. Users can only read their own reports and documents (unless they are admins).
3. **FinancialAgenda** entries belong to a specific client; only that client or an admin can access them.
4. **System Configurations** (plans_config) are read-only for authenticated users and write-only for admins.
5. All IDs must be valid (max 128 chars, alphanumeric).
6. Timestamps (createdAt, updatedAt) must be server-generated.

## The Dirty Dozen Payloads (Red Team)

1. **Identity Spoofing**: Attempt to create a profile with a different UID.
   - Payload: `{ uid: "attacker_id", email: "victim@example.com", role: "admin" }` to `userProfiles/victim_id`.
2. **Privilege Escalation**: Non-admin user trying to make themselves an admin.
   - Payload: `{ role: "admin" }` patch to `userProfiles/my_uid`.
3. **Data Snooping**: Client trying to read another client's report.
   - Action: `get` on `reports/other_client_report_id`.
4. **Broken Access Control**: Unauthenticated user trying to read any profile.
   - Action: `get` on `userProfiles/any_id` without auth header.
5. **Resource Exhaustion**: Sending a 1MB string in the 'name' field.
   - Payload: `{ name: "A".repeat(1000000) }`.
6. **Orphaned Write**: Creating a report for a non-existent client.
   - Payload: `{ clientId: "non_existent_id", ... }`.
7. **Temporal Fraud**: Setting `createdAt` to a date in the past from the client.
   - Payload: `{ createdAt: "2000-01-01T00:00:00Z" }`.
8. **State Shortcutting**: Updating a payment status directly to "pago" without processing.
   - Action: `patch` on `payments/id` with `{ status: "pago" }`.
9. **Bulk Export Attempt**: Authenticated user trying to `list` all user profiles.
   - Action: `get` on `userProfiles` collection without filters.
10. **ID Poisoning**: Using a 2KB string as a document ID.
    - Path: `userProfiles/VERY_LONG_STRING...`
11. **Shadow Update**: Adding a field `isVerified: true` to a profile during a name update.
    - Payload: `{ name: "New Name", isVerified: true }`.
12. **Null Token Bypass**: Attempting access with a null/expired auth token.

## Test Runner (Logic Overview)
The `firestore.rules` will be verified against these patterns. Each must return `PERMISSION_DENIED`.
