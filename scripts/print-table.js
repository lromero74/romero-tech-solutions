#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env (we're running from backend directory)
dotenv.config({ path: '.env' });

// Color codes for prettier output
const colors = {
  header: '\x1b[36m\x1b[1m', // Cyan bold
  border: '\x1b[37m',        // White
  data: '\x1b[0m',           // Reset
  number: '\x1b[33m',        // Yellow
  null: '\x1b[90m',          // Gray
  reset: '\x1b[0m'
};

function formatValue(value, maxWidth) {
  if (value === null || value === undefined) {
    return colors.null + 'NULL' + colors.reset;
  }

  let str = String(value);

  // Color numbers
  if (typeof value === 'number') {
    str = colors.number + str + colors.reset;
  }

  // Truncate if too long, but preserve color codes
  if (str.length > maxWidth) {
    const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
    if (plainStr.length > maxWidth) {
      const truncated = plainStr.substring(0, maxWidth - 3) + '...';
      if (typeof value === 'number') {
        return colors.number + truncated + colors.reset;
      }
      return truncated;
    }
  }

  return str;
}

function padString(str, width) {
  // Remove color codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = width - plainStr.length;
  return str + ' '.repeat(Math.max(0, padding));
}

function printTable(rows, tableName) {
  if (!rows.length) {
    console.log(`\n${colors.header}Table: ${tableName}${colors.reset}`);
    console.log('No data found.');
    return;
  }

  const headers = Object.keys(rows[0]);

  // Calculate column widths
  const columnWidths = headers.map(header => {
    const headerWidth = header.length;
    const dataWidth = Math.max(...rows.map(row => {
      const value = row[header];
      const str = value === null ? 'NULL' : String(value);
      return Math.min(str.length, 50); // Max width of 50 chars
    }));
    return Math.min(Math.max(headerWidth, dataWidth), 50);
  });

  // Print table name
  console.log(`\n${colors.header}Table: ${tableName} (${rows.length} rows)${colors.reset}`);

  // Print top border
  const topBorder = '┌' + columnWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  console.log(colors.border + topBorder + colors.reset);

  // Print headers
  const headerRow = '│ ' + headers.map((header, i) =>
    padString(colors.header + header + colors.reset, columnWidths[i])
  ).join(' │ ') + ' │';
  console.log(headerRow);

  // Print header separator
  const headerSep = '├' + columnWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  console.log(colors.border + headerSep + colors.reset);

  // Print data rows
  rows.forEach(row => {
    const dataRow = '│ ' + headers.map((header, i) =>
      padString(formatValue(row[header], columnWidths[i]), columnWidths[i])
    ).join(' │ ') + ' │';
    console.log(dataRow);
  });

  // Print bottom border
  const bottomBorder = '└' + columnWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  console.log(colors.border + bottomBorder + colors.reset);
}

async function main() {
  const tableName = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3]) : null;

  if (!tableName) {
    console.log('Usage: node print-table.js <table_name> [limit]');
    console.log('Example: node print-table.js users 10');
    process.exit(1);
  }

  let connection;
  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'company_management',
      port: process.env.DB_PORT || 3306
    });

    console.log(`${colors.header}Connected to database: ${process.env.DB_NAME || 'company_management'}${colors.reset}`);

    // Build query
    let query = `SELECT * FROM \`${tableName}\``;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    // Execute query
    const [rows] = await connection.execute(query);

    // Print the table
    printTable(rows, tableName);

  } catch (error) {
    console.error('Error:', error.message);

    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('\nAvailable tables:');
      try {
        const [tables] = await connection.execute('SHOW TABLES');
        tables.forEach(table => {
          const tableName = Object.values(table)[0];
          console.log(`  - ${tableName}`);
        });
      } catch (showError) {
        console.log('Could not fetch table list.');
      }
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});

main().catch(console.error);