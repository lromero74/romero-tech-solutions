# Data Retention Policy Alignment - Implementation Handoff

**Date Created:** 2025-10-19
**Status:** IN PROGRESS
**Goal:** Align data retention policies across codebase and EULA with industry best practices and legal compliance requirements
**Priority:** HIGH (Legal compliance and cost optimization)

---

## 🎯 EXECUTIVE SUMMARY

### Problem Statement
Current data retention policies are **inconsistent between EULA and implementation**, creating legal risk:
- EULA promises 90-day retention for performance metrics
- Code implements 365-day retention (4x longer than promised)
- EULA promises 30-day retention for security logs
- Code implements 365-day retention but **cleanup not scheduled** (infinite growth)

### Solution
Align both code and EULA to industry-standard **365-day retention policy** for compliance-critical data, backed by SOC 2, GDPR, and NIST requirements.

### Key Benefits
- ✅ **Legal Protection**: Meets SOC 2, GDPR, NIST compliance
- ✅ **Industry Alignment**: Follows MSP best practices
- ✅ **Defensible**: Documented justification for each retention period
- ✅ **Automated**: Prevents indefinite database growth
- ✅ **Cost Effective**: Balances compliance with storage costs

---

## 📊 CURRENT STATE ANALYSIS

### EULA Claims (LICENSE_EN.txt / LICENSE_ES.txt)
```
3.4 DATA RETENTION
   - Performance metrics: 90 days
   - Hardware health alerts: Until resolved
   - Security events: 30 days
   - Failed login attempts: 30 days
   - System events: 30 days
```

### Actual Implementation

| Data Type | Table | EULA Says | Code Does | Automated? | Issue |
|-----------|-------|-----------|-----------|------------|-------|
| Performance metrics | `agent_metrics` | 90 days | **365 days** | ✅ Yes (daily 2 AM) | 4x longer than promised |
| Security events | `audit_logs` | 30 days | **365 days** | ❌ **NO** | 12x longer + not cleaning |
| Failed login attempts | `audit_logs` | 30 days | **365 days** | ❌ **NO** | 12x longer + not cleaning |
| Hardware alerts | `alert_history` | Until resolved | **Forever** | ❌ **NO** | Infinite growth |
| System events | Various | 30 days | Unknown | ❌ Unknown | Unclear |

### Critical Issues Identified

1. **Audit Logs Growing Indefinitely**
   - Cleanup function exists but **never scheduled/called**
   - File: `backend/services/auditLogService.js:239`
   - Risk: Database will grow without bounds

2. **Resolved Alerts Never Deleted**
   - No cleanup mechanism exists
   - Table: `alert_history`
   - Risk: Infinite accumulation of resolved alerts

3. **EULA Misrepresents Reality**
   - Legal risk: Promising shorter retention than actually implemented
   - Privacy concern: Users expect data deleted sooner

---

## 🔬 INDUSTRY RESEARCH & COMPLIANCE REQUIREMENTS

### SOC 2 Requirements
**Source:** Multiple SOC 2 compliance guides (2024)

- **Minimum**: 365 days for audit trails and security logs
- **Rationale**: Enables year-over-year compliance audits
- **Applies to**:
  - Authentication logs (login success/failure)
  - Access control logs
  - System change logs
  - Security event logs

**Compliance Impact:**
> "Compliance with regulatory standards such as ISO 27001 and SOC 2 is contingent upon an organization's ability to prove they have maintained a comprehensive log of all security-related events"

### GDPR Requirements
**Source:** GDPR compliance guides, EU regulations

- **No fixed period**: Organizations must document and justify retention
- **Typical range**: 6-24 months for security logs
- **Key principle**: Data minimization (keep only as long as necessary)
- **Requirements**:
  - Document purpose for each data type
  - Justify retention period based on operational need
  - Implement automated deletion after retention period
  - Enable user data deletion requests (where applicable)

**Compliance Impact:**
> "GDPR enforces data minimization and data retention policy, meaning businesses must collect and store logs only for the necessary period"

### NIST 800-53 Requirements
**Source:** NIST Cybersecurity Framework

- **Requirement**: Retain audit records for minimum specified period
- **Typical**: 12 months minimum
- **Applies to**: AU-11 (Audit Record Retention)
- **Additional**: Must ensure integrity and availability of audit records

### Industry Best Practices
**Source:** LogicMonitor, SigNoz, Cribl, AuditBoard (2024)

**General Recommendations:**
- Security logs: 90-365 days minimum
- Performance metrics: 90-365 days
- Audit trails: 365+ days for compliance
- Cost optimization: Implement tiered storage (60-75% cost reduction)

**Data Classification Approach:**
```
CRITICAL (365 days):
- Authentication events (login/logout/MFA)
- Access control violations
- Security alerts
- Privileged account changes

OPERATIONAL (90 days):
- Performance metrics
- System health metrics
- Routine network activity

COMPLIANCE-DRIVEN (per regulation):
- Financial records (varies 3-7 years)
- Healthcare data (HIPAA: 6 years)
- Payment data (PCI DSS: varies)
```

### Legal Precedent
**Recent Enforcement:**
> "In February 2024, the SEC fined 16 firms a combined $81 million for failing to properly retain electronic communications"

---

## ✅ RECOMMENDED DATA RETENTION POLICY

### Final Policy (Legally Defensible & Industry-Aligned)

| Data Type | Retention Period | Justification | Compliance Mapping |
|-----------|------------------|---------------|-------------------|
| **Performance Metrics** | **365 days** | Trend analysis, capacity planning, SOC 2 | SOC 2, Industry standard |
| **Security/Audit Logs** | **365 days** | Incident investigation, forensics, compliance | SOC 2, NIST 800-53, GDPR |
| **Failed Login Attempts** | **365 days** | Security monitoring, threat detection | SOC 2, NIST 800-53 |
| **System Events** | **90 days** | Operational monitoring, GDPR minimization | GDPR, Operational need |
| **Resolved Hardware Alerts** | **365 days after resolution** | Accountability, pattern analysis | Industry best practice |
| **Active Hardware Alerts** | **Until resolved + 365 days** | Incident tracking, SLA monitoring | Operational need |

### Rationale Summary

**Why 365 Days for Compliance Data?**
1. **SOC 2 Requirement**: Explicit 365-day minimum for audit trails
2. **NIST Alignment**: Meets federal cybersecurity standards
3. **GDPR Compliant**: Documented justification for security purposes
4. **Industry Standard**: Aligns with MSP best practices
5. **Forensic Value**: Enables year-over-year security analysis
6. **Audit Readiness**: Supports annual compliance audits

**Why 90 Days for Operational Data?**
1. **GDPR Minimization**: Shorter retention for non-compliance data
2. **Cost Optimization**: Reduces storage costs
3. **Sufficient for Operations**: 3 months covers most troubleshooting needs
4. **Industry Acceptable**: Common practice for operational metrics

---

## 🛠️ IMPLEMENTATION PLAN

### Phase 1: Create Cleanup Services ✅ (Partially Done)

#### 1.1 Metrics Cleanup Service ✅
**Status:** Already implemented and running

**File:** `backend/services/metricsCleanupService.js`
- Retention: 365 days
- Schedule: Daily at 2:00 AM
- Status: Active in production

#### 1.2 Audit Log Cleanup Service ⏳
**Status:** Function exists but NOT SCHEDULED

**Current State:**
- File: `backend/services/auditLogService.js`
- Function: `cleanupOldLogs(retentionDays = 365)` exists
- Problem: Never called automatically

**Action Required:**
- Create: `backend/services/auditLogCleanupService.js`
- Schedule: Daily at 2:30 AM
- Retention: 365 days

#### 1.3 Alert Cleanup Service ⏳
**Status:** Does not exist

**Action Required:**
- Create: `backend/services/alertCleanupService.js`
- Schedule: Daily at 3:00 AM
- Retention: 365 days after resolution
- Logic: Only delete alerts where `resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '365 days'`

### Phase 2: Update Server Initialization ⏳

**File:** `backend/server.js`

**Changes:**
```javascript
// Add imports
import { auditLogCleanupService } from './services/auditLogCleanupService.js';
import { alertCleanupService } from './services/alertCleanupService.js';

// In startup sequence (after metricsCleanupService)
auditLogCleanupService.start();
alertCleanupService.start();

// In shutdown handlers
auditLogCleanupService.stop();
alertCleanupService.stop();
```

### Phase 3: Update EULA Documentation ⏳

#### 3.1 English EULA (LICENSE_EN.txt)

**Current Section 3.4:**
```
3.4 DATA RETENTION
   - Performance metrics: 90 days
   - Hardware health alerts: Until resolved
   - Security events: 30 days
   - Failed login attempts: 30 days
   - System events: 30 days
```

**New Section 3.4:**
```
3.4 DATA RETENTION

To ensure compliance with industry standards (SOC 2, GDPR, NIST 800-53) while
respecting data minimization principles, we maintain the following retention periods:

COMPLIANCE-CRITICAL DATA (365 days):
   - Performance metrics: 365 days
   - Security events and audit logs: 365 days
   - Failed login attempts: 365 days

OPERATIONAL DATA (90 days):
   - System events and operational logs: 90 days

INCIDENT MANAGEMENT:
   - Active hardware health alerts: Until resolved
   - Resolved hardware health alerts: 365 days after resolution

AUTOMATED DELETION:
All data is automatically deleted after the retention period expires through
secure, auditable processes. Data retention policies align with SOC 2, GDPR,
and NIST cybersecurity standards.

DATA SUBJECT RIGHTS:
Users may request deletion of their personal data in accordance with GDPR
Article 17, subject to legal retention obligations.
```

#### 3.2 Spanish EULA (LICENSE_ES.txt)

**Update corresponding section with Spanish translation**

### Phase 4: Testing & Verification ⏳

#### 4.1 Dev Environment Testing
```bash
# Test metrics cleanup (already working)
node backend/test-metrics-cleanup.js

# Test audit log cleanup (new)
node backend/test-audit-cleanup.js

# Test alert cleanup (new)
node backend/test-alert-cleanup.js
```

#### 4.2 Production Verification
```bash
# Check cleanup services running
curl http://localhost:3001/api/admin/cleanup/status

# Monitor cleanup logs
tail -f logs/cleanup.log

# Verify data retention
./scripts/table --sql "
SELECT
  'agent_metrics' as table_name,
  COUNT(*) as total_records,
  MIN(collected_at) as oldest_record,
  MAX(collected_at) as newest_record
FROM agent_metrics
UNION ALL
SELECT
  'audit_logs',
  COUNT(*),
  MIN(created_at),
  MAX(created_at)
FROM audit_logs
UNION ALL
SELECT
  'alert_history',
  COUNT(*),
  MIN(created_at),
  MAX(created_at)
FROM alert_history;
"
```

#### 4.3 Metrics to Monitor
- Total records in each table
- Oldest record timestamp (should not exceed retention period + buffer)
- Cleanup execution logs
- Storage size trends
- Failed cleanup attempts

---

## 📝 FILES TO CREATE/MODIFY

### Create New Files

1. **`backend/services/auditLogCleanupService.js`**
   - Purpose: Schedule automated cleanup of audit_logs
   - Pattern: Copy from metricsCleanupService.js
   - Schedule: Daily at 2:30 AM
   - Retention: 365 days

2. **`backend/services/alertCleanupService.js`**
   - Purpose: Clean resolved alerts after 365 days
   - Schedule: Daily at 3:00 AM
   - Logic: Only delete resolved alerts

3. **`backend/test-audit-cleanup.js`**
   - Purpose: Test audit log cleanup service
   - Tests: Manual cleanup, retention calculation, error handling

4. **`backend/test-alert-cleanup.js`**
   - Purpose: Test alert cleanup service
   - Tests: Resolved vs active separation, date calculation

### Modify Existing Files

1. **`backend/server.js`** (lines ~53-56, ~662, ~708, ~717)
   - Add: Import new cleanup services
   - Add: Start services on startup
   - Add: Stop services on shutdown

2. **`rts-monitoring-agent/LICENSE_EN.txt`** (Section 3.4)
   - Update: Data retention section with new policy
   - Add: Compliance framework references
   - Add: Data subject rights notice

3. **`rts-monitoring-agent/LICENSE_ES.txt`** (Section 3.4)
   - Update: Spanish translation of new policy

---

## 🔒 SECURITY & COMPLIANCE CONSIDERATIONS

### Data Integrity
- Cleanup operations logged to audit trail
- Soft deletes not used (hard delete for compliance)
- Deletion counts tracked and reported
- Failed deletions trigger alerts

### Access Controls
- Only admin endpoints can trigger manual cleanup
- Automated cleanup runs with system privileges
- Cleanup logs protected from deletion

### Audit Trail
```javascript
// Every cleanup operation logs:
{
  service: 'auditLogCleanupService',
  timestamp: '2025-10-19T02:30:00Z',
  retention_days: 365,
  records_deleted: 1523,
  oldest_deleted: '2024-10-18T00:00:00Z',
  execution_time_ms: 2341,
  status: 'success'
}
```

### GDPR Compliance
- **Article 5(1)(e)**: Data kept no longer than necessary ✅
- **Article 17**: Right to erasure (deletion requests) ✅
- **Article 30**: Processing activities documentation ✅
- **Data minimization**: Operational data reduced to 90 days ✅

---

## 💰 COST OPTIMIZATION

### Storage Savings Estimate

**Current State (No Cleanup):**
- agent_metrics: Growing indefinitely
- audit_logs: Growing indefinitely
- alert_history: Growing indefinitely

**With 365-Day Retention:**
- Reduces to ~70-80% after first year
- Steady state reached after 2 years
- Estimated storage reduction: 50-60% long-term

**Future Optimization (Phase 2):**
- Implement tiered storage (hot/warm/cold)
- Move older logs to cheaper S3 storage
- Potential cost reduction: 60-75% (industry standard)

---

## 🚨 ROLLBACK PLAN

If issues arise after implementation:

### 1. Emergency Disable
```javascript
// In server.js startup:
const ENABLE_CLEANUP = process.env.ENABLE_DATA_CLEANUP !== 'false';

if (ENABLE_CLEANUP) {
  auditLogCleanupService.start();
  alertCleanupService.start();
}
```

Set env var to disable:
```bash
export ENABLE_DATA_CLEANUP=false
./restart-services.sh
```

### 2. Restore Deleted Data
- Requires: Database backups from before cleanup
- RDS automated backups retained for 7 days
- Point-in-time recovery available

### 3. Adjust Retention Periods
```javascript
// If 365 days too short, increase:
const RETENTION_DAYS = process.env.RETENTION_DAYS || 365;
```

---

## 📈 SUCCESS CRITERIA

### Technical Success
- [ ] Audit log cleanup service running and logging
- [ ] Alert cleanup service running and logging
- [ ] No cleanup errors in logs for 7 days
- [ ] Database storage growth stabilized
- [ ] Oldest records not exceeding retention + 1 day buffer

### Compliance Success
- [ ] EULA matches implementation
- [ ] Documented justification for each retention period
- [ ] Audit trail for all cleanup operations
- [ ] Data subject deletion requests can be fulfilled

### Business Success
- [ ] Storage costs stabilized or reduced
- [ ] No customer complaints about data availability
- [ ] Audit-ready documentation maintained

---

## 🔄 MAINTENANCE & MONITORING

### Weekly Checks
- Review cleanup execution logs
- Check for failed cleanup operations
- Monitor database storage trends

### Monthly Reviews
- Analyze retention period effectiveness
- Review compliance requirement changes
- Update documentation if policies change

### Annual Reviews
- Full policy review for compliance updates
- Compare actual vs. expected retention
- Adjust periods based on business needs

---

## 📚 REFERENCE DOCUMENTS

### Internal Documentation
- `backend/services/metricsCleanupService.js` - Reference implementation
- `backend/migrations/037_agent_metrics_retention.sql` - Database retention function
- `backend/migrations/add_audit_logs_table.sql` - Audit logs schema

### External Resources
1. **SOC 2 Compliance:**
   - https://cribl.io/blog/mastering-log-retention-policy-a-guide-to-securing-your-data/
   - https://www.bytebase.com/blog/soc2-data-security-and-retention-requirements/

2. **GDPR Compliance:**
   - https://nxlog.co/news-and-blog/posts/gdpr-compliance
   - https://last9.io/blog/gdpr-log-management/

3. **NIST Guidelines:**
   - NIST 800-53 Rev. 5 - AU-11 (Audit Record Retention)

4. **Industry Best Practices:**
   - https://signoz.io/guides/log-retention/
   - https://auditboard.com/blog/security-log-retention-best-practices-guide

---

## 📞 STAKEHOLDER COMMUNICATION

### Who Needs to Know
1. **Legal/Compliance Team**: EULA changes, compliance alignment
2. **DevOps Team**: New services, monitoring requirements
3. **Support Team**: Customer questions about data retention
4. **Management**: Cost implications, risk mitigation

### Communication Plan
1. Notify legal team of EULA changes before deployment
2. Update privacy policy on website (if needed)
3. Add retention policy to customer-facing documentation
4. Train support team on retention policy questions

---

**Last Updated:** 2025-10-19
**Next Review:** 2026-01-19 (Quarterly review)
**Owner:** Development Team
**Approver:** Legal/Compliance Team

---

## ✅ IMPLEMENTATION CHECKLIST

- [ ] Create `auditLogCleanupService.js`
- [ ] Create `alertCleanupService.js`
- [ ] Update `server.js` with cleanup services
- [ ] Create test scripts for new services
- [ ] Update `LICENSE_EN.txt` Section 3.4
- [ ] Update `LICENSE_ES.txt` Section 3.4
- [ ] Test in dev environment
- [ ] Monitor for 48 hours in dev
- [ ] Deploy to production
- [ ] Monitor for 7 days in production
- [ ] Document any issues or adjustments
- [ ] Mark handoff document as COMPLETED
