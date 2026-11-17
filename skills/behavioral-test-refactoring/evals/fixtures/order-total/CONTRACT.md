# Order totals

The maintained API is src/order.mjs. It computes integer-cent totals, returns zero for an empty order, and rejects negative quantities with RangeError. Incident ORD-17 established rejection because negative quantities previously reduced charges.

The discount prototype was abandoned. test/prototype.test.mjs is a development probe with no maintained caller or product contract. No discount API ships.

Tests use plain outcome names, without a required should/when prefix. Run node --test test/*.test.mjs. Preserve this naming convention. Refactoring is limited to tests; the production API and test command remain unchanged.
