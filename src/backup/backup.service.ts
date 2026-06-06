import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

export interface BackupResult {
  filename: string;
  size: number;
  collections: number;
  documents: number;
  duration: number;
  createdAt: string;
}

export interface BackupStatus {
  lastBackup: BackupResult | null;
  totalBackups: number;
  totalSizeBytes: number;
  diskAvailable: boolean;
  backupDir: string;
  atlasEnabled: boolean;
  atlasNote: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  private readonly retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
  private isRunning = false;

  // All collections to back up
  private readonly collections = [
    'orders',
    'order_tests',
    'patients',
    'patient_notes',
    'results',
    'samples',
    'payments',
    'test_catalog',
    'test_panels',
    'test_reference_ranges',
    'expenditures',
    'cash_reconciliations',
    'cash_reconciliations',
    'machines',
    'machine_maintenance',
    'qc_samples',
    'qc_results',
    'panel_interpretations',
    'report_templates',
    'critical_result_notifications',
    'communication_logs',
    'audit_logs',
    'doctors',
    'profiles',
    'user_roles',
    'external_api_clients',
    'id_sequences',
    'price_history',
  ];

  constructor(@InjectConnection() private connection: Connection) {}

  async onModuleInit() {
    await this.ensureBackupDir();
    this.logger.log(`Backup service initialized. Directory: ${this.backupDir}`);
    this.logger.log(`Daily backup scheduled at midnight (00:00). Retention: ${this.retentionDays} days.`);
  }

  private async ensureBackupDir() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (err: any) {
      this.logger.error(`Failed to create backup directory: ${err.message}`);
    }
  }

  /**
   * Daily backup at midnight (00:00)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledDailyBackup() {
    if (this.isRunning) {
      this.logger.warn('Backup already in progress, skipping scheduled run');
      return;
    }
    this.logger.log('Starting scheduled daily backup...');
    try {
      const result = await this.runBackup();
      this.logger.log(
        `Backup complete: ${result.filename} (${this.formatBytes(result.size)}, ${result.documents} docs in ${result.duration}ms)`,
      );
      await this.cleanupOldBackups();
    } catch (err: any) {
      this.logger.error(`Scheduled backup failed: ${err.message}`, err.stack);
    }
  }

  /**
   * Run a backup now (manual trigger)
   */
  async runBackup(): Promise<BackupResult> {
    if (this.isRunning) {
      throw new Error('Backup already in progress');
    }
    this.isRunning = true;
    const startTime = Date.now();

    try {
      await this.ensureBackupDir();

      const db = this.connection.db;
      if (!db) throw new Error('No database connection');

      const exportData: Record<string, any> = {
        meta: {
          database: db.databaseName,
          exportedAt: new Date().toISOString(),
          app: 'carefam-lab',
          version: '1.0',
        },
        collections: {},
      };

      let totalDocs = 0;

      for (const collName of this.collections) {
        try {
          const docs = await db.collection(collName).find({}).toArray();
          if (docs.length > 0) {
            exportData.collections[collName] = docs;
            totalDocs += docs.length;
            this.logger.debug(`  ${collName}: ${docs.length} documents`);
          } else {
            this.logger.debug(`  ${collName}: empty (skipped)`);
          }
        } catch (err: any) {
          this.logger.warn(`  Failed to export ${collName}: ${err.message}`);
        }
      }

      const json = JSON.stringify(exportData);
      const compressed = await gzip(Buffer.from(json, 'utf-8'));

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup-${timestamp}.json.gz`;
      const filepath = path.join(this.backupDir, filename);

      await fs.writeFile(filepath, compressed);

      const result: BackupResult = {
        filename,
        size: compressed.length,
        collections: Object.keys(exportData.collections).length,
        documents: totalDocs,
        duration: Date.now() - startTime,
        createdAt: new Date().toISOString(),
      };

      this.logger.log(`Backup created: ${filename} (${this.formatBytes(result.size)})`);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Delete backup files older than retentionDays
   */
  async cleanupOldBackups() {
    try {
      const files = await this.listBackupFiles();
      const now = Date.now();
      const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(this.backupDir, file.filename);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtime.getTime() < cutoff) {
            await fs.unlink(filePath);
            deleted++;
            this.logger.log(`Deleted old backup: ${file.filename}`);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to delete old backup ${file.filename}: ${err.message}`);
        }
      }

      if (deleted > 0) {
        this.logger.log(`Cleanup complete: deleted ${deleted} old backup(s)`);
      }
    } catch (err: any) {
      this.logger.error(`Cleanup failed: ${err.message}`);
    }
  }

  /**
   * List all backup files
   */
  async listBackupFiles(): Promise<BackupResult[]> {
    try {
      await this.ensureBackupDir();
      const files = await fs.readdir(this.backupDir);
      const backups: BackupResult[] = [];

      for (const filename of files) {
        if (!filename.endsWith('.json.gz')) continue;
        const filePath = path.join(this.backupDir, filename);
        const stat = await fs.stat(filePath);

        backups.push({
          filename,
          size: stat.size,
          collections: 0,
          documents: 0,
          duration: 0,
          createdAt: stat.mtime.toISOString(),
        });
      }

      backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return backups;
    } catch (err: any) {
      this.logger.error(`Failed to list backups: ${err.message}`);
      return [];
    }
  }

  /**
   * Get backup status and stats
   */
  async getStatus(): Promise<BackupStatus> {
    const files = await this.listBackupFiles();
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const lastBackup = files[0] || null;

    return {
      lastBackup,
      totalBackups: files.length,
      totalSizeBytes: totalSize,
      diskAvailable: true,
      backupDir: this.backupDir,
      atlasEnabled: false,
      atlasNote: 'Atlas native backups are only available on M10+ paid clusters. This free M0 cluster uses local JSON exports for backup. Configure AWS S3 upload for offsite backups on production.',
    };
  }

  /**
   * Read a backup file as a buffer for download
   */
  async getBackupBuffer(filename: string): Promise<Buffer> {
    if (!filename.endsWith('.json.gz') || filename.includes('/') || filename.includes('..')) {
      throw new Error('Invalid filename');
    }
    const filePath = path.join(this.backupDir, filename);
    return fs.readFile(filePath);
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(filename: string): Promise<void> {
    if (!filename.endsWith('.json.gz') || filename.includes('/') || filename.includes('..')) {
      throw new Error('Invalid filename');
    }
    const filePath = path.join(this.backupDir, filename);
    await fs.unlink(filePath);
    this.logger.log(`Backup deleted: ${filename}`);
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
