import { google } from "googleapis";
import { logger } from "./logger";

const SHEET_ADMIN_EMAIL = process.env["SHEET_ADMIN_EMAIL"] ?? "";
const SHEET_COMMENTOR_EMAIL = process.env["SHEET_COMMENTOR_EMAIL"] ?? "";

function getAuth() {
  const b64 = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

const FILE_SLOTS = [
  "photo",
  "signature",
  "tenthMarksheet",
  "twelfthMarksheet",
  "graduationMarksheet",
  "pgMarksheet",
  "incomeCertificate",
  "casteCertificate",
  "domicileCertificate",
  "affidavit",
  "aadhaarFront",
  "aadhaarBack",
];

const FILE_LABELS: Record<string, string> = {
  photo: "Photo",
  signature: "Signature",
  tenthMarksheet: "10th Marksheet",
  twelfthMarksheet: "12th Marksheet",
  graduationMarksheet: "Graduation Marksheet",
  pgMarksheet: "PG Marksheet",
  incomeCertificate: "Income Certificate",
  casteCertificate: "Caste Certificate",
  domicileCertificate: "Domicile Certificate",
  affidavit: "Affidavit",
  aadhaarFront: "Aadhaar Front",
  aadhaarBack: "Aadhaar Back",
};

const HEADERS = [
  "S.No",
  "Name",
  "Father's Name",
  "Date of Birth",
  "10th Pass Year",
  "12th Pass Year",
  "Mobile",
  "Email",
  ...FILE_SLOTS.map((s) => FILE_LABELS[s]),
  "Created At",
];

function buildFileUrl(baseUrl: string, fileId: string): string {
  return `${baseUrl}/api/files/${fileId}`;
}

function studentToRow(student: any, baseUrl: string): any[] {
  const fileCells = FILE_SLOTS.map((slot) => {
    const f = student.files?.[slot];
    if (!f?.fileId) return "";
    const url = buildFileUrl(baseUrl, f.fileId);
    return { formula: `=HYPERLINK("${url}","${FILE_LABELS[slot]}")` };
  });

  return [
    student.googleSheetRowIndex ?? "",
    student.name,
    student.fathersName,
    student.dateOfBirth,
    student.tenthPassYear,
    student.twelfthPassYear,
    student.mobile,
    student.email,
    ...fileCells,
    new Date(student.createdAt).toLocaleString("en-IN"),
  ];
}

export async function createSheetForTeacher(teacherName: string): Promise<{ id: string; url: string }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `${teacherName} — Student Records` },
      sheets: [{ properties: { title: "Students" } }],
    },
  });

  const spreadsheetId = res.data.spreadsheetId!;

  // Write header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Students!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [HEADERS] },
  });

  // Format header row bold
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });

  // Share with admin (writer)
  if (SHEET_ADMIN_EMAIL) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: "user", role: "writer", emailAddress: SHEET_ADMIN_EMAIL },
      sendNotificationEmail: false,
    });
  }

  // Share with commentor
  if (SHEET_COMMENTOR_EMAIL) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: "user", role: "commenter", emailAddress: SHEET_COMMENTOR_EMAIL },
      sendNotificationEmail: false,
    });
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  logger.info({ spreadsheetId, teacherName }, "Created Google Sheet");
  return { id: spreadsheetId, url };
}

export async function appendStudentRow(
  student: any,
  spreadsheetId: string,
  baseUrl: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get current row count to determine S.No
  const meta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Students!A:A",
  });
  const rowCount = (meta.data.values?.length ?? 1);
  const sNo = rowCount; // header is row 1, so first student is row 2 → sNo = 1

  // Temporarily set row index for URL building
  student.googleSheetRowIndex = sNo;
  student.createdAt = student.createdAt ?? new Date();

  const row = studentToRow(student, baseUrl);

  // Replace formula objects with actual formula strings
  const formattedRow = row.map((cell) =>
    typeof cell === "object" && cell?.formula ? cell.formula : cell
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Students!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [formattedRow] },
  });

  return rowCount + 1; // actual sheet row number (1-based, header = row 1)
}

export async function updateStudentRow(
  student: any,
  spreadsheetId: string,
  rowIndex: number,
  baseUrl: string
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const row = studentToRow(student, baseUrl);
  const formattedRow = row.map((cell) =>
    typeof cell === "object" && cell?.formula ? cell.formula : cell
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Students!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [formattedRow] },
  });
}

export async function deleteStudentRow(
  spreadsheetId: string,
  rowIndex: number
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}
