import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../lib/config";

export const r2InternalEndpoint = `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const r2 = new S3Client({
  region: "auto",
  endpoint: r2InternalEndpoint,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});
