import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { EXCEL_MIME_TYPE } from '../lib/reportExport';

type WorkbookPayload = {
  fileName: string;
  bytes: Uint8Array;
};

export async function shareExcelReport(payload: WorkbookPayload) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('REPORT_SHARING_UNAVAILABLE');
  }

  const reportFile = new File(Paths.cache, payload.fileName);
  reportFile.create({ overwrite: true, intermediates: true });
  reportFile.write(payload.bytes);

  await Sharing.shareAsync(reportFile.uri, {
    dialogTitle: 'Export Excel report',
    mimeType: EXCEL_MIME_TYPE,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });

  return reportFile.uri;
}
