#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backendDir = __dirname;
const inputFile = process.env.FBC_REPORT_JSON || path.join(backendDir, 'fbc-report-sample.json');
const outputFile = process.env.FBC_REPORT_PDF || path.join(backendDir, 'fbc-report-sample.pdf');
const tempHtmlFile = path.join(backendDir, 'fbc-report-sample.print.html');

function resolveEdgePath() {
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  for (const edgePath of edgePaths) {
    if (fs.existsSync(edgePath)) {
      return edgePath;
    }
  }

  throw new Error('Microsoft Edge not found. Please install Edge or provide a compatible headless browser.');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRows(report) {
  const rows = [];
  for (const category of report.resultsByCategory || []) {
    for (const result of category.results || []) {
      rows.push(`
        <tr>
          <td>${escapeHtml(category.categoryDisplayName || category.category)}</td>
          <td>${escapeHtml(result.testCode)}</td>
          <td>${escapeHtml(result.testName)}</td>
          <td>${escapeHtml(result.value)}</td>
          <td>${escapeHtml(result.referenceRange || '-')}</td>
          <td>${escapeHtml(result.unit || '-')}</td>
          <td>${escapeHtml(result.flag || '-')}</td>
        </tr>
      `);
    }
  }

  return rows.join('');
}

function buildHtml(report) {
  const rowsHtml = buildRows(report);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FBC Report</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1, h2, h3 { margin: 0; }
    .header { margin-bottom: 10px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 14px; }
    .card { border: 1px solid #ccc; padding: 8px; border-radius: 4px; }
    .label { color: #444; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d3d3d3; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-size: 11px; }
    .foot { margin-top: 14px; font-size: 10px; color: #555; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Hobour Diagnostics</h2>
    <h3>FBC Sample Report</h3>
  </div>

  <div class="meta">
    <div class="card">
      <div><span class="label">Patient:</span> ${escapeHtml(report.patientInfo?.fullName || '-')}</div>
      <div><span class="label">Patient ID:</span> ${escapeHtml(report.patientInfo?.patientId || '-')}</div>
      <div><span class="label">Age/Gender:</span> ${escapeHtml(report.patientInfo?.age || '-')}/${escapeHtml(report.patientInfo?.gender || '-')}</div>
    </div>
    <div class="card">
      <div><span class="label">Order Number:</span> ${escapeHtml(report.orderInfo?.orderNumber || '-')}</div>
      <div><span class="label">Order Date:</span> ${escapeHtml(report.orderInfo?.orderDate || '-')}</div>
      <div><span class="label">Reported At:</span> ${escapeHtml(report.orderInfo?.reportedAt || '-')}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Code</th>
        <th>Test Name</th>
        <th>Result</th>
        <th>Reference Range</th>
        <th>Unit</th>
        <th>Flag</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="foot">
    Generated from API report payload.
  </div>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input report JSON not found: ${inputFile}`);
  }

  const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const html = buildHtml(report);
  fs.writeFileSync(tempHtmlFile, html, 'utf8');

  const edgePath = resolveEdgePath();
  const htmlUrl = `file:///${tempHtmlFile.replace(/\\/g, '/')}`;

  execFileSync(edgePath, [
    '--headless',
    '--disable-gpu',
    `--print-to-pdf=${outputFile}`,
    htmlUrl,
  ], { stdio: 'ignore' });

  console.log(`PDF generated: ${outputFile}`);
}

try {
  main();
} catch (error) {
  console.error('Failed to generate PDF.');
  console.error(error.message);
  process.exit(1);
}