import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const MIN_AGE_MS = 10 * 60 * 1000;
const DELETE_BATCH_SIZE = 1000;

const shouldDelete = process.argv.includes("--delete");
const bucket = process.env.BUCKET_NAME;
const publicUrl = process.env.STORAGE_PUBLIC_URL;

if (!bucket || !publicUrl || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("Set the storage values from example.env in .env.local first.");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const db = getFirestore(
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  }),
);

async function listFiles() {
  const files = [];
  let token;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );

    files.push(...(page.Contents ?? []));
    token = page.NextContinuationToken;
  } while (token);

  return files;
}

async function listUsedKeys() {
  const prefix = `${publicUrl}/`;
  const keys = new Set();
  const snapshot = await db.collection("media").get();

  snapshot.forEach((doc) => {
    const media = doc.data();
    const urls = [
      media.coverImage,
      media.bannerImage,
      media.images?.coverImage?.url,
      media.images?.bannerImage?.url,
    ];

    for (const url of urls) {
      if (typeof url === "string" && url.startsWith(prefix)) {
        keys.add(url.slice(prefix.length));
      }
    }
  });

  return keys;
}

const [files, usedKeys] = await Promise.all([listFiles(), listUsedKeys()]);
const cutoff = Date.now() - MIN_AGE_MS;
const unused = files.filter(
  (file) => !usedKeys.has(file.Key) && file.LastModified.getTime() < cutoff,
);
const totalKb = unused.reduce((sum, file) => sum + file.Size, 0) / 1024;

console.log(`${files.length} files in ${bucket}, ${unused.length} unused (${totalKb.toFixed(0)} KB).`);

for (const file of unused) {
  console.log(`  ${file.Key}`);
}

if (unused.length === 0) {
  process.exit(0);
}

if (!shouldDelete) {
  console.log("Run again with --delete to remove them.");
  process.exit(0);
}

let deleted = 0;

for (let start = 0; start < unused.length; start += DELETE_BATCH_SIZE) {
  const batch = unused.slice(start, start + DELETE_BATCH_SIZE);
  const result = await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((file) => ({ Key: file.Key })) },
    }),
  );

  deleted += result.Deleted?.length ?? 0;

  for (const error of result.Errors ?? []) {
    console.error(`  Failed to delete ${error.Key}: ${error.Message}`);
  }
}

console.log(`Deleted ${deleted} of ${unused.length} files.`);
