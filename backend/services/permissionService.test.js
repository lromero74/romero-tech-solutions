import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionService } from './permissionService.js';

test('_checkPermissionInDatabase serves fresh cache entries without a database hit', async () => {
  permissionService.permissionCache.set('emp-1:add.businesses.enable', {
    hasPermission: true,
    timestamp: Date.now()
  });
  permissionService.permissionCache.set('emp-1:delete.businesses.enable', {
    hasPermission: false,
    timestamp: Date.now()
  });

  assert.equal(
    await permissionService._checkPermissionInDatabase('emp-1', 'add.businesses.enable'),
    true
  );
  assert.equal(
    await permissionService._checkPermissionInDatabase('emp-1', 'delete.businesses.enable'),
    false
  );

  permissionService.permissionCache.delete('emp-1:add.businesses.enable');
  permissionService.permissionCache.delete('emp-1:delete.businesses.enable');
});

test('permission cache entries expire after CACHE_TTL', () => {
  assert.equal(permissionService.CACHE_TTL, 5 * 60 * 1000);
  permissionService.permissionCache.set('emp-2:view.test.enable', {
    hasPermission: true,
    timestamp: Date.now() - permissionService.CACHE_TTL - 1000
  });
  const cached = permissionService.permissionCache.get('emp-2:view.test.enable');
  assert.equal(Date.now() - cached.timestamp < permissionService.CACHE_TTL, false);
  permissionService.permissionCache.delete('emp-2:view.test.enable');
});
