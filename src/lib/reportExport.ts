import { strToU8, zipSync } from 'fflate';
import { ReportRow, Ticket } from '../types';

export const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ReportLike = {
  count: number;
  revenue: number;
} | null;

type Cell =
  | { kind: 'text'; value: string; style?: number }
  | { kind: 'number'; value: number; style?: number }
  | { kind: 'date'; value: string; style?: number };

type Sheet = {
  name: string;
  rows: Cell[][];
  widths: number[];
  freezeHeader?: boolean;
  autoFilter?: boolean;
};

const text = (value: unknown, style?: number): Cell => ({ kind: 'text', value: String(value ?? ''), style });
const number = (value: number, style?: number): Cell => ({ kind: 'number', value, style });
const date = (value: string): Cell => ({ kind: 'date', value, style: 4 });

function xmlEscape(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelDateSerial(isoValue: string) {
  const timestamp = Date.parse(isoValue);
  return Number.isFinite(timestamp) ? timestamp / 86_400_000 + 25_569 : 0;
}

function buildCellXml(cell: Cell, rowIndex: number, columnIndex: number) {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
  const style = cell.style === undefined ? '' : ` s="${cell.style}"`;
  if (cell.kind === 'number') {
    return `<c r="${reference}"${style}><v>${Number.isFinite(cell.value) ? cell.value : 0}</v></c>`;
  }
  if (cell.kind === 'date') {
    return `<c r="${reference}"${style}><v>${excelDateSerial(cell.value)}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
}

function buildSheetXml(sheet: Sheet) {
  const lastColumn = columnName(Math.max(0, sheet.widths.length - 1));
  const lastRow = Math.max(1, sheet.rows.length);
  const columns = sheet.widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const rows = sheet.rows
    .map((row, rowIndex) => `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ''}>${row.map((cell, columnIndex) => buildCellXml(cell, rowIndex, columnIndex)).join('')}</row>`)
    .join('');
  const frozenPane = sheet.freezeHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const autoFilter = sheet.autoFilter && sheet.rows.length > 0
    ? `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  ${frozenPane}
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${rows}</sheetData>
  ${autoFilter}
</worksheet>`;
}

function makeReportRows(params: {
  tickets: Ticket[];
  rows?: ReportRow[];
}) {
  const header = [
    'Receipt Number', 'Barcode', 'Organization', 'Location',
    'Vehicle Number', 'Vehicle Type', 'Parking Fee (PKR)', 'Issued At', 'Operator',
    'Payment Method', 'Payment Status', 'Print Status', 'Sync Status', 'Reprint Count',
  ].map(value => text(value, 1));

  if (params.rows?.length) {
    return [header, ...params.rows.map(row => [
      text(row.receiptNumber), text(row.barcodeValue), text(row.organizationName),
      text(row.locationName), text(row.vehicleNumber),
      text(row.vehicleType), number(row.vehicleRate, 3), date(row.issuedAt),
      text(row.operatorName), text(row.paymentMethod), text(row.paymentStatus),
      text(row.printStatus), text(row.syncStatus), number(row.reprintCount),
    ])];
  }

  return [header, ...params.tickets.map(ticket => [
    text(ticket.ticketNumber), text(ticket.ticketNumber), text(''),
    text(ticket.locationName), text(ticket.vehicleNumber), text(ticket.vehicleType),
    number(ticket.amount, 3), date(ticket.createdAt), text(''), text(ticket.paymentMethod),
    text(ticket.paymentStatus), text(''), text(''), number(0),
  ])];
}

function buildWorkbook(sheets: Sheet[], generatedAt: string) {
  const sheetEntries = sheets.map((sheet, index) =>
    `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join('');
  const sheetRelationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  const sheetOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetOverrides}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'),
    'docProps/app.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Valet POS</Application><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(sheet => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Valet POS</dc:creator><cp:lastModifiedBy>Valet POS</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(generatedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(generatedAt)}</dcterms:modified></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetEntries}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF0F172A"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE3ED"/></left><right style="thin"><color rgb="FFDDE3ED"/></right><top style="thin"><color rgb="FFDDE3ED"/></top><bottom style="thin"><color rgb="FFDDE3ED"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(buildSheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

export function buildReportExport(params: {
  locationName: string;
  tickets: Ticket[];
  rows?: ReportRow[];
  report: ReportLike;
  generatedAt: string;
}) {
  const detailedRows = params.rows?.length ? params.rows : undefined;
  const ticketCount = params.report?.count ?? (detailedRows?.length ?? params.tickets.length);
  const revenue = params.report?.revenue
    ?? (detailedRows
      ? detailedRows.reduce((sum, row) => sum + row.vehicleRate, 0)
      : params.tickets.reduce((sum, ticket) => sum + ticket.amount, 0));
  const sheets: Sheet[] = [
    {
      name: 'Summary',
      widths: [24, 28],
      rows: [
        [text('Daily Report', 1), text('Valet POS', 1)],
        [text('Generated At', 2), date(params.generatedAt)],
        [text('Location', 2), text(params.locationName)],
        [text('Tickets', 2), number(ticketCount)],
        [text('Revenue (PKR)', 2), number(revenue, 3)],
      ],
    },
    {
      name: 'Receipts',
      widths: [20, 22, 26, 24, 20, 15, 15, 22, 24, 18, 18, 16, 16, 15],
      rows: makeReportRows(params),
      freezeHeader: true,
      autoFilter: true,
    },
  ];

  return {
    fileName: `valet-report-${params.generatedAt.slice(0, 10)}.xlsx`,
    mimeType: EXCEL_MIME_TYPE,
    bytes: buildWorkbook(sheets, params.generatedAt),
  };
}
