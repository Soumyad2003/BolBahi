import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

test('firestore.rules includes default-deny catch-all and rules_version 2', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2';/);
  assert.match(rulesContent, /match\s+\/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});

test('every collection in firebase-blueprint.json has an explicit match block', () => {
  const collectionNames = Object.keys(blueprint.firestore).map((p) => p.split('/')[1]);
  for (const col of collectionNames) {
    assert.match(rulesContent, new RegExp(`match\\s+/${col}/\\{`), `Missing match block for ${col}`);
  }
});

test('Dirty Dozen security gates are enforced across all collections', () => {
  // 1 & 2 & 3: Verified auth + owner scoping on list/get/write
  assert.match(rulesContent, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rulesContent, /existing\(\)\.ownerId\s*==\s*request\.auth\.uid/);
  // 4 & 5: Strict hasAll & hasOnly checks in all validators
  assert.ok((rulesContent.match(/\.keys\(\)\.hasAll\(/g) || []).length >= 4);
  assert.ok((rulesContent.match(/\.keys\(\)\.hasOnly\(/g) || []).length >= 4);
  // 6: Path variable ID poisoning guard
  assert.match(rulesContent, /function isValidId\(id\)/);
  // 7 & 8: Relational consistency via exists() on supplierId and customerId
  assert.match(rulesContent, /exists\(\/databases\/\$\(database\)\/documents\/suppliers\/\$\(incoming\(\)\.supplierId\)\)/);
  assert.match(rulesContent, /exists\(\/databases\/\$\(database\)\/documents\/customers\/\$\(incoming\(\)\.customerId\)\)/);
  // 9: Temporal integrity against request.time
  assert.ok((rulesContent.match(/==\s*request\.time/g) || []).length >= 7);
  // 10 & 11: Immutability of ownerId/createdAt and terminal transaction lock
  assert.match(rulesContent, /match \/transactions\/\{transactionId\}[\s\S]*?allow update: if false;/);
  // 12: Bounded arrays & non-negative bounds
  assert.match(rulesContent, /aliases\.size\(\)\s*<=\s*15/);
  assert.match(rulesContent, /data\.items\.size\(\)\s*>=\s*1\s*&&\s*data\.items\.size\(\)\s*<=\s*30/);
});
