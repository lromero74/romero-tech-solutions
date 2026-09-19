import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Unmounted mock-data stubs must stay deleted: EmergencyAlerts (hardcoded
// fake outage), ClientRegistration (simulated submit), emailService
// (console.log "send"). The live paths are SimplifiedClientRegistration +
// signUpClient (backend-backed) and SES via backend emailService.
const ROOT = join(__dirname, '..', '..');
const DELETED = [
  'src/components/admin/EmergencyAlerts.tsx',
  'src/components/ClientRegistration.tsx',
  'src/services/emailService.ts',
];

describe('no unmounted mock-data stubs', () => {
  it('deleted stub modules stay deleted', () => {
    const present = DELETED.filter(f => existsSync(join(ROOT, f)));
    expect(present).toEqual([]);
  });

  it('no source file imports the deleted stubs', () => {
    const out = execSync(
      `grep -rn "EmergencyAlerts\\|components/ClientRegistration\\|services/emailService" src --include='*.ts' --include='*.tsx' | grep -v __tests__ || true`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });

  it('no source file simulates API calls with mock responses', () => {
    const markers = ['Mock successful response', 'Simulating emergency requests for demo'];
    const offenders: string[] = [];
    const files = execSync(
      `grep -rln "Mock successful response\\|Simulating emergency requests" src --include='*.ts' --include='*.tsx' | grep -v __tests__ || true`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const hits = markers.filter(m => src.includes(m));
      if (hits.length > 0) offenders.push(`${f}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
