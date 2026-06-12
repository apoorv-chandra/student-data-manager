import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public diagnostic — checks Google service account key format without revealing it
router.get("/check-google-creds", (_req, res) => {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw || !raw.trim()) {
    res.status(500).json({ ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON is not set or empty" });
    return;
  }
  try {
    const trimmed = raw.trim();
    let jsonStr: string;
    let encoding: string;
    if (trimmed.startsWith("{")) {
      jsonStr = trimmed;
      encoding = "raw-json";
    } else {
      jsonStr = Buffer.from(trimmed, "base64").toString("utf-8");
      encoding = "base64";
    }
    const creds = JSON.parse(jsonStr);
    const rawKey: string = creds.private_key ?? "";
    // Count literal \n vs real newlines before fix
    const literalBackslashN = (rawKey.match(/\\n/g) ?? []).length;
    const fixedKey = rawKey.replace(/\\n/g, "\n");
    const realNewlines = (fixedKey.match(/\n/g) ?? []).length;
    // Actually try to get a Google access token
    let authTest: any = { attempted: false };
    try {
      const { google } = await import("googleapis");
      creds.private_key = fixedKey;
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const client = await auth.getClient();
      const tokenResp = await (client as any).getAccessToken();
      authTest = { ok: true, token_obtained: !!tokenResp?.token };
    } catch (authErr: any) {
      const googleDetail = authErr?.response?.data ?? authErr?.message ?? String(authErr);
      authTest = { ok: false, error: typeof googleDetail === "string" ? googleDetail : JSON.stringify(googleDetail) };
    }

    res.json({
      ok: true,
      encoding,
      type: creds.type ?? "MISSING",
      project_id: creds.project_id ?? "MISSING",
      client_email: creds.client_email ?? "MISSING",
      private_key_id: creds.private_key_id ?? "MISSING",
      private_key_has_begin: fixedKey.includes("-----BEGIN PRIVATE KEY-----"),
      private_key_has_end: fixedKey.includes("-----END PRIVATE KEY-----"),
      private_key_real_newlines: realNewlines,
      private_key_literal_slash_n_before_fix: literalBackslashN,
      private_key_length: fixedKey.length,
      google_auth_test: authTest,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: `Parse error: ${e?.message}` });
  }
});

export default router;
