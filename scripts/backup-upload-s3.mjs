/**
 * backup-upload-s3.mjs — Upload a file to S3 using @aws-sdk/client-s3
 *
 * Usage: node backup-upload-s3.mjs <file> <bucket> <key> <region>
 *
 * Reads AWS credentials from environment:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional)
 */

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const [_node, _script, filePath, bucket, key, region] = process.argv;

if (!filePath || !bucket || !key) {
  console.error("Usage: node backup-upload-s3.mjs <file> <bucket> <key> [region]");
  process.exit(1);
}

const fileStats = statSync(filePath);
const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);
const fileName = basename(filePath);

console.error(`File: ${fileName} (${fileSizeMB} MB)`);
console.error(`Target: s3://${bucket}/${key}`);
console.error(`Region: ${region || "us-east-1"}`);

const client = new S3Client({
  region: region || "us-east-1",
  maxAttempts: 3,
});

const fileBody = readFileSync(filePath);

const command = new PutObjectCommand({
  Bucket: bucket,
  Key: key,
  Body: fileBody,
  ContentType: "application/sql",
  ServerSideEncryption: "AES256",
});

try {
  const result = await client.send(command);
  console.error(`✅ Uploaded successfully (ETag: ${result.ETag})`);
  console.log(JSON.stringify({
    bucket,
    key,
    sizeBytes: fileStats.size,
    etag: result.ETag,
    versionId: result.VersionId || null,
  }));
} catch (err) {
  console.error(`❌ Upload failed: ${err.message}`);
  process.exit(1);
}
