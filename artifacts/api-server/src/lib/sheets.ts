import { google } from "googleapis";
import { logger } from "./logger";
import { Config } from "../models/Config";

const MASTER_SHEET_ID_KEY = "masterSheetId";

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
  "photo", "signature", "tenthMarksheet", "twelfthMarksheet",
  "graduationMarksheet", "pgMarksheet", "incomeCertificate",
  "casteCertificate", "domicileCertificate", "affidavit",
  "aadhaarFront", "aadhaarBack",
];

const FILE_LABELS: Record<string, string> = {
  photo: "Photo", signature: "Signature",
  tenthMarksheet: "10th Marksheet", twelfthMarksheet: "12th Marksheet",
  graduationMarksheet: "Graduation Marksheet", pgMarksheet: "PG Marksheet",
  incomeCertificate: "Income Certificate", casteCertificate: "Caste Certificate",
  domicileCertificate: "Domicile Certificate", affidavit: "Affidavit",
  aadhaarFront: "Aadhaar Front", aadhaarBack: "Aadhaar Back",
};

const HEADERS = [
  "S.No", "Name", "Father's Name", "Date of Birth",
  "Address", "Aadhaar Number", "Mobile", "Email",
  "Department", "Course", "Subjects",
  "10th Pass Year", "10th School", "10th Board",
  "12th Pass Year", "12th School", "12th Board",
  ...FILE_SLOTS.map((s) => FILE_LABELS[s]),
  "Created At",
];

export function sanitizeTabName(name: string): string {
  return name
    .replace(/[\\/:*?[\]]/g, " ")
    .trim()
    .substring(0, 100)
    || "Sheet";
}

function buildFileUrl(baseUrl: string, fileId: string): string {
  return `${baseUrl}/api/files/${fileId}`;
}

function studentToRow(student: any, baseUrl: string): any[] {
  const fileCells = FILE_SLOTS.map((slot) => {
    const f = student.files?.[slot];
    if (!f?.fileId) return "";
    const url = buildFileUrl(baseUrl, f.fileId);
    return `=HYPERLINK("${url}","${FILE_LABELS[slot]}")`;
  });

  return [
    student.googleSheetRowIndex ?? "",
    student.name ?? "",
    student.fathersName ?? "",
    student.dateOfBirth ?? "",
    student.address ?? "",
    student.aadhaarNumber ?? "",
    student.mobile ?? "",
    student.email ?? "",
    student.department ?? "",
    student.course ?? "",
    student.subjects ?? "",
    student.tenthPassYear ?? "",
    student.tenthSchoolName ?? "",
    student.tenthBoard ?? "",
    student.twelfthPassYear ?? "",
    student.twelfthSchoolName ?? "",
    student.twelfthBoard ?? "",
    ...fileCells,
    new Date(student.createdAt).toLocaleString("en-IN"),
  ];
}

async function getOrCreateMasterSheet(): Promise<{ id: string; url: string }> {
  const cfg = await Config.findOne({ key: MASTER_SHEET_ID_KEY });
  if (cfg) {
    return { id: cfg.value, url: `https://docs.google.com/spreadsheets/d/${cfg.value}` };
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Student Records — Master Sheet" },
      sheets: [{ properties: { title: "Overview" } }],
    },
  });
  const spreadsheetId = res.data.spreadsheetId!;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Overview!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["Teacher", "Created At"]] },
  });

  const adminEmail = process.env["SHEET_ADMIN_EMAIL"];
  if (adminEmail) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: "user", role: "writer", emailAddress: adminEmail },
      sendNotificationEmail: false,
    });
  }

  await Config.create({ key: MASTER_SHEET_ID_KEY, value: spreadsheetId });
  logger.info({ spreadsheetId }, "Created master Google Sheet");
  return { id: spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

export async function getMasterSheetUrl(): Promise<string | null> {
  const cfg = await Config.findOne({ key: MASTER_SHEET_ID_KEY });
  if (!cfg) return null;
  return `https://docs.google.com/spreadsheets/d/${cfg.value}`;
}

export async function addTeacherTab(teacherName: string): Promise<{ spreadsheetId: string; tabName: string; url: string }> {
  const master = await getOrCreateMasterSheet();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const tabName = sanitizeTabName(teacherName);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: master.id });
  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title?.toLowerCase() === tabName.toLowerCase()
  );

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: master.id,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: tabName } } },
        ],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: master.id,
      range: `'${tabName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });

    const metaAfter = await sheets.spreadsheets.get({ spreadsheetId: master.id });
    const addedSheet = metaAfter.data.sheets?.find(
      (s) => s.properties?.title?.toLowerCase() === tabName.toLowerCase()
    );
    const sheetId = addedSheet?.properties?.sheetId ?? 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: master.id,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  backgroundColor: { red: 0.13, green: 0.37, blue: 0.87 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
        ],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: master.id,
      range: "Overview!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[teacherName, new Date().toLocaleString("en-IN")]] },
    });
  }

  logger.info({ teacherName, tabName, spreadsheetId: master.id }, "Added teacher tab to master sheet");
  const url = `${master.url}#gid=0`;
  return { spreadsheetId: master.id, tabName, url: master.url };
}

export async function appendStudentRow(
  student: any,
  spreadsheetId: string,
  tabName: string,
  baseUrl: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const safeTab = sanitizeTabName(tabName);

  const meta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${safeTab}'!A:A`,
  });
  const rowCount = meta.data.values?.length ?? 1;
  const sNo = rowCount;

  student.googleSheetRowIndex = sNo;
  student.createdAt = student.createdAt ?? new Date();

  const row = studentToRow(student, baseUrl);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${safeTab}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  return rowCount + 1;
}

export async function updateStudentRow(
  student: any,
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  baseUrl: string
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const safeTab = sanitizeTabName(tabName);

  const row = studentToRow(student, baseUrl);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${safeTab}'!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function deleteStudentRow(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const safeTab = sanitizeTabName(tabName);
  const sheetObj = meta.data.sheets?.find(
    (s) => s.properties?.title?.toLowerCase() === safeTab.toLowerCase()
  );
  const sheetId = sheetObj?.properties?.sheetId ?? 0;

  const totalColumns = HEADERS.length;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: totalColumns,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { strikethrough: true },
              },
            },
            fields: "userEnteredFormat.textFormat.strikethrough",
          },
        },
      ],
    },
  });
}
