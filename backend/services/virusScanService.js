import NodeClam from 'clamscan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Virus Scanning Service using ClamAV
 * Provides secure file scanning for malware detection
 */
class VirusScanService {
  constructor() {
    this.clam = null;
    this.initialized = false;
    this.initializeScanner();
  }

  /**
   * Initialize ClamAV scanner
   */
  async initializeScanner() {
    try {
      // ClamAV configuration
      // ClamAV is now enabled with correct socket path
      const useMockScanner = false; // Set to true to disable ClamAV

      const clamConfig = {
        removeInfected: false, // Don't auto-remove, log instead
        quarantineInfected: false, // We'll handle quarantine manually
        debugMode: false, // Disable debug mode to suppress ClamAV errors

        // Try different ClamAV paths
        clamdscan: {
          socket: '/var/run/clamd.scan/clamd.sock', // Correct socket path for RHEL
          host: '127.0.0.1',
          port: 3310,
          timeout: 30000,
          localFallback: true, // Enable fallback to clamscan if daemon fails
          path: '/usr/bin/clamdscan',
          config_file: '/etc/clamd.d/scan.conf', // Correct config path for RHEL
          multiscan: true,
          reloadDb: false,
          active: !useMockScanner // Disable when using mock scanner
        },

        clamscan: {
          path: '/usr/bin/clamscan',
          db: '/var/lib/clamav',
          scanArchives: true,
          active: !useMockScanner // Disable when using mock scanner
        },

        preference: 'clamdscan' // Prefer daemon for performance
      };

      console.log('🦠 Initializing virus scanner...');
      this.clam = await new NodeClam().init(clamConfig);
      this.initialized = true;
      console.log('✅ Virus scanner initialized successfully');

      // Test scanner functionality (scanFile is available even if scanBuffer isn't)
      try {
        if (typeof this.clam.scanFile === 'function') {
          console.log('🧪 ClamAV scanFile method available - ready to scan uploads');
        } else {
          throw new Error('scanFile method not available');
        }
      } catch (testError) {
        console.warn('⚠️ ClamAV test failed, falling back to mock scanner:', testError.message);
        this.initialized = false;
      }

    } catch (error) {
      console.warn('⚠️ ClamAV not available, using mock scanner for development:', error.message);
      this.initialized = false; // Will use mock scanning
    }
  }

  /**
   * Scan a file for viruses
   * @param {string} filePath - Path to file to scan
   * @param {object} fileInfo - File metadata
   * @returns {object} Scan result
   */
  async scanFile(filePath, fileInfo = {}) {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`🔍 Starting virus scan: ${scanId} for file: ${fileInfo.originalName || path.basename(filePath)}`);

    let scanResult = {
      scanId,
      filePath,
      fileName: fileInfo.originalName || path.basename(filePath),
      fileSize: fileInfo.size || 0,
      isInfected: false,
      virusName: null,
      scanTime: 0,
      scanEngine: 'unknown',
      scanSuccess: false,
      errorMessage: null,
      timestamp: new Date().toISOString()
    };

    try {
      if (this.initialized && this.clam) {
        // Use real ClamAV scanner
        console.log(`🦠 Running ClamAV scan on: ${filePath}`);
        const result = await this.clam.scanFile(filePath);

        scanResult.isInfected = result.isInfected || false;
        scanResult.virusName = result.viruses && result.viruses.length > 0 ? result.viruses.join(', ') : null;
        scanResult.scanEngine = 'ClamAV';
        scanResult.scanSuccess = true;

        if (scanResult.isInfected) {
          console.log(`🚨 VIRUS DETECTED: ${scanResult.virusName} in file: ${scanResult.fileName}`);
        } else {
          console.log(`✅ File clean: ${scanResult.fileName}`);
        }

      } else {
        // Use mock scanner for development/testing
        console.log(`🧪 Using mock virus scanner for: ${filePath}`);
        scanResult = await this.mockScan(filePath, fileInfo);
      }

      scanResult.scanTime = Date.now() - startTime;

      // Log scan result to database
      await this.logScanResult(scanResult, fileInfo);

      return scanResult;

    } catch (error) {
      scanResult.scanSuccess = false;
      scanResult.errorMessage = error.message;
      scanResult.scanTime = Date.now() - startTime;

      console.error(`❌ Virus scan failed for ${scanResult.fileName}:`, error);

      // Log failed scan to database
      await this.logScanResult(scanResult, fileInfo);

      return scanResult;
    }
  }

  /**
   * Mock virus scanner for development/testing
   * @param {string} filePath - File path
   * @param {object} fileInfo - File metadata
   * @returns {object} Mock scan result
   */
  async mockScan(filePath, fileInfo) {
    // Simulate scan time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const fileName = (fileInfo.originalName || path.basename(filePath)).toLowerCase();

    // Mock virus detection for testing (files with 'virus' in name)
    const isInfected = fileName.includes('virus') || fileName.includes('malware');

    return {
      isInfected,
      virusName: isInfected ? 'Test.Virus.MockDetection' : null,
      scanEngine: 'MockScanner',
      scanSuccess: true,
      errorMessage: null
    };
  }

  /**
   * Log scan result to database
   * @param {object} scanResult - Scan result object
   * @param {object} fileInfo - File metadata
   */
  async logScanResult(scanResult, fileInfo = {}) {
    try {
      const query = `
        INSERT INTO t_file_virus_scan_log (
          client_file_id, scan_engine, scan_version, scan_started_at,
          scan_completed_at, scan_duration_ms, scan_status,
          threats_found, threat_names, scan_raw_output,
          action_taken, action_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      const values = [
        fileInfo.fileId || null,
        scanResult.scanEngine || 'mock',
        scanResult.scanVersion || '1.0',
        new Date(),
        new Date(),
        scanResult.scanTime || 0,
        scanResult.scanSuccess ? (scanResult.isInfected ? 'infected' : 'clean') : 'error',
        scanResult.isInfected ? 1 : 0,
        scanResult.virusName ? [scanResult.virusName] : null,
        scanResult.errorMessage || null,
        scanResult.isInfected ? 'quarantine' : 'none',
        scanResult.isInfected ? `Virus detected: ${scanResult.virusName}` : null
      ];

      const pool = await getPool();
      await pool.query(query, values);
      console.log(`📝 Logged virus scan result: ${scanResult.scanId}`);

    } catch (error) {
      console.error('❌ Failed to log virus scan result:', error);
    }
  }

  /**
   * Quarantine infected file
   * @param {string} filePath - Path to infected file
   * @param {object} scanResult - Scan result
   */
  async quarantineFile(filePath, scanResult) {
    try {
      const quarantineDir = path.join(__dirname, '..', 'quarantine');

      // Create quarantine directory if it doesn't exist
      try {
        await fs.access(quarantineDir);
      } catch {
        await fs.mkdir(quarantineDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      const quarantinePath = path.join(quarantineDir, `${scanResult.scanId}_${fileName}`);

      // Move file to quarantine
      await fs.rename(filePath, quarantinePath);

      console.log(`🔒 File quarantined: ${fileName} -> ${quarantinePath}`);

      return quarantinePath;

    } catch (error) {
      console.error('❌ Failed to quarantine file:', error);
      throw error;
    }
  }

  /**
   * Delete infected file
   * @param {string} filePath - Path to infected file
   */
  async deleteInfectedFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted infected file: ${filePath}`);
    } catch (error) {
      console.error('❌ Failed to delete infected file:', error);
      throw error;
    }
  }

  /**
   * Get virus scan statistics
   * @param {string} businessId - Business ID (optional)
   * @returns {object} Scan statistics
   */
  async getScanStatistics(businessId = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_scans,
          COUNT(CASE WHEN is_infected THEN 1 END) as infected_files,
          COUNT(CASE WHEN scan_success THEN 1 END) as successful_scans,
          AVG(scan_time_ms) as avg_scan_time,
          MAX(created_at) as last_scan
        FROM t_file_virus_scan_log
      `;

      const values = [];

      if (businessId) {
        query += ' WHERE business_id = $1';
        values.push(businessId);
      }

      const result = await pool.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('❌ Failed to get scan statistics:', error);
      return null;
    }
  }
}

// Create singleton instance
const virusScanService = new VirusScanService();

export default virusScanService;